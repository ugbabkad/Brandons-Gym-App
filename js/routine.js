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

function pickExercise(muscleGroup, preferType, excludeNames) {
  const pool = EXERCISE_DB.filter(
    (e) => e.muscleGroup === muscleGroup && !excludeNames.has(e.name)
  );
  const typed = pool.filter((e) => e.type === preferType);
  const candidates = typed.length ? typed : pool;
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Returns { primaryGroups: [{key,label,daysSince}], exercises: [{name, muscleGroup, equipment, type}] }
function generateRoutine() {
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

  const primaryGroups = eligible.slice(0, PRIMARY_GROUP_COUNT);
  const exercises = [];
  const usedNames = new Set();

  // Pass 1: one compound (or best available) exercise per primary group.
  for (const g of primaryGroups) {
    const lastForGroup = Store.getLastForExercise; // not used directly here
    const ex = pickExercise(g.key, "compound", usedNames);
    if (ex) {
      exercises.push(ex);
      usedNames.add(ex.name);
    }
  }

  // Pass 2: round out to TARGET_EXERCISE_COUNT, cycling back through the
  // primary groups, preferring isolation work now that compounds are placed.
  let i = 0;
  while (exercises.length < TARGET_EXERCISE_COUNT && primaryGroups.length) {
    const g = primaryGroups[i % primaryGroups.length];
    const ex = pickExercise(g.key, "isolation", usedNames);
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
  };
}
