# Kiosk API contract (v1)

Read-only campus data for the information kiosk, served by the website
(`apps/campus_web/src/app/api/kiosk/v1`). Everything comes from **published**
Firestore content: an unknown place is a 404, never a guess. Responses are
plain ASCII, because the kiosk's TFT font has only characters 32-126.

Base URL: the website, e.g. `https://campus.example.edu`.

## Authentication

```
Authorization: Bearer cmk_<random>
```

Each kiosk PC (or, later, RFID reader) has its own **device key**, created in
Dashboard > Kiosk > Device keys. The key is shown once; the server stores only
its SHA-256 (`kioskDevices`, unreadable by every client). Revoking a key
disables it at once. Keys belong in the kiosk PC's environment
(`CAMPUS_KIOSK_KEY`), never in ESP32 firmware or a repository. A key carries
capabilities: `kiosk` for these endpoints, `attendance` for the future RFID
scan endpoint.

No Firebase Admin credential, API secret or write access ever reaches the
kiosk: the key can only read published content through these endpoints.

## Errors

Every error is JSON `{"error": "<sentence>"}`:

| Status | When |
|---|---|
| 400 | missing or malformed parameter (`?to=` absent, search under 2 characters) |
| 401 | no key, malformed key, unknown or revoked key |
| 403 | the action is switched off for this kiosk (Dashboard > Kiosk), or the key lacks the capability |
| 404 | the place is not on the campus map / not published |
| 503 | the server is not configured (Firebase), or the kiosk has no map position |

## Endpoints

Responses below are real output from the sample campus (seed data).

### `GET /api/kiosk/v1/config`

```json
{
  "kiosk": {
    "id": "default",
    "name": "Admin lobby kiosk",
    "welcomeText": "Namaste! Ask me about the campus, or scan a QR code to get directions on your phone.",
    "enabledActions": ["directions", "announcements", "events", "qr", "search"],
    "locationId": "admin-lobby-kiosk"
  },
  "siteUrl": "https://campus.example.edu"
}
```

### `GET /api/kiosk/v1/announcements?limit=3`

Published notices, pinned first. `limit` 1-10 (default: the kiosk's setting).
`body` is cut to 280 characters.

```json
{ "announcements": [{
    "id": "library-exam-hours", "category": "notice",
    "title": "Library open till 11 PM during exams",
    "body": "The Central Library reading hall stays open until 11 PM on all days during the end-semester examinations. Carry your ID card.",
    "pinned": true, "publishedAt": "2026-10-27T16:52:08.368Z",
    "url": "https://campus.example.edu/campus/notice/library-exam-hours", "isSample": true }] }
```

### `GET /api/kiosk/v1/events?limit=5`

Published events that have not started yet, soonest first. `limit` 1-10.

```json
{ "events": [{
    "id": "robotics-workshop", "title": "Line-follower robot workshop",
    "clubName": "Robotics and Automation Club", "venueName": "Robotics Club Room (D-105)",
    "venueLocationId": "robotics-club-room",
    "startAt": "2026-11-01T14:00:00.000Z", "endAt": "2026-11-01T17:00:00.000Z",
    "url": "https://campus.example.edu/campus/event/robotics-workshop", "isSample": true }] }
```

### `GET /api/kiosk/v1/search?q=bus`

Up to 5 published buildings and rooms, best match first (name, room number,
type, building, keywords). An empty list means nothing matched.

```json
{ "query": "bus", "results": [{
    "kind": "location", "id": "transport-office", "name": "Transport Office",
    "building": "Administrative Block", "floor": 0, "room": "ADM-06",
    "openingHours": "Mon-Sat 9:00-17:00",
    "url": "https://campus.example.edu/campus/location/transport-office" }] }
```

### `GET /api/kiosk/v1/directions?to=<placeId>[&from=<placeId>][&accessible=1]`

Walking directions along mapped campus paths, from the kiosk's own position
(Dashboard > Kiosk > "Where the kiosk stands") unless `from` is given.
`accessible=1` avoids paths with steps. `qrUrl` is what the kiosk shows as a
QR code: it opens the same route in the app or on the website.

```json
{
  "destination": { "kind": "location", "id": "library-reading-hall", "name": "Library Reading Hall",
                   "where": "Central Library, floor 0, LIB-G" },
  "distanceM": 148, "minutes": 2, "accessible": true,
  "steps": [
    "Start at Administrative Block entrance.",
    "Walk 38 m to Fountain circle (fountain).",
    "Turn left and walk 68 m to Central lawn junction (central lawn).",
    "Turn right and walk 43 m to Library entrance.",
    "You have arrived at Library entrance."
  ],
  "summary": "Library Reading Hall (Central Library, floor 0, LIB-G): about 2 min walk, 148 m.",
  "qrUrl": "https://campus.example.edu/campus/route?from=admin-lobby-kiosk&to=library-reading-hall"
}
```

## Caching and load

The server caches the map and directory for 60 seconds per instance, so a
kiosk polling every few seconds costs a handful of Firestore reads a minute.
A device's `lastSeenAt` is updated at most once a minute.

## Versioning

Breaking changes get a new prefix (`/api/kiosk/v2`); v1 keeps working until
every kiosk has moved. New optional fields may appear in v1 responses, so
clients must ignore fields they do not know.

## RFID check-in

`POST /api/attendance/v1/scan` with a key that has the `attendance`
capability, sent by `kiosk/rfid_bridge.py` when the ESP32 reports a card tap.
It answers `503 {"status": "disabled"}` until an administrator switches
check-ins on. Contract: `docs/RFID_BACKEND.md`.
