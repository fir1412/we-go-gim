# we go gim Android release

Capacitor Android 1.11.0, package `io.github.fir1412.wegogim`, versionCode2.
The package name comes from the earlier TWA preparation. A new Play app record was created
in fir1412's Console on2026-10-04. Min Android7(API24), target/compile36.

## Build

`npm ci`, `npm run sync`, `npm test`, `npm run test:e2e`.
Use JDK21/AndroidSDK36. On this PC:

```powershell
$env:JAVA_HOME='D:/tools/jdk21-extract/jdk-21.0.12.1+1'
$env:GRADLE_USER_HOME='D:/gradle-home'
node scripts/build-release.mjs
```

Signing reads the existing upload key from C:/Users/user/wegogim-android-keys.
Override with GIM_KEYSTORE and GIM_KEYSTORE_PASSWORD, or GIM_PASSWORD_FILE.
Never commit keys/passwords. Output APK/AAB/hash manifest stays under ignored output/release.
Debug package `.dev` is for phone checks; never uninstall Play to sideload around a signing mismatch.

## Play Console preparation

- VersionCode 2 is already published internally. Every subsequent upload needs a larger code.
- Verify the upload certificate matches the existing listing. Upload signing and Play app signing
  certificates normally differ. This native app needs no Digital Asset Links.
- Upload the signed AAB to the intended test track. Check Play's supported device comparison:
  Android7minimum can reduce reach compared with the old TWA. Retain old bundle if needed.
- Store icon: store-icon-512.png. Screenshots/feature graphic/listing text in this folder.
  Browser screenshots use synthetic sample data and are labeled as browser captures in evidence.
- Privacy URL: https://fir1412.github.io/we-go-gim/privacy.html. The native policy is published.
  If changed later, publish and verify it before submitting related Play declarations.
- Data safety: optional feedback collects feedback text, optional email/contact, and app information
  (version, phone/browser type, language, current screen) through Google Forms. No workout/body
  data collection, no ads/analytics. Do not answer "no data collected" while feedback exists.
- Health declaration: fitness/activity tracking; no medical diagnosis or treatment claims.
- Ads: no. App access: all accessible without login. Category: Health & Fitness. Support:
  fir1412dev@gmail.com. Audience13+asstatedinterms; answer forms after reviewing their exact wording.
- This account's Console confirms 12 closed testers continuously opted in for 14 days.
  Internal testing does not satisfy that production-access requirement.
- Notification/alarm access is optional; no restricted USE_EXACT_ALARM or full-screen-intent permission.
- PDF import downloads its reader from cdnjs on first use; core workout flows are packaged/offline.

## Migration

Browser/TWA storage does not automatically transfer to the Android app. Native Welcome provides
an explicit website backup→Androidrestorepath. Test with synthetic backups first; do not erase the
old app/site until the new one has been checked. Installing a normal signed update preserves the
native app's own SQLite database; uninstalling or Android Clear storage erases it.
Clearing browser/WebView storage does not erase SQLite. Existing native WebView data is copied once
transactionally, with the original retained. Android cloud backup is disabled; exported JSON backups
are essential for loss/uninstall recovery and omit progress photos.

Optional local training notifications schedule the next four weeks on each app visit. Editing the
plan/time/custom message renews that window; no indefinite closed-app scheduling is claimed.
1,000 English copy drafts are in content/reminders/drafts.md; the composer supports editing and
sharing. Notification delivery/screen illumination remain subject to Android/DND/battery settings.

Internal release1(versionCode2) is published and Active. Existing Beta Testers list has9accounts.
Join:https://play.google.com/apps/internaltest/4700623995534838864
Installation may take up to an hour to propagate; the unreviewed listing has a temporary package
name. No production submission is authorised. This account needs12closed testers for14continuous
days before requesting production access; internal testing does not count for that requirement.
See HANDOFF.md for actual verified tests, approval scope and remaining public-release steps.
