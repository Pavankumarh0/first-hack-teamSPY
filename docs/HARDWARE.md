# Campus Mithra - Hardware setup

The ESP32 is the kiosk's face: it shows the question and answer on the TFT and
speaks the answer through the PAM8403 and speaker. The PC is the brain: it
listens on the earphone mic, runs Sarvam speech-to-text and Gemma, and sends the
text and the speech audio down the USB cable.

```
 earphone mic ──► PC  (Ctrl+Alt+4)
                  pc_client.py ──► server: Sarvam STT ─► Gemma + RAG ─► edge-tts
                       │
                       │ USB serial, 460800 baud
                       ▼
                  ESP32 ──► TFT          question + answer
                        └─► GPIO25 DAC ─► attenuator ─► PAM8403 ─► speaker
```

There is **no microphone and no button on the ESP32** - Ctrl+Alt+4 is a PC
hotkey. **Power the ESP32 from USB only, and never put 5 V on a GPIO pin.**

## Pin map

| ESP32 | Goes to | Notes |
|---|---|---|
| 3V3 | TFT VCC, TFT LED | 3.3 V |
| GND | TFT GND, PAM8403 input GND, PAM8403 power GND | **all grounds joined** |
| GPIO5 | TFT CS | |
| GPIO2 | TFT DC (RS) | |
| GPIO4 | TFT RESET | |
| GPIO23 | TFT SDI (MOSI) | |
| GPIO18 | TFT SCK | |
| GPIO19 | TFT SDO (MISO) | optional |
| GPIO25 | attenuator → PAM8403 L input | DAC 1 |
| VIN (5 V from USB) | PAM8403 5V (+) | see the speaker section |

These TFT pins are the ones already working on this board (the
`espbluetoothspeaker` and `campus test` projects). They are set as build flags in
`firmware/platformio.ini`; the firmware prints them at boot, so a mismatch shows
up in the serial monitor. The TFT's touch pins (`T_*`) stay unconnected.

## Stage 1 - Flash and check the screen

1. VS Code with the **PlatformIO** extension, or the `pio` command line.
2. Plug the ESP32 in (it appears as **COM9**, Silicon Labs CP210x).
3. Close anything holding COM9 - the serial monitor, `pc_client.py`, or the old
   `campus test` scripts. Only one program can have the port.
4. Flash:

   ```powershell
   cd firmware
   pio run -t upload
   ```

5. The TFT shows the Campus Mithra idle screen: a title bar, a **YOU ASKED** panel
   and a **MITHRA** panel. `pio device monitor` shows:

   ```
   [esp] Campus Mithra display + speaker node
   [esp] TFT driver 0x9341 240x320  CS=5 DC=2 RST=4  |  speaker GPIO25 @ 8000 Hz, volume 45
   [esp] ready
   ```

   The first lines of garbage are the ESP32's ROM bootloader printing at 115200;
   that is normal at 460800.

| Screen problem | Fix |
|---|---|
| Blank white | Check VCC, CS, DC, RESET wires |
| Garbled, or colours swapped | It may be an ST7789: `pio run -e mithra_st7789 -t upload` |
| Mirrored / upside down | Change `tft.setRotation(1)` to `3` in `src/main.cpp` |
| Build fails with `CreateProcess: No such file or directory` | The `C:\pio` junction is missing - see the comment at the top of `platformio.ini` |

## Stage 2 - Speaker

The PAM8403 is a 5 V class-D amplifier with about 24 dB of gain. The ESP32 DAC
swings 0-3.3 V, far more than the amp wants, so **attenuate the signal**:

```
GPIO25 ──[10 kΩ pot: ends to GPIO25 and GND, wiper ──► amp L input]
            (or fixed: GPIO25 ─[10 kΩ]─┬─[1 kΩ]─ GND,  junction ──► amp L input)
ESP32 GND ──────────────────────────── amp input GND (middle pin of the input header)
ESP32 VIN (5 V) ──┬──────────────────── amp 5V +
                  └──||── GND           470 µF across the amp's 5V/GND, + to 5V
Speaker ────────── amp L+ and L−
```

**Never connect either speaker wire to GND** - the PAM8403 output is bridged, and
grounding it can destroy the amplifier.

Test it without a server or Gemma:

```powershell
python scripts\esp32_selftest.py --port COM9
```

You should see a question and a long two-page answer on the TFT, hear a chime,
then hear the whole answer spoken, with the page turning halfway through. The
script reports how much audio played and whether the buffer ever ran dry.

| Speaker problem | Fix |
|---|---|
| Distorted or harsh | Turn the pot / amp trimmer down, or pass `--volume 30` |
| Too quiet | Raise the pot first, then `--volume` (max 100) |
| Hiss, or a buzz while audio plays | Weak USB supply: power the amp from a separate 5 V 1 A supply (join its GND to the ESP32 GND) and keep the 470 µF capacitor |
| ESP32 resets when sound starts | Same - the amp is browning out the USB supply |
| Text appears but no sound | The PC needs internet for the edge-tts voice; check the server log for `TTS failed` |

**Multimeter checks (DT830D, DC volts, black probe on GND):**
- Amp 5V pin: about 4.8-5.1 V.
- GPIO25 while idle: about 0 V. The firmware idles the DAC at 0 so no DC sits on
  the amp input between answers, and ramps up to the 1.65 V midpoint before each
  clip, which also stops the click.
- GPIO25 while speaking: averages around 1.6 V.

## Stage 3 - The whole kiosk

1. Start the server: `cd server` then `python app.py`.
2. Start the client from the repo root:

   ```powershell
   python pc_client.py --esp32 COM9
   ```

   It picks a working earphone microphone (judged by real audio level, not the
   Windows default), connects to the ESP32 and waits.
3. Press **Ctrl+Alt+4**, ask "What is the hostel fee?", press **Ctrl+Alt+4** again.
4. The TFT shows your question as soon as Sarvam recognises it, then the answer,
   which is spoken on the kiosk speaker.

| Problem | Fix |
|---|---|
| `Could not open COM9 ... Access is denied` | Something else holds the port - close the serial monitor |
| `did not answer PING` | Flash the firmware (stage 1); check the baud is 460800 on both sides |
| "my thinking engine is not reachable" | Gemma failed - see the server log. With `LLM_BACKEND=gemini`, Google's free tier returns intermittent HTTP 500s; Ollama is the reliable option |
| "my speech service is not working" | Sarvam failed - check `SARVAM_API_KEY` and the network |
| "didn't catch that" | Silence was recorded - check the mic is the one picked, and speak closer |

## Protocol

For anyone extending the firmware: one command per line, PC → ESP32.

| Command | Meaning |
|---|---|
| `Q:<text>` | show the question (and clear the old answer) |
| `A:<text>` | show the answer, paged if long |
| `S:<text>` | title-bar status |
| `AUD:<bytes>` | spoken answer follows: raw unsigned 8-bit mono PCM at 8 kHz |
| `VOL:<0-100>` | speaker volume |
| `CLR` / `BEEP` / `PING` | idle screen / chime / replies `PONG` |

During `AUD`, the ESP32 replies `C:<bytes>` each time it has room for more, and
the PC sends audio only against that credit, so the 16 KB buffer can never
overflow no matter how long the answer. It ends with `DONE:<samples>,<gaps>`.

## The Wi-Fi kiosk variant

`archive/firmware-wifi-kiosk/` holds the campus-saathi firmware, in which the ESP32
records its own ADC microphone on a push button and talks to the server over
Wi-Fi. It needs a mic circuit on GPIO34 and buttons on GPIO27/14 that this build
does not have. The server still serves its `/api/esp/*` endpoints.
