# Campus Mithra - camera node

A second ESP32 DevKit V1 (WROOM, no PSRAM) with an OV7670 camera (no FIFO).
It has its own USB cable to the PC and its own firmware. The kiosk board, its
firmware in `../firmware` and `pc_client.py` are not touched by anything here.

Every pin is in [campus_mithra_cam/cam_config.h](campus_mithra_cam/cam_config.h):

| OV7670 | ESP32 | | OV7670 | ESP32 |
|---|---|---|---|---|
| SIOD (SDA) | GPIO26, 4.7k to 3V3 | | D0 / D1 / D2 / D3 | GPIO4 / 5 / 18 / 19 |
| SIOC (SCL) | GPIO27, 4.7k to 3V3 | | D4 / D5 / D6 / D7 | GPIO36 / 39 / 34 / 35 |
| XCLK | GPIO21 | | RESET (RET) | GPIO32 |
| VSYNC (VS) | GPIO25 | | PWDN | GND |
| HREF (HS) | GPIO23 | | 3V3 / GND | 3V3 / GND |
| PCLK | GPIO22 | | | |

**3.3 V only.** Keep the XCLK and PCLK wires short, and away from the kiosk's
INMP441 microphone.

## Flash

Set `upload_port` in [platformio.ini](platformio.ini) to the camera board's
port, then `pio run -t upload`. Upload is refused when no port is set, and when
the port is the kiosk's (COM9), whether it comes from the ini, `--upload-port`
or the VS Code port picker. Arduino IDE has no such guard: check the port twice.

## Bring-up, in order

Each step needs the one before it. `cam_grab.py` needs `numpy` and `pyserial`,
both already in the top-level `requirements.txt`.

| # | Do | Pass |
|---|---|---|
| 1 | `pio run` | builds: the bundled esp32-camera driver includes the OV7670 |
| 2 | flash, `pio device monitor` | SCCB table ends `VERDICT: OV7670 confirmed (PID 0x76 VER 0x73)` |
| 3 | `cam_grab.py --port COMx --send INFO` | camera running; note the largest free block |
| 4 | `--send "BARS 1" --send STATS` | `data bus OK: all 8 lines toggle` |
| 5 | `cam_grab.py --port COMx --bars` | the PNG shows 8 clean vertical colour bars |
| 6 | `--no-bars`, then again with the lens covered | a real scene; covered = dark |
| 7 | `--fmt GRAY --res QVGA`, then `--res QCIF` | each starts, or says why not |
| 8 | `--no-bars --count 50` | `50/50 frames intact` |
| 9 | both boards plugged in: `python scripts\esp32_selftest.py --port COM9`, then `.\start.ps1` and ask a question | the kiosk works exactly as before; `server/debug/last_kiosk_mic.wav` has no new hum |

PNGs go to `camera/captures/` (not committed). Colours wrong in step 5 (bars in
the wrong order or tinted)? Try `--swap-bytes` for RGB565, or `--uyvy` for YUV422.

| Problem | Look at |
|---|---|
| `nothing answers at 0x21` | 3V3, GND, SDA/SCL swapped, RESET low, PWDN not at GND |
| ACK but no valid ID | RESET floating, XCLK not reaching the camera |
| `no frame after ... ms` | VSYNC, HREF, PCLK, XCLK wiring; try `CAM_XCLK_HZ` 12-16 MHz |
| a data line `stuck` with bars on | that wire (the message names the GPIO) |
| `hash mismatch` / `lost sync` | USB cable, or another program on the port |
| `answered plain PONG` | that is the kiosk's port |
