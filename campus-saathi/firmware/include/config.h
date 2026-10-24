#pragma once
// ---------- EDIT THESE ----------
#define WIFI_SSID   "YOUR_WIFI_NAME"
#define WIFI_PASS   "YOUR_WIFI_PASSWORD"
#define SERVER_URL  "http://192.168.1.50:8000"   // PC running the Campus Saathi server (use its LAN IP, not localhost)

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
