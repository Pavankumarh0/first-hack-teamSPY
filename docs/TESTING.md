# Testing

Everything below runs without a Firebase project or credentials: the Firebase
emulators (project `demo-campus-mithra`) stand in for Auth, Firestore and
Storage. What needs a real project, a phone or the kiosk hardware is listed in
the manual checklist at the end - it has **not** been run.

## Automated tests

| Suite | Command | What it proves | Result (last run) |
|---|---|---|---|
| Firestore + Storage rules | `cd firebase && npm test` | role checks, no impersonation, rate limits, exact counters, report lifecycle + history, private photos, admin-only attendance | 23/23 pass (2026-10-27) |
| Website logic | `cd apps/campus_web && npm test` | Dijkstra routing + step-free routes on the sample map, deep-link parsing, usernames, search, report workflow, RFID helpers | 16/16 pass (2026-10-27) |
| Website types | `cd apps/campus_web && npx tsc --noEmit` | | no errors (2026-10-27) |
| Website build | `cd apps/campus_web && npm run build` | all pages and API routes compile | builds (2026-10-27) |
| Website end to end | `cd apps/campus_web && npm run e2e` | see below | 15/15 checks pass (2026-10-27) |
| App analysis | `cd apps/student_mobile && flutter analyze` | | no issues (2026-10-27) |
| App tests | `cd apps/student_mobile && flutter test` | routing + deep links (Dart port), shared schema, login has no email field, setup screen, registration validation | 15/15 pass (2026-10-27) |
| App on the emulators | `cd apps/student_mobile && bash tool/web_smoke.sh` | the Flutter app (web build) signs in as `student.demo`, files a report, and the admin dashboard lists it | 2/2 checks pass (2026-10-27) |
| Kiosk client | `python -m unittest discover -s kiosk/tests -v` | request format, key header, errors, TFT text (ASCII, one line, under the firmware's 600-character limit) | 6/6 pass (2026-10-27) |

`npm run e2e` builds the website for the emulators, seeds the sample campus
with demo accounts, starts the site and drives Chromium (Playwright) through:

1. the public home shows official notices and events from Firestore
2. a QR destination opens the location page with an app hand-off
3. unknown and malformed QR destinations show a safe page
4. a route deep link draws campus-only directions
5. a student registers with a username only (no email or phone field)
6. the student files a maintenance report
7. a student cannot open the admin dashboard
8. the report appears in the admin dashboard and the admin acknowledges it
9. the student sees the new status and an in-app notification
10. an admin-published event appears on the public website
11. community posts are rate limited
12. backend APIs refuse students and accept admins
13. kiosk API: directions, search and a QR URL with a device key; refusal without one
14. RFID check-in answers `503 pending_hardware`
15. the app association files are served

Failures save a screenshot to `apps/campus_web/e2e/artifacts/`. The
emulator-based runs need Java 21+ and download the emulator jars once.

## Manual checklist (not run - needs credentials or hardware)

### Real Firebase project
- [ ] Follow docs/FIREBASE_SETUP.md; `npm run deploy:rules` succeeds.
- [ ] `GET /api/health` reports no missing variables.
- [ ] `create-user` makes the first admin; sign in with the username works
      (confirms the project accepts the `.invalid` identifier).
- [ ] Register a student on the website (and in the app); the account appears
      in Dashboard > Users with role `student`.
- [ ] A student reading `users/<another uid>` or writing `announcements` in the
      browser console is denied (rules deployed).
- [ ] Admin resets a student's password; the student signs in with it and
      changes it under My account.
- [ ] Suspend a user: they cannot sign in again, and their open session stops
      working when its ID token expires (at most one hour - an already-issued
      token stays valid until then).
- [ ] File a report with a photo; staff see the photo, another student cannot.
- [ ] Each list that needs an index loads once the indexes finish building.

### Android app (no Android SDK in the development session)
- [ ] `flutter build apk --dart-define-from-file=.env` builds.
- [ ] Sign in, map, route, QR scanner (camera permission), report with a photo
      from the camera and the gallery, community, notifications, profile.
- [ ] App Links: the `adb` commands in docs/QR_DEEP_LINKS.md show `verified`,
      and a printed QR opens the app.
- [ ] Without the app, the same QR opens the web page with "Open in app".

### iOS app
- [ ] Builds and signs in Xcode; camera and photo permission prompts appear.
- [ ] After adding Associated Domains: a Universal Link opens the app.

### Kiosk hardware
- [ ] The existing kiosk still works exactly as before (`pc_client.py`,
      push-to-talk, speaker, TFT) - nothing in `firmware/` was changed.
- [ ] With `pc_client.py` closed:
      `python kiosk/campus_api_client.py directions library-reading-hall --show-on-kiosk COM9`
      shows the route on the TFT (question panel, source, paged answer).
- [ ] Revoke the kiosk's device key in the dashboard: the client gets 401.

### Not built, so nothing to test yet
- Push notifications (FCM): notifications are in-app only.
- RFID readers and card registration (docs/RFID_INTEGRATION.md).
- The OV7670 camera node is out of scope for the platform.
