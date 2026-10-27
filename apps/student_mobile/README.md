# Campus Mithra student app (Flutter)

The student app on the shared Campus Mithra Firebase project: campus home,
campus-only map and walking directions, directory, QR scanner, community,
maintenance reports with photos, clubs and events, notifications and profile.
Sign-in is by **username and password**: no email or phone number in the UI
(how that works: `docs/ARCHITECTURE.md`, "Username sign-in").

## Run it

```bash
cd apps/student_mobile
cp .env.example .env          # fill in your Firebase app values (see the comments)
flutter pub get
flutter run --dart-define-from-file=.env
```

Without the Firebase values the app opens a setup screen listing what is
missing, instead of crashing.

### Against the local emulators (no Firebase project needed)

```bash
cd firebase && npm install && npm run emulators:seeded      # sample campus + demo accounts
cd apps/campus_web && npm run dev                           # registration API on :3000 (see its .env)
cd apps/student_mobile
flutter run --dart-define=USE_FIREBASE_EMULATORS=true \
            --dart-define=FIREBASE_EMULATOR_HOST=10.0.2.2 \
            --dart-define=CAMPUS_SITE_URL=http://10.0.2.2:3000
```

`10.0.2.2` is your computer as seen from the Android emulator; use your
computer's LAN IP for a phone, or `localhost` with `-d chrome`. Demo accounts
(emulator only): `student.demo` / `Campus@demo1` (also `admin.demo`,
`staff.demo`, `robotics.lead`).

## Tests

```bash
flutter analyze
flutter test                 # logic (routing, deep links, usernames), shared-schema check, login/register widgets
bash tool/web_smoke.sh       # end to end: app (web build) files a report -> admin dashboard lists it
```

`test/shared_schema_test.dart` fails if `lib/core/constants.dart` drifts from
`firebase/schema/constants.json`; `test/logic_test.dart` runs the same routing
and deep-link cases as the website's tests on the sample map.

## Deep links and QR codes

`https://<campus site>/campus/...` and `campusmithra://campus/...` open the
matching screen (`lib/core/deep_links.dart`, handled in `lib/app.dart` with
`app_links`). Android App Links need `campusAppLinkHost` in
`android/gradle.properties` and the website's `assetlinks.json`; iOS Universal
Links need the Associated Domains capability (`ios/Runner/Runner.entitlements`
explains). Full steps: `docs/QR_DEEP_LINKS.md`.

## Layout

| Path | What |
|---|---|
| `lib/main.dart` | Firebase start-up from `--dart-define` values, or the setup screen |
| `lib/app.dart`, `lib/router.dart` | app shell, tabs, routes, incoming links |
| `lib/core/` | config, shared constants, routing (Dijkstra), deep links, usernames, errors |
| `lib/data/` | Firestore models, repository (rule-shaped writes), session |
| `lib/screens/` | all screens |
| `lib/ui/` | theme and shared widgets (campus map painter, cards, states) |

Push notifications (FCM) are not set up yet: notifications are in-app
(Firestore `notifications`), shown with an unread badge on Home.
