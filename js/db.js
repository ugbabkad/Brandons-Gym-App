// Exercise database — full commercial gym: barbell, dumbbell, machine, cable.
// Muscle groups are kept granular so the auto-varying routine generator has
// enough resolution to say "chest was hit 2 days ago but back wasn't."
//
// type: "compound" (multi-joint, prioritized first in a routine) or
//       "isolation" (single-joint, used to round a routine out).

const EXERCISE_DB = [
  // Chest
  { name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", type: "compound" },
  { name: "Incline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", type: "compound" },
  { name: "Chest Press Machine", muscleGroup: "chest", equipment: "machine", type: "compound" },
  { name: "Cable Fly", muscleGroup: "chest", equipment: "cable", type: "isolation" },
  { name: "Dumbbell Fly", muscleGroup: "chest", equipment: "dumbbell", type: "isolation" },
  { name: "Dips", muscleGroup: "chest", equipment: "bodyweight", type: "compound" },
  { name: "Assisted Dip Machine", muscleGroup: "chest", equipment: "machine", type: "compound" },

  // Back
  { name: "Barbell Row", muscleGroup: "back", equipment: "barbell", type: "compound" },
  { name: "Lat Pulldown", muscleGroup: "back", equipment: "cable", type: "compound" },
  { name: "Seated Cable Row", muscleGroup: "back", equipment: "cable", type: "compound" },
  { name: "Pull-Up", muscleGroup: "back", equipment: "bodyweight", type: "compound" },
  { name: "Assisted Pull-Up Machine", muscleGroup: "back", equipment: "machine", type: "compound" },
  { name: "T-Bar Row", muscleGroup: "back", equipment: "barbell", type: "compound" },
  { name: "Single-Arm Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", type: "compound" },

  // Shoulders
  { name: "Overhead Barbell Press", muscleGroup: "shoulders", equipment: "barbell", type: "compound" },
  { name: "Seated Dumbbell Shoulder Press", muscleGroup: "shoulders", equipment: "dumbbell", type: "compound" },
  { name: "Lateral Raise", muscleGroup: "shoulders", equipment: "dumbbell", type: "isolation" },
  { name: "Cable Lateral Raise", muscleGroup: "shoulders", equipment: "cable", type: "isolation" },
  { name: "Rear Delt Fly", muscleGroup: "shoulders", equipment: "dumbbell", type: "isolation" },
  { name: "Face Pull", muscleGroup: "shoulders", equipment: "cable", type: "isolation" },

  // Quads
  { name: "Barbell Back Squat", muscleGroup: "quads", equipment: "barbell", type: "compound" },
  { name: "Leg Press", muscleGroup: "quads", equipment: "machine", type: "compound" },
  { name: "Bulgarian Split Squat", muscleGroup: "quads", equipment: "dumbbell", type: "compound" },
  { name: "Leg Extension", muscleGroup: "quads", equipment: "machine", type: "isolation" },
  { name: "Front Squat", muscleGroup: "quads", equipment: "barbell", type: "compound" },

  // Hamstrings / Glutes
  { name: "Romanian Deadlift", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Lying Leg Curl", muscleGroup: "hamstrings_glutes", equipment: "machine", type: "isolation" },
  { name: "Hip Thrust", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Cable Pull-Through", muscleGroup: "hamstrings_glutes", equipment: "cable", type: "compound" },
  { name: "Glute Bridge Machine", muscleGroup: "hamstrings_glutes", equipment: "machine", type: "isolation" },

  // Biceps
  { name: "Barbell Curl", muscleGroup: "biceps", equipment: "barbell", type: "isolation" },
  { name: "Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },
  { name: "Cable Curl", muscleGroup: "biceps", equipment: "cable", type: "isolation" },
  { name: "Hammer Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },

  // Triceps
  { name: "Cable Triceps Pushdown", muscleGroup: "triceps", equipment: "cable", type: "isolation" },
  { name: "Skull Crusher", muscleGroup: "triceps", equipment: "barbell", type: "isolation" },
  { name: "Overhead Dumbbell Extension", muscleGroup: "triceps", equipment: "dumbbell", type: "isolation" },
  { name: "Close-Grip Bench Press", muscleGroup: "triceps", equipment: "barbell", type: "compound" },

  // Core
  { name: "Cable Crunch", muscleGroup: "core", equipment: "cable", type: "isolation" },
  { name: "Hanging Leg Raise", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Ab Wheel Rollout", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Weighted Plank", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },

  // Calves
  { name: "Standing Calf Raise", muscleGroup: "calves", equipment: "machine", type: "isolation" },
  { name: "Seated Calf Raise", muscleGroup: "calves", equipment: "machine", type: "isolation" },
];

// Display order + friendly labels for muscle groups, used across the UI.
const MUSCLE_GROUPS = [
  { key: "chest", label: "Chest" },
  { key: "back", label: "Back" },
  { key: "shoulders", label: "Shoulders" },
  { key: "quads", label: "Quads" },
  { key: "hamstrings_glutes", label: "Hamstrings / Glutes" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "core", label: "Core" },
  { key: "calves", label: "Calves" },
];
