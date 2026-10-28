# Campus map on Google satellite, with live directions

This sets up the campus map for your college (for example The Oxford College
of Engineering) on top of Google's satellite imagery, and turns on live
turn-by-turn directions for students on the website and in the app.

How it fits together:

- The campus is still stored as Campus Mithra's own plan: buildings, walkway
  points and links in `campusMap/main` and `locations/*`. Routing uses that
  plan, so it works with or without Google.
- `campusMap.geo` (`lat`, `lng`, `rotationDeg`) pins the plan's centre to the
  Earth, and `metersPerUnit` sets its scale. With that, every building and
  path can be drawn over the satellite view, and a phone's GPS position can
  be placed on the plan.
- Google only provides the backdrop imagery and the place search. Building
  names, codes, floors, hours and paths come from **you**.

## 1. Google Cloud keys

In [Google Cloud console](https://console.cloud.google.com/), in one project
with billing on, enable these APIs:

| Used by | APIs |
| --- | --- |
| Website | Maps JavaScript API, Geocoding API |
| Android app | Maps SDK for Android |
| iOS app | Maps SDK for iOS |

Create **separate keys** and restrict each one (APIs & Services > Credentials):

| Key | Application restriction | API restriction |
| --- | --- | --- |
| Website | Websites: your domain(s), e.g. `https://campus.example.edu/*` and `http://localhost:3000/*` for development | Maps JavaScript API, Geocoding API |
| Android | Android apps: package `edu.campusmithra.student` + your signing certificate SHA-1 | Maps SDK for Android |
| iOS | iOS apps: bundle id `edu.campusmithra.student` | Maps SDK for iOS |

Maps keys end up inside the web page and the app, so they are not secret in
the way a service-account key is. The restrictions above are what stop
others from using them. Still, keep the real values out of git, as below.

## 2. Where each key goes (none of these files are committed)

| Where | File | Setting |
| --- | --- | --- |
| Website | `apps/campus_web/.env.local` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...` (optional `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`; `DEMO_MAP_ID` is used if empty) |
| App (switches the satellite view on) | `apps/student_mobile/.env` | `GOOGLE_MAPS_API_KEY=...`, read with `flutter run --dart-define-from-file=.env` |
| Android SDK | `apps/student_mobile/android/local.properties` | `GOOGLE_MAPS_API_KEY=...` (or the same environment variable on a build server) |
| iOS SDK | `apps/student_mobile/ios/Flutter/Secrets.xcconfig` | copy `Secrets.xcconfig.example`, set `GOOGLE_MAPS_API_KEY = ...` |

For a hosted website, set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in the hosting
provider's environment settings and rebuild.

Without keys, everything keeps working on the drawn campus plan, including
live directions, once the campus has been placed (step 3).

## 3. Place the campus (Dashboard > Campus map > Place on satellite)

Sign in as an admin, open **Dashboard > Campus map**, then **Place on satellite**.

1. **Find the campus.** The search box starts with your college name
   (`NEXT_PUBLIC_COLLEGE_NAME`). Pick the right result and press **Use this**.
2. **Anchor.** Drag the yellow anchor to the middle of the campus.
3. **Rotation.** Turn the slider until the plan lines up with the roads and
   buildings you see.
4. **Scale.** Leave metres per unit at 0.5 unless you are reusing an old plan
   drawn at another scale.
5. **Add buildings** (Add building mode). Click where a building is, then in the side panel:
   - give it its real name and code;
   - set its floors, category, width and depth in metres, and opening hours;
   - drag the label to fine-tune its position.

   Each building gets an entrance point. New buildings are hidden until you tick
   **Published**.
6. **Add paths** (Add path mode). Click along walkways; each point links to
   the one selected before it. Use **Connect** to join points (including
   building entrances) into a network. Routes can only follow these links.
7. Name useful points (gates, junctions) as landmarks: directions read
   "turn left at *Main gate*".
8. **Save.** Then open the public map and try a route.

If the sample campus is still loaded, remove its buildings and rooms in
**Dashboard > Buildings and rooms** (the sample-data notice has a button for
this). Its walkway points stay on the map until you delete them in
**Campus map**.

### Use your own knowledge for names and details

Google's terms do not allow tracing or copying map data out of their
imagery or maps. Use the satellite view only to see where to click. The
building names, codes, floors and hours you enter should come from the
college (a campus map, the estate office, signboards), not be copied from
Google Maps listings.

## 4. Live directions for students

- **Website:** on the map page, choose **From: My location (live
  directions)** (or **Start from my location**). The browser asks for
  location permission.
- **App:** **START FROM MY LOCATION** on the map screen. Android and iOS ask
  for "while using the app" location permission.

Then the card shows the next turn ("In 40 m, turn left at Central lawn
junction."), the distance and minutes left, GPS accuracy, and "You're here"
on arrival. When the student walks off the route (more than 25 m from it),
the route is re-planned. Someone more than 60 m from any mapped path is told
to come onto campus first.

### Privacy

The position is used only on the student's own device, only while live
directions are on, and is never written to Firestore, sent to the server or
kept in browser storage (the end-to-end test checks storage). The website
sends `Permissions-Policy: geolocation=(self)`, so embedded third-party
frames cannot ask for location.

Campus Mithra does **not** let staff see where students are. If you want
that, it needs consent, a clear purpose and retention rules first. Treat it
as a separate feature.

## 5. Testing

- Unit tests cover the plan <-> latitude/longitude conversion and live
  directions (snap to path, next turn, off route, arrival) on both sides:
  `cd apps/campus_web && npm test`, `cd apps/student_mobile && flutter test`.
- `npm run e2e` (website) and `bash tool/web_smoke.sh` (app) pin the sample
  campus to test coordinates in the emulator and walk a faked GPS from the
  gate to the library.
- Still needs a real check with your keys and a phone on campus: see the
  "Google Maps and GPS" list in docs/TESTING.md. Satellite tiles were not
  rendered in development because no key was available.
