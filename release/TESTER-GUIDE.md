# Closed testing: we go gim

The first closed release is 1.11.1 (Android version code 3), initially available in Malaysia.
Google review and automatic checks must finish before the closed-test link works.

Closed-test opt-in: https://play.google.com/apps/testing/io.github.fir1412.wegogim
Android listing: https://play.google.com/store/apps/details?id=io.github.fir1412.wegogim
Internal testing is separate: https://play.google.com/apps/internaltest/4700623995534838864

## Joining

1. The owner adds your Google Play account to the closed tester email list.
2. Open the closed-test opt-in link while signed in to that same account and join.
3. Install through Google Play. Stay opted in for at least 14 continuous days and use the app.
4. Send useful feedback through More → Send feedback or fir1412dev@gmail.com.

The account requires at least 12 closed testers continuously opted in for 14 days before the
owner can apply for production access. The current list contains 9 accounts; being listed alone
does not count as opting in. Internal participation does not count for this requirement.
If an account is enrolled internally, switch to the closed test before counting its closed-test time.

## Useful checks

- Finish a workout; reopen the app and confirm the sets remain.
- Switch kg/lb/levels/bodyweight during a workout; earlier completed sets should retain their units.
- Save a JSON backup to a location you can find again. Restore it in a separate test installation,
  or use Merge when preserving existing history. Check loads, reps, notes and workout dates.
- Export CSV, import it through the review screen, and compare the saved workout. CSV stores
  weight in canonical kg; JSON preserves per-set kg/lb display preferences.
- Try theme/palette changes, large text, keyboard input, and your chosen language.
- If you enable notifications, test a rest alert with the screen off. Android permissions, battery,
  Do Not Disturb and device settings affect delivery; screen illumination is not guaranteed.

Android history uses app-private SQLite. Browser deletion and cache clearing are separate.
Uninstalling we go gim or using Android Clear storage/data erases its local data. Exported backups
remain at their chosen destinations; JSON backups omit progress photos. Preserve existing data
when testing and never uninstall to bypass a signing mismatch.

## Owner follow-up

Check Play review/pre-launch results, recruit enough eligible testers, collect feedback during
the 14-day period, and apply for production access. Production publication needs separate owner
approval. No invitations have been sent by the agent.

Phone interoperability tests are paused for Tally. Authentic FitNotes, Hevy and Strong export
fixtures and Android file-picker round trips remain pending; browser tests are not substitutes.
