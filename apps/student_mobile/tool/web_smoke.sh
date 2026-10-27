#!/usr/bin/env bash
# Builds the app for the web against the emulators, serves it on :5050, starts
# the website (emulator build, :3000) and runs tool/web_smoke.cjs.
# Needs: Flutter, Node, Java (emulators) and Playwright with Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
flutter build web --no-web-resources-cdn \
  --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=FIREBASE_EMULATOR_HOST=localhost \
  --dart-define=CAMPUS_SITE_URL=http://localhost:3000 >/dev/null
export NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_SITE_URL=http://localhost:3000
export FIREBASE_ADMIN_PROJECT_ID=demo-campus-mithra NEXT_DIST_DIR=.next-e2e
# A throwaway card-hashing secret for this run only.
export RFID_UID_HMAC_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
(cd ../campus_web && npx next build >/dev/null)
python3 -m http.server 5050 --directory build/web >/dev/null 2>&1 &
WEB=$!
trap 'kill $WEB 2>/dev/null || true' EXIT
cd ../../firebase
npx firebase emulators:exec --project demo-campus-mithra --only auth,firestore,storage \
  "node scripts/seed.mjs --demo-users && cd ../apps/campus_web && SMOKE=../student_mobile/tool/web_smoke.cjs node e2e/with-server.mjs"
