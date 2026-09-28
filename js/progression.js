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

function suggestNext(exercise) {
  if (exercise.equipment === "bodyweight") return suggestNextBodyweight(exercise);

  const defaults = DEFAULTS_BY_TYPE[exercise.type] || DEFAULTS_BY_TYPE.isolation;
  const last = Store.getLastForExercise(exercise.name);

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

  if (hitAll) {
    return {
      weight: lastWeight + defaults.incrementLbs,
      sets: last.sets.length,
      targetReps,
      note: `Hit all ${targetReps} reps last time — try +${defaults.incrementLbs} lbs.`,
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
