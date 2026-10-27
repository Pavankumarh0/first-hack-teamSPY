#pragma once
// ===========================================================================
// Campus Mithra camera node - every pin and setting lives in this one file.
//
// Board : ESP32 DevKit V1 (ESP32-WROOM-32, no PSRAM) - the SECOND ESP32.
//         This is not the kiosk board. The kiosk keeps its own firmware in
//         ../../firmware and is never flashed from here.
// Camera: OV7670 without FIFO (no AL422B chip), 3.3 V only.
// ===========================================================================

// ---------- serial link to the PC ----------
#define CAM_SERIAL_BAUD   921600

// ---------- OV7670 control bus (SCCB, I2C-like) ----------
#define CAM_PIN_SIOD      26     // OV7670 SDA
#define CAM_PIN_SIOC      27     // OV7670 SCL
#define CAM_SCCB_ADDR     0x21   // 7-bit (0x42 write / 0x43 read)
// FIFO-less modules usually have NO pull-ups on SDA/SCL: fit 4.7k to 3V3 on
// each. The diagnostics report whether they are present.

// ---------- clock and sync ----------
#define CAM_PIN_XCLK      21     // ESP32 -> camera master clock (output)
#define CAM_PIN_VSYNC     25     // VS
#define CAM_PIN_HREF      23     // HS
#define CAM_PIN_PCLK      22
// OV7670 accepts 10-48 MHz. Without PSRAM the frame goes straight to internal
// RAM by DMA, and a lower clock gives slower, cleaner PCLK edges on breadboard
// wiring - 10 MHz is the safe starting point.
#define CAM_XCLK_HZ       10000000

// ---------- 8-bit data bus (esp32-camera calls these Y2..Y9) ----------
#define CAM_PIN_D0        4
#define CAM_PIN_D1        5      // strapping pin, but only for SDIO timing: safe
#define CAM_PIN_D2        18
#define CAM_PIN_D3        19
#define CAM_PIN_D4        36     // VP, input-only - fine, data lines are inputs
#define CAM_PIN_D5        39     // VN, input-only
#define CAM_PIN_D6        34     // input-only
#define CAM_PIN_D7        35     // input-only

// ---------- power-down and reset ----------
// PWDN is active HIGH (1 = powered down). Tie it to GND -> -1 here.
#define CAM_PIN_PWDN      -1
// RET on the module is RESET, active LOW (0 = held in reset). Do not leave it
// floating: wire it to GPIO32 so the firmware can pulse a clean reset (this
// setting), or tie it to 3V3 and set -1.
#define CAM_PIN_RESET     32

// ---------- image ----------
// No PSRAM, so one frame must fit in internal RAM:
//   QQVGA 160x120 RGB565 = 38 KB   (default, always fits)
//   QVGA  320x240 GRAY   = 77 KB   (usually fits)
//   QVGA  320x240 RGB565 = 154 KB  (does not fit - refused)
#define CAM_DEFAULT_FRAMESIZE  FRAMESIZE_QQVGA
#define CAM_DEFAULT_PIXFORMAT  PIXFORMAT_RGB565

// ---------- Wi-Fi live view ----------
// Open http://mithra-cam.local/ (or the IP printed at boot) in a browser.
// With secrets.h (copy secrets.h.example) the camera joins that network; with
// no secrets.h, or if joining fails, it starts its own hotspot instead: join
// CAM_AP_SSID from the phone or laptop and open http://192.168.4.1/.
// The ESP32 joins 2.4 GHz networks only.
#define CAM_HOSTNAME      "mithra-cam"
#define CAM_AP_SSID       "CampusMithra-Cam"
#define CAM_AP_PASSWORD   "mithracam"   // at least 8 characters
#define CAM_WIFI_JOIN_MS  15000         // give up on the home network after this
