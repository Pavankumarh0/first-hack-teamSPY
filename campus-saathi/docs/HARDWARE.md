# Campus Saathi - Hardware setup

Build and test in this order. Each stage proves one thing, so a fault is easy to find.
**Power the ESP32 from USB only. Never connect 5 V to any GPIO pin: ESP32 pins are 3.3 V only.**

## Parts and roles
| Part | Role |
|---|---|
| ESP32 dev board | Brain: Wi-Fi, reads mic (ADC), plays audio (DAC), drives the screen |
| 2.8" SPI TFT (ILI9341) | Shows question and answer |
| Earphone mic + 3.5 mm socket | Microphone input |
| PAM8403 / HW-104 amplifier + speaker | Plays the answer |
| Breadboard, jumpers, DT830D | Wiring and testing |
| 2 push buttons *(recommended)* | TALK (hold to speak) and NEXT (preset question, tests everything without the mic) |
| 10 kOhm x3, 2.2 kOhm x1, 1 kOhm, 1-10 uF capacitor, 470 uF capacitor, 10 kOhm pot | Mic bias, volume control, power smoothing (all common kit parts) |

## Pin map
| ESP32 | Goes to | Notes |
|---|---|---|
| 3V3 | TFT VCC and LED | 3.3 V |
| GND | TFT GND, socket GND, amp GND, buttons | **All grounds joined** |
| GPIO5 | TFT CS | |
| GPIO22 | TFT RESET | |
| GPIO21 | TFT DC (RS) | |
| GPIO23 | TFT SDI (MOSI) | |
| GPIO18 | TFT SCK | |
| GPIO19 | TFT SDO (MISO) | optional |
| GPIO34 | Mic circuit output | ADC1, input only |
| GPIO25 | Volume pot / attenuator -> amp input | DAC1 |
| GPIO27 | TALK button other leg to GND | internal pull-up used |
| GPIO14 | NEXT button other leg to GND | optional |
| VIN (5 V from USB) | Amp 5V (+) | see power notes |

The TFT's `T_` touch pins (T_CLK, T_CS, T_DIN, T_DO, T_IRQ) stay unconnected.

## Stage 1 - Screen
1. Wire the TFT as in the table (VCC to 3V3, not 5 V).
2. Install VS Code + the **PlatformIO** extension. Open the `firmware` folder.
3. Edit `include/config.h`: Wi-Fi name and password (2.4 GHz only), and `SERVER_URL` = your PC's LAN address, e.g. `http://192.168.1.50:8000`
   (`ipconfig` on Windows, `ifconfig`/`ip a` on Linux/Mac, use the Wi-Fi adapter's IPv4).
4. Plug the ESP32 in by USB and click **Upload**, then open the Serial Monitor (115200).
   *Expected:* "Campus Saathi" header and the welcome text.
   *Blank white screen?* Check VCC, CS/DC/RESET wires. *Mirrored or rotated?* Change `tft.setRotation(1)` to 3.
   Arduino IDE instead? Rename `main.cpp` to `campus_saathi.ino`, put `config.h` beside it, install TFT_eSPI and ArduinoJson,
   and copy the `-D` flags from `platformio.ini` into TFT_eSPI's `User_Setup.h`.

## Stage 2 - Server and Wi-Fi
1. Start the server on the PC (`python app.py`). Allow Python through the Windows firewall for **private networks** (port 8000).
2. From your phone (same Wi-Fi) open `http://<PC-IP>:8000/api/health`. It must show JSON. If not, it is the firewall or the router's
   "client isolation" setting. A phone hotspot works well for demos.
3. The dot at the top right of the screen is green when the ESP32 is on Wi-Fi.

## Stage 3 - Speaker (test with the NEXT button before the mic exists)
Wire the amplifier. The PAM8403 is a 5 V, ~24 dB gain amplifier, and the ESP32 DAC puts out up to 3.3 V, so it **must be attenuated**:

```
GPIO25 ---[10k pot: ends to GPIO25 and GND, wiper -> amp L input]     (or fixed: GPIO25 -[10k]-+-[1k]- GND, + -> amp L input)
ESP32 GND ---------------------------------------------------- amp GND (the middle pin of the input header)
ESP32 VIN (5V) ---+---------------------------------------- amp 5V
                  +---||--- GND   470 uF across amp 5V/GND, + on 5V
Speaker ---------- amp L+ and L-  (do NOT connect either speaker wire to GND: the output is bridged)
```
1. Turn the pot to about one quarter. Press **NEXT** (or temporarily hold GPIO14 to GND with a jumper wire).
2. The screen shows "Thinking...", then the first preset answer is shown and spoken. Each press asks the next preset question, the last one (weather) should be politely refused.
3. Hiss or crackle? Lower the pot and `PLAY_VOLUME` in `config.h`. A buzz while Wi-Fi sends data usually means the amp shares a weak USB supply: use a separate 5 V 1 A+ supply for the amp (join its GND to the ESP32 GND) and keep the 470 uF capacitor.
4. No sound but text appears? Open `http://<PC-IP>:8000/api/health`, then watch the server log for "TTS failed" (the PC needs internet for the voice).

## Stage 4 - Microphone

### 4a. Find the socket pins with the DT830D
The 5-pin 3.5 mm socket usually has: common ground, left, right, mic, and a switch (detect) pin. Layouts differ between makers, so measure:
1. Plug the earphone in. Set the meter to the **20 k** resistance range.
2. Touch two pins at a time. Pins that read **about 15-50 Ohm** are the earphone speakers (left or right to ground). The pin common to both is **GND**.
3. The pair that reads **a few kOhm (about 1-10 k)** and gives a *different* reading when you swap the probes is the microphone (red probe on the mic pin gives the lower reading). The reading wobbles when you tap or blow on the mic. That pin is **MIC**, the other is **GND**.
4. A pin that shows continuity with another pin only when the plug is out is the detect switch. Ignore it.
Mark the pins MIC and GND (tape a note on the breadboard).

### 4b. Choose a mic circuit
An earphone mic produces only a few millivolts, and the ESP32's ADC is noisy, so a plain bias circuit works but gives marginal recognition. In order of quality:

**Option 1 (best, about Rs. 150-250):** an electret mic amplifier module (MAX4466 or MAX9814). Use its own mic, or feed your earphone into it as a source: connect VCC to 3V3, GND to GND, OUT to GPIO34. No bias parts needed.

**Option 2 (your parts + one transistor, e.g. BC547/2N2222, about 40x gain):**
```
3V3 --[2.2k]--+------ socket MIC pin           socket GND pin ---- GND
              |
              +--[1 uF]--+--[1 M]--+
                         |         |
                       base      collector --[4.7k]-- 3V3     collector ---- GPIO34
                       emitter -- GND
```
The 1 M resistor between collector and base self-biases the transistor, so the collector rests around 1.5-2.5 V (any value in that range is fine, firmware removes the DC level).

**Option 3 (simplest, weakest):** passive bias
```
3V3 --[2.2k]--+------ socket MIC pin            socket GND pin ---- GND
              +--[10 uF, + toward mic]--+---- GPIO34
                              3V3 --[10k]--+--[10k]-- GND
```
Add a 100 nF capacitor from 3V3 to GND next to the divider. Speak close to the mic. Increase `MIC_GAIN` in `config.h` to 10-12.

### 4c. Calibrate
1. Hold **TALK**, say "What are the hostel fees?" clearly, close to the mic, then release.
2. Open the Serial Monitor: it prints `ADC min/max/p-p`. While speaking, **p-p should be above 200** (Option 1 or 2 gives 500-2500). If it is below 100, check the bias (GPIO34 should read about 1.65 V with the meter on Option 3, about 1.5-2.5 V on Option 2) and the MIC/GND pin identification.
3. On the PC open `server/debug/last_esp.wav` - this is exactly what the server heard. If it is faint or hissy, improve the circuit; if it clips, reduce `MIC_GAIN`.
4. Keep the speaker's volume low and do not speak while the answer is playing (push-to-talk avoids feedback).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Server error -1" | Wrong `SERVER_URL`, firewall, or PC and ESP32 on different networks |
| "Too short - hold longer" | Hold TALK for at least half a second |
| Wrong words heard | Raise p-p (circuit), speak closer, listen to `last_esp.wav`, try `WHISPER_MODEL=small.en` in `.env` |
| Always "I can only answer college questions" | Server log `retrieval ...` line: lower `EMB_MIN_SCORE` / `TFIDF_MIN_SCORE` |
| Answers slow (>15 s) | Use `gemma3:1b`, or the Gemini backend; keep Ollama on the GPU if you have one |
| Random resets when sound plays | Weak USB supply or no 470 uF capacitor on the amp supply |
| Speech sounds harsh or noisy | 8-bit 8 kHz DAC audio is telephone quality; that is expected. Keep volume moderate |
| Screen shows a green dot but no text updates | Open the Serial Monitor to see the HTTP error code |

## Demo-day tips
Put the PC (server) and ESP32 on a phone hotspot to avoid college Wi-Fi restrictions; pre-run each question once so the speech model is warm; keep the `/kiosk` page open on the PC as a backup demo.
