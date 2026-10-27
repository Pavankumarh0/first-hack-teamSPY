# QR codes and deep links

Every QR code is an ordinary HTTPS URL on the campus website. The same URL
works for everyone: it opens the student app when the app is installed and
the link is verified, and otherwise a full web page.

## URL format

| Destination | URL |
|---|---|
| Room / place | `https://DOMAIN/campus/location/<locationId>` |
| Building | `https://DOMAIN/campus/building/<buildingId>` |
| Event | `https://DOMAIN/campus/event/<eventId>` |
| Club | `https://DOMAIN/campus/club/<clubId>` |
| Notice | `https://DOMAIN/campus/notice/<announcementId>` |
| Route | `https://DOMAIN/campus/route?from=<placeId>&to=<placeId>[&accessible=1]` |

`DOMAIN` comes from `NEXT_PUBLIC_SITE_URL`. Ids are the Firestore document ids
(`^[A-Za-z0-9_-]{1,100}$`); anything else, or a document that is missing or
unpublished, shows a safe "this link is not valid" page in both apps - never
someone else's content and never a crash. Parsing lives in `deeplinks.ts`
(website) and `deep_links.dart` (app) and is unit-tested in both.

The app also accepts `campusmithra://campus/location/<id>` (same paths) - used
by the website's "Open in app" button.

## Generating codes

Dashboard > **QR codes**: choose a destination, preview, download PNG or SVG
for printing. "Save to list" records the code in `qrDestinations`, where it
can be found again and marked inactive. Re-printing is never needed when a room changes: edit the
location, the URL stays the same.

The kiosk API returns `qrUrl` for routes from the kiosk (kiosk/API_CONTRACT.md).

## What happens when a code is scanned

| Phone | Result |
|---|---|
| App installed, App Links / Universal Links verified | the app opens on that page |
| App installed, links not verified | the web page opens; its **Open in app** button uses `campusmithra://` |
| No app | the web page: details, map, route from any place, store links if set |
| The app's own scanner | handled inside the app (any campus URL from the configured site) |

**App-installed detection is not attempted.** Browsers do not offer a reliable
way to detect installed apps, so the web page always shows its full content
and an explicit button. Verified links are the only automatic hand-off.

## Android App Links

1. Sign the release build and get the SHA-256 fingerprint:
   `keytool -list -v -keystore <release.jks> -alias <alias>` (or Play Console
   > App integrity > App signing key certificate, when Play signs the app).
2. Website env: `ANDROID_APP_PACKAGE=edu.campusmithra.student`,
   `ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:...` (comma-separated for several).
   `https://DOMAIN/.well-known/assetlinks.json` then lists them (it is `[]`
   until set).
3. App: set `campusAppLinkHost=<DOMAIN host>` in
   `apps/student_mobile/android/gradle.properties`. The manifest's intent
   filter (`autoVerify`, `/campus/` prefix) uses it.
4. Install and test:

```bash
adb shell pm verify-app-links --re-verify edu.campusmithra.student
adb shell pm get-app-links edu.campusmithra.student          # expect: verified
adb shell am start -a android.intent.action.VIEW -d "https://DOMAIN/campus/location/library-reading-hall"
adb shell am start -a android.intent.action.VIEW -d "campusmithra://campus/location/library-reading-hall"
```

## iOS Universal Links

1. Website env: `APPLE_TEAM_ID`, `IOS_BUNDLE_ID=edu.campusmithra.student`.
   `https://DOMAIN/.well-known/apple-app-site-association` then lists
   `<team>.<bundle>` for `/campus/*` (served as JSON, no redirect).
2. Xcode > Runner > Signing & Capabilities: add **Associated Domains** with
   `applinks:DOMAIN`. `ios/Runner/Runner.entitlements` already holds the
   entry for `campus.example.edu`; change it to your domain and select the file
   as the target's entitlements (the capability needs a paid Apple developer
   team, which is why it is not switched on in the project).
3. Test on a device (the simulator caches the association):

```bash
xcrun simctl openurl booted "campusmithra://campus/location/library-reading-hall"
# Universal link: paste https://DOMAIN/campus/... in Notes and tap it
```

## Not verified here

App Links and Universal Links need the real domain over HTTPS, a signed build
and a phone; they could not be tested in the development session. The URL
parsing, invalid-link handling, the association files and the web fallback
are tested (docs/TESTING.md).
