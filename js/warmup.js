// Warm-up: a ~10 minute guided sequence (light cardio + mobility/stretches)
// with a countdown timer, shown before the lifting routine. Mobility picks
// lean toward whatever today's routine is going to train, using the same
// primary-muscle-group data the routine generator already computed.

const CARDIO_DB = [
  { name: "Treadmill Incline Walk", note: "Set an incline (5-10%) and walk at an easy, conversational pace." },
  { name: "Stationary Bike", note: "Easy, conversational pace — this is just to raise blood flow, not a workout." },
  { name: "Rowing Machine", note: "Light, steady pace." },
  { name: "Elliptical", note: "Easy, conversational pace." },
];
const CARDIO_SECONDS = 420; // 7:00

// Each item's `segments` flattens into the timer sequence. Two segments
// (e.g. "Left side" / "Right side") means the timer runs it twice in a row.
const WARMUP_MOBILITY_DB = [
  { name: "Arm Circles", focus: "upper", segments: [{ label: "Forward", seconds: 30 }, { label: "Backward", seconds: 30 }] },
  { name: "Shoulder Rolls", focus: "upper", segments: [{ label: "Continue", seconds: 30 }, { label: "Continue", seconds: 30 }] },
  { name: "Torso Twists", focus: "upper", segments: [{ label: "Continue", seconds: 60 }] },
  { name: "Chest Opener Stretch", focus: "upper", segments: [{ label: "Hold", seconds: 30 }, { label: "Hold again", seconds: 30 }] },
  { name: "Leg Swings (front to back)", focus: "lower", segments: [{ label: "Left leg", seconds: 30 }, { label: "Right leg", seconds: 30 }] },
  { name: "Leg Swings (side to side)", focus: "lower", segments: [{ label: "Left leg", seconds: 30 }, { label: "Right leg", seconds: 30 }] },
  { name: "Walking Lunges", focus: "lower", segments: [{ label: "Continue", seconds: 60 }] },
  { name: "Hip Flexor Stretch", focus: "lower", segments: [{ label: "Left side", seconds: 30 }, { label: "Right side", seconds: 30 }] },
  { name: "Bodyweight Squats", focus: "lower", segments: [{ label: "Continue", seconds: 60 }] },
  { name: "Cat-Cow Stretch", focus: "full", segments: [{ label: "Continue", seconds: 60 }] },
  { name: "Standing Reach & Toe Touch", focus: "full", segments: [{ label: "Continue", seconds: 60 }] },
];

const LOWER_GROUPS = ["quads", "hamstrings_glutes", "calves"];
const UPPER_GROUPS = ["chest", "back", "shoulders", "biceps", "triceps"];

function pickRandomN(arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// primaryGroupKeys: array of muscle-group keys from generateRoutine()'s
// primaryGroups, e.g. ["chest","back","shoulders"]. Returns a plan object:
// { items: [...], segments: [flattened timer segments], totalSeconds }
function generateWarmupPlan(primaryGroupKeys) {
  const hasLower = primaryGroupKeys.some((k) => LOWER_GROUPS.includes(k));
  const hasUpper = primaryGroupKeys.some((k) => UPPER_GROUPS.includes(k));

  let pool;
  if (hasLower && hasUpper) pool = WARMUP_MOBILITY_DB;
  else if (hasLower) pool = WARMUP_MOBILITY_DB.filter((m) => m.focus === "lower" || m.focus === "full");
  else if (hasUpper) pool = WARMUP_MOBILITY_DB.filter((m) => m.focus === "upper" || m.focus === "full");
  else pool = WARMUP_MOBILITY_DB;

  const mobility = pickRandomN(pool, 3);
  const cardio = pickRandomN(CARDIO_DB, 1)[0];

  const items = [
    { type: "cardio", name: cardio.name, note: cardio.note, segments: [{ label: "Keep it easy", seconds: CARDIO_SECONDS }] },
    ...mobility.map((m) => ({ type: "mobility", name: m.name, note: null, segments: m.segments })),
  ];

  const segments = [];
  items.forEach((item, itemIndex) => {
    item.segments.forEach((seg) => {
      segments.push({
        itemIndex,
        itemName: item.name,
        itemType: item.type,
        note: item.note,
        label: seg.label,
        seconds: seg.seconds,
      });
    });
  });

  const totalSeconds = segments.reduce((sum, s) => sum + s.seconds, 0);
  return { items, segments, totalSeconds };
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ===================== Timer engine + screen rendering =====================

let warmupPlan = null;
let warmupSegIndex = 0;
let warmupRemaining = 0;
let warmupIntervalId = null;
let warmupPaused = false;
let audioCtx = null;

function playWarmupBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    // Web Audio unavailable/blocked — silently skip the beep, timer still works.
  }
}

function vibrateShort(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    // no-op
  }
}

// Uses the `el(id)` helper already declared in app.js (loaded before this
// file) — not redeclared here to avoid a duplicate top-level binding.

function renderWarmupShell() {
  const list = el("warmup-item-list");
  list.innerHTML = warmupPlan.items
    .map(
      (item, i) => `<li class="warmup-item-row" data-item-index="${i}">
        <span class="warmup-item-dot"></span>
        <span class="warmup-item-name">${item.name}</span>
      </li>`
    )
    .join("");
}

function updateWarmupItemList() {
  const currentItemIndex = warmupPlan.segments[warmupSegIndex].itemIndex;
  document.querySelectorAll("#warmup-item-list .warmup-item-row").forEach((row) => {
    const i = Number(row.dataset.itemIndex);
    row.classList.toggle("current", i === currentItemIndex);
    row.classList.toggle("done", i < currentItemIndex);
  });
}

function renderCurrentSegment() {
  const seg = warmupPlan.segments[warmupSegIndex];
  el("warmup-item-name").textContent = seg.itemName;
  el("warmup-segment-label").textContent =
    warmupPlan.segments.filter((s) => s.itemName === seg.itemName).length > 1 ? seg.label : "";
  el("warmup-note").textContent = seg.note || "";
  el("warmup-timer-display").textContent = formatMMSS(warmupRemaining);
  el("warmup-progress-fill").style.width = `${((seg.seconds - warmupRemaining) / seg.seconds) * 100}%`;
  el("warmup-pause-btn").textContent = "Pause";
  updateWarmupItemList();
}

function updateTimerDisplay() {
  const seg = warmupPlan.segments[warmupSegIndex];
  el("warmup-timer-display").textContent = formatMMSS(warmupRemaining);
  el("warmup-progress-fill").style.width = `${((seg.seconds - warmupRemaining) / seg.seconds) * 100}%`;
}

function clearWarmupInterval() {
  if (warmupIntervalId) {
    clearInterval(warmupIntervalId);
    warmupIntervalId = null;
  }
}

function beginSegment(index) {
  clearWarmupInterval();
  if (index >= warmupPlan.segments.length) {
    completeWarmup();
    return;
  }
  warmupSegIndex = index;
  warmupRemaining = warmupPlan.segments[index].seconds;
  warmupPaused = false;
  renderCurrentSegment();
  vibrateShort(30);
  startTick();
}

function startTick() {
  clearWarmupInterval();
  warmupIntervalId = setInterval(() => {
    if (warmupPaused) return;
    warmupRemaining--;
    if (warmupRemaining <= 0) {
      clearWarmupInterval();
      playWarmupBeep();
      vibrateShort([40, 60, 40]);
      beginSegment(warmupSegIndex + 1);
    } else {
      updateTimerDisplay();
    }
  }, 1000);
}

function toggleWarmupPause() {
  warmupPaused = !warmupPaused;
  el("warmup-pause-btn").textContent = warmupPaused ? "Resume" : "Pause";
}

function skipWarmupSegment() {
  beginSegment(warmupSegIndex + 1);
}

function completeWarmup() {
  clearWarmupInterval();
  playWarmupBeep();
  vibrateShort([40, 60, 40, 60, 40]);
  el("warmup-active").classList.add("hidden");
  el("warmup-complete").classList.remove("hidden");
}

// Bails out of the warm-up entirely and goes straight to the (already
// generated) routine screen.
function skipWholeWarmup() {
  clearWarmupInterval();
  showRoutineScreen();
}

// Called from the "Warm Up" button. Generates today's routine up front (so
// mobility picks can lean toward what it trains) but doesn't show it yet —
// showRoutineScreen() (in app.js) is called once warm-up finishes or is skipped.
async function startWarmup() {
  const routine = await generateAndStoreRoutine();
  warmupPlan = generateWarmupPlan(routine.primaryGroups.map((g) => g.key));

  el("start-screen").classList.add("hidden");
  el("warmup-screen").classList.remove("hidden");
  el("warmup-active").classList.remove("hidden");
  el("warmup-complete").classList.add("hidden");

  renderWarmupShell();
  beginSegment(0);
}

document.addEventListener("DOMContentLoaded", () => {
  if (el("warmup-pause-btn")) el("warmup-pause-btn").addEventListener("click", toggleWarmupPause);
  if (el("warmup-skip-btn")) el("warmup-skip-btn").addEventListener("click", skipWarmupSegment);
  if (el("warmup-skip-all-btn")) el("warmup-skip-all-btn").addEventListener("click", skipWholeWarmup);
  // "Start Workout" button shown once the warm-up sequence finishes.
  if (el("warmup-done-btn")) el("warmup-done-btn").addEventListener("click", showRoutineScreen);
});
