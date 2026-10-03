# Capacitor Android migration — 2026-10-04

Current work is on `fix-welcome`. User requested Capacitor conversion, Play preparation,
Tally lessons, bug/phone checks, frequent commits. Also asked about screen-off rest alerts.

## Implementation checkpoint

- Capacitor 8.5.2, permanent package `io.github.fir1412.wegogim` from existing TWA project.
- Debug suffix `.dev`: never uninstall or overwrite an existing Play app for sideload tests.
- Public assets allowlisted into ignored `www`; bundle bridge only. Native has no service worker.
- Native SAF Save as completes after actual write; backups await completion. No storage permission.
- FileProvider limited to dedicated share cache; 32 MiB per output, 64 files/96 MiB cache,
  shares retained 24h for delayed recipient reads. Concurrent sharing rejected.
- Rest alerts use native LocalNotifications, high importance sound/vibration channel;
  POST_NOTIFICATIONS and user-controlled SCHEDULE_EXACT_ALARM. No full-screen intent.
  Screen illumination is controlled by Android settings; Doze can delay frequent idle alarms.
- Android Back delegates to existing app/sheet history; root minimizes app. Keyboard adjustResize.
- Native app now uses app-private Android SQLite via WorkoutStoragePlugin. Existing native
  WebView data is copied once in a transaction; original source remains intact. Website/TWA
  data is separate and still needs JSON export/import. Never uninstall the existing app to test.

## Tally lessons reviewed

Read D:/tally-android commits f0a5a86, 34cac75 and 5a740a2 plus HANDOFF and sync script;
also tally-play history and existing wegogim-play README/twa-manifest.
Carry forward: public asset allowlist; awaited native save; bounded cache; delayed share cleanup;
separate dev package; no automatic browser storage migration; upload key != Play signing key;
do not confuse browser simulations with actual phone verification or review with publication.

## Second checkpoint

- Startup bug found on real Samsung SM-S948B: strict CSP rejects inline bootstrap.
  Fixed by external native/start.js. Reinstalled `.dev`, native Welcome loads correctly.
- Actual screen-off test: scheduled native rest alert, put phone to sleep; Android notification
  record shows id1/high-importance rest channel delivered. Screen illumination not verified.
  Test used adb permission grant/exact-alarm appop on development package only.
- Mid-workout per-set kg/lb/level/bodyweight control added at user's request. Earlier completed
  sets retain load metadata; kg/lb share kg storage; other type changes clear only unfinished loads.
  Engine volume/exposures/PR logic exclude incompatible units. JSON/CSV preserve load types.
- 553 unit tests pass; mixed-unit browser reload/save test passes; focused four-language sweep
  now passes (calendar aria-label names translated individually).
- Build-tool uuid override to11.1.1 fixes all3moderate audit findings; install audit reports0.
- Compatibility matrix first900cases has5transientHistoryoverflows; rerun waits for animations.
- User's official icon source copied verbatim from penup_20261003_231302.jpg;
  exporting web/Android/Play variants. Original orientation and drawing preserved.

## Final preparation checkpoint

- Native SQLite is now authoritative through the existing js/db.js API. Migration commits records
  and its marker in one transaction, retains WebView/localStorage sources, and stops on errors.
  Save failures never silently fall back to browser storage. The migration marker survives the
  app's own Erase everything so old WebView data cannot reappear afterwards.
- Samsung SM-S948B storage proof: all37synthetic sessions survived deleting WebView IndexedDB
  and localStorage, force-stop/restart, and reinstalling the APK with -r. Evidence in ignored
  output/phone/storage-results.json. Uninstall/Android Clear storage still erases data.
- Actual native phone smoke:15checks passed, including7routes,37pxsafe-top inset handling,
  Save-file cancellation, file/text share cancellation, hardware Back, reload persistence,
  and training notification scheduling/opt-out cancellation. output/phone/results.json.
  CDP Page.captureScreenshot hangs on this WebView; use adb screencap (script now does).
- Final unit suite560/560, browser interactions27/27, active-workout layout900/900cases:
  5languages ×6sizes ×3textscales ×10routes. Japanese150%calibration label wrapping fixed.
  Real hardware testing covers one Samsung; the900case matrix is Chromium simulation.
- Android build/lint succeeds:0errors,29template/dependency/resource warnings. APK signature
  verified(v2), AAB jar signature verified; normal self-signed upload-certificate warnings.
  No packaged .so files. MinimumAPI24,target/compile36,versionName1.11.0.
- Signed APK/AAB and SHA256 manifests: ignored output/release. Rebuild with
  scripts/build-release.mjs; JDK21 D:/tools/jdk21-extract/jdk-21.0.12.1+1,
  Gradle cache D:/gradle-home, SDK C:/Users/user/.bubblewrap/android_sdk.
  Upload key C:/Users/user/wegogim-android-keys; never print/commit passwords or key files.
- Official artwork now also replaces densityless drawable/splash.png. All web/native/store
  icons use the provided source without redrawing or rotating it.
- Interactive requested mockup:mockups/welcome.html (Welcome/Startup,theme,plan/restore previews).
  It is a design preview; live Welcome has explicit website backup→Androidrestore guidance.
- 1,000English reminder drafts:content/reminders/drafts.md,source.mjs,VOICE.md. Curated20themes
  ×10openings ×5closings, persisted unique complete messages<=180characters. Brand-voice skill
  applied; dedicated UX-writing/microcopy skills were not installed. Principles applied directly.
- Both requested reminder features: optional native planned-day notifications with custom text,
  plus editable share/copy composer. No messages sent automatically. English default rotates
  through the bank; other supported languages use a localized short default, or user's text.
  Native consent is stored outside exported settings; importing a backup disables reminders.
- Training notifications renew the next28days on app visits/changes. No indefinite scheduling
  while unopened is promised. Android/DND/battery settings affect timing, sound and illumination.
  Earlier screen-off rest test verified delivery record; screen illumination remains unverified.
- Existing website data still needs explicit JSON export/import; no automatic browser/TWA transfer.
  Cloud backup is disabled. JSON exports omit progress photos; retain photos separately.
- Ponytail native-first guidance applied; Graphify CLI/map traced state→db and privacy references.
  Commit hook rebuilds Graphify automatically. Website and Android remain separate data stores.

## Before publishing

- See release/README.md and release/listing-en.md. Listing art/screenshots prepared;
  screenshots use synthetic Chromium data and are labelled as simulations in their manifest.
- Native versionCode2isprovisional: confirm the highest code already uploaded in Play Console.
- Confirm signing identity in Console; upload key is not necessarily the Play app signing key.
- Publish updated public privacy page, complete Data safety/health declarations, upload to internal
  testing and check Play pre-launch report. Optional feedback prevents a blanket "no data collected".
- Confirm account production-access/testing requirements; this session did not inspect the Console.
- No push, website deployment or Play submission performed. Public launch timing depends on Console
  requirements and Google review. Do not claim the app is already available from the Play Store.
