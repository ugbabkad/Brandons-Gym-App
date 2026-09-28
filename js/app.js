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
    inputs.forEach((input) =>
      input.addEventListener("focus", () => (lastFocusedExercise = exercise.name))
    );
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

function collectSessionFromDom() {
  const exercises = [];
  document.querySelectorAll("#exercise-list .exercise-card").forEach((card) => {
    const targetReps = card.dataset.targetReps === "" ? null : Number(card.dataset.targetReps);
    const isBodyweight = card.dataset.equipment === "bodyweight";
    const sets = [];
    card.querySelectorAll(".set-row").forEach((row) => {
      const reps = row.querySelector(".reps-input").value;
      if (isBodyweight) {
        if (reps !== "") sets.push({ reps: Number(reps) });
        return;
      }
      const weight = row.querySelector(".weight-input").value;
      if (weight !== "" && reps !== "") {
        sets.push({ weight: Number(weight), reps: Number(reps) });
      }
    });
    if (sets.length) {
      exercises.push({
        name: card.dataset.exerciseName,
        muscleGroup: card.dataset.muscleGroup,
        targetReps,
        sets,
      });
    }
  });
  return exercises;
}

function finishWorkout() {
  const exercises = collectSessionFromDom();
  if (!exercises.length) {
    const proceed = confirm("No sets logged yet. Discard this workout anyway?");
    if (proceed) resetToStartScreen();
    return;
  }
  Store.saveSession({
    id: `s_${Date.now()}`,
    date: new Date().toISOString(),
    exercises,
  });
  resetToStartScreen();
  alert("Workout saved.");
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
    div.innerHTML = `<div class="history-session-date">${date}</div>${exLines}`;
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
    }
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.error("SW registration failed", e));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  registerServiceWorker();
  el("start-workout-btn").addEventListener("click", startWorkout);
  if (el("warmup-btn")) el("warmup-btn").addEventListener("click", startWarmup);
  el("finish-workout-btn").addEventListener("click", finishWorkout);
  el("chat-send-btn").addEventListener("click", handleChatSend);
  el("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleChatSend();
  });
});
