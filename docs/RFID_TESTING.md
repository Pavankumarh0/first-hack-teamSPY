# RFID testing

> **Turned off for now.** RFID attendance is switched off in the kiosk firmware, the kiosk PC, the website and the app; its code is kept (the reader sketch and tests are in `archive/rfid/`). docs/ARCHITECTURE.md, "Turning RFID attendance back on", lists the switches.

Work up the levels in order; each one isolates one hop, so a failure points at
one place. Levels 0 and 3 ran in the development session (no hardware there).
**Levels 1, 2, 4 and the hardware half of 5 have not been run** - they need
the boards on your desk.

## Acceptance criteria - status

| # | Criterion | Status |
|---|---|---|
| 1 | UNO Q sketch builds for the board | **pending** - the UNO Q toolchain could not be downloaded in the cloud session. Its board-independent code (`rfid_sender_core.h`) is compiled and tested on a PC. Build: docs/RFID_WIRING.md |
| 2 | RC522 initialises and detects cards | **pending hardware** (level 1) |
| 3 | each scan gives one well-formed UART frame | logic verified on PC (level 0); on the wire: **pending** (level 2/3) |
| 4 | ESP32 parses without blocking the kiosk loop | receiver code verified on PC with Arduino stand-ins (level 0); on the board: **pending** (level 2) |
| 5 | existing ESP32 firmware still builds, other functions intact | **pending**: `pio run` could not run (PlatformIO's registry is blocked in the cloud session). `main.cpp` and the receiver pass a syntax/type check against stand-in headers with no warnings; the change only adds code. Build and the kiosk regression check: level 2 |
| 6 | invalid messages ignored safely | verified on PC (level 0, incl. AddressSanitizer/UBSan) |
| 7 | duplicate scans handled | verified: sender debounce, receiver 2 s window (level 0), backend one-record-per-session (level 3) |
| 8 | backend validates the card before recording | verified on the emulators (level 3) |
| 9 | dashboard reads real backend data | verified on the emulators (level 3) |
| 10 | missing credentials give clear instructions | verified: `/api/health`, dashboard checklist, `pc_client` "RFID attendance: off (set CAMPUS_API_URL ...)" |
| 11 | no camera integration | verified: no camera code or pins in this change |
| 12 | hardware tests marked pending | this table |

## Level 0 - no hardware (ran here, 2026-10-27)

| Command | Result |
|---|---|
| `bash archive/rfid/tests/run.sh` | protocol 31/31, receiver 18/18 (g++ 13, `-Wall -Wextra -Werror`, ASan + UBSan) |
| `python -m unittest discover -s kiosk/tests` | 18/18 (bridge + the real `pc_client.run_button_mode` loop with a fake ESP32) |

`archive/rfid/tests/run.sh` feeds frames made by the **sender's own code** into the
**ESP32's own parser** byte by byte, plus Zephyr boot noise, binary garbage,
lowercase/short/long UIDs, CRLF, split reads, cut-off frames, and the
one-event-per-tap state machine. It also runs `firmware/src/rfid_receiver.cpp`
itself against Arduino stand-ins: UART2 with RX 16 and TX -1, buffer set
before `begin()`, at most 64 bytes per poll, the 2 s repeat window, the log
lines.

## Level 1 - UNO Q + RC522 alone (pending)

Flash `archive/rfid/uno_q_rfid_sender` (docs/RFID_WIRING.md). Do not connect the
ESP32 yet. In the UNO Q's monitor:

```
[rfid] Campus Mithra RFID sender - UNO Q, protocol RFID/1
[rfid] link: Serial1 D1/TX 115200 8N1 -> ESP32 GPIO16
[rfid] RC522 ok, version 0x92            (0x91, 0x92, 0x88 or 0x12 are all fine)
```

- [ ] Tap a card: `[rfid] sent #1: RFID:A3:2F:91:0C` - **once**.
- [ ] Leave it on the reader for 10 s: no further lines.
- [ ] Remove it: `[rfid] card removed - ready for the next tap`. Tap again: `sent #2`.
- [ ] Two different cards one after the other: two lines, two UIDs.
- [ ] Note each card's UID - you can register cards with it.
- [ ] Pull the RC522's 3.3V wire: within 5 s `reader stopped answering`, then
      `RC522 NOT FOUND`. Reconnect: `reader is back`.

## Level 2 - ESP32 receiver alone (pending)

1. Back up the ESP32 (docs/RFID_WIRING.md), then `cd firmware && pio run`
   (must build) and `pio run -t upload`.
2. `pio device monitor` (921600). At boot, after the existing lines:
   `[esp] rfid: UART2 RX=GPIO16 115200 baud (receive only)`.
3. **Kiosk regression** - with `pc_client.py` (close the monitor first):
   - [ ] idle screen and title bar as before
   - [ ] hold the button, ask, release: recording, answer on the TFT, speech
         on the speaker, pages turn - exactly as before
   - [ ] `BEEP`, volume, "PC offline" when pc_client stops - as before
4. **Receiver without the UNO Q:** a 3.3 V USB-UART adapter, TX -> GPIO16,
   GND -> GND:
   ```bash
   python archive/rfid/tools/send_test_frames.py --port COM12
   ```
   Expected in the ESP32 monitor, in order: `ignored 1 line(s), last: not a
   frame`, `sender says RFID/1 reader=ok`, `card A3:2F:91:0C`, `repeat of
   A3:2F:91:0C ignored`, an `ignored` line for the bad UID / too long, `card
   04:5A:1B:2C:3D:80:01`.
   - [ ] then, during a spoken answer: `send_test_frames.py --port COM12
         --uid A3:2F:91:0C --repeat 5 --gap 3` - speech plays without a
         glitch, and each tap is logged.

## Level 3 - backend and dashboard without hardware (ran here, 2026-10-27)

| Command | Result |
|---|---|
| `cd firebase && npm test` | 25/25 rules tests (records/cards/log backend-only; students read only their own records; session validation) |
| `cd apps/campus_web && npm test` | 19/19 (incl. card hint, session choice, kiosk text fits 30 ASCII characters) |
| `cd apps/campus_web && npm run e2e` | 21/21, of which 7 RFID: refused while off -> admin turns on + opens a session on a reader -> unknown card refused and listed (raw UID never on the page) -> admin assigns it -> `201 checked_in` ("Checked in: Demo", a forged `studentId` ignored) then `200 already_checked_in` -> one verified record + scan log in the dashboard -> student cannot register cards, no key = 401, deactivated card = 404 |
| `cd apps/student_mobile && bash tool/web_smoke.sh` | 3/3: a check-in made through the scan API shows in the app under My attendance |

Uses the emulators and a throwaway `RFID_UID_HMAC_SECRET` generated per run.

## Level 4 - two boards (pending)

1. Wire UNO Q D1 -> ESP32 GPIO16 and GND -> GND only. Multimeter first: D1
   idles at about 3.3 V (docs/RFID_WIRING.md).
2. Power both. In the ESP32 monitor some `ignored ... not a frame` lines at
   UNO Q boot are normal (Zephyr console), then `sender says RFID/1 reader=ok`.
3. - [ ] Tap: `[esp] rfid: card A3:2F:91:0C` - the same UID the UNO Q logged.
   - [ ] Card resting on the reader: one line only.
   - [ ] 20 taps in a row, alternating two cards: 20 `card` lines, no `ignored`.
   - [ ] Reset the UNO Q mid-session: the kiosk keeps working; taps resume.

## Level 5 - the whole chain (pending)

1. Website reachable from the kiosk PC, with `RFID_UID_HMAC_SECRET` set;
   rules/indexes deployed (docs/RFID_BACKEND.md, setup).
2. `kiosk/.env` from `kiosk/.env.example`; start `pc_client.py` /
   `start.ps1`. It prints `RFID attendance: on, https://.../api/attendance/v1/scan`.
3. Dashboard: a session open now with this reader ticked; check-ins on.
4. - [ ] Unregistered card: title bar `Card not registered`; it appears
         under Cards > Tapped, not registered. Assign it.
   - [ ] Tap again: `Checked in: <name>`; pc_client prints
         `attendance: card **:**:91:0C -> checked_in`.
   - [ ] Records tab shows it; the student sees it in the app (Profile > My attendance).
   - [ ] Tap again: `Already in: <name>`; still one record; Scan log shows the repeat.
   - [ ] Tap while Mithra is speaking: the answer plays undisturbed; the
         result appears in the title bar after it (record shows "tapped ~N s earlier" if > 5 s).
   - [ ] No session open: `No class open now`. Check-ins off: `Attendance is off`.
   - [ ] Deactivate the card: next tap `Card not registered`.
   - [ ] Unplug the kiosk PC's network: `Attendance offline` after the retries (about 6 s, up to ~25 s if requests hang); the kiosk keeps answering questions.
   - [ ] Revoke the device key: pc_client prints `http_401`.
