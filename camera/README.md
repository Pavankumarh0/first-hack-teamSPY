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
port, then `pio run -t upload`. Before flashing, the upload asks the board on
that port what it is (it sends `INFO`): the camera answers `[cam] ...` and is
flashed; the kiosk answers `ERR:unknown command` and is refused, whatever its
COM number. Windows can give both boards COM9 when they use the same USB socket
one after the other, which is why the port number alone is not trusted.

A blank camera board answers nothing. On any port but COM9 it is flashed; on
COM9 it is refused unless you confirm that only the camera is plugged in:

```powershell
$env:CAM_FLASH_UNKNOWN=1; pio run -t upload; Remove-Item Env:CAM_FLASH_UNKNOWN
```

After the first flash the board answers as the camera and the override is not
needed again. Close `pc_client.py` and any serial monitor first, so the port
can be opened. Arduino IDE has no such check: check the port twice there.

If the camera takes COM9, the kiosk will get another number when both are
plugged in, and `start.ps1` (COM9 by default) will find the camera instead -
`pc_client.py` then reports no kiosk. Run `.\start.ps1 -Port COMx` with the
kiosk's port, or give the camera its own number in Device Manager (Ports >
the camera's port > Properties > Port Settings > Advanced > COM Port Number).

## Live view in a browser

The camera serves its own page over Wi-Fi. No PC software is needed.

1. **Your Wi-Fi (recommended):** copy `campus_mithra_cam/secrets.h.example` to
   `secrets.h` and fill in the network name and password (2.4 GHz only;
   `secrets.h` is never committed). Flash, then open the address the serial log
   prints, e.g. `[cam] wifi: on "HomeWiFi" connected ... -> http://192.168.1.42/`,
   or <http://mithra-cam.local/> (works on most laptops and iPhones, not always on Android).
2. **No router:** without `secrets.h`, or if joining fails within 15 s, the
   camera starts its own hotspot. Join **CampusMithra-Cam** (password
   `mithracam`) and open <http://192.168.4.1/>.

The page shows the live picture with its size, format and frame rate, and has
buttons for pause, save picture (PNG), colour bars, frame size and format. The
serial `WIFI` command prints the address again. Expect a few frames per second
at QQVGA: the OV7670 has no JPEG, so every frame travels uncompressed. Names,
password and timeout are in `cam_config.h`.

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
| 8b | open the page from "Live view in a browser" | moving picture, frame rate shown, no "No picture" message |
| 9 | both boards plugged in: `python scripts\esp32_selftest.py --port COM9`, then `.\start.ps1` and ask a question | the kiosk works exactly as before; `server/debug/last_kiosk_mic.wav` has no new hum |

PNGs go to `camera/captures/` (not committed). Colours wrong in step 5 (bars in
the wrong order or tinted)? Try `--swap-bytes` for RGB565, or `--uyvy` for YUV422.

| Problem | Look at |
|---|---|
| `nothing answers at 0x21` | 3V3, GND, SDA/SCL swapped, RESET low, PWDN not at GND |
| ACK but no valid ID | RESET floating, XCLK not reaching the camera |
| `no frame after ... ms` | VSYNC, HREF, PCLK, XCLK wiring; try `CAM_XCLK_HZ` 12-16 MHz |
| `cam_hal: FB-SIZE: 30720 != 38400` (seen with `LOG 1`) | the wiring is fine; the sensor's picture window is short. At boot the firmware extends it until frames arrive (`frames OK`). If it cannot, share the output of `REGS` |
| a data line `stuck` with bars on | that wire (the message names the GPIO) |
| `hash mismatch` / `lost sync` | USB cable, or another program on the port |
| `answered plain PONG` | that is the kiosk's port |
| page does not open | same network as the camera? try the IP instead of `.local`; `WIFI` on the serial port |
| `could not join` at boot | 5 GHz network, or a typo in `secrets.h` - it falls back to the hotspot |
