# Capacitor Android migration — 2026-10-04

## Claude: resume here

Android **1.11.0 / versionCode 2** is already published to Play **internal testing**.
GitHub main, the updated privacy page and the startup mockup are published too.
Local branch: `fix-welcome`. Code checkpoint: `579df86`; internal publication notes: `9df3300`.
Subsequent handoff commits change documentation only. Read this section before the historical
implementation checkpoints below, which contain earlier test counts and in-progress notes.

### Approval scope and storage promise

- User approved GitHub/Pages publication and Play internal testing only. They separately approved
  Google's policy and US export declarations when creating the app. **Closed/open testing and
  production submission are not authorised.** Do not modify Tally or send invitations/messages.
- Android workouts use **app-private SQLite**, not browser persistent storage. Clearing browser
  cache/data, uninstalling a browser, or clearing we go gim's **cache** does not erase workouts.
  Uninstalling **we go gim**, Android **Clear storage/data**, a phone reset or device loss can.
  Browser uninstallation itself was not performed; its data is separate by architecture.
- Website/PWA/TWA data still uses separate browser storage. Export JSON there and restore it
  in Android. Android cloud backup is disabled; exported backups omit progress photos.
- Native SQLite migration retains original sources, commits its marker transactionally and
  stops on errors. Never introduce a silent browser fallback or seed empty history after failure.

### Where to continue, in order

1. Verify installation through the internal tester link with an eligible Google account, then
   check the Play-delivered app. Hardware evidence so far uses the separate development APK.
   Never uninstall an existing app or clear its data to bypass a signing mismatch.
2. Finish store listing and app-content **drafts**: official icon, prepared description/screenshots/
   feature graphic, published privacy URL, Data safety, health declaration, content rating,
   target audience, no ads and unrestricted app access. These are not submitted for public review.
   Optional Google Forms feedback sends text, optional contact and basic app information;
   do not declare blanket "no data collected." Use exact Console wording and source evidence.
3. Check Play pre-launch reports when available and fix actual findings. Do not call a pending
   report passed. Current verification: **560 unit tests, 27 browser tests, 900 active-workout
   layout cases and 15 real Samsung smoke checks** passed; hardware coverage is one phone.
4. Fixes need a **versionCode greater than 2**, appropriate tests, a new signed build and an
   internal rollout. Do not upload changed bytes with code 2. Commit checkpoints and update this file.
5. Obtain authority before closed/open testing or production. This account requires **12 closed
   testers continuously opted in for 14 days**, then an application for production access and
   Google review. The nine-account internal list does not meet or count toward that requirement.

### Links, artifacts and practical pickup notes

- Internal opt-in: https://play.google.com/apps/internaltest/4700623995534838864
- Console: https://play.google.com/console/u/1/developers/8815481908048608009/app/4974756118756386209/tracks/4700623995534838864?tab=releases
- Mockup: https://fir1412.github.io/we-go-gim/mockups/welcome.html
- Privacy: https://fir1412.github.io/we-go-gim/privacy.html
- Play visibly showed **Active / Available to internal testers**. Beta Testers (nine accounts)
  was selected and saved; no invitations were sent. The unreviewed listing uses a temporary
  package-name title. Play said installation can take up to an hour, occasionally longer.
- Uploaded AAB: `output/release/we-go-gim-1.11.0.aab`, SHA256
  `6be393dfb0d1f9473205471ef7b1cadfa2070dfaea7d83615783c4aa0e5a4cb1`.
- APK: `output/release/we-go-gim-1.11.0.apk`, SHA256
  `ffaa9d1e679f473ec575ed51cc5ed9707af6ca00dee33faf9a211adb8116611a`.
- `output/` is gitignored and stays on this PC. Another checkout must rebuild artifacts and
  regenerate evidence. Logs/results: `output/final-unit-tests.log`, `output/final-e2e.log`,
  `output/compatibility/layout.json`, `output/phone/results.json`,
  `output/phone/storage-results.json` and `output/phone/native-data.png`.
- Build instructions: `release/README.md`. Signing keys/passwords remain outside the repo at
  `C:/Users/user/wegogim-android-keys`; never print or commit them. Upload signing and Play app
  signing can differ. The `.dev` package is for synthetic tests, not production-data experiments.
- `mockups/welcome.html` is a design preview, not the live onboarding redesign. The live welcome
  adds explicit website-to-Android backup restoration. Keep that distinction in release claims.
- Training reminders renew only the next 28 days on app visits/changes. Screen-off rest delivery
  was observed, but screen illumination was not verified or guaranteed. Preserve those limits.
- The bank has 1,000 composed **English drafts**, not 1,000 translations. Other supported
  languages use a localized short default or custom text. Review sources in `content/reminders/`.
- Official artwork: `icons/official-source.jpg`; preserve the drawing and orientation.
- Graphify's commit hook rebuilds the graph automatically. Ponytail guidance favours existing
  helpers and Android's built-in APIs. Review actual data-loss paths before simplifying them.

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

### Internal publication completed (2026-10-04)

User approved GitHub/Pages publication and Play internal testing only; production submission
is NOT authorised. User separately approved the policy/export declarations at app creation.

- GitHub main pushed to579df86; Pages build confirmed built. Live mockup:
  https://fir1412.github.io/we-go-gim/mockups/welcome.html. Updated privacy is published too.
- Play account fir1412, developer8815481908048608009 had only Tally. Created NEW we go gim
  app record4974756118756386209; package io.github.fir1412.wegogim was confirmed available.
  The earlier TWA project was preparation, not an existing listing in this Console account.
- Signed AAB versionCode2/versionName1.11.0 accepted, minimum24,target36,9.35MBinstall estimate.
  Internal track4700623995534838864 is Active; release1 is Available to internal testers.
- Existing Beta Testers list(9accounts) selected and saved. No invitations/messages sent.
  Opt-in:https://play.google.com/apps/internaltest/4700623995534838864
- Play initially warned no testers; saving the list and refreshing removed that warning.
  Remaining non-blocking warning is missing deobfuscation mapping; minifyEnabled=false.
- Play displays temporary name io.github.fir1412.wegogim(unreviewed). Installation can take
  up to an hour to propagate. App setup/listing/content declarations are not yet submitted
  for public review. Native launcher uses the official artwork.
- This account explicitly requires closed testing with12testers for14continuous days before
  applying for production access. Internal testing does not fulfil that requirement.
- Final uploaded AAB SHA256:6be393dfb0d1f9473205471ef7b1cadfa2070dfaea7d83615783c4aa0e5a4cb1.
  Next Android release must use a versionCode greater than2.
- Do not modify Tally's release. Do not promote to closed/open/production without user authority.

- See release/README.md and release/listing-en.md. Listing art/screenshots prepared;
  screenshots use synthetic Chromium data and are labelled as simulations in their manifest.
- VersionCode2isnowuploaded to internal testing; increment for the next build.
- Confirm signing identity in Console; upload key is not necessarily the Play app signing key.
- Complete Data safety/health declarations and check Play pre-launch reports before any broader
  release. Optional feedback prevents a blanket "no data collected". Privacy page is already live.
- Public launch requires the account's closed-test criteria and Google review, plus user permission.
  Internal testers have access; do not claim the app is publicly available or reviewed.
