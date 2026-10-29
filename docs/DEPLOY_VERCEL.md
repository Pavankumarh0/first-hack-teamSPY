# Deploying the website on Vercel

Phones need a public **https** address: browsers only share live location with
https sites, and a kiosk QR code that says `localhost` opens nothing on a phone.
This puts the website, admin dashboard and kiosk API on `https://<project>.vercel.app`.

Uploads go from the repository root. `.vercelignore` there sends only
`apps/campus_web` and `firebase/schema`, never an `.env` file, key, kiosk or
firmware code.

## 1. Create and link the project (once)

```powershell
cd Campus-Mithra            # the repository root, not apps/campus_web
npx vercel link             # "Link to existing project?" No -> name it, e.g. campus-mithra
```

In the Vercel dashboard: **Project > Settings > Build and Deployment > Root
Directory** = `apps/campus_web` (framework: Next.js). Keep "Include files
outside the root directory" on: the site imports `firebase/schema`.

The site's address is shown under **Settings > Domains**, e.g.
`https://campus-mithra.vercel.app`. It is `<SITE_URL>` below.

## 2. Environment variables (you enter these, in the dashboard)

**Settings > Environment Variables**, for Production (and Preview if you use it).
Vercel accepts a pasted `.env` block.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (6 values) | same as `apps/campus_web/.env.local` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | same as `.env.local` |
| `NEXT_PUBLIC_COLLEGE_NAME`, `REGISTRATION_MODE`, `REGISTRATION_INVITE_CODE`, `RFID_UID_HMAC_SECRET` | same as `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | `<SITE_URL>`: every QR code is built from it |
| `FIREBASE_ADMIN_PROJECT_ID` | your Firebase project id |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` from the service-account key file |
| `FIREBASE_ADMIN_PRIVATE_KEY` | `private_key` from the key file, the whole `-----BEGIN ... END PRIVATE KEY-----` text. Mark it **Sensitive** |

Do **not** add `GOOGLE_APPLICATION_CREDENTIALS` (a local file path) or
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`.

## 3. Deploy

```powershell
npx vercel deploy --prod    # from the repository root
```

Changing an environment variable later needs another deploy: `NEXT_PUBLIC_*`
values are compiled into the site.

## 4. Allow the new address

- **Firebase console > Authentication > Settings > Authorized domains**: add
  `campus-mithra.vercel.app` (your domain), or sign-in fails there.
- **Google Cloud console > APIs and Services > Credentials > the Maps key >
  Website restrictions**: add `<SITE_URL>/*`, or the map stays grey.

## 5. Point the kiosk at it

In `kiosk/.env` set `CAMPUS_API_URL=<SITE_URL>` and restart `pc_client.py`.
The kiosk key stays the same (it lives in Firestore, not on Vercel).

## Check

1. `<SITE_URL>/api/health` answers.
2. Press the kiosk button and ask "give me a map to go to the engineering block".
   The TFT shows a QR code with the destination and walking time.
3. Scan it with a phone: `<SITE_URL>/campus/route?from=__me&to=...` opens, asks
   for location, and guides you live along the campus paths.
