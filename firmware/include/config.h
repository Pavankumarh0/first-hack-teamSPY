#pragma once
// Campus Mithra kiosk - tunables. TFT pins are build flags in platformio.ini.
//
// Pin map (no conflicts with the TFT on 2, 4, 5, 18, 19, 23):
//   INMP441 mic  (I2S0, RX)   SCK 14   WS 15   SD 32   L/R -> 3V3 (right slot)
//   MAX98357A    (I2S1, TX)   BCLK 26  LRC 25  DIN 22  SD -> 3V3 (always on)
//   Talk button               GPIO27 -> button -> GND  (INPUT_PULLUP)

// ---------- LINK TO THE PC ----------
// Must match monitor_speed in platformio.ini and BAUD in pc_client.py.
// 16 kHz 16-bit mic audio is 32 KB/s; 921600 baud carries ~92 KB/s.
#define SERIAL_BAUD       921600

// ---------- TALK BUTTON ----------
#define BTN_TALK          27
#define BTN_DEBOUNCE_MS   25
#define REC_MIN_MS        400      // shorter presses are ignored (an accidental tap)
#define REC_MAX_MS        15000    // recording stops here even if still held

// ---------- INMP441 MICROPHONE ----------
#define MIC_PORT          I2S_NUM_0
#define MIC_SCK           14
#define MIC_WS            15
#define MIC_SD            32
#define MIC_RATE          16000    // what Sarvam prefers
// The INMP441 sends 24-bit samples left-aligned in 32-bit slots. Converting to
// 16-bit keeps the top 16 bits; each extra bit here doubles the level (+6 dB).
// Speech at arm's length sits around -40 dBFS, so +12 dB uses the 16-bit range
// better without clipping a normal voice. The PC normalises again afterwards.
#define MIC_GAIN_BITS     2

// ---------- MAX98357A SPEAKER ----------
#define AMP_PORT          I2S_NUM_1
#define AMP_BCLK          26
#define AMP_LRC           25
#define AMP_DIN           22
#define PLAY_RATE         16000    // must equal ESP_I2S_RATE in the server .env
#define PLAY_VOLUME       100      // 0-100 at boot (full scale); the PC can lower it with VOL:<n>
// The MAX98357A's own gain is set by its GAIN pin, not by software:
//   GAIN to GND through 100k = 15 dB (loudest)   GAIN to GND = 12 dB
//   GAIN unconnected         =  9 dB (as wired)   GAIN to VIN =  6 dB
// For more volume than full-scale samples give, rewire GAIN, not this number.

// ---------- AUDIO BUFFERING ----------
// Speech arrives faster than it plays; the PC only sends what fits here (credit
// flow control), so this can never overflow however long the answer is.
#define AUDIO_RING_BYTES  32768    // 1 s of 16 kHz 16-bit
#define AUDIO_PREBUFFER   6144     // ~0.2 s before playback starts
#define AUDIO_CREDIT_STEP 2048
#define AUDIO_TIMEOUT_MS  3000     // give up if the PC goes quiet mid-answer

// ---------- PC LINK HEALTH ----------
#define PC_ALIVE_MS       7000     // the PC sends HB every 2 s; silence longer = offline
#define BUSY_TIMEOUT_MS   90000    // longest wait for an answer after releasing
