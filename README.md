# we go gim

**▶ Open the app: https://fir1412.github.io/we-go-gim/** (on Android, open this link in Chrome, then ⋮ → Install app)

A phone-first workout tracker that pre-fills every session from your last one, so you never copy and paste a workout again.

- **Auto-suggest:** each exercise arrives with today's target from double progression: add reps until every set hits the top of the range, then add the smallest weight step. New exercises or machines ask you to calibrate; poor sleep or pain holds the load; three flat sessions flag a plateau; deload weeks when the signs pile up.
- **Workout logging:** tap to tick sets; a rest timer starts itself; weights carry forward; warm-ups, supersets, swaps, notes, RIR and pain flags; plate and dumbbell helper; time left and finish time.
- **Insights:** what to focus on next session, trend per muscle, weekly sets, estimated max per lift, body weight toward your goal, cardio with leg-day clash warnings.
- **Levels:** a body map where each muscle earns XP from hard sets and personal bests, and levels up.
- **Your data:** programme editor, exercise library, gyms (machine loads compare per gym), equipment, import old logs from PDF/text/CSV, CSV export, JSON backup and share to Drive. Everything is stored on the phone (IndexedDB) and works offline.

## Install on Android

Open the GitHub Pages link in Chrome, then tap **⋮ → Add to Home screen** (or the install banner). It runs full-screen and offline.

## Run locally

No build step. Serve the folder and open it:

```sh
python -m http.server 8765
# http://127.0.0.1:8765/            (add ?today=2026-09-28 to fake the date, &notour to skip the tour)
```

## Tests

```sh
node --test tests/*.test.mjs
```

Screen tests drive a headless Chrome on a phone-sized screen (typing, folding cards, back, swipe to skip, the rest timer). They use the Chrome installed on the machine, or `CHROME_PATH`, and need nothing installed:

```sh
node --test tests/e2e/*.e2e.mjs
```

## Structure

| Path | What |
| --- | --- |
| `js/engine.js` | Pure training logic: suggestions, trends, plateaus, deloads, warm-ups, plates, XP, duration estimates |
| `js/state.js` | In-memory state, workout draft lifecycle, persistence |
| `js/db.js` | IndexedDB wrapper with localStorage fallback |
| `js/seed.js` | Exercise library, 5-day programme, starter history |
| `js/io.js` | CSV, JSON backup, free-text and PDF log parsing |
| `js/views/*.js` | Today, Workout, Insights, Levels, History, More |
| `sw.js` | Offline cache |

Icon: a tuxedo kitten holding two dumbbells, drawn for this project (`icons/icon.svg`, full-bleed `icons/icon-maskable.svg`), MIT like the code.
