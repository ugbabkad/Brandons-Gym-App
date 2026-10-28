// Auto-varying routine generator.
//
// Instead of a fixed split (push/pull/legs on a schedule), this looks at
// how long it's been since each muscle group was last trained and builds
// today's routine around whatever is most "due" — while respecting a
// minimum recovery window so a group hit yesterday isn't hit again today.

const TARGET_EXERCISE_COUNT = 5; // ~30-40 min at full-gym pace
const PRIMARY_GROUP_COUNT = 3; // how many muscle groups the session centers on
const MIN_RECOVERY_DAYS = 2; // don't re-hit a group trained more recently than this...
const RECOVERY_FALLBACK_DAYS = 2; // ...unless literally everything is under-recovered

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rankMuscleGroups(recency) {
  // Score: never-trained groups first (Infinity), then most days-since first.
  // Shuffled before the (stable) sort so groups tied on daysSince — e.g. a
  // brand-new user where everything is untrained — don't always come out
  // in the same fixed order.
  const scored = shuffle(MUSCLE_GROUPS).map((g) => {
    const r = recency[g.key];
    const daysSince = r ? r.daysSince : Infinity;
    return { ...g, daysSince };
  });
  scored.sort((a, b) => b.daysSince - a.daysSince);
  return scored;
}

function pickExercise(muscleGroup, preferType, excludeNames, avoidEquipment) {
  const blocked = avoidEquipment || [];
  const pool = EXERCISE_DB.filter(
    (e) => e.muscleGroup === muscleGroup && !excludeNames.has(e.name) && !blocked.includes(e.equipment)
  );
  const typed = pool.filter((e) => e.type === preferType);
  const candidates = typed.length ? typed : pool;
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Free-text request parsing ("arms are sore, do legs"). Runs locally — no API.
// Each clause is either an "avoid" (sore/skip/no/...) or a "focus" request.
const REQUEST_GROUP_WORDS = [
  [/\b(arms?|biceps?|triceps?)\b/, (w) => (w.startsWith("bi") ? ["biceps"] : w.startsWith("tri") ? ["triceps"] : ["biceps", "triceps"])],
  [/\b(legs?|lower body|lower)\b/, () => ["quads", "hamstrings_glutes", "calves"]],
  [/\b(quads?|quadriceps)\b/, () => ["quads"]],
  [/\b(hamstrings?|glutes?|butt|hips?)\b/, () => ["hamstrings_glutes"]],
  [/\b(calf|calves)\b/, () => ["calves"]],
  [/\b(chest|pecs?)\b/, () => ["chest"]],
  [/\b(back|lats?)\b/, () => ["back"]],
  [/\b(shoulders?|delts?)\b/, () => ["shoulders"]],
  [/\b(abs?|core)\b/, () => ["core"]],
  [/\b(knees?)\b/, () => ["quads", "hamstrings_glutes"]],
  [/\b(elbows?)\b/, () => ["biceps", "triceps"]],
  [/\b(push)\b/, () => ["chest", "shoulders", "triceps"]],
  [/\b(pull)\b/, () => ["back", "biceps"]],
  [/\b(upper body|upper)\b/, () => ["chest", "back", "shoulders", "biceps", "triceps"]],
];
const REQUEST_AVOID_CUE = /\b(sore|soreness|tired|hurt|hurts|hurting|injured|injury|pain|avoid|skip|no|not|without|except|rest|resting|recover|recovering|tweaked|bugging|strained|dont|don't|nothing)\b/;

function parseWorkoutRequest(text) {
  const focus = [];
  const avoid = [];
  const clauses = String(text || "").toLowerCase().split(/[,;.!\n]|\bbut\b|\bso\b|\bthen\b|\binstead\b/);
  for (const clause of clauses) {
    const target = REQUEST_AVOID_CUE.test(clause) ? avoid : focus;
    for (const [re, toKeys] of REQUEST_GROUP_WORDS) {
      const m = clause.match(re);
      if (!m) continue;
      for (const k of toKeys(m[1])) if (!target.includes(k)) target.push(k);
    }
  }
  return { focus: focus.filter((k) => !avoid.includes(k)), avoid };
}

// Returns { primaryGroups: [{key,label,daysSince}], exercises: [{name, muscleGroup, equipment, type}] }
// Asks Claude (via the Supabase "parse-request" edge function) to read the
// request; falls back to the local keyword parser if offline or unavailable.
const EQUIPMENT_TYPES = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell"];
const EQUIPMENT_WORDS = [
  ["barbell", /\bbarbells?\b/],
  ["dumbbell", /\b(dumbbells?|db|dbs)\b/],
  ["machine", /\bmachines?\b/],
  ["cable", /\bcables?\b/],
  ["kettlebell", /\b(kettlebells?|kb|kbs)\b/],
  ["bodyweight", /\b(bodyweight|body weight|calisthenics)\b/],
];

// Local parsing of everything besides muscle groups: equipment to skip,
// session length, and intensity. Used as a fallback, and to fill in anything
// the server-side parser doesn't return.
function parseRequestModifiers(text) {
  const t = String(text || "").toLowerCase();
  const avoidEquipment = [];
  for (const clause of t.split(/[,;.!\n]|\bbut\b|\bthen\b|\binstead\b/)) {
    const mentioned = EQUIPMENT_WORDS.filter(([, re]) => re.test(clause)).map(([k]) => k);
    if (!mentioned.length) continue;
    if (/\bonly\b/.test(clause)) {
      for (const k of EQUIPMENT_TYPES) if (k !== "bodyweight" && !mentioned.includes(k) && !avoidEquipment.includes(k)) avoidEquipment.push(k);
    } else if (REQUEST_AVOID_CUE.test(clause)) {
      for (const k of mentioned) if (!avoidEquipment.includes(k)) avoidEquipment.push(k);
    }
  }

  let exerciseCount = null;
  const mins = t.match(/(\d+)\s*(?:min|mins|minutes)\b/);
  const exs = t.match(/\b(\d+)\s*exercises?\b/);
  if (exs) exerciseCount = Number(exs[1]);
  else if (mins) exerciseCount = Math.round(Number(mins[1]) / 8);
  else if (/\b(quick|express|in a hurry|short on time|rushed)\b/.test(t)) exerciseCount = 3;
  else if (/\b(short|brief)\b/.test(t)) exerciseCount = 4;
  else if (/\b(long|longer|more volume|extra volume|high volume)\b/.test(t)) exerciseCount = 7;
  if (exerciseCount !== null) exerciseCount = Math.min(8, Math.max(3, exerciseCount));

  let intensity = "normal";
  if (/\b(light|lighter|easy|easier|deload|take it easy|go easy|low energy|tired|exhausted)\b/.test(t)) intensity = "light";
  else if (/\b(heavy|heavier|go hard|intense|push hard|max effort)\b/.test(t)) intensity = "heavy";

  return { avoidEquipment, exerciseCount, intensity };
}

// Always resolves to { focus, avoid, avoidEquipment, exerciseCount, intensity, text }.
async function resolveWorkoutRequest(text) {
  const empty = { focus: [], avoid: [], avoidEquipment: [], exerciseCount: null, intensity: "normal", text: "" };
  if (!String(text || "").trim()) return empty;
  const local = parseRequestModifiers(text);
  let base = null;
  try {
    const { data, error } = await Cloud.client.functions.invoke("parse-request", { body: { text } });
    if (!error && data && Array.isArray(data.focus) && Array.isArray(data.avoid)) base = data;
  } catch (e) {}
  const localGroups = parseWorkoutRequest(text);
  if (!base || (!base.focus.length && !base.avoid.length)) base = { ...(base || {}), ...localGroups };

  const avoidEquipment = Array.isArray(base.avoidEquipment)
    ? base.avoidEquipment.filter((k) => EQUIPMENT_TYPES.includes(k))
    : local.avoidEquipment;
  const n = Number(base.exerciseCount);
  const exerciseCount = Number.isInteger(n) && n >= 3 && n <= 8 ? n : local.exerciseCount;
  const intensity = ["light", "normal", "heavy"].includes(base.intensity) ? base.intensity : local.intensity;
  return { focus: base.focus, avoid: base.avoid, avoidEquipment, exerciseCount, intensity, text: String(text).trim() };
}

// request: { focus: [...], avoid: [...] } muscle-group keys (optional).
function generateRoutine(request) {
  const { focus, avoid } = request || { focus: [], avoid: [] };
  const avoidEquipment = (request && request.avoidEquipment) || [];
  const targetCount = (request && request.exerciseCount) || TARGET_EXERCISE_COUNT;
  const recency = Store.getMuscleGroupRecency();
  let ranked = rankMuscleGroups(recency);

  let eligible = ranked.filter(
    (g) => g.daysSince === Infinity || g.daysSince >= MIN_RECOVERY_DAYS
  );
  // Fallback: if recovery filtering leaves too few groups to build a session
  // (e.g. brand-new user, or trained every group recently), just use the
  // least-recently-trained groups regardless of the recovery window.
  if (eligible.length < PRIMARY_GROUP_COUNT) {
    eligible = ranked;
  }

  eligible = eligible.filter((g) => !avoid.includes(g.key));
  // Requested groups go first (ignoring recovery), then fill from the ranking.
  const requested = ranked.filter((g) => focus.includes(g.key));
  const rest = eligible.filter((g) => !focus.includes(g.key));
  const primaryGroups = [...requested, ...rest].slice(0, PRIMARY_GROUP_COUNT);
  const exercises = [];
  const usedNames = new Set();

  // Pass 1: one compound (or best available) exercise per primary group.
  for (const g of primaryGroups) {
    const lastForGroup = Store.getLastForExercise; // not used directly here
    const ex = pickExercise(g.key, "compound", usedNames, avoidEquipment);
    if (ex) {
      exercises.push(ex);
      usedNames.add(ex.name);
    }
  }

  // Pass 2: round out to TARGET_EXERCISE_COUNT, cycling back through the
  // primary groups, preferring isolation work now that compounds are placed.
  let i = 0;
  if (exercises.length > targetCount) exercises.length = targetCount;
  while (exercises.length < targetCount && primaryGroups.length) {
    const g = primaryGroups[i % primaryGroups.length];
    const ex = pickExercise(g.key, "isolation", usedNames, avoidEquipment);
    if (ex) {
      exercises.push(ex);
      usedNames.add(ex.name);
    }
    i++;
    if (i > primaryGroups.length * 4) break; // safety valve, pool exhausted
  }

  return {
    primaryGroups: primaryGroups.map((g) => ({
      key: g.key,
      label: g.label,
      daysSince: g.daysSince === Infinity ? null : g.daysSince,
    })),
    exercises,
    intensity: (request && request.intensity) || "normal",
  };
}
