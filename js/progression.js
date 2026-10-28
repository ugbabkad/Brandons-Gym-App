// Progressive-overload suggestions.
//
// Reads the last logged instance of an exercise from the local store and
// proposes the next weight/reps/sets. This is a *suggestion* shown before
// logging — the user can always override it when they log the set.

const DEFAULTS_BY_TYPE = {
  compound: { sets: 4, targetReps: 6, incrementLbs: 5 },
  isolation: { sets: 3, targetReps: 10, incrementLbs: 2.5 },
};

// Bodyweight moves (pull-up, dips, hanging leg raise, ab wheel, plank) don't
// track weight at all — no belt/vest support for now, just reps. A true
// beginner may not be able to do a fixed rep count across every set the
// first time, so the first session is open-ended ("do what you can") and
// every session after that progresses by adding a rep.
const BODYWEIGHT_DEFAULTS = { sets: 3, incrementReps: 1 };

// Kettlebells come in fixed sizes (roughly 18/26/35/44/53 lb), so a +5 lb
// suggestion isn't loadable. Suggest the next bell size up instead.
const KETTLEBELL_INCREMENT_LBS = 9;
// Exercises flagged unit: "kg" in db.js (e.g. Goblet Squat) are logged in kilograms;
// kettlebell bells in kg step 8/12/16/20/24/28/32, so go up one bell (4 kg).
const KETTLEBELL_INCREMENT_KG = 4;

function suggestNext(exercise, intensity) {
  const s = suggestNextBase(exercise);
  if (!s || !s.sets) return s;
  // Pre-workout request: "light" = one fewer set and no weight increase; "heavy" = one extra set.
  if (intensity === "light") {
    s.sets = Math.max(2, s.sets - 1);
    if (s.heldWeight != null) {
      s.weight = s.heldWeight;
      s.note = `Light day — hold at ${s.heldWeight} ${exercise.unit === "kg" ? "kg" : "lbs"}, one fewer set.`;
    } else {
      s.note += " (Light day: one fewer set.)";
    }
  } else if (intensity === "heavy") {
    s.sets = Math.min(6, s.sets + 1);
    s.note += " (Heavy day: one extra set.)";
  }
  return s;
}

function suggestNextBase(exercise) {
  if (exercise.equipment === "bodyweight") return suggestNextBodyweight(exercise);

  const defaults = DEFAULTS_BY_TYPE[exercise.type] || DEFAULTS_BY_TYPE.isolation;
  const last = Store.getLastForExercise(exercise.name);
  const unit = exercise.unit === "kg" ? "kg" : "lbs";
  const incrementLbs =
    exercise.equipment === "kettlebell"
      ? (unit === "kg" ? KETTLEBELL_INCREMENT_KG : KETTLEBELL_INCREMENT_LBS)
      : defaults.incrementLbs;

  if (!last || !last.sets || !last.sets.length) {
    return {
      weight: null,
      sets: defaults.sets,
      targetReps: defaults.targetReps,
      note: "First time logging this — pick a comfortable starting weight.",
      isFirstTime: true,
    };
  }

  const targetReps = last.targetReps || defaults.targetReps;
  const hitAll = last.sets.every((s) => s.reps >= targetReps);
  // Most-used weight in the last session (mode), falling back to the last set's weight.
  const counts = {};
  last.sets.forEach((s) => (counts[s.weight] = (counts[s.weight] || 0) + 1));
  const lastWeight =
    Number(
      Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
    ) || last.sets[last.sets.length - 1].weight;

  if (hitAll && exercise.weightMeaning === "assistance") {
    // Assisted machine: the weight is help from the machine, so progress = less help.
    const next = Math.max(lastWeight - incrementLbs, 0);
    return {
      weight: next,
      sets: last.sets.length,
      targetReps,
      note:
        next === lastWeight
          ? `Hit all ${targetReps} reps with no assistance — try the unassisted version.`
          : `Hit all ${targetReps} reps last time — try ${incrementLbs} ${unit} LESS assistance.`,
      isFirstTime: false,
    };
  }

  if (hitAll) {
    return {
      weight: lastWeight + incrementLbs,
      heldWeight: lastWeight,
      sets: last.sets.length,
      targetReps,
      note: `Hit all ${targetReps} reps last time — try +${incrementLbs} ${unit}.`,
      isFirstTime: false,
    };
  }

  return {
    weight: lastWeight,
    sets: last.sets.length,
    targetReps,
    note: `Missed the ${targetReps}-rep target last time — repeat this weight.`,
    isFirstTime: false,
  };
}

// Returns { sets, targetReps, note, isFirstTime } — no `weight` key at all;
// bodyweight exercises don't track load. targetReps is null for an AMRAP
// ("as many reps as possible") session, meaning there's no number to hit yet.
function suggestNextBodyweight(exercise) {
  const last = Store.getLastForExercise(exercise.name);

  if (!last || !last.sets || !last.sets.length) {
    return {
      sets: BODYWEIGHT_DEFAULTS.sets,
      targetReps: null,
      note: "First time — do as many strict reps as you can on each set, don't worry about a number. We'll set a target from what you get.",
      isFirstTime: true,
    };
  }

  const reps = last.sets.map((s) => s.reps);

  // Previous session was itself an open-ended baseline (no target yet):
  // set the target from the weakest set so it's achievable across all sets.
  if (last.targetReps == null) {
    const baseline = Math.max(Math.min(...reps), 1);
    return {
      sets: last.sets.length,
      targetReps: baseline,
      note: `Last time you got ${reps.join("/")} reps — aim for ${baseline} on every set this time.`,
      isFirstTime: false,
    };
  }

  const hitAll = reps.every((r) => r >= last.targetReps);

  if (hitAll) {
    const nextTarget = last.targetReps + BODYWEIGHT_DEFAULTS.incrementReps;
    return {
      sets: last.sets.length,
      targetReps: nextTarget,
      note: `Hit ${last.targetReps} reps on every set — try ${nextTarget} this time.`,
      isFirstTime: false,
    };
  }

  return {
    sets: last.sets.length,
    targetReps: last.targetReps,
    note: `Missed the ${last.targetReps}-rep target last time — repeat the same target.`,
    isFirstTime: false,
  };
}
