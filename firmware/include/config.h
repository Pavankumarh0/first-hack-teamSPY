#pragma once
// Campus Mithra display + speaker node - tunables.
// TFT pins are build flags in platformio.ini, not here.

// ---------- LINK TO THE PC ----------
// Must match monitor_speed in platformio.ini and BAUD in pc_client.py.
#define SERIAL_BAUD       460800

// ---------- SPEAKER ----------
// GPIO25 is DAC channel 1 -> PAM8403 input. Clear of the TFT pins
// (2, 4, 5, 18, 19, 23).
#define SPK_PIN           25
#define PLAY_RATE         8000     // must equal ESP_PLAY_RATE in the server .env
#define PLAY_VOLUME       45       // 0-100 at boot; the PC can change it with VOL:<n>
                                   // Keep the amp's trimmer low too - the PAM8403
                                   // has ~24 dB of gain and distorts easily.

// ---------- AUDIO BUFFERING ----------
// Speech arrives faster than it plays, so it is buffered here. The PC only
// sends what the ESP32 has room for (credit flow control), so this can never
// overflow however long the answer is.
#define AUDIO_RING_BYTES  16384    // 2 s of 8 kHz audio
#define AUDIO_PREBUFFER   2048     // wait for 0.25 s before starting, so a USB
                                   // hiccup at the start doesn't cause a stutter
#define AUDIO_CREDIT_STEP 1024     // grant the PC more room in steps of this
#define AUDIO_TIMEOUT_MS  3000     // give up if the PC goes quiet mid-answer
