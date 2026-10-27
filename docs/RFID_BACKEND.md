# RFID attendance backend

Same Firebase project, same trusted backend (the website's API routes,
`apps/campus_web`), same device keys as the kiosk API. Code:
`src/lib/server/attendance.ts`, `src/app/api/attendance/v1/scan`,
`src/app/api/admin/rfid-cards`, rules in `firebase/firestore.rules`.

## Who can do what

| Actor | Holds | Can |
|---|---|---|
| UNO Q, ESP32 | nothing | read a card / pass the UID on. No keys, no network, no Firebase. |
| Kiosk PC | one **device key** with the `attendance` capability (`kiosk/.env`) | `POST /api/attendance/v1/scan` - say "this card was tapped" |
| Backend | Firebase Admin (Application Default Credentials) + `RFID_UID_HMAC_SECRET` | decide whose card it is, whether they may check in, for which session; write records |
| Administrator | signed-in account with role `admin` | register / deactivate cards, manage sessions, read everything |
| Student | own account | read **their own** records (app: Profile > My attendance) |

No client can write `rfidCards`, `attendanceRecords` or `attendanceAudit`
(`allow write: if false`); 25 rules tests cover this. The device key is
hashed at rest (SHA-256), can be revoked in Dashboard > Kiosk, and grants no
Firebase access of any kind.

## Data model

| Collection | Document id | Fields | Read |
|---|---|---|---|
| `rfidCards` | `HMAC-SHA256(secret, UID)` | studentId, studentUsername, studentName, cardHint (`91:0C`), label, active, registeredAt, registeredBy, updatedAt | admin |
| `attendanceSessions` | auto | title, course, startsAt, endsAt, **readerIds** (device ids), createdAt, updatedAt | admin |
| `attendanceRecords` | `<sessionId>_<studentId>` | sessionId, sessionTitle, course, studentId, studentUsername, studentName, readerId, readerName, method `rfid`, cardHint, checkInAt (server time), deviceDelayMs | admin; the student it belongs to |
| `attendanceAudit` | auto | result, readerId, readerName, cardKey, cardHint, sessionId, studentId, studentUsername, deviceDelayMs, byAdmin, at | admin |
| `settings/attendance` | - | enabled (default off), duplicateWindowMinutes, status | admin |

- **No raw UID is stored anywhere** - not in cards, records, the log or
  server logs. Only its keyed hash (the card's document id) and the last two
  bytes for display. Without `RFID_UID_HMAC_SECRET` a stored key cannot be
  matched to a UID.
- No password, token or device key is stored in any attendance document.
- One record per student per session, by construction (document id +
  `create()`), so double taps, two readers or a retried request never make
  two records.

## Scan: `POST /api/attendance/v1/scan`

```http
Authorization: Bearer cmk_<device key with "attendance">
Content-Type: application/json

{"cardUid": "A3:2F:91:0C", "ageMs": 1250}
```

| Field | |
|---|---|
| `cardUid` | required; any common notation (`A3:2F:91:0C`, `a32f910c`) |
| `ageMs` | optional, 0-600000: how long the tap waited at the kiosk (stored, capped at 120 s) |
| `sessionId` | optional; normally omitted - the session is the one **open now** on this reader (latest-started if several overlap) |

Anything else in the body (e.g. a `studentId`) is ignored. The order of checks:

1. device key valid, not revoked, has `attendance` -> else **401/403**
2. at most 60 scans a minute per reader -> else **429**
3. attendance switched on -> else **503** `disabled`
4. card registered and active -> else **404** `unknown_card` (logged with its hint, so an admin can assign it)
5. its student exists and is active -> else **403** `student_inactive`
6. a session is open on this reader -> else **409** `no_open_session`
7. create the record -> **201** `checked_in`, or **200** `already_checked_in` if it exists (logged as `duplicate` within the duplicate window)

Every outcome from step 4 on is written to `attendanceAudit`.

```json
{"status": "checked_in", "display": "Checked in: Asha", "session": "CS301 lecture"}
{"status": "already_checked_in", "display": "Already in: Asha", "session": "CS301 lecture", "checkInAt": "2026-11-03T09:04:11.000Z"}
{"status": "unknown_card", "display": "Card not registered", "error": "Card not registered."}
```

`display` is plain ASCII, at most 30 characters, for the kiosk title bar.

## Cards (administrators)

Dashboard > RFID attendance > **Cards**, or the API (Firebase ID token of an admin):

```http
POST /api/admin/rfid-cards          {"username": "asha.k", "cardUid": "A3:2F:91:0C", "label": "ID card 2026"}
POST /api/admin/rfid-cards          {"username": "asha.k", "cardKey": "<id of a scanned unknown card>"}
PATCH /api/admin/rfid-cards/<id>    {"active": false}
```

- The easy way: switch check-ins on, tap the new card on a reader, then
  assign it under **Tapped, not registered** - the UID never has to be typed.
- Only **active student** accounts can be given a card. A card active for
  one student cannot be given to another until it is deactivated.
- Deactivating (lost card) takes effect on the next scan; past records stay.

## Dashboard

Dashboard > **RFID attendance**: a setup checklist (card secret, reader keys,
a session with a reader, check-ins on) and four tabs - **Records** (filter by
session, day, student username; newest first), **Cards**, **Scan log** (every
accepted and refused scan and card change) and **Sessions & settings**.
Students cannot open it (admin route + rules).

## Setting it up

1. Website server: set `RFID_UID_HMAC_SECRET` (32+ random characters,
   `openssl rand -hex 32`). Changing it later makes every card unknown.
   `GET /api/health` shows `rfidAttendance.cardSecret: "set"` (never the value).
2. Deploy rules and indexes: `cd firebase && npm run deploy:rules` (new
   indexes for records by student/session, sessions by reader, the scan log).
3. Dashboard > Kiosk > Device keys > New key, tick **Submit RFID check-ins**
   (and **Kiosk** if the same PC uses the kiosk API). Copy the key once into
   the kiosk PC's `kiosk/.env` (`kiosk/.env.example`).
4. Dashboard > RFID attendance > Sessions & settings: add a session, tick the
   reader, switch check-ins on.
5. Register cards (above), then follow docs/RFID_TESTING.md.

## Without Firebase credentials

Everything above runs on the emulators with no project and no secrets:
`cd apps/campus_web && npm run e2e` creates a reader key, refuses a scan
while off, opens a session, assigns a tapped card, checks a student in once,
and checks the dashboard (docs/RFID_TESTING.md, level 3).

## Not done / limits

- No enrolment list: any active student with a card can check in to any
  session open on that reader. Add a `studentIds`/group field to sessions if
  classes must be restricted.
- The in-memory rate limiter is per server instance.
- Composite indexes are not enforced by the emulator; a missing index on the
  real project shows "still being prepared" in the dashboard until built.
