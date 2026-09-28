# Brandons Gym App

Weightlifting tracker PWA. No build step — plain HTML/CSS/JS. Workouts are
saved to a Supabase project ("Brandons Gym App") behind an email + password
login, so history survives a lost phone or cleared browser and can be queried
directly to adjust future workouts.

## Try it locally
```
cd app
python3 -m http.server 8000
```
Open http://localhost:8000 in a browser. To try it on your iPhone on the
same network, use your Mac's LAN IP instead of localhost.

## Install on iPhone
Once this is hosted somewhere reachable from your phone (even a simple
static host — GitHub Pages, Netlify, etc. — since `file://` won't work for
a service worker): open it in Safari → Share → **Add to Home Screen**. It
then launches full-screen with no browser chrome. It needs a connection
to load and save your workouts.

## What's built
- `js/db.js` — exercise database (full gym: barbell/dumbbell/machine/cable/
  bodyweight/kettlebell/assisted-machine), tagged by muscle group and
  compound/isolation. 96 exercises total.
- `js/cloud.js` — Supabase connection and sign-in. The publishable key in it
  is meant to be public; row-level security in the database (each row is
  owned by the signed-in user) is what protects the data.
- `js/store.js` — cloud data layer; source of truth for history. History is
  loaded once at startup into memory (so routine/progression stay
  synchronous); every write goes to the database. An in-progress workout is
  saved set-by-set and picked back up if the app is closed mid-workout;
  Finish Workout reconciles everything on screen and only clears it once the
  save succeeds. The old on-phone history (`liftTracker.history.v1`) is moved
  into the cloud once after the first sign-in.

  Tables: `workout_sessions` (notes, cardio), `session_exercises`, `sets`
  (weights in lbs, optional RPE), plus a `set_history` view for analysis.
  Assisted machines are flagged `weightMeaning: "assistance"` in `db.js`, so
  progression lowers the assistance instead of adding weight.
- `js/routine.js` — auto-varying routine generator: ranks muscle groups by
  days since last trained (respecting a minimum recovery window, with a
  shuffle so a fresh user doesn't always get the same combo) and builds a
  ~5-exercise session around whatever's most due.
- `js/progression.js` — progressive-overload suggestions, split by
  equipment type:
  - **Weighted exercises** (barbell/dumbbell/machine/cable): hit all reps
    last time → +5 lbs compound / +2.5 lbs isolation; missed reps → repeat
    weight.
  - **Bodyweight exercises** (Pull-Up, Dips, Hanging Leg Raise, Ab Wheel
    Rollout, Weighted Plank): no weight is tracked at all — just reps. The
    first session for any bodyweight exercise is open-ended (AMRAP — as
    many reps as possible per set, no target), and the app sets a real
    rep target from whatever you actually got. After that, hitting the
    target on every set bumps it up by 1 rep next time; missing it repeats
    the same target. `Dips` and `Pull-Up` also have easier
    machine-assisted alternatives in the exercise DB (Assisted Dip
    Machine, Assisted Pull-Up Machine) for anyone building up to the
    unassisted version.
- `js/formGuidance.js` — per-exercise form guidance, shown in a collapsed
  "Form guidance ▸" section on each exercise card (tap to expand). Covers
  all 96 exercises, each with a stick-figure diagram (~53 pose families; `pads` supports benches/boxes/machine pads): a written cue, 2-3 common mistakes, and a short
  stick-figure diagram sequence rendered as inline SVG (data-driven off
  ~26 reusable "pose families" rather than one-off art per exercise). Some
  poses include a faint red "ghost" overlay showing one common mistake
  visually, where that reads naturally on the pose.
- `js/warmup.js` — optional ~10-minute guided warm-up before a workout
  ("Warm Up first" button on the start screen). 7 minutes of light cardio
  (treadmill incline walk, bike, rower, or elliptical — picked at random)
  plus 3 mobility/stretch moves drawn from a pool of 11, weighted toward
  whatever muscle groups today's routine is about to train (e.g. skips
  upper-body-only stretches on a leg day). Each move has its own timed
  segment(s) — including 30-second holds for static stretches — with a
  real countdown, a progress bar, a beep + short vibration when a segment
  ends, pause/resume, skip-this-segment, and skip-the-whole-warmup.
  Finishing (or skipping) the warm-up hands off into the normal routine
  screen.
- `js/chat.js` — optional text-command layer. Handles "log 3x10 at 135"
  locally and offline. Free-form parsing (swap suggestions, "what's next",
  etc.) needs a real Claude API call, which is **not wired up yet** — see
  the TODO at the top of that file. Calling the Claude API straight from
  the browser would leak the API key, so this needs a small backend proxy
  first.
- `js/app.js` — UI wiring: start/finish workout, swap an exercise, log
  sets, view history. Routine generation and screen display are split
  (`generateAndStoreRoutine()` / `showRoutineScreen()`) so both the direct
  "Start Workout" button and the warm-up flow can share the same routine
  logic.

## Known open items
- Chat layer is a stub for anything beyond the "log NxM at W" pattern —
  needs a backend proxy + real Claude API call.
- No edit/delete UI for a logged session yet (only `Store.deleteSession`
  exists as a data-layer method).
- Icons are a placeholder dumbbell mark generated programmatically —
  swap for real branding whenever you want.
