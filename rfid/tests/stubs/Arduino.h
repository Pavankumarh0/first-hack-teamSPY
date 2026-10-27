// Minimal stand-ins for the Arduino-ESP32 calls used by
// firmware/src/rfid_receiver.cpp, so it can be compiled and exercised on a PC.
// Only what that file uses; behaviour mirrors arduino-esp32 2.0.17.
#pragma once
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <deque>
#include <string>

#define SERIAL_8N1 0x800001c

inline uint32_t g_millis = 0;
inline uint32_t millis() { return g_millis; }

class HardwareSerial {
 public:
  explicit HardwareSerial(int uartNr) : uartNr(uartNr) { lastConstructed() = this; }
  static HardwareSerial *&lastConstructed() { static HardwareSerial *p = nullptr; return p; }

  size_t setRxBufferSize(size_t n) {
    if (began) { rxBufferSetAfterBegin = true; return 0; }   // the real core refuses too
    rxBufferSize = n;
    return n;
  }
  void begin(unsigned long b, uint32_t cfg = SERIAL_8N1, int8_t rx = -1, int8_t tx = -1) {
    baud = b; config = cfg; rxPin = rx; txPin = tx; began = true;
  }
  int available() { return (int)rx.size(); }
  int read() {
    if (rx.empty()) return -1;
    const int c = (unsigned char)rx.front();
    rx.pop_front();
    reads++;
    return c;
  }
  int printf(const char *fmt, ...) {
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    const int n = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    out += buf;
    return n;
  }

  int uartNr;
  bool began = false, rxBufferSetAfterBegin = false;
  unsigned long baud = 0;
  uint32_t config = 0;
  int rxPin = -99, txPin = -99;
  size_t rxBufferSize = 0, reads = 0;
  std::deque<char> rx;
  std::string out;
};

inline HardwareSerial Serial(0);
