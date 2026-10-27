# Kiosk integration

The physical kiosk is unchanged: the ESP32 in `../firmware` (TFT, INMP441
microphone, MAX98357A speaker, talk button) talks over USB to `pc_client.py`,
which uses the FastAPI server in `../server` to answer from `../kb`. Nothing in
this folder modifies that firmware, its pins or its protocol.

This folder connects the kiosk to the **Campus Mithra platform** (the shared
Firebase data behind the website and the app) from the kiosk **PC**:

```
ESP32 kiosk  --USB serial-->  kiosk PC: pc_client.py  --HTTP-->  server/ (questions, speech)
                                         |
                                         +-- kiosk/campus_api_client.py --HTTPS + device key-->  website /api/kiosk/v1
                                                                                                 (published Firestore data)
```

- The ESP32 never talks to Firebase and holds no credentials.
- The kiosk PC holds one **device key** with read-only access to published
  content (`API_CONTRACT.md`).
- Answers come only from the platform's directory, map, notices and events:
  an unknown place returns "not on the campus map", never an invented one.

## Try it

```bash
export CAMPUS_API_URL=https://campus.example.edu     # or http://localhost:3000
export CAMPUS_KIOSK_KEY=cmk_...                      # Dashboard > Kiosk > Device keys > New key
python kiosk/campus_api_client.py search "placement"
python kiosk/campus_api_client.py directions placement-cell
python kiosk/campus_api_client.py announcements
```

### Show directions on the kiosk screen (no firmware change)

```bash
python kiosk/campus_api_client.py directions library-reading-hall --show-on-kiosk COM9
```

This uses the firmware's existing commands: `Q:` (the question panel),
`R:` (source) and `A:` (the answer, paged on the TFT), the same way
`pc_client.py` shows a spoken answer. Close `pc_client.py` first: only one
program can hold the COM port. **Not tested on the hardware from the cloud
session**; manual check: `docs/TESTING.md`, "Kiosk hardware".

## Next steps (proposals, not implemented)

| Step | Change | Touches firmware? |
|---|---|---|
| Answer "where is X?" by voice | `pc_client.py` / `server/` call `CampusApi.search` + `directions` when the question is about a place, and speak `summary` | No |
| Show a QR code on the TFT | a new `QR:<url>` command drawing `qrUrl` with a QR library | **Yes** - a firmware addition, to be flashed and tested on the board |
| Kiosk notices screen | rotate `announcements` through `A:` while idle | No |

The QR step is the only one that needs new firmware; it is left as a proposal
so the working kiosk is not changed without testing on the device.

## Tests

```bash
python -m unittest discover -s kiosk/tests -v     # client contract against a stub server
```

The live API is covered by `apps/campus_web/e2e/smoke.mjs` (directions,
search, QR URL, refusals) - see `docs/TESTING.md`.
