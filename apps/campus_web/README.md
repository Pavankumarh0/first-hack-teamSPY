# Campus Mithra website, admin dashboard and backend

Next.js 16 (App Router) + TypeScript + Tailwind 4, on the shared Firebase
project (`../../firebase`).

| Area | Paths |
|---|---|
| Public site | `/`, `/directory`, `/map`, `/events`, `/clubs`, `/notices`, `/community` (approved posts), `/campus/...` (QR pages, docs/QR_DEEP_LINKS.md) |
| Members | `/login`, `/register`, `/account`, `/reports`, `/notifications`, community posting |
| Admin dashboard | `/admin` - reports, announcements, events, clubs, directory, map, QR codes, moderation, users, kiosk, RFID attendance |
| Backend API | `/api/auth/register`, `/api/admin/*`, `/api/kiosk/v1/*` (kiosk/API_CONTRACT.md), `/api/attendance/v1/scan` + `/api/admin/rfid-cards` (docs/RFID_BACKEND.md), `/api/health` |

Browser code uses only the Firebase client SDK and the security rules. The
Admin SDK runs only in API routes (`src/lib/server`, marked `server-only`)
with Application Default Credentials.

## Run

```bash
npm install
cp .env.example .env.local      # every variable is explained in the file
npm run dev                     # http://localhost:3000
```

Without a project, use the emulators (docs/FIREBASE_SETUP.md, last section).
Missing settings show a "setup required" banner; `/api/health` names them.

## Test

```bash
npm test               # unit tests (routing, deep links, usernames, search, workflow, RFID helpers)
npx tsc --noEmit
npm run build
npm run e2e            # builds, starts the emulators with sample data, drives Chromium
```

Results: docs/TESTING.md.
