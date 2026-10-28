# RFID link protocol (version 1)

> **Turned off for now.** RFID attendance is switched off in the kiosk firmware, the kiosk PC, the website and the app; its code is kept (the reader sketch and tests are in `archive/rfid/`). docs/ARCHITECTURE.md, "Turning RFID attendance back on", lists the switches.

Three hops, each with its own format:

| Hop | Wire | Format | Code |
|---|---|---|---|
| UNO Q -> ESP32 | UART 115200 8N1, D1 -> GPIO16, one way | `RFID:<UID>\n` | `archive/rfid/uno_q_rfid_sender/`, `firmware/include/rfid_frame.h` |
| ESP32 -> kiosk PC | the existing USB link, 921600 | `RFID:<UID> age=<ms>\n` | `firmware/src/main.cpp`, `pc_client.py` |
| kiosk PC -> backend | HTTPS + device key | `POST /api/attendance/v1/scan` | `kiosk/rfid_bridge.py`, docs/RFID_BACKEND.md |

## 1. UNO Q -> ESP32

One ASCII line per tap:

```
RFID:A3:2F:91:0C\n
```

| Part | Rule |
|---|---|
| prefix | exactly `RFID:` (uppercase) |
| UID | 4, 7 or 10 bytes (ISO 14443-A single, double, triple size), each as **two uppercase hex digits**, joined by `:` - so 11, 20 or 29 characters |
| end | `\n`; a `\r` before it is ignored |
| length | at most 35 bytes; the receiver discards any line over 64 characters whole |
| characters | printable ASCII only (0x20-0x7E); a line with anything else is discarded |

Examples: `RFID:A3:2F:91:0C`, `RFID:04:5A:1B:2C:3D:80:01`.
Rejected: `RFID:a3:2f:91:0c` (lowercase), `RFID:A3:2F:91` (3 bytes),
`RFID:A3-2F-91-0C`, `RFID: A3:2F:91:0C`, anything over 64 characters.

**Optional status line** (extension point): `HELLO:RFID/1 reader=ok` or
`HELLO:RFID/1 reader=missing`, sent at boot, when the reader recovers, and
every 30 s. The ESP32 only logs it.

**Versioning:** `RFID/1` in the hello names this format. A future format uses
a new prefix (for example `RFID2:`), which version-1 receivers ignore as "not
a frame", so sender and receiver can be upgraded one at a time.

### Sender rules (UNO Q)

- Polls the RC522 every 50 ms with WUPA, so a card left on the reader is still
  seen (REQA would not wake a halted card).
- **One event per tap:** a card resting on the reader is sent once. It counts
  as removed after 700 ms unseen; the same card is not re-sent within 1.5 s of
  its last frame (quick lift-and-replace). A different card is sent at once.
- Each frame goes out in a single `Serial1.write()`. Diagnostics go to
  `Monitor` (the UNO Q's `Serial`, an RPC channel through the Linux side) -
  never to `Serial1`.
- Checks the RC522's VersionReg every 5 s; `0x00`/`0xFF` means it stopped
  answering, and the sender re-initialises it.

### Receiver rules (ESP32)

- UART2, RX on GPIO16 only, 1024-byte buffer, read at most 64 bytes per loop
  pass - never blocks the audio, display or button.
- Byte-by-byte state machine (`rfidlink::LineParser`): an over-long line is
  dropped whole; a partial line left unfinished for 1 s is dropped (a cut
  cable or a reset mid-frame) so it cannot glue onto the next one.
- **Expect noise at power-up:** Zephyr uses USART1 (D0/D1) as its console, so
  the UNO Q's boot messages arrive on GPIO16 too. They fail validation and
  are counted, with at most one `[esp] rfid: ignored N line(s)` log line per
  second.
- The same UID again within 2 s counts as one tap (`RFID_SAME_CARD_MS`).
- Valid taps call `onRfidCardDetected(uid)` in `main.cpp` - the extension
  point for anything else a tap should do.

## 2. ESP32 -> kiosk PC

The kiosk's USB link already carries text lines and binary audio packets
(`firmware/src/main.cpp` header). Taps are added as one more line type:

```
RFID:A3:2F:91:0C age=1200
```

`age` is how many milliseconds the tap waited on the ESP32. Taps are queued
(8 slots, oldest dropped first) and sent **only while the kiosk is idle and
pc_client's main loop is alive** (it sends `HB` every 2 s): while the PC is
fetching or playing an answer it reads no lines and discards its input before
playback, so a tap sent then would be lost. Taps older than 120 s are dropped
with a log line rather than recorded late.

For humans, the ESP32 also logs:

```
[esp] rfid: UART2 RX=GPIO16 115200 baud (receive only)
[esp] rfid: sender says RFID/1 reader=ok
[esp] rfid: card A3:2F:91:0C
[esp] rfid: repeat of A3:2F:91:0C ignored
[esp] rfid: ignored 3 line(s), last: not a frame
[esp] rfid: queue full, dropped A3:2F:91:0C
[esp] rfid: A3:2F:91:0C waited too long, dropped
```

## 3. Kiosk PC -> backend

`pc_client.py` passes `RFID:` lines to `kiosk/rfid_bridge.py`, which posts
them from a background thread (the kiosk loop never waits on the network):

```http
POST /api/attendance/v1/scan
Authorization: Bearer cmk_...
Content-Type: application/json

{"cardUid": "A3:2F:91:0C", "ageMs": 1250}
```

The answer's `display` text (at most 30 characters, e.g. `Checked in: Asha`)
is shown in the kiosk's title bar with the existing `S:` command - no new
firmware command. Network errors and 5xx are retried twice (2 s, 4 s); a
retried request cannot create a second record. Logs on the PC show only the
last two UID bytes (`**:**:91:0C`). Full contract: docs/RFID_BACKEND.md.

## Security notes

- A UID is an identifier, not a secret: common cards can be cloned. Treat a
  scan as "this card was presented", never as proof of identity.
- No hop carries a student id. The backend maps the card to a student.
- The UART link is unauthenticated by design (two boards on one bench); the
  trust boundary is the device key between the kiosk PC and the backend.
