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
- Native app uses separate WebView storage: old PWA/TWA data needs JSON export/import.

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

## Verification / next work

- Baseline 545 unit tests passed before changes.
- Dependencies installed. npm initially reported 3 moderate issues; online audit still needs verification.
- Native assets sync completed. Android build, new regression tests, phone checks and release
  signing/store preparation remain in progress. Do not claim ready to upload yet.
- Connected adb phone available. SDK C:/Users/user/.bubblewrap/android_sdk;
  JDK21 D:/tools/jdk21-extract/jdk-21.0.12.1+1.
- Existing signing key C:/Users/user/wegogim-android-keys (never print/commit secrets).
- Native versionCode 2 is provisional: verify highest uploaded code before submission.
- No push, deployment or Play submission performed or requested in this session.
