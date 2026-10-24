#pragma once

// Wi-Fi name and password live in secrets.h, which is gitignored so they are
// never committed. Copy secrets.h.example to secrets.h and fill it in.
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing include/secrets.h - copy include/secrets.h.example to include/secrets.h and set your Wi-Fi name and password"
#endif

// PC running the Campus Mithra server. Use its LAN address, never localhost:
// to the ESP32, localhost is the ESP32 itself. Find it with `ipconfig`
// (the IPv4 address of the Wi-Fi adapter). It changes if the PC rejoins the
// network, so re-check this first if the kiosk shows "Server error -1".
#define SERVER_URL  "http://10.108.11.17:8000"

// ---------- PINS ----------
#define MIC_PIN   34   // ADC1_CH6 (input only). Never use ADC2 pins with Wi-Fi.
#define SPK_PIN   25   // DAC1 -> amplifier input
#define BTN_TALK  27   // push-to-talk button to GND (hold while speaking)
#define BTN_NEXT  14   // optional button to GND: asks a preset question (tests everything without the mic)

// ---------- AUDIO ----------
#define REC_RATE      8000   // samples per second recorded
#define REC_MAX_SEC   5      // max recording length
#define MIC_GAIN      6      // software gain before upload (server normalises again)
#define PLAY_RATE     8000   // must equal ESP_PLAY_RATE in .env
#define PLAY_VOLUME   70     // 0-100 (also adjust the amplifier pot / keep low to avoid distortion)
