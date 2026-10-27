#include "sccb_diag.h"
#include "cam_config.h"

namespace {

// OV7670 identity registers and their expected values.
const uint8_t REG_PID = 0x0A, REG_VER = 0x0B, REG_MIDH = 0x1C, REG_MIDL = 0x1D;
const int EXPECT_PID = 0x76, EXPECT_VER = 0x73;

const int BUS_SDA = CAM_PIN_SIOD;
const int BUS_SCL = CAM_PIN_SIOC;
uint32_t halfUs = 5;            // half a clock period: 5 us ~ 100 kHz
bool useInternalPullups = true;
bool sclTimedOut = false;

// --- open-drain primitives: a line is either driven LOW or released --------

inline void dly() { delayMicroseconds(halfUs); }

inline void release(int pin) { pinMode(pin, useInternalPullups ? INPUT_PULLUP : INPUT); }

inline void driveLow(int pin) {
  digitalWrite(pin, LOW);      // set the level first, so the pin never glitches high
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
}

// Release BUS_SCL and wait for it to actually rise (honours clock stretching).
inline void sclHigh() {
  release(BUS_SCL);
  const uint32_t t = micros();
  while (!digitalRead(BUS_SCL)) {
    if (micros() - t > 2000) { sclTimedOut = true; return; }
  }
}

void busStart() { release(BUS_SDA); sclHigh(); dly(); driveLow(BUS_SDA); dly(); driveLow(BUS_SCL); dly(); }
void busStop()  { driveLow(BUS_SDA); dly(); sclHigh(); dly(); release(BUS_SDA); dly(); }

// Returns true if the receiver pulled BUS_SDA low in the 9th clock (ACK).
bool writeByte(uint8_t b) {
  for (int i = 7; i >= 0; i--) {
    if (b & (1 << i)) release(BUS_SDA); else driveLow(BUS_SDA);
    dly();
    sclHigh();
    dly();
    driveLow(BUS_SCL);
  }
  release(BUS_SDA);
  dly();
  sclHigh();
  dly();
  const bool ack = digitalRead(BUS_SDA) == LOW;
  driveLow(BUS_SCL);
  dly();
  return ack;
}

// Reads one byte and answers NACK, which is what SCCB expects for a 1-byte read.
uint8_t readByte() {
  uint8_t v = 0;
  release(BUS_SDA);
  for (int i = 7; i >= 0; i--) {
    dly();
    sclHigh();
    dly();
    if (digitalRead(BUS_SDA)) v |= (1 << i);
    driveLow(BUS_SCL);
  }
  release(BUS_SDA);                 // NACK
  dly();
  sclHigh();
  dly();
  driveLow(BUS_SCL);
  dly();
  return v;
}

// Nine clocks then STOP frees a slave left mid-byte by an earlier failed transfer.
void busRecover() {
  release(BUS_SDA);
  for (int i = 0; i < 9; i++) { driveLow(BUS_SCL); dly(); sclHigh(); dly(); }
  busStop();
}

bool probe() {
  busStart();
  const bool ack = writeByte(CAM_SCCB_ADDR << 1);
  busStop();
  return ack;
}

struct Read {
  int value;                    // what came back on the bus
  bool ackW, ackReg, ackR;      // ACKs: address+write, register, address+read
};

// An SCCB register read: a 2-phase write of the register address, then a
// 2-phase read. SCCB wants a STOP between the two; repeatedStart=true sends a
// repeated START instead (what Wire.endTransmission(false) does) to show
// whether that is what broke an earlier test.
Read readReg(uint8_t reg, bool repeatedStart) {
  Read r{};
  busStart();
  r.ackW = writeByte(CAM_SCCB_ADDR << 1);
  r.ackReg = writeByte(reg);
  if (!repeatedStart) busStop();
  busStart();
  r.ackR = writeByte((CAM_SCCB_ADDR << 1) | 1);
  r.value = readByte();
  busStop();
  return r;
}

const char *yn(bool b) { return b ? "yes" : "NO "; }

}  // namespace


void diagXclk(bool on) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  if (on) {
    // channel 7 = a timer the camera driver (timer 0 / channel 0) never uses
    ledcAttachChannel(CAM_PIN_XCLK, CAM_XCLK_HZ, 1, 7);
    ledcWrite(CAM_PIN_XCLK, 1);   // 1-bit resolution, duty 1 = 50%
  } else {
    ledcDetach(CAM_PIN_XCLK);
    pinMode(CAM_PIN_XCLK, INPUT);
  }
#else
  if (on) {
    ledcSetup(6, CAM_XCLK_HZ, 1);  // channel 6 -> timer 3, clear of the camera's timer 0
    ledcAttachPin(CAM_PIN_XCLK, 6);
    ledcWrite(6, 1);
  } else {
    ledcDetachPin(CAM_PIN_XCLK);
    pinMode(CAM_PIN_XCLK, INPUT);
  }
#endif
}


SccbIds runSccbDiagnostics() {
  SccbIds best{false, -1, -1, -1, -1};
  Serial.println(F("[cam] ---- SCCB diagnosis ------------------------------------------"));
  Serial.printf("[cam] OV7670 at 0x%02X on BUS_SDA=GPIO%d BUS_SCL=GPIO%d; expect PID=0x%02X VER=0x%02X\n",
                CAM_SCCB_ADDR, BUS_SDA, BUS_SCL, EXPECT_PID, EXPECT_VER);

  // Power-down off and a clean reset pulse, if those lines are wired to GPIOs.
  if (CAM_PIN_PWDN >= 0) { pinMode(CAM_PIN_PWDN, OUTPUT); digitalWrite(CAM_PIN_PWDN, LOW); }
  if (CAM_PIN_RESET >= 0) {
    pinMode(CAM_PIN_RESET, OUTPUT);
    digitalWrite(CAM_PIN_RESET, LOW);
    delay(10);
    digitalWrite(CAM_PIN_RESET, HIGH);
    delay(20);
    Serial.printf("[cam] reset pulsed on GPIO%d (RET)\n", CAM_PIN_RESET);
  }

  // 1. Are the lines idle-high, and are there external pull-ups?
  pinMode(BUS_SDA, INPUT_PULLDOWN);
  pinMode(BUS_SCL, INPUT_PULLDOWN);
  delay(2);
  const bool extSda = digitalRead(BUS_SDA), extScl = digitalRead(BUS_SCL);   // high despite pull-down
  pinMode(BUS_SDA, INPUT_PULLUP);
  pinMode(BUS_SCL, INPUT_PULLUP);
  delay(2);
  const bool idleSda = digitalRead(BUS_SDA), idleScl = digitalRead(BUS_SCL);
  Serial.printf("[cam] lines idle (internal pull-up): BUS_SDA=%s BUS_SCL=%s\n",
                idleSda ? "HIGH ok" : "LOW!", idleScl ? "HIGH ok" : "LOW!");
  Serial.printf("[cam] external pull-ups: BUS_SDA=%s BUS_SCL=%s%s\n", extSda ? "yes" : "no", extScl ? "yes" : "no",
                (extSda && extScl) ? "" : "   (fit 4.7k to 3V3 on each for a reliable bus)");
  if (!idleSda || !idleScl) {
    Serial.println(F("[cam] VERDICT: a bus line is held LOW. Check for a short to GND, a wire on the"));
    Serial.println(F("[cam]          wrong pin, or the camera unpowered (3V3 and GND)."));
    release(BUS_SDA);
    release(BUS_SCL);
    return best;
  }

  // 2. The matrix: XCLK off/on x 100 kHz / 20 kHz x STOP / repeated-start.
  struct Cond { bool xclk; uint32_t half; const char *speed; };
  const Cond conds[] = {{false, 5, "100k"}, {false, 25, " 20k"}, {true, 5, "100k"}, {true, 25, " 20k"}};
  bool anyAck = false, okStop[4] = {}, okRs[4] = {};

  Serial.println(F("[cam]  XCLK  speed  ACK   STOP read: PID  VER     repeated-start: PID  VER"));
  for (int i = 0; i < 4; i++) {
    diagXclk(conds[i].xclk);
    delay(conds[i].xclk ? 30 : 5);       // let the sensor wake on its clock
    halfUs = conds[i].half;
    sclTimedOut = false;
    busRecover();
    const bool ack = probe();
    anyAck |= ack;
    const Read sp = readReg(REG_PID, false), sv = readReg(REG_VER, false);
    const Read rp = readReg(REG_PID, true), rv = readReg(REG_VER, true);
    okStop[i] = sp.value == EXPECT_PID && sv.value == EXPECT_VER;
    okRs[i] = rp.value == EXPECT_PID && rv.value == EXPECT_VER;
    Serial.printf("[cam]  %-4s  %s   %s       0x%02X 0x%02X %s          0x%02X 0x%02X %s%s\n",
                  conds[i].xclk ? "on" : "off", conds[i].speed, yn(ack),
                  sp.value, sv.value, okStop[i] ? "OK  " : "bad ",
                  rp.value, rv.value, okRs[i] ? "OK" : "bad",
                  sclTimedOut ? "  (BUS_SCL stuck low!)" : "");
    if (conds[i].xclk) diagXclk(false);
  }

  // 3. Explain it.
  int good = -1;
  for (int i : {2, 3, 0, 1}) if (okStop[i]) { good = i; break; }   // prefer XCLK on, 100 kHz

  if (!anyAck) {
    Serial.println(F("[cam] VERDICT: nothing answers at 0x21. Check 3V3 and GND at the camera, BUS_SDA=GPIO26,"));
    Serial.println(F("[cam]          BUS_SCL=GPIO27 (not swapped), RET not held LOW, PWDN tied to GND."));
  } else if (good < 0) {
    Serial.println(F("[cam] VERDICT: the sensor ACKs its address but never returns a valid ID, even with"));
    Serial.println(F("[cam]          XCLK running and a STOP between phases. Most likely RET/RESET is low"));
    Serial.println(F("[cam]          or floating (tie it HIGH / to GPIO32), or PWDN is not at GND. Also check"));
    Serial.println(F("[cam]          XCLK actually reaches the camera (GPIO21)."));
  } else {
    Serial.printf("[cam] VERDICT: OV7670 confirmed (PID 0x%02X VER 0x%02X).\n", EXPECT_PID, EXPECT_VER);
    if (!okStop[0] && !okStop[1] && (okStop[2] || okStop[3]))
      Serial.println(F("[cam]          Reads only work with XCLK running: the sensor needs its clock to"));
    if (!okStop[0] && !okStop[1] && (okStop[2] || okStop[3]))
      Serial.println(F("[cam]          answer. An earlier test without XCLK would ACK 0x21 and then fail."));
    if ((okStop[2] && !okRs[2]) || (okStop[3] && !okRs[3]))
      Serial.println(F("[cam]          Repeated-start reads fail: SCCB needs a STOP before the read phase."));
    if (!okStop[2] && okStop[3])
      Serial.println(F("[cam]          Only the slow bus works: weak/missing pull-ups or long wires."));

    // Read the full identity under the working condition.
    diagXclk(conds[good].xclk);
    delay(30);
    halfUs = conds[good].half;
    best.pid = readReg(REG_PID, false).value;
    best.ver = readReg(REG_VER, false).value;
    best.midh = readReg(REG_MIDH, false).value;
    best.midl = readReg(REG_MIDL, false).value;
    best.ok = best.pid == EXPECT_PID && best.ver == EXPECT_VER;
    Serial.printf("[cam] ID: PID=0x%02X VER=0x%02X MIDH=0x%02X MIDL=0x%02X (OmniVision = 0x7F 0xA2)\n",
                  best.pid, best.ver, best.midh, best.midl);
    if (conds[good].xclk) diagXclk(false);
  }

  release(BUS_SDA);
  release(BUS_SCL);
  pinMode(BUS_SDA, INPUT);            // hand the pins back untouched for the camera driver
  pinMode(BUS_SCL, INPUT);
  Serial.println(F("[cam] ----------------------------------------------------------------"));
  return best;
}
