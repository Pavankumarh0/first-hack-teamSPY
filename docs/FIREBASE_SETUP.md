# Firebase setup

The website, admin dashboard, student app and kiosk API share **one** Firebase
project. No credentials are committed: you put real values in local, ignored
files (`apps/campus_web/.env.local`, `apps/student_mobile/.env`).

You can try everything first without a project: see "Local development with the
emulators" at the end.

## 1. Create the project

1. <https://console.firebase.google.com> > Add project (Google Analytics is not needed).
2. **Authentication** > Get started > Sign-in method > enable **Email/Password**.
   The student UI never asks for an email: this provider only stores the
   internal `<username>@users.campus-mithra.invalid` identifiers
   (docs/ARCHITECTURE.md, "Username sign-in"). Leave "Email link" off.
3. **Authentication > Settings > User actions**: untick **Enable create
   (sign-up)**. Accounts are then created only by the backend
   (`/api/auth/register`, Dashboard > Users, `npm run create-user`), which also
   sets the role claims. (Even if left on, accounts made directly have no role
   and can only read public content.)
4. **Firestore Database** > Create database, production mode, a region near
   the campus (for India: `asia-south1`).
5. **Storage** > Get started, production mode, same region. Needs the Blaze
   plan on new projects; without Storage, report photos are the only feature
   that stops working.

## 2. Register the apps and fill the env files

Project settings > General > Your apps:

| App | Register as | Values go to |
|---|---|---|
| Website / dashboard | Web app | `apps/campus_web/.env.local` (`NEXT_PUBLIC_FIREBASE_*`) |
| Android student app | Android, package `edu.campusmithra.student` | `apps/student_mobile/.env` (`FIREBASE_API_KEY`, `FIREBASE_APP_ID`, ...) |
| iOS student app | iOS, bundle `edu.campusmithra.student` | `apps/student_mobile/.env` (iOS app id, `IOS_BUNDLE_ID`) |

```bash
cp apps/campus_web/.env.example apps/campus_web/.env.local
cp apps/student_mobile/.env.example apps/student_mobile/.env
```

Every variable is explained in the `.env.example` files. The `NEXT_PUBLIC_*`
and Flutter values identify the project; they are **not secrets** (access is
decided by the security rules), but still keep them out of git. The app reads
its values with `--dart-define-from-file=.env`; no `google-services.json` /
`GoogleService-Info.plist` is required.

Server-only variables (`apps/campus_web/.env.local`, never `NEXT_PUBLIC_`):

| Variable | Purpose |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | project id for the Admin SDK |
| `GOOGLE_APPLICATION_CREDENTIALS` | only locally, path to a key file **outside** the repo; better: `gcloud auth application-default login` |
| `REGISTRATION_MODE`, `REGISTRATION_INVITE_CODE` | `open` / `invite` / `closed` self-registration |
| `RFID_UID_HMAC_SECRET` | RFID attendance: hashes card UIDs; set before registering cards (docs/RFID_BACKEND.md) |
| `ANDROID_*`, `APPLE_TEAM_ID`, `IOS_BUNDLE_ID` | app-link verification files (docs/QR_DEEP_LINKS.md) |

`GET /api/health` on the running site lists any missing variable by name
(never their values); pages show a "setup required" banner instead of failing.

## 3. Admin credentials (Application Default Credentials)

The backend uses the Admin SDK with Application Default Credentials. **Never**
put a service-account key in a `NEXT_PUBLIC_*` variable, the Flutter app, the
ESP32 or the repository (`.gitignore` blocks the usual file names).

- **Hosted** on Firebase App Hosting or Cloud Run: the runtime service account
  is used automatically. Give it the roles *Firebase Authentication Admin* and
  *Cloud Datastore User*.
- **Locally**: `gcloud auth application-default login` (your own Google
  account, which must have access to the project), then
  `gcloud auth application-default set-quota-project <project-id>`.
  A downloaded key file also works via `GOOGLE_APPLICATION_CREDENTIALS`, kept
  outside the repository.

## 4. Deploy rules and indexes

```bash
cd firebase
npm install
cp .firebaserc.example .firebaserc      # put your project id in it (ignored by git)
npx firebase login
npm test                                 # rules tests on the emulator first
npm run deploy:rules                     # firestore.rules, indexes, storage.rules
```

Index builds take a few minutes; until then, a list that needs one shows a
"still being prepared" message.

## 5. The first administrator

```bash
cd firebase
node scripts/create-user.mjs --project <project-id> --username principal.office --role admin --name "Principal's office"
```

The password is asked with a hidden prompt (or read from `CAMPUS_NEW_PASSWORD`),
never as a command-line argument and never logged. Then sign in on the website
with that username: the **Dashboard** link appears. More staff, club managers
and admins are created in Dashboard > Users.

## 6. Content

- Enter the real campus in the dashboard (Directory, Map, Clubs, Events,
  Announcements, Kiosk).
- Or, to evaluate first, load the **sample** campus:
  `node scripts/seed.mjs --project <project-id> --confirm-sample-data`.
  Every sample document has `isSample: true` and shows a "Sample data" label;
  delete or replace them before going live. Demo accounts are only created on
  the emulator (`--demo-users` refuses a real project).

## 7. Run and host the website

```bash
cd apps/campus_web
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
```

Hosting: Firebase App Hosting (connect the repo, root `apps/campus_web`) or
Cloud Run. Set the same environment variables there; set
`NEXT_PUBLIC_SITE_URL` to the real domain before printing any QR code.

## 8. Run the app

```bash
cd apps/student_mobile
flutter pub get
flutter run --dart-define-from-file=.env
```

## Check once on the real project

The username identifiers end in `.invalid`. The Auth emulator accepts them;
confirm the real project does by creating the first admin (step 5) and signing
in. If it were rejected, change `identityDomain` in
`firebase/schema/constants.json` to a subdomain you own that has no mail
service (e.g. `users.campus.example.edu`) and rebuild the clients, **before**
any student account exists.

## Local development with the emulators

No Firebase project, credentials or network access to Google are needed:

```bash
cd firebase && npm install && npm run emulators:seeded    # Auth, Firestore, Storage + sample data
# another terminal
cd apps/campus_web && NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true FIREBASE_ADMIN_PROJECT_ID=demo-campus-mithra REGISTRATION_MODE=open npm run dev
# app: set USE_FIREBASE_EMULATORS=true in apps/student_mobile/.env
```

Emulator UI: <http://localhost:4000>. Demo accounts (emulator only, password
`Campus@demo1`): `admin.demo`, `staff.demo`, `robotics.lead` (club manager),
`student.demo`.
