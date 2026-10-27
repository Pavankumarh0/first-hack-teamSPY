# RFID wiring and board setup

```
RC522 --SPI--> Arduino UNO Q --UART (D1 -> GPIO16), one way--> kiosk ESP32 --USB--> kiosk PC --HTTPS--> backend
```

The camera is not part of this. Nothing here changes the kiosk's TFT,
microphone, amplifier or button wiring.

## RC522 -> Arduino UNO Q (unchanged from the working test)

| RC522 | UNO Q | UNO Q MCU pin | Notes |
|---|---|---|---|
| SDA / SS | D10 | PB9 | chip select (driven by the MFRC522 library) |
| SCK | D13 | PB13 | SPI2 SCK |
| MOSI | D11 | PB15 | SPI2 MOSI |
| MISO | D12 | PB14 | SPI2 MISO |
| RST | D9 | PB8 | reset |
| VCC | **3.3V** | | **never 5V** - the RC522 is a 3.3 V part |
| GND | GND | | |
| IRQ | - | | not connected |

D10-D13 are the UNO Q's `SPI` (SPI2) in the Zephyr board definition
(`spi2_sck_pb13 / miso_pb14 / mosi_pb15 / nss_pb9`), which is why the tested
mapping works unchanged. Checked against the ArduinoCore-zephyr variant
`arduino_uno_q_stm32u585xx` and Zephyr's `boards/arduino/uno_q` (October 2026).

## UNO Q -> ESP32 (one way, first milestone)

| UNO Q | ESP32 DevKit V1 | Why |
|---|---|---|
| D1 / TX (PB6, USART1 TX = `Serial1`) | **GPIO16** (UART2 RX) | card frames, 115200 8N1 |
| GND | GND | common reference - required |
| D0 / RX | - | leave disconnected (no reverse channel yet) |
| 5V / 3.3V | - | **do not connect** the boards' power pins together |

- **Logic levels:** D1 is driven by the UNO Q's STM32U585 MCU, a 3.3 V
  device, and the ESP32's GPIO16 is 3.3 V, so a direct wire is expected to be
  safe. **Check before connecting the ESP32:** with the sender running,
  measure D1 to GND with a multimeter - idle UART is high, so it should read
  about 3.3 V. If it reads about 5 V, stop and add a level shifter or a
  divider (e.g. 1 kOhm series + 2 kOhm to GND).
- **Why GPIO16:** the kiosk firmware uses GPIO 2, 4, 5, 18, 19, 23 (TFT),
  14, 15, 32 (INMP441), 22, 25, 26 (MAX98357A), 27 (button) and 1/3 (USB
  serial to the PC). GPIO16 is used by nothing (checked in
  `firmware/include/config.h`, `platformio.ini` and `firmware/src/main.cpp`).
  The receiver attaches **RX only**; UART2's TX is never routed, so GPIO17
  stays free.
- **Module check:** this assumes the DevKit V1's **ESP32-WROOM-32** (printed
  on the metal can). On an ESP32-**WROVER** module GPIO16/17 belong to PSRAM -
  then pick another free input pin and change `RFID_RX_PIN` in `config.h`.
- **Power:** each board on its own USB supply is fine; only GND is shared.

## Kiosk pin map after this change

| Function | Pins |
|---|---|
| TFT (SPI) | MOSI 23, SCLK 18, CS 5, DC 2, RST 4, MISO 19 |
| INMP441 (I2S0) | SCK 14, WS 15, SD 32 |
| MAX98357A (I2S1) | BCLK 26, LRC 25, DIN 22 |
| Talk button | 27 |
| USB serial to PC | 1 (TX), 3 (RX) - 921600 baud |
| **RFID link (UART2 RX)** | **16** - 115200 baud |

## Flashing the UNO Q (sender)

Sketch: `rfid/uno_q_rfid_sender/` (`uno_q_rfid_sender.ino` + `rfid_sender_core.h`).

**Arduino IDE 2**
1. Boards Manager: install **Arduino UNO Q Board** (core `arduino:zephyr`).
   Note the installed version (Tools > Board > Boards Manager) - the pin
   mapping above was checked against the core's current sources.
2. Library Manager: install **MFRC522** (by GithubCommunity, 1.4.x - the one
   your working test uses) and **Arduino_RouterBridge** (provides `Monitor`,
   the UNO Q's `Serial`; installs Arduino_RPClite with it).
3. Tools > Board > **Arduino UNO Q**. Leave Tools > *Wait for Linux* at its
   default. Use the **Default** (not Debug) build mode: Debug waits for the
   Zephyr shell on USART1 - the same pin that feeds the ESP32.
4. Upload. Open the Serial Monitor: you should see the `[rfid]` lines below.

**Arduino App Lab** - create an App, put `uno_q_rfid_sender.ino` and
`rfid_sender_core.h` in its `sketch/` folder, add MFRC522 to the sketch's
libraries, run. The `[rfid]` lines appear in the App's console.

**arduino-cli**
```bash
arduino-cli core install arduino:zephyr
arduino-cli lib install MFRC522 Arduino_RouterBridge
arduino-cli compile -b arduino:zephyr:unoq rfid/uno_q_rfid_sender
arduino-cli upload  -b arduino:zephyr:unoq -p <port> rfid/uno_q_rfid_sender
```

## Flashing the ESP32 (kiosk firmware, with the receiver)

Back up the board first (below), then as before:
```powershell
cd firmware
pio run                 # build - must succeed before anything is flashed
pio run -t upload       # COM9 as configured in platformio.ini
pio device monitor      # 921600 baud; close it before starting pc_client.py
```
`RFID_ENABLED 0` in `config.h` (or `-D RFID_ENABLED=0` in `build_flags`)
builds the kiosk exactly as it was, without the receiver.

### Back up and restore the ESP32

The source is in git, so the old firmware can always be rebuilt
(`git checkout <commit> -- firmware`). A byte-for-byte copy of the board is
still the safest fallback:

```powershell
# PlatformIO's bundled esptool (no extra install). Close every serial monitor first.
pio pkg exec -p tool-esptoolpy -- esptool.py --chip esp32 --port COM9 flash_id      # note the flash size (DevKit V1: 4MB)
pio pkg exec -p tool-esptoolpy -- esptool.py --chip esp32 --port COM9 read_flash 0 0x400000 kiosk-backup-2026-10-27.bin
# restore
pio pkg exec -p tool-esptoolpy -- esptool.py --chip esp32 --port COM9 write_flash 0 kiosk-backup-2026-10-27.bin
```
Use the size `flash_id` reports (0x400000 = 4MB). Keep the `.bin` outside
the repository.

## Serial monitor settings

| Port | Settings | Shows |
|---|---|---|
| ESP32 USB (COM9) | 921600 baud | `[esp] rfid: ...` lines (and the kiosk protocol) |
| UNO Q | IDE/App Lab monitor (an RPC channel, no baud rate) | `[rfid] ...` lines |
| USB-UART adapter on GPIO16 (testing only) | 115200 8N1 | what the ESP32 receives |
