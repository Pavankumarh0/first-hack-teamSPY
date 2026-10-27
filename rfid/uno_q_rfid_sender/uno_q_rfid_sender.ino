/*
 * Campus Mithra - RFID sender for the Arduino UNO Q (STM32U585 MCU, Zephyr core)
 *
 *   RC522 card reader --SPI--> UNO Q --Serial1 (D1/TX, 115200)--> ESP32 GPIO16
 *
 * Reads a card's UID and sends ONE line per tap to the kiosk ESP32:
 *
 *   RFID:A3:2F:91:0C\n
 *
 * Protocol: docs/RFID_PROTOCOL.md   Wiring: docs/RFID_WIRING.md
 *
 * Board: "Arduino UNO Q" (FQBN arduino:zephyr:unoq), core "Arduino UNO Q
 * Board" (arduino:zephyr). Libraries: MFRC522 (GithubCommunity, 1.4.x) and
 * Arduino_RouterBridge (Library Manager; it provides Monitor/Serial on the
 * UNO Q - App Lab sketches already use it). Setup: docs/RFID_WIRING.md.
 *
 * Two different serial ports - do not mix them up:
 *   LINK_PORT  = Serial1  hardware USART1 on D0/D1. Carries ONLY protocol
 *                         frames to the ESP32. (Zephyr also uses USART1 as its
 *                         console, so a few boot messages may appear on D1 at
 *                         power-up; the ESP32 ignores every line that is not a
 *                         valid frame.)
 *   DEBUG_PORT = Monitor  the UNO Q's "Serial" - not a wire but an RPC channel
 *                         to the Linux side (App Lab / Arduino IDE Serial
 *                         Monitor). Diagnostics only. Each print is an RPC
 *                         call, so a scan is always sent on LINK_PORT first
 *                         and logged afterwards.
 *
 * RC522 wiring (as already tested on this board): SDA/SS D10, SCK D13,
 * MOSI D11, MISO D12, RST D9, VCC 3.3V (NEVER 5V), GND, IRQ not connected.
 * D10-D13 are the UNO Q's SPI2 (the default SPI object).
 *
 * A card UID is an identifier, not a password: cards can be cloned. The
 * backend treats a scan as "this card was presented", nothing more.
 */

#include <SPI.h>
#include <MFRC522.h>
#include <Arduino_RouterBridge.h>
#include "rfid_sender_core.h"

// ---------- pins (unchanged from the working test) ----------
#define RC522_SS_PIN   10
#define RC522_RST_PIN  9

// ---------- ports ----------
#define LINK_PORT  Serial1       // to the ESP32 (D1/TX -> ESP32 GPIO16)
#define DEBUG_PORT Monitor       // to your computer, through the UNO Q's Linux side
#define LINK_BAUD  115200        // must equal RFID_BAUD in firmware/include/config.h

// ---------- timing ----------
#define POLL_MS          50     // how often the reader is asked for a card
#define REMOVAL_MS       700    // card counts as removed after this long unseen
#define RETAP_MS         1500   // the same card is not re-sent sooner than this
#define HEALTH_MS        5000   // reader self-check interval
#define HELLO_MS         30000  // "still here" line to the ESP32

MFRC522 reader(RC522_SS_PIN, RC522_RST_PIN);
rfidsend::TapDebouncer taps(REMOVAL_MS, RETAP_MS);

static bool readerOk = false;
static uint32_t lastPollMs = 0, lastHealthMs = 0, lastHelloMs = 0;
static uint32_t framesSent = 0;

/* The MFRC522's VersionReg: 0x91/0x92 = genuine chip v1/v2, 0x88 and 0x12 =
   common clones. 0x00 or 0xFF means nothing answered on SPI. */
static bool readerAnswers(uint8_t *version) {
  const uint8_t v = reader.PCD_ReadRegister(MFRC522::VersionReg);
  if (version) *version = v;
  return v != 0x00 && v != 0xFF;
}

static void initReader() {
  reader.PCD_Init();
  delay(10);
  uint8_t v = 0;
  readerOk = readerAnswers(&v);
  if (readerOk) {
    DEBUG_PORT.print("[rfid] RC522 ok, version 0x");
    DEBUG_PORT.println(v, HEX);
  } else {
    DEBUG_PORT.print("[rfid] RC522 NOT FOUND (version 0x");
    DEBUG_PORT.print(v, HEX);
    DEBUG_PORT.println("). Check SS=D10 SCK=D13 MOSI=D11 MISO=D12 RST=D9, 3.3V and GND.");
  }
}

static void sendHello() {
  // Optional status line (protocol extension point): the ESP32 logs it, the
  // backend never sees it.
  LINK_PORT.print(readerOk ? "HELLO:RFID/1 reader=ok\n" : "HELLO:RFID/1 reader=missing\n");
  lastHelloMs = millis();
}

/* Asks for a card, including one that is already resting on the reader (WUPA
   wakes halted cards, REQA would not), and reads its UID. */
static bool readCard(char *uidText, size_t size) {
  uint8_t atqa[2];
  uint8_t atqaSize = sizeof(atqa);
  const MFRC522::StatusCode wake = reader.PICC_WakeupA(atqa, &atqaSize);
  if (wake != MFRC522::STATUS_OK && wake != MFRC522::STATUS_COLLISION) return false;
  if (!reader.PICC_ReadCardSerial()) return false;
  const size_t n = rfidsend::formatUid(reader.uid.uidByte, reader.uid.size, uidText, size);
  reader.PICC_HaltA();
  return n > 0;
}

void setup() {
  DEBUG_PORT.begin();                      // Monitor ignores the baud argument
  LINK_PORT.begin(LINK_BAUD);
  SPI.begin();
  delay(50);
  DEBUG_PORT.println("[rfid] Campus Mithra RFID sender - UNO Q, protocol RFID/1");
  DEBUG_PORT.println("[rfid] link: Serial1 D1/TX 115200 8N1 -> ESP32 GPIO16");
  initReader();
  sendHello();
}

void loop() {
  const uint32_t now = millis();

  // Reader health: a loose wire or brown-out shows as VersionReg 0x00/0xFF.
  if (now - lastHealthMs >= HEALTH_MS) {
    lastHealthMs = now;
    const bool ok = readerAnswers(nullptr);
    if (!ok) {
      if (readerOk) DEBUG_PORT.println("[rfid] reader stopped answering - re-initialising");
      initReader();
      if (readerOk) sendHello();
    } else if (!readerOk) {
      readerOk = true;
      DEBUG_PORT.println("[rfid] reader is back");
      sendHello();
    }
  }
  if (now - lastHelloMs >= HELLO_MS) sendHello();

  if (!readerOk || now - lastPollMs < POLL_MS) return;
  lastPollMs = now;

  char uid[rfidsend::MAX_UID_TEXT + 1];
  const bool present = readCard(uid, sizeof(uid));
  if (taps.update(now, present, present ? uid : "")) {
    char frame[rfidsend::MAX_FRAME + 1];
    const size_t len = rfidsend::buildFrame(uid, frame, sizeof(frame));
    if (len) {
      LINK_PORT.write((const uint8_t *)frame, len);     // the whole frame in one write
      framesSent++;
      DEBUG_PORT.print("[rfid] sent #");
      DEBUG_PORT.print(framesSent);
      DEBUG_PORT.print(": ");
      DEBUG_PORT.print(frame);                            // frame ends in '\n'
    }
  }
  if (taps.takeRemoved()) DEBUG_PORT.println("[rfid] card removed - ready for the next tap");
}
