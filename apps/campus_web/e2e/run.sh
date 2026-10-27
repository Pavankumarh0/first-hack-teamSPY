#!/usr/bin/env bash
# Builds the site for the emulators and runs e2e/smoke.mjs against it.
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
export FIREBASE_ADMIN_PROJECT_ID=demo-campus-mithra
export REGISTRATION_MODE=open
export NEXT_DIST_DIR=.next-e2e
npx next build >/dev/null
cd ../../firebase
npx firebase emulators:exec --project demo-campus-mithra --only auth,firestore,storage \
  "node scripts/seed.mjs --demo-users && cd ../apps/campus_web && node e2e/with-server.mjs"
