#pragma once
#include <Arduino.h>

// Bit-banged SCCB for diagnosing the OV7670 control bus.
//
// Why not Wire: the camera driver owns its own I2C peripheral, and on ESP32
// core 3.x it uses the new IDF I2C driver, which aborts at boot if the legacy
// one is also in use. Bit-banging needs no driver at all, and gives exact
// control over what usually breaks OV7670 reads: STOP vs repeated start, bus
// speed, pull-ups, and whether XCLK is running.

struct SccbIds {
  bool ok;              // PID and VER read back as an OV7670 (0x76 / 0x73)
  int pid, ver, midh, midl;   // -1 = read failed
};

// Runs the full diagnosis and prints a report. Returns what was read under
// the best working conditions. Leaves XCLK stopped and SDA/SCL released.
SccbIds runSccbDiagnostics();

// XCLK on/off for diagnostics (LEDC on CAM_PIN_XCLK). The camera driver
// starts its own XCLK later; this must be stopped before that.
void diagXclk(bool on);
