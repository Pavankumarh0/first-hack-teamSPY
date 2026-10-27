# Shared Firebase backend

One project for the website, dashboard, student app and kiosk API.

| File | Purpose |
|---|---|
| `firestore.rules` | role-based access, validation, rate limits, report workflow |
| `storage.rules` | report photos (owner + staff only), public media (admin) |
| `firestore.indexes.json` | composite indexes for every paginated list |
| `schema/constants.json` | roles, username rules, categories, statuses, report transitions - read by all clients |
| `seed/sample-campus.json` | the **sample** campus (every document gets `isSample: true`) |
| `scripts/seed.mjs` | loads the sample; `--emulator [--demo-users]` or `--project <id> --confirm-sample-data` |
| `scripts/create-user.mjs` | creates an account with a role (the first admin); password via hidden prompt |
| `tests/` | rules tests on the emulator |

```bash
npm install
npm test                    # rules tests (emulator)
npm run emulators:seeded    # local Auth/Firestore/Storage with sample data and demo accounts
npm run deploy:rules        # to the project in .firebaserc (copy .firebaserc.example)
```

Setup: docs/FIREBASE_SETUP.md. Data model: docs/ARCHITECTURE.md.
