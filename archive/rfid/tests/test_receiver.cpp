// Runs firmware/src/rfid_receiver.cpp (the code flashed to the ESP32) against
// the stand-ins in stubs/Arduino.h: UART setup, non-blocking polling,
// de-duplication and the log lines the PC sees.
#include <Arduino.h>
#include <string>
#include <vector>
#include "config.h"
#include "rfid_receiver.h"

static int failures = 0, checks = 0;
#define CHECK(cond)                                                       \
  do {                                                                    \
    checks++;                                                             \
    if (!(cond)) { failures++; std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

static std::vector<std::string> taps;
static void onCard(const char *uid) { taps.push_back(uid); }

static HardwareSerial *uart() {
  // rfid_receiver.cpp's own UART object (Serial is constructed first).
  return HardwareSerial::lastConstructed();
}
static void wire(const std::string &s) { for (char c : s) uart()->rx.push_back(c); }
static void pollAll() { for (int i = 0; i < 100 && uart()->available(); i++) rfidPoll(); rfidPoll(); }

int main() {
  CHECK(uart() != &Serial);
  rfidBegin(onCard);
  CHECK(uart()->uartNr == 2);
  CHECK(uart()->began);
  CHECK(uart()->rxPin == 16);
  CHECK(uart()->txPin == -1);                       // GPIO17 is never attached
  CHECK(uart()->baud == 115200);
  CHECK(uart()->rxBufferSize == 1024);
  CHECK(!uart()->rxBufferSetAfterBegin);
  CHECK(Serial.out.find("[esp] rfid: UART2 RX=GPIO16 115200 baud (receive only)") != std::string::npos);

  // Zephyr boot noise, then a hello, then a tap.
  g_millis = 1000;
  wire("*** Booting Zephyr OS ***\r\nHELLO:RFID/1 reader=ok\nRFID:A3:2F:91:0C\n");
  pollAll();
  CHECK(taps.size() == 1 && taps[0] == "A3:2F:91:0C");
  CHECK(Serial.out.find("[esp] rfid: sender says RFID/1 reader=ok") != std::string::npos);
  CHECK(Serial.out.find("[esp] rfid: card A3:2F:91:0C") != std::string::npos);
  CHECK(Serial.out.find("[esp] rfid: ignored 1 line(s), last: not a frame") != std::string::npos);

  // One poll never reads more than RFID_MAX_BYTES_POLL bytes.
  std::string burst;
  for (int i = 0; i < 10; i++) burst += "garbage-garbage-garbage\n";
  wire(burst);
  const size_t before = uart()->reads;
  rfidPoll();
  CHECK(uart()->reads - before == RFID_MAX_BYTES_POLL);
  pollAll();

  // The same card again within RFID_SAME_CARD_MS is one tap; later it is a new one.
  g_millis = 1500;
  wire("RFID:A3:2F:91:0C\n");
  pollAll();
  CHECK(taps.size() == 1);
  CHECK(Serial.out.find("repeat of A3:2F:91:0C ignored") != std::string::npos);
  g_millis = 1500 + RFID_SAME_CARD_MS + 1;
  wire("RFID:A3:2F:91:0C\nRFID:11:22:33:44\n");
  pollAll();
  CHECK(taps.size() == 3 && taps[2] == "11:22:33:44");

  // Malformed frames never reach the callback.
  g_millis = 9000;
  wire("RFID:a3:2f:91:0c\nRFID:A3:2F\nRFID:" + std::string(300, 'F') + "\n");
  pollAll();
  CHECK(taps.size() == 3);

  std::printf("%d/%d receiver checks passed\n", checks - failures, checks);
  return failures ? 1 : 0;
}
