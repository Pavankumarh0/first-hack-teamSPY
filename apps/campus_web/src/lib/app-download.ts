// The Android student app, served from public/downloads. After a new build
// (apps/student_mobile: flutter build apk --release --dart-define-from-file=.env
// --target-platform android-arm,android-arm64), copy
// build/app/outputs/flutter-apk/app-release.apk to public/downloads/campus-mithra.apk
// and update the version and size here.
export const ANDROID_APP = {
  href: '/downloads/campus-mithra.apk',
  version: '1.0.0',
  sizeMb: 53,
  // Without a Play Store listing the site's own page explains sideloading.
  page: '/app',
};
