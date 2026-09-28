// Exercise form guidance: cue text, common mistakes, and a small reusable
// stick-figure diagram system.
//
// Poses are coordinate DATA, not hand-drawn SVG per exercise. Many
// exercises share an identical movement pattern from a stick figure's
// perspective (all four curl variants look the same — only the equipment
// label differs), so each POSE_FAMILY is authored once and reused by every
// exercise that maps to it. FORM_GUIDANCE_DB maps each exercise name to a
// family + its own cue/mistake text.

const VIEWBOX = "0 0 120 170";
const COLOR_START = "#e8e9ee";
const COLOR_LATER = "#6366f1";
// Matches --surface-2 (the .frames background). Used as an outline around
// each limb so an arm crossing in front of the torso still reads clearly.
const OUTLINE = "#232735";

// ---- Muscular body rendering ----
// Every bone is drawn as a filled, tapered segment with a muscle "belly"
// (wide near the proximal joint, bulging, narrowing toward the distal
// joint) instead of a thin line. Segment type is inferred from joint
// names, so all existing pose data renders beefed-up with no edits.
// Widths are FULL widths in viewBox units: [proximal, belly, distal, bellyPos].
const SEGMENT_SHAPES = {
  torso:       [19, 20, 13, 0.28], // shoulder -> hip: broad chest, tapered waist
  upperArm:    [9, 10.5, 6.5, 0.42], // shoulder -> elbow: delt/bicep
  forearm:     [7, 7.5, 4.5, 0.3], // elbow -> hand
  straightArm: [9, 9.5, 4.5, 0.25], // shoulder -> hand (no elbow joint)
  thigh:       [13, 13.5, 8, 0.35], // hip -> knee: quads
  shin:        [8, 8.5, 5, 0.3], // knee -> ankle/foot: calf
  foot:        [5, 5, 3.5, 0.5], // ankle -> toe
  straightLeg: [12, 12, 5, 0.3], // hip -> ankle
  other:       [7, 7, 6, 0.5],
};
const JOINT_RANK = { shoulder: 0, hip: 0, elbow: 1, knee: 1, hand: 2, ankle: 2, foot: 2, toe: 3 };

// "elbowL" / "frontKnee" / "rearFoot" -> "elbow" / "knee" / "foot"
function baseJoint(name) {
  const n = name.replace(/^(front|rear)/, "").replace(/(L|R|G|Base|Upright)$/, "");
  return n.charAt(0).toLowerCase() + n.slice(1);
}

function segmentType(a, b) {
  const s = [baseJoint(a), baseJoint(b)].sort().join("-");
  switch (s) {
    case "hip-shoulder": return "torso";
    case "elbow-shoulder": return "upperArm";
    case "elbow-hand": return "forearm";
    case "hand-shoulder": return "straightArm";
    case "hip-knee": return "thigh";
    case "ankle-knee": case "foot-knee": return "shin";
    case "ankle-toe": return "foot";
    case "ankle-hip": case "foot-hip": return "straightLeg";
    default: return "other";
  }
}

const r1 = (v) => Math.round(v * 10) / 10;

// Closed path for a tapered segment from P (proximal) to Q (distal).
function taperedPath(P, Q, shape) {
  const [wp, wm, wq, t] = shape;
  const dx = Q[0] - P[0], dy = Q[1] - P[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const hp = wp / 2, hm = wm / 2, hq = wq / 2;
  const side = (s) => {
    const a = [P[0] + nx * hp * s, P[1] + ny * hp * s];
    const b = [Q[0] + nx * hq * s, Q[1] + ny * hq * s];
    const m = [P[0] + dx * t + nx * hm * s, P[1] + dy * t + ny * hm * s];
    // Quadratic control point chosen so the curve passes through the belly.
    const c = [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2];
    return { a, b, c };
  };
  const L = side(1), R = side(-1);
  return (
    `M${r1(L.a[0])} ${r1(L.a[1])}` +
    `Q${r1(L.c[0])} ${r1(L.c[1])} ${r1(L.b[0])} ${r1(L.b[1])}` +
    `A${r1(hq)} ${r1(hq)} 0 0 0 ${r1(R.b[0])} ${r1(R.b[1])}` +
    `Q${r1(R.c[0])} ${r1(R.c[1])} ${r1(R.a[0])} ${r1(R.a[1])}` +
    `A${r1(hp)} ${r1(hp)} 0 0 0 ${r1(L.a[0])} ${r1(L.a[1])}Z`
  );
}

// Draws a group of shapes twice: a fat outline pass, then the fill. Shapes
// within one group merge into a single smooth limb; separate groups get a
// visible seam where they overlap.
function limbGroup(paths, circles, color) {
  if (!paths.length && !circles.length) return "";
  const shapes = (attrs) =>
    paths.map((d) => `<path d="${d}" ${attrs}/>`).join("") +
    circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`).join("");
  return (
    `<g>${shapes(`fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"`)}` +
    `${shapes(`fill="${color}"`)}</g>`
  );
}

function renderBody(pose, color) {
  const j = pose.joints;
  const segs = (pose.bones || []).map(([a, b]) => {
    const type = segmentType(a, b);
    const ra = JOINT_RANK[baseJoint(a)] ?? 1;
    const rb = JOINT_RANK[baseJoint(b)] ?? 1;
    // Torso always tapers shoulder -> hip; limbs taper away from the body.
    let [p, q] = ra <= rb ? [a, b] : [b, a];
    if (type === "torso" && baseJoint(p) !== "shoulder") [p, q] = [q, p];
    return { a, b, p, q, type };
  });

  // Group non-torso bones into limbs by shared joints (ignoring the
  // shoulder/hip roots, so left and right limbs stay separate).
  const parent = {};
  const find = (x) => (parent[x] === undefined || parent[x] === x ? x : (parent[x] = find(parent[x])));
  const isRoot = (n) => n === "shoulder" || n === "hip";
  segs.forEach((s) => {
    if (s.type === "torso") return;
    const ka = isRoot(s.a) ? `${s.a}:${s.b}` : s.a;
    const kb = isRoot(s.b) ? `${s.b}:${s.a}` : s.b;
    s.key = ka;
    parent[find(kb)] = find(ka);
  });

  const limbs = {};
  segs.forEach((s) => {
    if (s.type === "torso") return;
    const k = find(s.key);
    (limbs[k] = limbs[k] || { legs: false, segs: [] }).segs.push(s);
    if (["thigh", "shin", "foot", "straightLeg"].includes(s.type)) limbs[k].legs = true;
  });

  // Front views (poses with paired L/R limbs): root each arm at the edge of
  // the chest and each leg at the side of the pelvis instead of the body's
  // centerline, so limbs read as separate from the torso.
  const isFront = segs.some((s) => /L$/.test(s.a) || /L$/.test(s.b)) &&
    segs.some((s) => /R$/.test(s.a) || /R$/.test(s.b));
  const pt = (name, other) => {
    const m = other.match(/(L|R)$/);
    if (!isFront || !isRoot(name) || !m) return j[name];
    const sign = m[1] === "L" ? -1 : 1;
    return name === "shoulder"
      ? [j[name][0] + sign * 7.5, j[name][1] + 2]
      : [j[name][0] + sign * 4.5, j[name][1]];
  };

  const limbSvg = (limb) => {
    const paths = limb.segs.map((s) => taperedPath(pt(s.p, s.q), pt(s.q, s.p), SEGMENT_SHAPES[s.type]));
    // Round "hand"/"foot" nubs on the distal ends so extremities read.
    const circles = [];
    limb.segs.forEach((s) => {
      const bq = baseJoint(s.q);
      if (bq === "hand") circles.push([j[s.q][0], j[s.q][1], 3.6]);
    });
    return limbGroup(paths, circles, color);
  };

  const legs = Object.values(limbs).filter((l) => l.legs).map(limbSvg).join("");
  const arms = Object.values(limbs).filter((l) => !l.legs).map(limbSvg).join("");

  // Torso + neck + head as one group.
  const torsoPaths = segs
    .filter((s) => s.type === "torso")
    .map((s) => taperedPath(j[s.p], j[s.q], SEGMENT_SHAPES.torso));
  const torsoCircles = [];
  if (pose.head) {
    if (j.shoulder) torsoPaths.push(taperedPath(j.shoulder, pose.head, [8, 7, 7, 0.5]));
    torsoCircles.push([pose.head[0], pose.head[1], 9.5]);
  }
  const torso = limbGroup(torsoPaths, torsoCircles, color);

  return legs + torso + arms;
}

// Renders one pose (named joints + bone connections, plus optional
// ground/bench/bar/plate fixtures and a ghost overlay) to an SVG string.
function renderPose(pose, color) {
  const ground = pose.ground
    ? `<line x1="12" y1="${pose.ground + 1}" x2="108" y2="${pose.ground + 1}" stroke="#3a3f55" stroke-width="2.5" stroke-linecap="round"/>`
    : "";
  const bench = pose.bench
    ? `<line x1="${pose.bench[0]}" y1="${pose.bench[1] + 2}" x2="${pose.bench[2]}" y2="${pose.bench[1] + 2}" stroke="#3a3f55" stroke-width="7" stroke-linecap="round"/>`
    : "";
  // Barbell: bar plus a chunky plate at each end.
  const bar = pose.bar
    ? `<line x1="${pose.bar[0] - 6}" y1="${pose.bar[1]}" x2="${pose.bar[2] + 6}" y2="${pose.bar[1]}" stroke="#9297a8" stroke-width="3" stroke-linecap="round"/>` +
      `<rect x="${pose.bar[0] - 7}" y="${pose.bar[1] - 8}" width="5" height="16" rx="1.5" fill="#9297a8"/>` +
      `<rect x="${pose.bar[2] + 2}" y="${pose.bar[1] - 8}" width="5" height="16" rx="1.5" fill="#9297a8"/>`
    : "";
  const plate = pose.plate
    ? `<circle cx="${pose.plate[0]}" cy="${pose.plate[1]}" r="7" fill="#9297a8" stroke="${OUTLINE}" stroke-width="2"/>` +
      `<circle cx="${pose.plate[0]}" cy="${pose.plate[1]}" r="2" fill="${OUTLINE}"/>`
    : "";
  const plateV = pose.plateV
    ? `<line x1="${pose.plateV[0]}" y1="${pose.plateV[1]}" x2="${pose.plateV[0]}" y2="${pose.plateV[2]}" stroke="#3a3f55" stroke-width="7" stroke-linecap="round"/>`
    : "";

  let ghostSvg = "";
  let ghostLabel = "";
  if (pose.ghost) {
    const g = pose.ghost;
    if (g.bones) {
      const gj = g.joints;
      ghostSvg += g.bones
        .map(([a, b]) => {
          const [x1, y1] = gj[a];
          const [x2, y2] = gj[b];
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 5" opacity="0.6"/>`;
        })
        .join("");
    }
    if (g.curve) {
      ghostSvg += `<path d="${g.curve}" fill="none" stroke="#ef4444" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 5" opacity="0.6"/>`;
    }
    if (g.head) {
      ghostSvg += `<circle cx="${g.head[0]}" cy="${g.head[1]}" r="8.5" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="3 3" opacity="0.6"/>`;
    }
    if (g.label) {
      ghostLabel += `<text x="${g.labelPos[0]}" y="${g.labelPos[1]}" font-size="8" fill="#ef4444" opacity="0.9">${g.label}</text>`;
    }
  }

  const body = renderBody(pose, color);
  return `<svg viewBox="${VIEWBOX}">${ground}${bench}${ghostSvg}${plateV}${body}${bar}${plate}${ghostLabel}</svg>`;
}

function renderFrame(frame, index) {
  const color = index === 0 ? COLOR_START : COLOR_LATER;
  const svg = renderPose(frame.pose, color);
  const labelClass = frame.checkpoint ? "frame-label checkpoint" : "frame-label";
  return `
    <div class="frame">
      <span class="frame-num">${index + 1}</span>
      ${svg}
      <p class="${labelClass}">${frame.label}</p>
    </div>`;
}

// ===================== POSE FAMILIES =====================
// Each family is a short sequence of frames (2-3) shared by every exercise
// mapped to it in FORM_GUIDANCE_DB below.

const POSE_FAMILIES = {
  // Pull-Up, Assisted Pull-Up Machine — bar fixed overhead, body rises.
  hangPullFront: {
    frames: [
      {
        label: "Dead hang",
        pose: {
          bar: [25, 15, 95],
          head: [60, 40],
          joints: {
            shoulder: [60, 50], elbowL: [46, 33], handL: [35, 15],
            elbowR: [74, 33], handR: [85, 15],
            hip: [60, 95], kneeL: [56, 125], footL: [54, 155],
            kneeR: [64, 125], footR: [66, 155],
          },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Midpoint — body stays still",
        checkpoint: true,
        pose: {
          bar: [25, 15, 95],
          head: [60, 30],
          joints: {
            shoulder: [60, 40], elbowL: [30, 28], handL: [35, 15],
            elbowR: [90, 28], handR: [85, 15],
            hip: [60, 80], kneeL: [58, 115], footL: [57, 150],
            kneeR: [62, 115], footR: [63, 150],
          },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { hip: [60, 80], kneeG: [75, 100], footG: [90, 118] },
            bones: [["hip","kneeG"],["kneeG","footG"]],
            label: "avoid: swinging legs", labelPos: [62, 132],
          },
        },
      },
      {
        label: "Chin over bar",
        pose: {
          bar: [25, 15, 95],
          head: [60, 17],
          joints: {
            shoulder: [60, 28], elbowL: [18, 25], handL: [35, 15],
            elbowR: [102, 25], handR: [85, 15],
            hip: [60, 68], kneeL: [57, 105], footL: [55, 140],
            kneeR: [63, 105], footR: [65, 140],
          },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
    ],
  },

  // Lat Pulldown — seated, torso fixed, bar moves overhead -> chest.
  seatedPulldownFront: {
    frames: [
      {
        label: "Start — arms extended",
        pose: {
          bar: [30, 20, 90], head: [60, 58],
          joints: {
            shoulder: [60, 70], elbowL: [40, 45], handL: [30, 20],
            elbowR: [80, 45], handR: [90, 20],
            hip: [60, 110], kneeL: [45, 130], footL: [40, 155],
            kneeR: [75, 130], footR: [80, 155],
          },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ground: 158,
        },
      },
      {
        label: "Bar to chest",
        checkpoint: true,
        pose: {
          bar: [38, 68, 82], head: [60, 58],
          joints: {
            shoulder: [60, 70], elbowL: [25, 80], handL: [38, 68],
            elbowR: [95, 80], handR: [82, 68],
            hip: [60, 110], kneeL: [45, 130], footL: [40, 155],
            kneeR: [75, 130], footR: [80, 155],
          },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ground: 158,
          ghost: {
            joints: { hip: [60, 110], shoulderG: [82, 92] },
            bones: [["hip","shoulderG"]],
            head: [88, 82],
            label: "avoid: leaning back", labelPos: [90, 80],
          },
        },
      },
    ],
  },

  // Barbell Row, Seated Cable Row, T-Bar Row, Single-Arm Dumbbell Row.
  rowSideProfile: {
    frames: [
      {
        label: "Start — arm extended",
        pose: {
          head: [70, 48], ground: 150,
          joints: { ankle: [55, 150], knee: [55, 115], hip: [62, 90], shoulder: [68, 60], elbow: [80, 75], hand: [95, 85] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","elbow"],["elbow","hand"]],
          dots: ["knee","hip","shoulder","elbow"],
        },
      },
      {
        label: "Pull to torso",
        checkpoint: true,
        pose: {
          head: [70, 48], ground: 150,
          joints: { ankle: [55, 150], knee: [55, 115], hip: [62, 90], shoulder: [68, 60], elbow: [55, 65], hand: [45, 60] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","elbow"],["elbow","hand"]],
          dots: ["knee","hip","shoulder","elbow"],
          ghost: {
            joints: { hip: [62, 90], shoulderG: [62, 55] },
            bones: [["hip","shoulderG"]],
            head: [63, 43],
            label: "avoid: jerking upright", labelPos: [64, 40],
          },
        },
      },
    ],
  },

  // Barbell Bench Press, Incline Dumbbell Press, Chest Press Machine, Close-Grip Bench Press.
  pressLyingSide: {
    frames: [
      {
        label: "Bar at chest",
        pose: {
          head: [28, 96], bench: [15, 105, 100],
          joints: { shoulder: [45, 98], elbow: [48, 78], hand: [50, 58], hip: [75, 100], knee: [95, 90], foot: [95, 115] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
          plate: [50, 58],
        },
      },
      {
        label: "Full extension",
        checkpoint: true,
        pose: {
          head: [28, 96], bench: [15, 105, 100],
          joints: { shoulder: [45, 98], elbow: [47, 68], hand: [48, 40], hip: [75, 100], knee: [95, 90], foot: [95, 115] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
          plate: [48, 40],
          ghost: {
            joints: { hipBase: [75, 100], hipG: [75, 85] },
            bones: [["hipBase","hipG"]],
            label: "avoid: hips lifting off bench", labelPos: [40, 90],
          },
        },
      },
    ],
  },

  // Cable Fly, Dumbbell Fly.
  flyLyingSide: {
    frames: [
      {
        label: "Arms open",
        pose: {
          head: [28, 96], bench: [15, 105, 100],
          joints: { shoulder: [45, 98], elbow: [50, 105], hand: [35, 112], hip: [75, 100], knee: [95, 90], foot: [95, 115] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
        },
      },
      {
        label: "Arms together",
        checkpoint: true,
        pose: {
          head: [28, 96], bench: [15, 105, 100],
          joints: { shoulder: [45, 98], elbow: [45, 75], hand: [45, 55], hip: [75, 100], knee: [95, 90], foot: [95, 115] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
          ghost: {
            joints: { shoulder: [45, 98], elbowG: [47, 68], handG: [48, 40] },
            bones: [["shoulder","elbowG"],["elbowG","handG"]],
            label: "avoid: pressing, not arcing", labelPos: [50, 36],
          },
        },
      },
    ],
  },

  // Dips, Assisted Dip Machine — hands fixed on parallel bars, body lowers/raises.
  dipVertical: {
    frames: [
      {
        label: "Top — arms extended",
        pose: {
          head: [58, 78],
          joints: { handL: [40, 60], elbowL: [35, 75], handR: [80, 60], elbowR: [85, 75], shoulder: [60, 90], hip: [65, 120], knee: [70, 140], foot: [75, 160] },
          bones: [["handL","elbowL"],["elbowL","shoulder"],["handR","elbowR"],["elbowR","shoulder"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["elbowL","elbowR","shoulder","hip","knee"],
        },
      },
      {
        label: "Bottom — lowered",
        checkpoint: true,
        pose: {
          head: [58, 63],
          joints: { handL: [40, 60], elbowL: [30, 50], handR: [80, 60], elbowR: [90, 50], shoulder: [60, 75], hip: [68, 100], knee: [73, 120], foot: [78, 145] },
          bones: [["handL","elbowL"],["elbowL","shoulder"],["handR","elbowR"],["elbowR","shoulder"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["elbowL","elbowR","shoulder","hip","knee"],
          ghost: {
            joints: { shoulderG: [55, 75], hipUpright: [55, 110] },
            bones: [["shoulderG","hipUpright"]],
            label: "avoid: staying too upright", labelPos: [15, 108],
          },
        },
      },
    ],
  },

  // Overhead Barbell Press, Seated Dumbbell Shoulder Press.
  overheadPressFront: {
    frames: [
      {
        label: "Start — bar at shoulders",
        pose: {
          head: [60, 42], ground: 155, bar: [35, 50, 85],
          joints: { shoulder: [60, 55], elbowL: [40, 60], handL: [35, 50], elbowR: [80, 60], handR: [85, 50],
                    hip: [60, 95], kneeL: [56, 125], footL: [54, 155], kneeR: [64, 125], footR: [66, 155] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Locked out overhead",
        checkpoint: true,
        pose: {
          head: [60, 42], ground: 155, bar: [35, 15, 85],
          joints: { shoulder: [60, 55], elbowL: [38, 35], handL: [35, 15], elbowR: [82, 35], handR: [85, 15],
                    hip: [60, 95], kneeL: [56, 125], footL: [54, 155], kneeR: [64, 125], footR: [66, 155] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: {},
            curve: "M60,95 Q78,75 60,55",
            label: "avoid: arching your back", labelPos: [78, 78],
          },
        },
      },
    ],
  },

  // Lateral Raise, Cable Lateral Raise.
  lateralRaiseFront: {
    frames: [
      {
        label: "Arms at sides",
        pose: {
          head: [60, 42], ground: 158,
          joints: { shoulder: [60, 55], elbowL: [44, 78], handL: [41, 100], elbowR: [76, 78], handR: [79, 100],
                    hip: [60, 100], kneeL: [56, 130], footL: [54, 158], kneeR: [64, 130], footR: [66, 158] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Raised to shoulder height",
        checkpoint: true,
        pose: {
          head: [60, 42], ground: 158,
          joints: { shoulder: [60, 55], elbowL: [35, 55], handL: [18, 53], elbowR: [85, 55], handR: [102, 53],
                    hip: [60, 100], kneeL: [56, 130], footL: [54, 158], kneeR: [64, 130], footR: [66, 158] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { shoulderBase: [60, 55], shoulderG: [60, 42] },
            bones: [["shoulderBase","shoulderG"]],
            label: "avoid: shrugging up", labelPos: [64, 40],
          },
        },
      },
    ],
  },

  // Rear Delt Fly, Face Pull.
  rearDeltBentSide: {
    frames: [
      {
        label: "Start — arm hanging",
        pose: {
          head: [68, 50], ground: 150,
          joints: { ankle: [55, 150], knee: [55, 118], hip: [60, 90], shoulder: [66, 62], elbow: [62, 78], hand: [58, 95] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","elbow"],["elbow","hand"]],
          dots: ["knee","hip","shoulder","elbow"],
        },
      },
      {
        label: "Pulled back",
        checkpoint: true,
        pose: {
          head: [68, 50], ground: 150,
          joints: { ankle: [55, 150], knee: [55, 118], hip: [60, 90], shoulder: [66, 62], elbow: [80, 55], hand: [95, 50] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","elbow"],["elbow","hand"]],
          dots: ["knee","hip","shoulder","elbow"],
          ghost: {
            joints: { hip: [60, 90], shoulderG: [58, 55] },
            bones: [["hip","shoulderG"]],
            head: [56, 44],
            label: "avoid: jerking your torso", labelPos: [12, 42],
          },
        },
      },
    ],
  },

  // Barbell Back Squat, Front Squat.
  squatSideProfile: {
    frames: [
      {
        label: "Standing",
        pose: {
          head: [58, 30], ground: 150, plate: [67, 42],
          joints: { shoulder: [58, 42], hand: [70, 44], hip: [57, 76], knee: [55, 112], ankle: [55, 150], toe: [76, 152] },
          bones: [["shoulder","hand"],["shoulder","hip"],["hip","knee"],["knee","ankle"],["ankle","toe"]],
          dots: ["shoulder","hip","knee"],
        },
      },
      {
        label: "Descending — chest stays up",
        checkpoint: true,
        pose: {
          head: [59, 48], ground: 150, plate: [69, 60],
          joints: { shoulder: [60, 60], hand: [72, 62], hip: [64, 92], knee: [50, 120], ankle: [55, 150], toe: [76, 152] },
          bones: [["shoulder","hand"],["shoulder","hip"],["hip","knee"],["knee","ankle"],["ankle","toe"]],
          dots: ["shoulder","hip","knee"],
          ghost: {
            joints: {},
            curve: "M64,92 Q76,72 79,50",
            head: [79, 45],
            label: "avoid: chest drops", labelPos: [82, 42],
          },
        },
      },
      {
        label: "Bottom — hips back",
        pose: {
          head: [58, 42], ground: 150, plate: [68, 55],
          joints: { shoulder: [60, 55], hand: [74, 57], hip: [72, 98], knee: [48, 112], ankle: [55, 150], toe: [76, 152] },
          bones: [["shoulder","hand"],["shoulder","hip"],["hip","knee"],["knee","ankle"],["ankle","toe"]],
          dots: ["shoulder","hip","knee"],
        },
      },
    ],
  },

  // Bulgarian Split Squat — single-leg, rear foot elevated.
  bulgarianSplitSquatSide: {
    frames: [
      {
        label: "Top",
        pose: {
          head: [58, 38], ground: 150, bench: [80, 100, 100],
          joints: { shoulder: [58, 50], hip: [58, 85], frontKnee: [50, 118], frontAnkle: [50, 150], rearKnee: [75, 120], rearFoot: [85, 100] },
          bones: [["shoulder","hip"],["hip","frontKnee"],["frontKnee","frontAnkle"],["hip","rearKnee"],["rearKnee","rearFoot"]],
          dots: ["hip","frontKnee","rearKnee"],
        },
      },
      {
        label: "Bottom — front knee bends",
        checkpoint: true,
        pose: {
          head: [57, 58], ground: 150, bench: [80, 100, 100],
          joints: { shoulder: [57, 70], hip: [56, 105], frontKnee: [48, 125], frontAnkle: [50, 150], rearKnee: [78, 128], rearFoot: [85, 100] },
          bones: [["shoulder","hip"],["hip","frontKnee"],["frontKnee","frontAnkle"],["hip","rearKnee"],["rearKnee","rearFoot"]],
          dots: ["hip","frontKnee","rearKnee"],
          ghost: {
            joints: { frontAnkle: [50, 150], kneeG: [68, 118] },
            bones: [["frontAnkle","kneeG"]],
            label: "avoid: knee past your toes", labelPos: [64, 114],
          },
        },
      },
    ],
  },

  // Leg Press — seated, reclined.
  legPressSeatedSide: {
    frames: [
      {
        label: "Bent — plate close",
        pose: {
          head: [30, 68],
          joints: { shoulder: [35, 80], hip: [45, 110], knee: [65, 90], foot: [80, 80] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
          plateV: [85, 50, 110],
        },
      },
      {
        label: "Extended — plate pushed away",
        checkpoint: true,
        pose: {
          head: [30, 68],
          joints: { shoulder: [35, 80], hip: [45, 110], knee: [75, 105], foot: [105, 95] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
          plateV: [110, 75, 115],
          ghost: {
            joints: { hip: [45, 110], hipG: [50, 95] },
            bones: [["hip","hipG"]],
            label: "avoid: lower back lifting off pad", labelPos: [5, 92],
          },
        },
      },
    ],
  },

  // Romanian Deadlift, Cable Pull-Through.
  hipHingeStandingSide: {
    frames: [
      {
        label: "Top — standing",
        pose: {
          head: [58, 38], ground: 150, plate: [60, 95],
          joints: { ankle: [55, 150], knee: [55, 115], hip: [57, 85], shoulder: [58, 50], hand: [60, 95] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["knee","hip","shoulder"],
        },
      },
      {
        label: "Bottom — hips back",
        checkpoint: true,
        pose: {
          head: [68, 48], ground: 150, plate: [58, 135],
          joints: { ankle: [55, 150], knee: [54, 113], hip: [75, 90], shoulder: [65, 55], hand: [58, 135] },
          bones: [["ankle","knee"],["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["knee","hip","shoulder"],
          ghost: {
            joints: {},
            curve: "M75,90 Q86,68 70,50",
            label: "avoid: rounding your back", labelPos: [78, 62],
          },
        },
      },
    ],
  },

  // Hip Thrust, Glute Bridge Machine.
  hipThrustSupineSide: {
    frames: [
      {
        label: "Bottom — hips down",
        pose: {
          head: [20, 98], bench: [10, 100, 45],
          joints: { shoulder: [30, 100], hip: [55, 120], knee: [80, 105], foot: [95, 140] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
        },
      },
      {
        label: "Top — hips extended",
        checkpoint: true,
        pose: {
          head: [20, 98], bench: [10, 100, 45],
          joints: { shoulder: [30, 100], hip: [60, 80], knee: [82, 90], foot: [95, 140] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
          ghost: {
            joints: { hip: [60, 80], hipG: [65, 65] },
            bones: [["hip","hipG"]],
            label: "avoid: overarching your back", labelPos: [66, 62],
          },
        },
      },
    ],
  },

  // Lying Leg Curl.
  legCurlProneSide: {
    frames: [
      {
        label: "Legs extended",
        pose: {
          head: [18, 88], bench: [15, 95, 85],
          joints: { shoulder: [25, 90], hip: [55, 90], knee: [80, 90], foot: [102, 90] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
        },
      },
      {
        label: "Curled — heel to glutes",
        checkpoint: true,
        pose: {
          head: [18, 88], bench: [15, 95, 85],
          joints: { shoulder: [25, 90], hip: [55, 90], knee: [80, 90], foot: [85, 60] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
          ghost: {
            joints: { hip: [55, 90], hipG: [55, 78] },
            bones: [["hip","hipG"]],
            label: "avoid: hips lifting up", labelPos: [35, 74],
          },
        },
      },
    ],
  },

  // Leg Extension.
  legExtensionSeatedSide: {
    frames: [
      {
        label: "Bent — start",
        pose: {
          head: [20, 42],
          joints: { shoulder: [25, 55], hip: [35, 90], knee: [55, 100], foot: [55, 140] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
        },
      },
      {
        label: "Extended — leg straight",
        checkpoint: true,
        pose: {
          head: [20, 42],
          joints: { shoulder: [25, 55], hip: [35, 90], knee: [60, 95], foot: [95, 90] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","hip","knee"],
          ghost: {
            joints: { knee: [60, 95], footG: [100, 70] },
            bones: [["knee","footG"]],
            label: "avoid: kicking the weight up", labelPos: [80, 66],
          },
        },
      },
    ],
  },

  // Barbell Curl, Dumbbell Curl, Cable Curl, Hammer Curl.
  curlStandingFront: {
    frames: [
      {
        label: "Arms extended",
        pose: {
          head: [60, 42], ground: 158,
          joints: { shoulder: [60, 55], elbowL: [43, 80], handL: [40, 104], elbowR: [77, 80], handR: [80, 104],
                    hip: [60, 100], kneeL: [56, 130], footL: [54, 158], kneeR: [64, 130], footR: [66, 158] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Curled up",
        checkpoint: true,
        pose: {
          head: [60, 42], ground: 158,
          joints: { shoulder: [60, 55], elbowL: [43, 80], handL: [38, 57], elbowR: [77, 80], handR: [82, 57],
                    hip: [60, 100], kneeL: [56, 130], footL: [54, 158], kneeR: [64, 130], footR: [66, 158] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { elbowBase: [48, 80], elbowG: [32, 63] },
            bones: [["elbowBase","elbowG"]],
            label: "avoid: swinging your elbows", labelPos: [4, 60],
          },
        },
      },
    ],
  },

  // Cable Triceps Pushdown.
  tricepPushdownSide: {
    frames: [
      {
        label: "Bent — start",
        pose: {
          head: [55, 42], ground: 155,
          joints: { shoulder: [55, 55], elbow: [58, 75], hand: [62, 60], hip: [57, 95], knee: [55, 125], foot: [53, 155] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
        },
      },
      {
        label: "Extended down",
        checkpoint: true,
        pose: {
          head: [55, 42], ground: 155,
          joints: { shoulder: [55, 55], elbow: [58, 75], hand: [65, 100], hip: [57, 95], knee: [55, 125], foot: [53, 155] },
          bones: [["shoulder","elbow"],["elbow","hand"],["shoulder","hip"],["hip","knee"],["knee","foot"]],
          dots: ["shoulder","elbow","hip","knee"],
          ghost: {
            joints: { elbowBase: [58, 75], elbowG: [76, 70] },
            bones: [["elbowBase","elbowG"]],
            label: "avoid: elbows flaring out", labelPos: [78, 66],
          },
        },
      },
    ],
  },

  // Skull Crusher.
  skullCrusherLyingSide: {
    frames: [
      {
        label: "Bar near forehead",
        pose: {
          head: [22, 93], bench: [15, 100, 95],
          joints: { shoulder: [35, 95], elbow: [45, 60], hand: [35, 45] },
          bones: [["shoulder","elbow"],["elbow","hand"]],
          dots: ["shoulder","elbow"],
        },
      },
      {
        label: "Extended overhead",
        checkpoint: true,
        pose: {
          head: [22, 93], bench: [15, 100, 95],
          joints: { shoulder: [35, 95], elbow: [45, 60], hand: [48, 35] },
          bones: [["shoulder","elbow"],["elbow","hand"]],
          dots: ["shoulder","elbow"],
          ghost: {
            joints: { elbowBase: [45, 60], elbowG: [28, 55] },
            bones: [["elbowBase","elbowG"]],
            label: "avoid: elbows drifting back", labelPos: [4, 50],
          },
        },
      },
    ],
  },

  // Overhead Dumbbell Extension.
  overheadTricepExtFront: {
    frames: [
      {
        label: "Extended overhead",
        pose: {
          head: [60, 38], ground: 155,
          joints: { shoulder: [60, 50], elbowL: [46, 32], handL: [44, 12], elbowR: [74, 32], handR: [76, 12],
                    hip: [60, 95], kneeL: [56, 125], footL: [54, 155], kneeR: [64, 125], footR: [66, 155] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Lowered behind head",
        checkpoint: true,
        pose: {
          head: [60, 38], ground: 155,
          joints: { shoulder: [60, 50], elbowL: [46, 32], handL: [42, 58], elbowR: [74, 32], handR: [78, 58],
                    hip: [60, 95], kneeL: [56, 125], footL: [54, 155], kneeR: [64, 125], footR: [66, 155] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { elbowBase: [50, 35], elbowG: [22, 42] },
            bones: [["elbowBase","elbowG"]],
            label: "avoid: elbows flaring out", labelPos: [2, 38],
          },
        },
      },
    ],
  },

  // Cable Crunch.
  cableCrunchKneelingSide: {
    frames: [
      {
        label: "Start",
        pose: {
          head: [48, 65],
          joints: { knee: [55, 140], hip: [55, 110], shoulder: [52, 80], hand: [40, 60] },
          bones: [["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["hip","shoulder"],
        },
      },
      {
        label: "Crunched down",
        checkpoint: true,
        pose: {
          head: [65, 105],
          joints: { knee: [55, 140], hip: [55, 110], shoulder: [62, 95], hand: [55, 95] },
          bones: [["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["hip","shoulder"],
          ghost: {
            joints: { hip: [55, 110], hipG: [75, 105] },
            bones: [["hip","hipG"]],
            label: "avoid: hips shifting back", labelPos: [76, 102],
          },
        },
      },
    ],
  },

  // Hanging Leg Raise — bar fixed, arms static, legs move.
  hangingLegRaiseFront: {
    frames: [
      {
        label: "Legs hanging",
        pose: {
          bar: [25, 15, 95], head: [60, 40],
          joints: { shoulder: [60, 50], elbowL: [46, 33], handL: [35, 15], elbowR: [74, 33], handR: [85, 15],
                    hip: [60, 95], kneeL: [56, 130], footL: [54, 160], kneeR: [64, 130], footR: [66, 160] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","hip","kneeL","kneeR"],
        },
      },
      {
        label: "Legs raised",
        checkpoint: true,
        pose: {
          bar: [25, 15, 95], head: [60, 40],
          joints: { shoulder: [60, 50], elbowL: [46, 33], handL: [35, 15], elbowR: [74, 33], handR: [85, 15],
                    hip: [60, 95], kneeL: [65, 80], footL: [68, 55], kneeR: [68, 82], footR: [72, 58] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","hip","kneeL","kneeR"],
          ghost: {
            joints: { hip: [60, 95], kneeG: [85, 100], footG: [105, 110] },
            bones: [["hip","kneeG"],["kneeG","footG"]],
            label: "avoid: swinging your legs", labelPos: [78, 122],
          },
        },
      },
    ],
  },

  // Ab Wheel Rollout.
  abWheelKneelingSide: {
    frames: [
      {
        label: "Start — upright",
        pose: {
          head: [58, 68],
          joints: { knee: [55, 150], hip: [57, 120], shoulder: [58, 80], hand: [58, 150] },
          bones: [["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["hip","shoulder"],
        },
      },
      {
        label: "Rolled out",
        checkpoint: true,
        pose: {
          head: [95, 105],
          joints: { knee: [55, 150], hip: [58, 130], shoulder: [85, 110], hand: [105, 140] },
          bones: [["knee","hip"],["hip","shoulder"],["shoulder","hand"]],
          dots: ["hip","shoulder"],
          ghost: {
            joints: { hip: [58, 130], hipG: [62, 150] },
            bones: [["hip","hipG"]],
            label: "avoid: hips sagging down", labelPos: [64, 155],
          },
        },
      },
    ],
  },

  // Weighted Plank — single-frame isometric hold.
  plankSideHold: {
    frames: [
      {
        label: "Hold — straight line, head to heels",
        pose: {
          head: [22, 100], ground: 145,
          joints: { elbow: [30, 130], groundPt: [35, 140], shoulder: [35, 105], hip: [65, 110], ankle: [95, 140] },
          bones: [["elbow","groundPt"],["elbow","shoulder"],["shoulder","hip"],["hip","ankle"]],
          dots: ["elbow","shoulder","hip"],
          ghost: {
            joints: { hipBase: [65, 110], hipSagG: [68, 128] },
            bones: [["hipBase","hipSagG"]],
            label: "avoid: hips sagging or piking", labelPos: [70, 132],
          },
        },
      },
    ],
  },

  // Standing Calf Raise.
  calfRaiseStandingSide: {
    frames: [
      {
        label: "Heels down",
        pose: {
          head: [53, 38], ground: 150,
          joints: { toe: [60, 150], ankle: [45, 145], knee: [50, 115], hip: [52, 85], shoulder: [53, 50] },
          bones: [["toe","ankle"],["ankle","knee"],["knee","hip"],["hip","shoulder"]],
          dots: ["ankle","knee","hip"],
        },
      },
      {
        label: "Heels raised",
        checkpoint: true,
        pose: {
          head: [54, 36], ground: 150,
          joints: { toe: [60, 150], ankle: [50, 130], knee: [52, 105], hip: [53, 80], shoulder: [54, 48] },
          bones: [["toe","ankle"],["ankle","knee"],["knee","hip"],["hip","shoulder"]],
          dots: ["ankle","knee","hip"],
        },
      },
    ],
  },

  // Seated Calf Raise.
  calfRaiseSeatedSide: {
    frames: [
      {
        label: "Heels down",
        pose: {
          head: [35, 78],
          joints: { shoulder: [38, 90], hip: [40, 100], knee: [65, 105], ankle: [70, 145], toe: [80, 150] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","ankle"],["ankle","toe"]],
          dots: ["hip","knee","ankle"],
        },
      },
      {
        label: "Heels raised",
        checkpoint: true,
        pose: {
          head: [35, 78],
          joints: { shoulder: [38, 90], hip: [40, 100], knee: [65, 105], ankle: [70, 130], toe: [80, 150] },
          bones: [["shoulder","hip"],["hip","knee"],["knee","ankle"],["ankle","toe"]],
          dots: ["hip","knee","ankle"],
        },
      },
    ],
  },
};

// ===================== PER-EXERCISE TEXT =====================

const FORM_GUIDANCE_DB = {
  "Barbell Bench Press": {
    family: "pressLyingSide",
    cue: "Feet flat on the floor, shoulder blades pulled back and down into the bench. Lower the bar to your mid-chest with control, then press it back up in a straight line.",
    mistakes: ["Hips lifting off the bench to help drive the bar up", "Bouncing the bar off the chest instead of a controlled touch", "Flaring the elbows straight out to 90° instead of a slight tuck"],
  },
  "Incline Dumbbell Press": {
    family: "pressLyingSide",
    cue: "Set the bench to a moderate incline (30-45°). Press the dumbbells up and slightly inward until your arms are extended, without locking the elbows hard.",
    mistakes: ["Setting the incline too steep, which turns it into a shoulder press", "Letting the dumbbells drift out wide instead of tracking over the chest", "Not lowering with control on the way down"],
  },
  "Chest Press Machine": {
    family: "pressLyingSide",
    cue: "Adjust the seat so the handles line up with mid-chest height. Press forward until your arms are extended without fully locking the elbows, then return with control.",
    mistakes: ["Seat set too high or low, changing which part of the chest gets worked", "Shrugging the shoulders up toward the ears during the press", "Using a fast, bouncing tempo instead of a controlled one"],
  },
  "Cable Fly": {
    family: "flyLyingSide",
    cue: "Stand between the cable towers with a slight forward lean. Sweep your arms in a wide arc, bringing your hands together in front of your chest with a slight bend in the elbows.",
    mistakes: ["Bending the elbows more and more until it turns into a press", "Using too much weight and losing the stretch at the start", "Letting the arms drop lower than shoulder height at the start of the arc"],
  },
  "Dumbbell Fly": {
    family: "flyLyingSide",
    cue: "Lying on a bench, lower the dumbbells out to the sides in a wide arc with a slight elbow bend, then bring them back together above your chest.",
    mistakes: ["Bending the elbows more and more until it turns into a press", "Lowering the dumbbells too far and straining the shoulder joint", "Rushing the stretch at the bottom instead of controlling it"],
  },
  "Dips": {
    family: "dipVertical",
    cue: "Support yourself on the bars with arms extended, lean your torso slightly forward, and lower until your shoulders dip just below your elbows, then press back up.",
    mistakes: ["Staying too upright, which shifts stress onto the shoulders", "Flaring the elbows out wide instead of keeping them tucked back", "Only lowering a few inches instead of reaching real depth"],
  },
  "Assisted Dip Machine": {
    family: "dipVertical",
    cue: "Set the assistance weight so the last couple reps are genuinely hard. Lean slightly forward and lower until your shoulders dip just below your elbows, then press back up.",
    mistakes: ["Setting too much assistance so the exercise doesn't actually challenge you", "Staying perfectly upright instead of leaning slightly forward", "Rushing back up instead of controlling the descent"],
  },
  "Lat Pulldown": {
    family: "seatedPulldownFront",
    cue: "Sit with your thighs secured under the pad. Pull the bar down to your upper chest, driving your elbows down and back, then let it return with control.",
    mistakes: ["Leaning back and using body momentum instead of pulling with the back", "Pulling the bar behind the neck instead of to the front", "Not letting the bar return to a full stretch overhead between reps"],
  },
  "Barbell Row": {
    family: "rowSideProfile",
    cue: "Hinge at the hips with a flat back, torso roughly 45°. Pull the bar to your lower ribs/upper stomach, squeezing your shoulder blades together, then lower with control.",
    mistakes: ["Jerking the torso upright to use momentum instead of pulling with the back", "Rounding the lower back instead of keeping it flat", "Pulling to the chest instead of the lower ribs, which shifts the emphasis"],
  },
  "Seated Cable Row": {
    family: "rowSideProfile",
    cue: "Sit tall with a slight forward lean at the start. Pull the handle to your torso, squeezing your shoulder blades, then let your torso follow forward again with control on the return.",
    mistakes: ["Leaning way back and using body momentum to move the weight", "Rounding the lower back at the start of each rep", "Shrugging the shoulders up instead of pulling with the mid-back"],
  },
  "T-Bar Row": {
    family: "rowSideProfile",
    cue: "Hinge at the hips with a flat back. Pull the handle up to your torso, squeezing your shoulder blades together, then lower with control.",
    mistakes: ["Jerking upright to use momentum instead of pulling with the back", "Rounding the lower back under load", "Cutting the range of motion short instead of a full stretch-to-squeeze"],
  },
  "Single-Arm Dumbbell Row": {
    family: "rowSideProfile",
    cue: "Support yourself with one hand and knee on a bench, flat back. Pull the dumbbell to your hip, squeezing your shoulder blade, then lower with control.",
    mistakes: ["Twisting/rotating the torso to help move the weight", "Rounding the lower back instead of keeping it flat", "Pulling with a bent wrist instead of leading with the elbow"],
  },
  "Pull-Up": {
    family: "hangPullFront",
    cue: "Hang with arms fully extended, hands just outside shoulder width. Pull your elbows down and back to bring your chest toward the bar, finishing with your chin above it.",
    mistakes: ["Swinging/kipping the legs for momentum instead of pulling with the back", "Not returning to a full dead hang between reps (cutting range of motion short)", "Shrugging the shoulders toward the ears instead of pulling them down and back"],
  },
  "Assisted Pull-Up Machine": {
    family: "hangPullFront",
    cue: "Set the assistance so the last rep or two is genuinely hard. Pull your elbows down and back to bring your chest toward the bar, finishing with your chin above it.",
    mistakes: ["Setting too much assistance so the movement doesn't actually challenge you", "Rushing through reps instead of controlling the descent", "Shrugging the shoulders toward the ears instead of pulling them down and back"],
  },
  "Overhead Barbell Press": {
    family: "overheadPressFront",
    cue: "Stand with the bar at shoulder height, brace your core. Press straight overhead until your arms lock out, keeping the bar path close to your face.",
    mistakes: ["Arching the lower back excessively to get the bar overhead", "Pressing the bar forward instead of straight up", "Not fully locking out at the top"],
  },
  "Seated Dumbbell Shoulder Press": {
    family: "overheadPressFront",
    cue: "Sit with back support, dumbbells at shoulder height. Press straight overhead until your arms are extended, then lower with control back to shoulder height.",
    mistakes: ["Arching the lower back excessively instead of staying braced", "Letting the dumbbells drift too far forward or behind the head", "Not lowering all the way back to shoulder height between reps"],
  },
  "Lateral Raise": {
    family: "lateralRaiseFront",
    cue: "Standing with a slight bend in the elbows, raise the dumbbells out to your sides until they reach shoulder height, then lower with control.",
    mistakes: ["Shrugging the shoulders up toward the ears instead of raising through the shoulder joint", "Swinging the weight up using body momentum", "Raising past shoulder height, which brings the traps into it more than the delts"],
  },
  "Cable Lateral Raise": {
    family: "lateralRaiseFront",
    cue: "Standing side-on to the cable, raise your arm out to the side until it reaches shoulder height, keeping a slight bend in the elbow, then lower with control.",
    mistakes: ["Shrugging the shoulder up toward the ear instead of raising through the joint", "Leaning away from the cable to cheat the weight up", "Rushing the lowering phase instead of controlling it"],
  },
  "Rear Delt Fly": {
    family: "rearDeltBentSide",
    cue: "Hinge forward at the hips with a flat back. With a slight bend in the elbows, raise the dumbbells out and back, squeezing your shoulder blades together.",
    mistakes: ["Jerking the torso upright to use momentum instead of isolating the rear delts", "Turning it into a row by bending the elbows too much", "Using too much weight and losing range of motion"],
  },
  "Face Pull": {
    family: "rearDeltBentSide",
    cue: "With the cable at roughly face height, pull the rope toward your face, flaring your elbows out wide and squeezing your shoulder blades together at the end.",
    mistakes: ["Using the arms/biceps to pull instead of leading with the shoulder blades", "Letting the elbows drop low instead of staying up near face height", "Leaning back and using body momentum"],
  },
  "Barbell Back Squat": {
    family: "squatSideProfile",
    cue: "Bar rests on your upper traps, feet shoulder-width with toes slightly turned out. Push your hips back and bend your knees together, chest up, until your thighs are at least parallel to the floor, then drive back up.",
    mistakes: ["Knees caving inward as you stand back up", "Heels lifting off the floor / weight shifting onto the toes", "Chest collapsing forward and lower back rounding at the bottom"],
  },
  "Leg Press": {
    family: "legPressSeatedSide",
    cue: "Feet shoulder-width on the plate, lower back flat against the pad. Lower the plate under control until your knees reach roughly 90°, then press back up without locking your knees hard.",
    mistakes: ["Lower back lifting off the pad at the bottom of the movement", "Letting the knees cave inward as you press", "Locking the knees out hard at the top of every rep"],
  },
  "Bulgarian Split Squat": {
    family: "bulgarianSplitSquatSide",
    cue: "Rear foot elevated on a bench behind you, most of your weight in the front foot. Lower straight down until your front thigh is roughly parallel to the floor, then drive back up.",
    mistakes: ["Letting the front knee travel way past the toes instead of tracking over them", "Pushing off the rear foot to help the rep instead of keeping it light", "Leaning the torso too far forward, which shifts the balance point"],
  },
  "Leg Extension": {
    family: "legExtensionSeatedSide",
    cue: "Seated with the pad against your shins, extend your legs until they're straight, squeezing your quads at the top, then lower with control.",
    mistakes: ["Using momentum to kick the weight up instead of a controlled squeeze", "Locking the knees out hard and bouncing at the top", "Lowering too fast instead of controlling the negative"],
  },
  "Front Squat": {
    family: "squatSideProfile",
    cue: "Bar rests across the front of your shoulders, elbows up and forward. Push your hips back and bend your knees, staying as upright as possible, until your thighs are at least parallel to the floor.",
    mistakes: ["Elbows dropping, which lets the bar roll forward off the shoulders", "Chest collapsing forward and lower back rounding at the bottom", "Heels lifting off the floor as you descend"],
  },
  "Romanian Deadlift": {
    family: "hipHingeStandingSide",
    cue: "Standing with the bar at your thighs, push your hips straight back while keeping a soft bend in the knees and the bar close to your legs, until you feel a stretch in your hamstrings.",
    mistakes: ["Rounding the lower back instead of keeping it flat", "Bending the knees too much and turning it into a squat", "Letting the bar drift away from your legs instead of staying close"],
  },
  "Lying Leg Curl": {
    family: "legCurlProneSide",
    cue: "Lying face down with the pad against your ankles, curl your heels toward your glutes, then lower with control back to the start.",
    mistakes: ["Hips lifting off the bench to help complete the rep", "Using a fast, jerky tempo instead of a controlled one", "Not going through the full range of motion"],
  },
  "Hip Thrust": {
    family: "hipThrustSupineSide",
    cue: "Upper back against a bench, feet flat on the floor. Drive your hips up until your body forms a straight line from shoulders to knees, squeezing your glutes at the top.",
    mistakes: ["Overarching the lower back at the top instead of squeezing the glutes", "Pushing through the toes instead of driving through the heels", "Not reaching full hip extension at the top of each rep"],
  },
  "Cable Pull-Through": {
    family: "hipHingeStandingSide",
    cue: "Facing away from the cable with the rope between your legs, hinge at the hips with a flat back, then drive your hips forward to standing, squeezing your glutes.",
    mistakes: ["Rounding the lower back at the bottom of the hinge", "Squatting the weight up with the knees instead of hinging at the hips", "Not finishing with a full hip extension / glute squeeze at the top"],
  },
  "Glute Bridge Machine": {
    family: "hipThrustSupineSide",
    cue: "Upper back supported, feet flat on the platform. Drive your hips up until your body forms a straight line, squeezing your glutes at the top, then lower with control.",
    mistakes: ["Overarching the lower back instead of squeezing the glutes", "Rushing through reps instead of pausing briefly at the top", "Pushing through the toes instead of the heels"],
  },
  "Barbell Curl": {
    family: "curlStandingFront",
    cue: "Standing with elbows pinned at your sides, curl the bar up toward your shoulders, then lower with control back to full extension.",
    mistakes: ["Swinging the elbows forward or using the hips/back to heave the weight up", "Only doing the top half of the rep instead of full extension at the bottom", "Letting the elbows drift backward behind the torso"],
  },
  "Dumbbell Curl": {
    family: "curlStandingFront",
    cue: "Standing with elbows pinned at your sides, curl the dumbbells up toward your shoulders, rotating your palms up as you go, then lower with control.",
    mistakes: ["Swinging the elbows forward or using body momentum to heave the weight up", "Letting the elbows drift out to the sides instead of staying pinned", "Rushing the lowering phase instead of controlling it"],
  },
  "Cable Curl": {
    family: "curlStandingFront",
    cue: "Standing with elbows pinned at your sides, curl the handle up toward your shoulders against the cable's constant tension, then lower with control.",
    mistakes: ["Leaning back to help move the weight instead of isolating the arms", "Letting the elbows drift forward away from the body", "Not controlling the weight on the way down"],
  },
  "Hammer Curl": {
    family: "curlStandingFront",
    cue: "Standing with elbows pinned at your sides and palms facing each other (neutral grip), curl the dumbbells up toward your shoulders, then lower with control.",
    mistakes: ["Swinging the elbows forward or using body momentum", "Letting the wrists rotate instead of keeping a neutral grip throughout", "Letting the elbows flare out away from the torso"],
  },
  "Cable Triceps Pushdown": {
    family: "tricepPushdownSide",
    cue: "Standing with elbows pinned at your sides, extend your forearms down until your arms are straight, then let the weight return under control.",
    mistakes: ["Elbows flaring away from the body instead of staying pinned", "Using the shoulders/body weight to help push the bar down", "Not extending all the way to a straight arm at the bottom"],
  },
  "Skull Crusher": {
    family: "skullCrusherLyingSide",
    cue: "Lying on a bench with your upper arms vertical, lower the bar toward your forehead by bending only at the elbow, then extend back up.",
    mistakes: ["Letting the elbows drift back toward the face/eyes instead of staying vertical", "Letting the upper arms move instead of keeping them fixed", "Flaring the elbows out wide instead of keeping them narrow"],
  },
  "Overhead Dumbbell Extension": {
    family: "overheadTricepExtFront",
    cue: "Standing or seated with the dumbbell overhead, lower it behind your head by bending only at the elbow, keeping your upper arms close to your head, then extend back up.",
    mistakes: ["Elbows flaring out wide instead of staying close to the head", "Arching the lower back to help move the weight", "Only using a partial range of motion"],
  },
  "Close-Grip Bench Press": {
    family: "pressLyingSide",
    cue: "Hands just inside shoulder width, elbows tucked close to your body. Lower the bar to your lower chest, then press back up focusing on triceps extension.",
    mistakes: ["Flaring the elbows out wide like a regular bench press", "Grip too narrow, which strains the wrists", "Bouncing the bar off the chest instead of a controlled touch"],
  },
  "Cable Crunch": {
    family: "cableCrunchKneelingSide",
    cue: "Kneeling below the cable with the rope at your head, crunch down by flexing your spine (not your hips), bringing your elbows toward your knees.",
    mistakes: ["Hips shifting back to help pull the weight instead of flexing the spine", "Pulling with the arms instead of the abs", "Using a fast, jerky tempo instead of a controlled squeeze"],
  },
  "Hanging Leg Raise": {
    family: "hangingLegRaiseFront",
    cue: "Hanging from a bar with arms static, raise your legs up by flexing at the hips (and knees if needed), then lower with control.",
    mistakes: ["Swinging the body / using momentum instead of a controlled raise", "Only raising a short distance instead of using a full range of motion", "Using the arms to help swing instead of keeping the upper body still"],
  },
  "Ab Wheel Rollout": {
    family: "abWheelKneelingSide",
    cue: "Kneeling with hands on the wheel, brace your core hard and roll forward as far as you can control, keeping a straight line from shoulders to knees, then roll back.",
    mistakes: ["Hips sagging toward the floor instead of staying braced", "Rolling out further than you can control and losing the position", "Using the shoulders to yank yourself back instead of the core"],
  },
  "Weighted Plank": {
    family: "plankSideHold",
    cue: "Forearms and toes on the floor, body in a straight line from head to heels. Brace your core and hold the position without sagging or piking your hips.",
    mistakes: ["Hips sagging toward the floor over the course of the hold", "Hips piking up too high instead of staying in line", "Holding your breath instead of breathing steadily throughout"],
  },
  "Standing Calf Raise": {
    family: "calfRaiseStandingSide",
    cue: "Standing with the balls of your feet on a platform, rise up onto your toes as high as you can, pause briefly, then lower until you feel a stretch in your calves.",
    mistakes: ["Bouncing at the bottom instead of a controlled stretch", "Only using a partial range of motion instead of full stretch to full raise", "Rushing through reps instead of pausing at the top"],
  },
  "Seated Calf Raise": {
    family: "calfRaiseSeatedSide",
    cue: "Seated with the pad on your thighs and balls of your feet on the platform, rise up onto your toes, pause, then lower until you feel a stretch.",
    mistakes: ["Bouncing at the bottom instead of a controlled stretch", "Only using a partial range of motion", "Rushing through reps instead of pausing at the top of each one"],
  },
};

function hasFormGuidance(exerciseName) {
  return Object.prototype.hasOwnProperty.call(FORM_GUIDANCE_DB, exerciseName);
}

// Builds the collapsed/expandable "Form guidance" block for one exercise.
// Returns an HTML string; caller appends it into the exercise card.
function buildFormGuidanceHTML(exerciseName) {
  const entry = FORM_GUIDANCE_DB[exerciseName];
  if (!entry) return "";
  const family = POSE_FAMILIES[entry.family];
  if (!family) return "";

  const frameEls = family.frames.map((frame, i) => renderFrame(frame, i));
  const withArrows = frameEls.join('<span class="arrow">&rarr;</span>');

  const mistakesHTML = entry.mistakes.map((m) => `<li>${m}</li>`).join("");

  return `
    <button class="form-toggle" aria-expanded="false" onclick="toggleFormGuidance(this)">
      <span>Form guidance</span>
      <span class="chevron">&#9656;</span>
    </button>
    <div class="form-section">
      <p class="form-label">Form</p>
      <p class="cue-text">${entry.cue}</p>
      <div class="mistakes">
        <p class="mistakes-label">Common mistakes</p>
        <ul>${mistakesHTML}</ul>
      </div>
      <div class="frames">${withArrows}</div>
    </div>`;
}

function toggleFormGuidance(btn) {
  const section = btn.nextElementSibling;
  const isOpen = section.classList.toggle("open");
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}
