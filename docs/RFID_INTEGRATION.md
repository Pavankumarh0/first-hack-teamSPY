# RFID attendance - prepared, hardware pending

**Status: no RFID reader exists, no card has been scanned, and no attendance
record has been created.** The platform contains the data model, security
rules, a disabled check-in endpoint and an admin page so a reader can be added
later without redesign. Nothing in the UI claims scanning works: the admin
page says "Status: pending hardware integration" and the endpoint refuses every scan with
`503 pending_hardware` while attendance is disabled (the default).

## Data model

| Collection | Fields | Access |
|---|---|---|
| `settings/attendance` | enabled (false), status (`pending_hardware`), duplicateWindowMinutes (10) | admin read/write |
| `attendanceSessions/{id}` | title, course, startsAt, endsAt, readerIds | admin read/write |
| `rfidCards/{cardKey}` | studentId, active, registeredAt | admin read; written only by the backend |
| `attendanceRecords/{sessionId}_{studentId}` | sessionId, studentId, readerId, checkInAt, method `rfid` | admin read; written only by the backend |
| `attendanceAudit/{id}` | result, readerId, sessionId, cardKey, studentId?, at | admin read; written only by the backend |

No client (app or browser) can write cards, records or audit entries; the
rules say `allow write: if false`. Readers never talk to Firestore.

## Privacy: card UIDs are not stored

`cardKey = HMAC-SHA256(RFID_UID_HMAC_SECRET, normalisedUid)`
(`apps/campus_web/src/lib/server/rfid.ts`). The raw UID is not saved
anywhere, including the audit log; without the server secret a stored key
cannot be turned back into a UID. UIDs are normalised first (`04:a2:3b:1c` and
`04A23B1C` are the same card; `normalizeCardUid` in `lib/attendance.ts`).
Note that a card UID is an identifier, not a credential: cheap cards can be
cloned, so RFID attendance should be treated as convenience, not proof.

## The check-in endpoint

```
POST /api/attendance/v1/scan
Authorization: Bearer cmk_<device key with the "attendance" capability>
{"cardUid": "04A23B1C", "sessionId": "cse-2a-dbms-2026-11-03"}
```

| Situation | Response | Audit `result` |
|---|---|---|
| attendance disabled (default) | `503 {"status":"pending_hardware"}` | - |
| key missing / revoked / lacks `attendance` | 401 / 403 | - |
| session not open now | 409 | `session_closed` |
| card unknown or deactivated | 404 | `unknown_card` |
| first scan in the session | `201 {"status":"checked_in"}` | `checked_in` |
| repeat scan | `200 {"status":"already_checked_in"}` | `duplicate` (within the window) or `already_checked_in` |

A repeat scan can never create a second record: the record id is
`<sessionId>_<studentId>` and is created with `create()`, which fails if it
exists.

## Enabling it later

1. Choose readers (e.g. an RC522/PN532 on a small microcontroller or a USB
   reader on the kiosk PC) that can make an HTTPS request, or a PC bridge like
   `pc_client.py`. Readers must hold only a device key, never Firebase
   credentials.
2. Set `RFID_UID_HMAC_SECRET` on the server (`openssl rand -hex 32`). Changing
   it later invalidates every registered card.
3. Dashboard > Kiosk > Device keys > New key with "RFID check-ins" per reader.
4. **Card registration - still to build**: an admin flow (or a backend route)
   that links a card to a student by writing `rfidCards/<cardKey>`. It is not
   implemented because it depends on how cards are issued.
5. Create sessions, then switch on Dashboard > Attendance > Enabled.
6. Test with a real reader and card; add the reader to docs/TESTING.md.

## Tested without hardware

- `normalizeCardUid`, `isDuplicateScan`, `attendanceRecordId` - unit tests
  (`apps/campus_web/tests/logic.test.ts`).
- The endpoint returns `503 pending_hardware` - end-to-end test.
- Rules: students cannot read attendance records, and no client (not even an
  admin) can write records or cards - `firebase/tests/firestore.rules.test.mjs`.

The `checked_in` path itself has **not** been run: it needs a registered card,
which in turn needs the registration step above.
