# RFID attendance - overview

```
student taps card -> RC522 -> Arduino UNO Q --UART--> kiosk ESP32 --USB--> kiosk PC --HTTPS + device key--> backend -> Firestore -> dashboard / app
```

| Document | Covers |
|---|---|
| [RFID_WIRING.md](RFID_WIRING.md) | pins, logic levels, board/core/library setup, flashing each board, backing up the ESP32, serial settings |
| [RFID_PROTOCOL.md](RFID_PROTOCOL.md) | the `RFID:<UID>` frame, validation, debounce, the ESP32 -> PC line, versioning |
| [RFID_BACKEND.md](RFID_BACKEND.md) | data model, scan API, card registration, authorization, privacy, setup |
| [RFID_TESTING.md](RFID_TESTING.md) | acceptance status, what ran, step-by-step hardware checks with expected output |
| [RFID_TROUBLESHOOTING.md](RFID_TROUBLESHOOTING.md) | symptom -> cause -> fix, per hop |

**Status (2026-10-27):** the software for every hop is written. The parts
that run without hardware are tested (protocol and receiver on a PC, backend
and dashboard on the Firebase emulators, the app against the emulators). The
physical chain - UNO Q build, RC522 reads, the UART wire, the ESP32 build and
the kiosk regression check - has **not** been run yet; follow
RFID_TESTING.md levels 1, 2, 4 and 5. No attendance record has been created
from a physical card.
