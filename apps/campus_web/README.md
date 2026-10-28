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

## Animated characters (Remotion)

Mithra (the kiosk buddy), the QR phone and the campus map are
[Remotion](https://www.remotion.dev) compositions in `src/characters/`, each a
seamless 4-second loop drawn as SVG.

- **Website:** played live with `@remotion/player` (`CharacterPlayer.tsx`).
  They play only while on screen, and show a still frame when the visitor's
  system asks for reduced motion.
- **App:** rendered to looping animated WebP files (+ a still PNG for reduced
  motion) in `apps/student_mobile/assets/characters/`. Re-render after
  changing a character:

```bash
npm run characters:studio    # preview and tweak in Remotion Studio
npm run characters:render    # -> ../student_mobile/assets/characters (needs Python 3 + Pillow)
```

Remotion downloads its own headless Chrome for rendering unless
`REMOTION_BROWSER_EXECUTABLE` points at one.

**Licence:** Remotion is free for individuals, non-profits and companies of up
to three people; larger companies need a company licence
(<https://remotion.dev/license>). Once you have confirmed which applies, you
can add the `acknowledgeRemotionLicense` prop in `CharacterPlayer.tsx` to
silence the browser-console notice.
