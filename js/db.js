// Exercise database — full commercial gym: barbell, dumbbell, machine, cable,
// plus bodyweight and kettlebell work.
// Muscle groups are kept granular so the auto-varying routine generator has
// enough resolution to say "chest was hit 2 days ago but back wasn't."
//
// type: "compound" (multi-joint, prioritized first in a routine) or
//       "isolation" (single-joint, used to round a routine out).
// weightMeaning: omitted = the weight is the load lifted. "assistance" = the
//       weight is help from the machine (assisted pull-up / dip), so LESS is progress.

const EXERCISE_DB = [
  // Chest
  { name: "Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", type: "compound" },
  { name: "Incline Dumbbell Press", muscleGroup: "chest", equipment: "dumbbell", type: "compound" },
  { name: "Chest Press Machine", muscleGroup: "chest", equipment: "machine", type: "compound" },
  { name: "Cable Fly", muscleGroup: "chest", equipment: "cable", type: "isolation" },
  { name: "Dumbbell Fly", muscleGroup: "chest", equipment: "dumbbell", type: "isolation" },
  { name: "Dips", muscleGroup: "chest", equipment: "bodyweight", type: "compound" },
  { name: "Assisted Dip Machine", muscleGroup: "chest", equipment: "machine", type: "compound", weightMeaning: "assistance" },
  { name: "Dumbbell Bench Press", muscleGroup: "chest", equipment: "dumbbell", type: "compound" },
  { name: "Incline Barbell Bench Press", muscleGroup: "chest", equipment: "barbell", type: "compound" },
  { name: "Pec Deck", muscleGroup: "chest", equipment: "machine", type: "isolation" },
  { name: "Push-Up", muscleGroup: "chest", equipment: "bodyweight", type: "compound" },
  { name: "Kettlebell Floor Press", muscleGroup: "chest", equipment: "kettlebell", type: "compound" },

  // Back
  { name: "Barbell Row", muscleGroup: "back", equipment: "barbell", type: "compound" },
  { name: "Lat Pulldown", muscleGroup: "back", equipment: "cable", type: "compound" },
  { name: "Seated Cable Row", muscleGroup: "back", equipment: "cable", type: "compound" },
  { name: "Pull-Up", muscleGroup: "back", equipment: "bodyweight", type: "compound" },
  { name: "Assisted Pull-Up Machine", muscleGroup: "back", equipment: "machine", type: "compound", weightMeaning: "assistance" },
  { name: "T-Bar Row", muscleGroup: "back", equipment: "barbell", type: "compound" },
  { name: "Single-Arm Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", type: "compound" },
  { name: "Chin-Up", muscleGroup: "back", equipment: "bodyweight", type: "compound" },
  { name: "Inverted Row", muscleGroup: "back", equipment: "bodyweight", type: "compound" },
  { name: "Chest-Supported Dumbbell Row", muscleGroup: "back", equipment: "dumbbell", type: "compound" },
  { name: "Straight-Arm Pulldown", muscleGroup: "back", equipment: "cable", type: "isolation" },
  { name: "Machine Row", muscleGroup: "back", equipment: "machine", type: "compound" },
  { name: "Kettlebell Bent-Over Row", muscleGroup: "back", equipment: "kettlebell", type: "compound" },
  { name: "Back Extension", muscleGroup: "back", equipment: "bodyweight", type: "isolation" },

  // Shoulders
  { name: "Overhead Barbell Press", muscleGroup: "shoulders", equipment: "barbell", type: "compound" },
  { name: "Seated Dumbbell Shoulder Press", muscleGroup: "shoulders", equipment: "dumbbell", type: "compound" },
  { name: "Lateral Raise", muscleGroup: "shoulders", equipment: "dumbbell", type: "isolation" },
  { name: "Cable Lateral Raise", muscleGroup: "shoulders", equipment: "cable", type: "isolation" },
  { name: "Rear Delt Fly", muscleGroup: "shoulders", equipment: "dumbbell", type: "isolation" },
  { name: "Face Pull", muscleGroup: "shoulders", equipment: "cable", type: "isolation" },
  { name: "Arnold Press", muscleGroup: "shoulders", equipment: "dumbbell", type: "compound" },
  { name: "Machine Shoulder Press", muscleGroup: "shoulders", equipment: "machine", type: "compound" },
  { name: "Pike Push-Up", muscleGroup: "shoulders", equipment: "bodyweight", type: "compound" },
  { name: "Reverse Pec Deck", muscleGroup: "shoulders", equipment: "machine", type: "isolation" },
  { name: "Dumbbell Front Raise", muscleGroup: "shoulders", equipment: "dumbbell", type: "isolation" },
  { name: "Kettlebell Overhead Press", muscleGroup: "shoulders", equipment: "kettlebell", type: "compound" },
  { name: "Kettlebell Clean and Press", muscleGroup: "shoulders", equipment: "kettlebell", type: "compound" },
  { name: "Kettlebell Halo", muscleGroup: "shoulders", equipment: "kettlebell", type: "isolation" },

  // Quads
  { name: "Barbell Back Squat", muscleGroup: "quads", equipment: "barbell", type: "compound" },
  { name: "Leg Press", muscleGroup: "quads", equipment: "machine", type: "compound" },
  { name: "Bulgarian Split Squat", muscleGroup: "quads", equipment: "dumbbell", type: "compound" },
  { name: "Leg Extension", muscleGroup: "quads", equipment: "machine", type: "isolation" },
  { name: "Front Squat", muscleGroup: "quads", equipment: "barbell", type: "compound" },
  { name: "Goblet Squat", muscleGroup: "quads", equipment: "kettlebell", type: "compound" },
  { name: "Hack Squat", muscleGroup: "quads", equipment: "machine", type: "compound" },
  { name: "Dumbbell Walking Lunge", muscleGroup: "quads", equipment: "dumbbell", type: "compound" },
  { name: "Reverse Lunge", muscleGroup: "quads", equipment: "bodyweight", type: "compound" },
  { name: "Step-Up", muscleGroup: "quads", equipment: "dumbbell", type: "compound" },

  // Hamstrings / Glutes
  { name: "Romanian Deadlift", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Lying Leg Curl", muscleGroup: "hamstrings_glutes", equipment: "machine", type: "isolation" },
  { name: "Hip Thrust", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Cable Pull-Through", muscleGroup: "hamstrings_glutes", equipment: "cable", type: "compound" },
  { name: "Glute Bridge Machine", muscleGroup: "hamstrings_glutes", equipment: "machine", type: "isolation" },
  { name: "Conventional Deadlift", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Dumbbell Romanian Deadlift", muscleGroup: "hamstrings_glutes", equipment: "dumbbell", type: "compound" },
  { name: "Good Morning", muscleGroup: "hamstrings_glutes", equipment: "barbell", type: "compound" },
  { name: "Seated Leg Curl", muscleGroup: "hamstrings_glutes", equipment: "machine", type: "isolation" },
  { name: "Kettlebell Swing", muscleGroup: "hamstrings_glutes", equipment: "kettlebell", type: "compound" },
  { name: "Kettlebell Deadlift", muscleGroup: "hamstrings_glutes", equipment: "kettlebell", type: "compound" },
  { name: "Single-Leg Kettlebell RDL", muscleGroup: "hamstrings_glutes", equipment: "kettlebell", type: "compound" },
  { name: "Glute Bridge", muscleGroup: "hamstrings_glutes", equipment: "bodyweight", type: "isolation" },
  { name: "Single-Leg Glute Bridge", muscleGroup: "hamstrings_glutes", equipment: "bodyweight", type: "isolation" },
  { name: "Nordic Hamstring Curl", muscleGroup: "hamstrings_glutes", equipment: "bodyweight", type: "isolation" },

  // Biceps
  { name: "Barbell Curl", muscleGroup: "biceps", equipment: "barbell", type: "isolation" },
  { name: "Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },
  { name: "Cable Curl", muscleGroup: "biceps", equipment: "cable", type: "isolation" },
  { name: "Hammer Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },
  { name: "Preacher Curl", muscleGroup: "biceps", equipment: "barbell", type: "isolation" },
  { name: "Incline Dumbbell Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },
  { name: "Concentration Curl", muscleGroup: "biceps", equipment: "dumbbell", type: "isolation" },

  // Triceps
  { name: "Cable Triceps Pushdown", muscleGroup: "triceps", equipment: "cable", type: "isolation" },
  { name: "Skull Crusher", muscleGroup: "triceps", equipment: "barbell", type: "isolation" },
  { name: "Overhead Dumbbell Extension", muscleGroup: "triceps", equipment: "dumbbell", type: "isolation" },
  { name: "Close-Grip Bench Press", muscleGroup: "triceps", equipment: "barbell", type: "compound" },
  { name: "Rope Triceps Pushdown", muscleGroup: "triceps", equipment: "cable", type: "isolation" },
  { name: "Triceps Kickback", muscleGroup: "triceps", equipment: "dumbbell", type: "isolation" },
  { name: "Bench Dip", muscleGroup: "triceps", equipment: "bodyweight", type: "compound" },
  { name: "Diamond Push-Up", muscleGroup: "triceps", equipment: "bodyweight", type: "compound" },
  { name: "Kettlebell Overhead Triceps Extension", muscleGroup: "triceps", equipment: "kettlebell", type: "isolation" },

  // Core
  { name: "Cable Crunch", muscleGroup: "core", equipment: "cable", type: "isolation" },
  { name: "Hanging Leg Raise", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Ab Wheel Rollout", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Weighted Plank", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Dead Bug", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Bicycle Crunch", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Hanging Knee Raise", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Mountain Climber", muscleGroup: "core", equipment: "bodyweight", type: "isolation" },
  { name: "Pallof Press", muscleGroup: "core", equipment: "cable", type: "isolation" },
  { name: "Kettlebell Russian Twist", muscleGroup: "core", equipment: "kettlebell", type: "isolation" },
  { name: "Kettlebell Turkish Get-Up", muscleGroup: "core", equipment: "kettlebell", type: "compound" },

  // Calves
  { name: "Standing Calf Raise", muscleGroup: "calves", equipment: "machine", type: "isolation" },
  { name: "Seated Calf Raise", muscleGroup: "calves", equipment: "machine", type: "isolation" },
  { name: "Single-Leg Calf Raise", muscleGroup: "calves", equipment: "bodyweight", type: "isolation" },
  { name: "Dumbbell Calf Raise", muscleGroup: "calves", equipment: "dumbbell", type: "isolation" },
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
