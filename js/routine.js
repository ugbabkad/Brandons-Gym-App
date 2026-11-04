// Auto-varying routine generator.
//
// Instead of a fixed split (push/pull/legs on a schedule), this looks at
// how long it's been since each muscle group was last trained and builds
// today's routine around whatever is most "due" — while respecting a
// minimum recovery window so a group hit yesterday isn't hit again today.

const TARGET_EXERCISE_COUNT = 5; // ~30-40 min at full-gym pace

// Workout days: each session is one of these regular combos. `groups` maps a
// muscle group to its relative share of the session's exercises.
const WORKOUT_DAYS = [
  { label: "Back + Biceps", groups: { back: 3, biceps: 2 } },
  { label: "Chest + Triceps", groups: { chest: 3, triceps: 2, shoulders: 1 } },
  { label: "Legs", groups: { quads: 2, hamstrings_glutes: 2, calves: 1, core: 1 } },
];
const MIN_RECOVERY_DAYS = 2; // don't re-hit a group trained more recently than this...

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

// Lowercase, hyphens/punctuation to spaces, naive singularizing ("pull-ups" -> "pull up").
function normalizeWords(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 2 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
}

// Short names people actually say, for exercises whose full name is longer.
const EXERCISE_ALIASES = {
  "bench press": "Barbell Bench Press",
  bench: "Barbell Bench Press",
  squat: "Barbell Back Squat",
  deadlift: "Conventional Deadlift",
  rdl: "Romanian Deadlift",
  "overhead press": "Overhead Barbell Press",
  ohp: "Overhead Barbell Press",
  "shoulder press": "Seated Dumbbell Shoulder Press",
  "row": "Barbell Row",
  pulldown: "Lat Pulldown",
  "lat pull down": "Lat Pulldown",
  "pull up": "Pull-Up",
  pullup: "Pull-Up",
  "chin up": "Chin-Up",
  "assisted pullup": "Assisted Pull-Up Machine",
  "assisted dip": "Assisted Dip Machine",
  dip: "Dips",
  "push up": "Push-Up",
  pushup: "Push-Up",
  pushdown: "Cable Triceps Pushdown",
  "tricep pushdown": "Cable Triceps Pushdown",
  "skullcrusher": "Skull Crusher",
  "leg curl": "Lying Leg Curl",
  "calf raise": "Standing Calf Raise",
  "lateral raise": "Lateral Raise",
  "side raise": "Lateral Raise",
  fly: "Cable Fly",
  "hip thrust": "Hip Thrust",
  "lunge": "Dumbbell Walking Lunge",
  "curl": "Dumbbell Curl",
  "bicep curl": "Dumbbell Curl",
};

// Finds specific exercises named in the request. Longest names match first and
// consume their words, so "assisted pull ups" gives the assisted machine, not
// also plain Pull-Up. A clause with an avoid cue ("no pull ups") blocks instead.
function parseNamedExercises(text) {
  const candidates = [];
  for (const e of EXERCISE_DB) {
    candidates.push([normalizeWords(e.name.replace(/\bmachine\b/i, "")), e.name]);
    candidates.push([normalizeWords(e.name), e.name]);
  }
  for (const [alias, name] of Object.entries(EXERCISE_ALIASES)) candidates.push([normalizeWords(alias), name]);
  candidates.sort((a, b) => b[0].length - a[0].length);

  const want = [];
  const block = [];
  for (const clause of String(text || "").toLowerCase().split(/[,;.!\n]|\bbut\b|\bthen\b|\binstead\b/)) {
    let rest = " " + normalizeWords(clause) + " ";
    const target = REQUEST_AVOID_CUE.test(clause) ? block : want;
    for (const [phrase, name] of candidates) {
      if (!phrase) continue;
      const needle = " " + phrase + " ";
      if (!rest.includes(needle)) continue;
      rest = rest.split(needle).join(" ");
      if (!target.includes(name)) target.push(name);
    }
  }
  return want.filter((n) => !block.includes(n));
}

// Always resolves to { focus, avoid, avoidEquipment, exerciseCount, intensity, text }.
async function resolveWorkoutRequest(text) {
  const empty = { focus: [], avoid: [], avoidEquipment: [], exerciseCount: null, intensity: "normal", exercises: [], text: "" };
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
  const exercises = parseNamedExercises(text);
  return { focus: base.focus, avoid: base.avoid, avoidEquipment, exerciseCount, intensity, exercises, text: String(text).trim() };
}

// Splits `n` slots across weighted groups (largest remainder, ties random).
function allocateSlots(weights, n) {
  const keys = shuffle(Object.keys(weights));
  const total = keys.reduce((t, k) => t + weights[k], 0);
  const out = {};
  let used = 0;
  for (const k of keys) {
    out[k] = Math.floor((weights[k] * n) / total);
    used += out[k];
  }
  const byRemainder = keys
    .slice()
    .sort((a, b) => ((weights[b] * n) / total) % 1 - ((weights[a] * n) / total) % 1);
  for (let i = 0; used < n && i < byRemainder.length; i++, used++) out[byRemainder[i]]++;
  return out;
}

// Picks today's session type: the regular combo (back+biceps, chest+triceps,
// legs) that has gone longest without being trained and is recovered.
function chooseWorkoutDay(recency, avoid) {
  const scored = shuffle(WORKOUT_DAYS).map((day) => {
    const keys = Object.keys(day.groups).filter((k) => !avoid.includes(k));
    const days = keys.map((k) => (recency[k] ? recency[k].daysSince : 30));
    const lost = Object.keys(day.groups).filter((k) => avoid.includes(k)).reduce((t, k) => t + day.groups[k], 0);
    const total = Object.values(day.groups).reduce((t, w) => t + w, 0);
    return {
      day,
      score: days.length ? days.reduce((t, d) => t + Math.min(d, 30), 0) / days.length : -1,
      recovered: days.length > 0 && Math.min(...days) >= MIN_RECOVERY_DAYS,
      usable: lost / total < 0.5,
    };
  });
  const pool = scored.filter((d) => d.usable);
  const recovered = pool.filter((d) => d.recovered);
  return (recovered.length ? recovered : pool.length ? pool : scored).sort((a, b) => b.score - a.score)[0].day;
}

// request: { focus, avoid, avoidEquipment, exerciseCount, intensity, exercises }.
function generateRoutine(request) {
  const req = request || {};
  const avoid = req.avoid || [];
  const avoidEquipment = req.avoidEquipment || [];
  const named = (req.exercises || []).map(exerciseMeta).filter(Boolean);
  const targetCount = Math.max(req.exerciseCount || TARGET_EXERCISE_COUNT, named.length);
  const recency = Store.getMuscleGroupRecency();

  // Groups the lifter asked for, directly or by naming an exercise.
  const focus = [...new Set([...(req.focus || []), ...named.map((e) => e.muscleGroup)])].filter((k) => !avoid.includes(k));
  let weights;
  let label;
  if (focus.length) {
    const home = WORKOUT_DAYS.filter((d) => focus.every((k) => k in d.groups));
    if (home.length) {
      // Everything asked for lives in one regular combo: run that whole day.
      weights = { ...home[0].groups };
      label = home[0].label;
      for (const k of focus) weights[k] = Math.max(weights[k], 3);
    } else {
      weights = Object.fromEntries(focus.map((k) => [k, 2]));
      label = focus.map(muscleLabel).join(" + ");
    }
  } else {
    const day = chooseWorkoutDay(recency, avoid);
    weights = { ...day.groups };
    label = day.label;
  }
  for (const k of avoid) delete weights[k];

  const slots = allocateSlots(weights, targetCount);
  const exercises = [...named];
  const usedNames = new Set(named.map((e) => e.name));
  for (const e of named) if (slots[e.muscleGroup] > 0) slots[e.muscleGroup]--;

  const groupKeys = Object.keys(weights).sort((a, b) => weights[b] - weights[a]);
  for (const k of groupKeys) {
    const total = slots[k];
    for (let j = 0; j < total; j++) {
      const prefer = k !== "core" && j < Math.round(total * 0.67) ? "compound" : "isolation";
      const ex = pickExercise(k, prefer, usedNames, avoidEquipment) || pickExercise(k, prefer, usedNames, []);
      if (ex) {
        exercises.push(ex);
        usedNames.add(ex.name);
      }
    }
  }
  // A group ran out of exercises: top up from the others in the day.
  for (let guard = 0; exercises.length < targetCount && guard < 20; guard++) {
    const k = groupKeys[guard % groupKeys.length];
    const ex = pickExercise(k, "isolation", usedNames, avoidEquipment);
    if (ex) {
      exercises.push(ex);
      usedNames.add(ex.name);
    }
  }
  // Heavy compound lifts first, isolation work after.
  exercises.sort((a, b) => (a.type === "compound" ? 0 : 1) - (b.type === "compound" ? 0 : 1));

  const present = [...new Set(exercises.map((e) => e.muscleGroup))];
  return {
    dayLabel: label,
    primaryGroups: present.map((key) => ({
      key,
      label: muscleLabel(key),
      daysSince: recency[key] ? recency[key].daysSince : null,
    })),
    exercises,
    intensity: req.intensity || "normal",
  };
}
