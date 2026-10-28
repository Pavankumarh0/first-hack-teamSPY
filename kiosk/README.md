# Kiosk integration

The ESP32 kiosk connects by USB to `pc_client.py`; the PC runs speech, while
the Campus Mithra website API supplies published Firestore content. The ESP32
never talks to Firebase and stores no credentials. The kiosk PC uses a
read-only device key.

```text
ESP32 --USB serial--> kiosk PC / pc_client.py --HTTPS + device key--> website API --> Firestore
```

## Configure the PC

Copy `.env.example` to `kiosk/.env` on the kiosk PC and set the deployed
website URL and device key (Dashboard > Kiosk > Device keys). Do not put the
key in firmware or commit the local file.

The voice kiosk retrieves published campus data for directions, buildings,
rooms, clubs, events, notices, and general searches. It sends the retrieved
records with the visitor's question to the local `/api/ask` endpoint; Gemma
composes an answer grounded in that live context. Example questions include
"take me to CSE branch", "what events are coming up?", "show robotics club",
and "latest notices". Route answers include a QR link for phone directions;
live GPS starts on the phone only after the visitor scans and grants location
permission. The kiosk API never queries user profiles, usernames, attendance,
reports, notifications, or community posts. Unknown or unpublished map places
are not guessed.

The client can also be used directly:

```powershell
python kiosk/campus_api_client.py config
python kiosk/campus_api_client.py search "CSE branch"
python kiosk/campus_api_client.py directions cse-department --show-on-kiosk COM9
python kiosk/campus_api_client.py clubs --query robotics
python kiosk/campus_api_client.py events
python kiosk/campus_api_client.py announcements
```

## Flash QR support

The firmware accepts `QR:<url>` and renders a route link on the TFT. Connect
the ESP32, close the serial monitor and PC client, then from the repository root:

```powershell
cd firmware
pio run -e mithra_ili9341 -t upload
```

Use `-e mithra_st7789` only when the installed panel is ST7789. The PlatformIO
project defaults to COM9; update `upload_port` if needed. The route API returns
a phone deep link as a QR. Scanning it opens live directions on the phone.

## Run and deploy the kiosk data API

The kiosk endpoints are part of the Next.js campus website, so deploy the
website and API together. For local demo data, run seeded Firebase emulators
from the repository root:

```powershell
cd firebase
npm install
npm run emulators:seeded
```

In a second terminal, run `npm install` and `npm run dev` in
`apps/campus_web`, using the emulator environment in `docs/FIREBASE_SETUP.md`.
For hosted deployment, use Firebase App Hosting with `apps/campus_web` as the
app root (or Cloud Run) and follow that guide for credentials, environment
variables, Firestore rules, and indexes. Then create a kiosk device key under
Dashboard > Kiosk and set it in `kiosk/.env` on the kiosk PC. Enable the `clubs`
action in the kiosk's saved configuration.

## Oxford campus map and location tracking

The app and website use the same published Firestore buildings, rooms, and
walkway graph. Populate and verify these under Dashboard > Directory, Map, and
Kiosk before enabling live routing. The checked-in seed map is explicitly
fictional SVIT sample data; it must not be used for Oxford College directions.
The Google hybrid map component can provide satellite imagery when the Google
Maps key is configured, but actual Oxford building footprints and walkway
routes need to be traced and checked against the campus.

After scanning a route QR, the phone route page can ask for location permission
and follow the visitor until arrival. The location is only used in that phone
session; the kiosk server does not keep tracking them.

## RFID attendance

RFID attendance remains disabled (`RFID_ENABLED 0`). See
`docs/ARCHITECTURE.md` and `docs/RFID_INTEGRATION.md` before enabling it.
