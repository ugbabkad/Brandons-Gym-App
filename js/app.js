// Main UI wiring. Plain scripts (no build step, no bundler) — everything
// in js/db.js, store.js, routine.js, progression.js, chat.js is loaded as
// global functions/constants before this file runs.

let currentRoutine = null; // array of exercise objects in the active session
let currentPrimaryGroups = null; // primaryGroups from the last generated routine (for the focus banner)
let lastFocusedExercise = null; // name of the exercise whose input was last focused (for chat commands)

const el = (id) => document.getElementById(id);

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      el(`tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "history") renderHistory();
    });
  });
}

function muscleLabel(key) {
  const g = MUSCLE_GROUPS.find((m) => m.key === key);
  return g ? g.label : key;
}

function renderFocusBanner(primaryGroups) {
  const parts = primaryGroups.map((g) => {
    const recency = g.daysSince === null ? "never trained" : `${g.daysSince}d ago`;
    return `${g.label} (${recency})`;
  });
  el("routine-focus").innerHTML = `<strong>Today's focus:</strong> ${parts.join(", ")}`;
}

function buildExerciseCard(exercise) {
  const suggestion = suggestNext(exercise);
  const card = document.createElement("div");
  card.className = "exercise-card";
  card.dataset.exerciseName = exercise.name;
  card.dataset.muscleGroup = exercise.muscleGroup;
  card.dataset.type = exercise.type;
  card.dataset.equipment = exercise.equipment;
  card.dataset.targetReps = suggestion.targetReps === null ? "" : suggestion.targetReps;

  const head = document.createElement("div");
  head.className = "exercise-card-head";
  head.innerHTML = `
    <div>
      <p class="exercise-name">${exercise.name}</p>
      <p class="exercise-meta">${muscleLabel(exercise.muscleGroup)} &middot; ${exercise.equipment}</p>
    </div>
  `;
  const swapBtn = document.createElement("button");
  swapBtn.className = "secondary-btn";
  swapBtn.textContent = "Swap";
  swapBtn.addEventListener("click", () => swapExercise(exercise.name));
  head.appendChild(swapBtn);
  card.appendChild(head);

  const note = document.createElement("p");
  note.className = "suggestion-note";
  note.textContent = suggestion.note;
  card.appendChild(note);

  const isBodyweight = exercise.equipment === "bodyweight";
  const setsWrap = document.createElement("div");
  setsWrap.className = "sets-wrap";
  for (let i = 0; i < suggestion.sets; i++) {
    const row = document.createElement("div");
    row.className = isBodyweight ? "set-row bodyweight" : "set-row";
    const targetLabel = suggestion.targetReps === null ? "AMRAP" : `/ ${suggestion.targetReps}`;
    row.innerHTML = isBodyweight
      ? `
      <span class="set-index">${i + 1}</span>
      <input type="number" inputmode="numeric" class="reps-input" placeholder="reps" />
      <span class="set-target">${targetLabel}</span>
    `
      : `
      <span class="set-index">${i + 1}</span>
      <input type="number" inputmode="decimal" class="weight-input" placeholder="lbs" value="${suggestion.weight ?? ""}" />
      <input type="number" inputmode="numeric" class="reps-input" placeholder="reps" />
      <span class="set-target">${targetLabel}</span>
    `;
    const inputs = isBodyweight
      ? [row.querySelector(".reps-input")]
      : [row.querySelector(".weight-input"), row.querySelector(".reps-input")];
    row.dataset.setNumber = String(i + 1);
    inputs.forEach((input) => {
      input.addEventListener("focus", () => (lastFocusedExercise = exercise.name));
      input.addEventListener("change", () => syncRow(card, row));
    });
    setsWrap.appendChild(row);
  }
  card.appendChild(setsWrap);

  if (typeof hasFormGuidance === "function" && hasFormGuidance(exercise.name)) {
    const formWrap = document.createElement("div");
    formWrap.innerHTML = buildFormGuidanceHTML(exercise.name);
    while (formWrap.firstChild) card.appendChild(formWrap.firstChild);
  }

  return card;
}

function renderExerciseList() {
  const list = el("exercise-list");
  list.innerHTML = "";
  currentRoutine.forEach((exercise) => list.appendChild(buildExerciseCard(exercise)));
}

function swapExercise(name) {
  const idx = currentRoutine.findIndex((e) => e.name === name);
  if (idx === -1) return;
  const exercise = currentRoutine[idx];
  const excludeNames = new Set(currentRoutine.map((e) => e.name));
  const replacement =
    pickExercise(exercise.muscleGroup, exercise.type, excludeNames) ||
    pickExercise(exercise.muscleGroup, exercise.type === "compound" ? "isolation" : "compound", excludeNames);
  if (!replacement) {
    alert("No other exercises available for this muscle group.");
    return;
  }
  currentRoutine[idx] = replacement;
  Store.replaceExercise(exercise.name, replacement);
  renderExerciseList();
}

// Generates today's routine and stores it in state, but does not touch the
// DOM at all. Returns the full routine object ({primaryGroups, exercises})
// so callers — e.g. the warm-up screen — can use primaryGroups (to pick
// relevant mobility work) before the routine screen is ever shown.
function generateAndStoreRoutine() {
  const routine = generateRoutine();
  currentRoutine = routine.exercises;
  currentPrimaryGroups = routine.primaryGroups;
  return routine;
}

// Shows the routine screen for the already-generated currentRoutine /
// currentPrimaryGroups. Safe to call whether the user skipped the warm-up
// or just finished it.
function showRoutineScreen() {
  if (!Store.getActive()) Store.beginSession(currentRoutine);
  renderFocusBanner(currentPrimaryGroups);
  renderExerciseList();
  el("start-screen").classList.add("hidden");
  if (el("warmup-screen")) el("warmup-screen").classList.add("hidden");
  el("routine-screen").classList.remove("hidden");
  el("chat-reply").textContent = "";
  el("chat-input").value = "";
}

function startWorkout() {
  generateAndStoreRoutine();
  showRoutineScreen();
}

// Reads every exercise card on screen. Each set keeps its row number, so a
// skipped row stays skipped instead of shifting later sets up.
function collectRowsFromDom() {
  const out = [];
  document.querySelectorAll("#exercise-list .exercise-card").forEach((card) => {
    const targetReps = card.dataset.targetReps === "" ? null : Number(card.dataset.targetReps);
    const isBodyweight = card.dataset.equipment === "bodyweight";
    const sets = [];
    card.querySelectorAll(".set-row").forEach((row) => {
      const setNumber = Number(row.dataset.setNumber);
      const reps = row.querySelector(".reps-input").value;
      if (isBodyweight) {
        if (reps !== "") sets.push({ setNumber, reps: Number(reps) });
        return;
      }
      const weight = row.querySelector(".weight-input").value;
      if (weight !== "" && reps !== "") {
        sets.push({ setNumber, weight: Number(weight), reps: Number(reps) });
      }
    });
    out.push({
      name: card.dataset.exerciseName,
      muscleGroup: card.dataset.muscleGroup,
      targetReps,
      sets,
    });
  });
  return out;
}

// Saves one set row to the cloud as soon as it is filled in (or clears it).
function syncRow(card, row) {
  const name = card.dataset.exerciseName;
  const setNumber = Number(row.dataset.setNumber);
  const reps = row.querySelector(".reps-input").value;
  if (card.dataset.equipment === "bodyweight") {
    Store.saveSet(name, setNumber, reps === "" ? null : { reps: Number(reps) });
    return;
  }
  const weight = row.querySelector(".weight-input").value;
  Store.saveSet(
    name,
    setNumber,
    weight !== "" && reps !== "" ? { weight: Number(weight), reps: Number(reps) } : null
  );
}

async function finishWorkout() {
  const rows = collectRowsFromDom();
  if (!rows.some((r) => r.sets.length)) {
    const proceed = confirm("No sets logged yet. Discard this workout anyway?");
    if (proceed) {
      Store.discardSession();
      resetToStartScreen();
    }
    return;
  }
  const btn = el("finish-workout-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await Store.finishSession(rows);
    resetToStartScreen();
    alert("Workout saved.");
  } catch (e) {
    console.error(e);
    alert(
      "Couldn't save your workout. Your sets are still on screen — check your connection and tap Finish Workout again."
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Finish Workout";
  }
}

function resetToStartScreen() {
  currentRoutine = null;
  currentPrimaryGroups = null;
  el("routine-screen").classList.add("hidden");
  el("start-screen").classList.remove("hidden");
}

function renderHistory() {
  const list = el("history-list");
  const history = Store.getHistory().slice().reverse();
  if (!history.length) {
    list.innerHTML = `<p class="empty-state">No workouts logged yet.</p>`;
    return;
  }
  list.innerHTML = "";
  history.forEach((session) => {
    const div = document.createElement("div");
    div.className = "history-session";
    const date = new Date(session.date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const exLines = session.exercises
      .map((ex) => {
        const hasWeight = ex.sets[0] && Object.prototype.hasOwnProperty.call(ex.sets[0], "weight");
        const setStr = hasWeight
          ? ex.sets.map((s) => `${s.weight}x${s.reps}`).join(", ")
          : ex.sets.map((s) => `${s.reps} reps`).join(", ");
        return `<p class="history-exercise"><strong>${ex.name}</strong>: ${setStr}</p>`;
      })
      .join("");
    const notesLine = session.notes ? `<p class="history-notes">${escapeHtml(session.notes)}</p>` : "";
    div.innerHTML = `<div class="history-session-date">${date}</div>${exLines}${notesLine}`;
    list.appendChild(div);
  });
}

async function handleChatSend() {
  const input = el("chat-input");
  const text = input.value.trim();
  if (!text) return;
  const replyEl = el("chat-reply");
  replyEl.textContent = "…";
  try {
    const result = await parseWithClaude(text, lastFocusedExercise);
    if (result.handled && result.action === "log") {
      applyLoggedCommand(result);
    }
    replyEl.textContent = result.reply || "";
  } catch (e) {
    replyEl.textContent = "Something went wrong reaching the assistant.";
    console.error(e);
  }
  input.value = "";
}

// Fills in the set rows for a locally-parsed "log NxM at W" command.
// Bodyweight cards have no weight input at all, so this only ever writes a
// weight value when one exists on the row.
function applyLoggedCommand(result) {
  const card = document.querySelector(
    `#exercise-list .exercise-card[data-exercise-name="${CSS.escape(result.exercise)}"]`
  );
  if (!card) return;
  const rows = card.querySelectorAll(".set-row");
  rows.forEach((row, i) => {
    if (i < result.sets) {
      const weightInput = row.querySelector(".weight-input");
      if (weightInput) weightInput.value = result.weight;
      row.querySelector(".reps-input").value = result.reps;
      syncRow(card, row);
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.error("SW registration failed", e));
  }
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function renderSyncStatus(status) {
  const b = el("sync-status");
  if (!b) return;
  b.className = `sync-status ${status}`;
  b.textContent =
    status === "saving" ? "Saving…" : status === "error" ? "Not saved — tap to retry" : "Saved \u2713";
}

function showAuth(message) {
  el("auth-screen").classList.remove("hidden");
  el("loading-screen").classList.add("hidden");
  el("start-screen").classList.add("hidden");
  el("routine-screen").classList.add("hidden");
  if (message) el("auth-msg").textContent = message;
}

async function handleAuth(mode) {
  const email = el("auth-email").value.trim();
  const password = el("auth-password").value;
  if (!email || password.length < 6) {
    el("auth-msg").textContent = "Enter your email and a password (6+ characters).";
    return;
  }
  el("auth-msg").textContent = mode === "signup" ? "Creating account…" : "Signing in…";
  try {
    const session = mode === "signup" ? await Cloud.signUp(email, password) : await Cloud.signIn(email, password);
    if (!session) {
      el("auth-msg").textContent = "Account created. Confirm it from the email we sent, then sign in here.";
      return;
    }
    el("auth-screen").classList.add("hidden");
    await bootApp();
  } catch (e) {
    el("auth-msg").textContent = e.message || "Sign-in failed.";
  }
}

// Re-opens an unfinished workout (saved set-by-set) exactly where it was left.
function resumeActiveWorkout() {
  const active = Store.getActive();
  if (!active) return false;
  currentRoutine = active.exercises.map(
    (e) =>
      EXERCISE_DB.find((x) => x.name === e.name) || {
        name: e.name,
        muscleGroup: e.muscleGroup,
        equipment: e.equipment || "machine",
        type: "isolation",
      }
  );
  const recency = Store.getMuscleGroupRecency();
  currentPrimaryGroups = [...new Set(currentRoutine.map((e) => e.muscleGroup))].map((key) => ({
    label: muscleLabel(key),
    daysSince: recency[key] ? recency[key].daysSince : null,
  }));
  showRoutineScreen();
  active.exercises.forEach((e) => {
    const card = document.querySelector(
      `#exercise-list .exercise-card[data-exercise-name="${CSS.escape(e.name)}"]`
    );
    if (!card) return;
    e.sets.forEach((s) => {
      const row = card.querySelector(`.set-row[data-set-number="${s.setNumber}"]`);
      if (!row) return;
      const w = row.querySelector(".weight-input");
      if (w && s.weight !== null) w.value = s.weight;
      row.querySelector(".reps-input").value = s.reps;
    });
  });
  el("chat-reply").textContent = "Picked up the workout you had in progress.";
  return true;
}

async function bootApp() {
  el("loading-screen").classList.remove("hidden");
  el("load-msg").textContent = "Loading your history…";
  el("load-retry-btn").classList.add("hidden");
  el("start-screen").classList.add("hidden");
  try {
    const moved = await Store.migrateLegacy();
    await Store.init();
    if (moved) alert(`Moved ${moved} earlier workout${moved === 1 ? "" : "s"} from this phone into your cloud history.`);
  } catch (e) {
    console.error(e);
    el("load-msg").textContent = "Couldn't load your history. Check your connection and try again.";
    el("load-retry-btn").classList.remove("hidden");
    return;
  }
  el("loading-screen").classList.add("hidden");
  if (!resumeActiveWorkout()) el("start-screen").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  registerServiceWorker();
  Cloud.init();
  Store.onStatus = renderSyncStatus;
  window.addEventListener("online", () => Store.retryFailed());
  el("sync-status").addEventListener("click", () => Store.retryFailed());
  el("auth-signin-btn").addEventListener("click", () => handleAuth("signin"));
  el("auth-signup-btn").addEventListener("click", () => handleAuth("signup"));
  el("auth-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAuth("signin");
  });
  el("load-retry-btn").addEventListener("click", bootApp);
  el("signout-btn").addEventListener("click", async () => {
    await Cloud.signOut();
    location.reload();
  });
  Cloud.getSession().then((session) => (session ? bootApp() : showAuth()));
  el("start-workout-btn").addEventListener("click", startWorkout);
  if (el("warmup-btn")) el("warmup-btn").addEventListener("click", startWarmup);
  el("finish-workout-btn").addEventListener("click", finishWorkout);
  el("chat-send-btn").addEventListener("click", handleChatSend);
  el("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleChatSend();
  });
});
