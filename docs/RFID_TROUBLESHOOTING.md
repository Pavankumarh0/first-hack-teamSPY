# RFID troubleshooting

> **Turned off for now.** RFID attendance is switched off in the kiosk firmware, the kiosk PC, the website and the app; its code is kept (the reader sketch and tests are in `archive/rfid/`). docs/ARCHITECTURE.md, "Turning RFID attendance back on", lists the switches.

Find the first hop where the tap disappears: UNO Q monitor (`[rfid]`) ->
ESP32 monitor (`[esp] rfid:`) -> pc_client window (`attendance:`) ->
Dashboard > RFID attendance > Scan log.

## UNO Q / RC522

| Symptom | Likely cause | Fix |
|---|---|---|
| `RC522 NOT FOUND (version 0x0)` or `0xFF` | SPI wiring, no 3.3 V, wrong SS/RST pin | check SDA/SS D10, SCK D13, MOSI D11, MISO D12, RST D9, VCC on **3.3V**, GND |
| version `0x88` / `0x12` | clone chip | fine - these work |
| no `[rfid]` lines at all | Monitor not connected, or sketch built in **Debug** mode (waits for the Zephyr shell) | open the IDE/App Lab monitor; build in Default mode |
| compile error: `Monitor` not declared | Arduino_RouterBridge missing | Library Manager > Arduino_RouterBridge |
| card read only very close / not at all | weak antenna field, metal nearby | keep the RC522 off metal; try another card (some fobs are 125 kHz - the RC522 reads 13.56 MHz only) |
| one card sends repeatedly | it is on the edge of the field, flickering in and out for more than 0.7 s | place it flat in the middle; raise `REMOVAL_MS` |
| a second tap of the same card is ignored | within `RETAP_MS` (1.5 s) | wait, or lower it |

## UNO Q -> ESP32 link

| Symptom | Likely cause | Fix |
|---|---|---|
| UNO Q logs `sent`, ESP32 shows nothing | wire on the wrong pin, no common GND | D1 (TX) -> GPIO16; GND to GND. D0 is RX - not used |
| ESP32 shows `ignored ... not a frame` at UNO Q boot | Zephyr's console shares USART1 | normal, harmless |
| `ignored ... bad characters` / `bad UID` on every tap | baud mismatch or noise | both 115200 (`LINK_BAUD`, `RFID_BAUD`); keep the wire short; shared GND |
| `ignored ... cut off` | frame interrupted (UNO Q reset, loose wire) | check the connection |
| nothing at all, even from `send_test_frames.py` | firmware without the receiver, or `RFID_ENABLED 0` | boot log must show `[esp] rfid: UART2 RX=GPIO16`; reflash |
| GPIO16 seems dead | ESP32-WROVER module (PSRAM on 16/17) | use another free input pin, set `RFID_RX_PIN` |

## ESP32 -> kiosk PC

| Symptom | Likely cause | Fix |
|---|---|---|
| ESP32 logs `card ...`, pc_client shows nothing | pc_client not running in button mode, or the kiosk was busy | taps are held while busy and sent once idle; they need pc_client's heartbeat. Check `[esp] rfid: ... waited too long` / `queue full` |
| `kiosk: card tapped - not recorded: set CAMPUS_API_URL ...` | kiosk PC not configured | `kiosk/.env` from `kiosk/.env.example` |
| `pio device monitor` and pc_client at once | only one program can own COM9 | close the monitor |

## Kiosk PC -> backend

| pc_client / kiosk title bar | Meaning | Fix |
|---|---|---|
| `Attendance offline` | network down, wrong URL, server error - or the server's `RFID_UID_HMAC_SECRET` is missing (it answers 503, which is retried) | check `CAMPUS_API_URL`; open `<url>/api/health` from the kiosk PC: `rfidAttendance.cardSecret` must be `set` |
| `http_401` / "Unknown or revoked device key" | key wrong or revoked | new key in Dashboard > Kiosk |
| `http_403` / "not allowed to use attendance" | key lacks the capability | create a key with **Submit RFID check-ins** |
| `Attendance is off` | check-ins switched off | Dashboard > RFID attendance > Sessions & settings |
| `No class open now` | no session open now with this reader ticked | add/adjust a session; tick the reader |
| `Card not registered` | card unknown or deactivated | Cards > Tapped, not registered > Assign |
| `Card blocked - see office` | the student's account is suspended | Dashboard > Users |
| `http_429` | over 60 scans a minute from one reader | a stuck card or a fault - check the reader |

## Dashboard / app

| Symptom | Fix |
|---|---|
| list says the data is "still being prepared" | new Firestore indexes are building after `npm run deploy:rules`; wait a few minutes |
| all cards became "Card not registered" | `RFID_UID_HMAC_SECRET` changed - restore it, or re-register the cards |
| a student sees no records in the app | records belong to the account the card is registered to - check Cards |
