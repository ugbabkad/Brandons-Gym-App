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
    `<g>${shapes(`fill="${OUTLINE}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"`)}` +
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
      ? [j[name][0] + sign * 14.5, j[name][1] + 4]
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
  // Arbitrary pad/box segments (incline bench, preacher pad, step box...): [x1,y1,x2,y2].
  const pads = (pose.pads || [])
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3a3f55" stroke-width="7" stroke-linecap="round"/>`)
    .join("");
  // Top-down bench (vertical pad behind a lying figure): [cx, y1, y2, width].
  const benchTop = pose.benchTop
    ? `<rect x="${pose.benchTop[0] - pose.benchTop[3] / 2}" y="${pose.benchTop[1]}" width="${pose.benchTop[3]}" height="${pose.benchTop[2] - pose.benchTop[1]}" rx="6" fill="#2e3244"/>`
    : "";
  // Dashed reference lines (e.g. shoulder width): [x1,y1,x2,y2].
  const guides = (pose.guides || [])
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f0b429" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>`)
    .join("");
  const guideLabel = pose.guideLabel
    ? `<text x="${pose.guideLabel[1]}" y="${pose.guideLabel[2]}" font-size="7.5" fill="#f0b429" text-anchor="middle" opacity="0.9">${pose.guideLabel[0]}</text>`
    : "";
  // Cable runs / rope: thin lines [x1,y1,x2,y2]. Handles: short solid bar, no plates.
  const cables = (pose.cables || [])
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9297a8" stroke-width="1.5" stroke-linecap="round"/>`)
    .join("");
  const ropes = (pose.ropes || [])
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b8bccb" stroke-width="2" stroke-linecap="round"/>`)
    .join("");
  const handles = (pose.handles || [])
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9297a8" stroke-width="3.5" stroke-linecap="round"/>`)
    .join("");
  // Dumbbells / kettlebells seen end-on: [[x,y], ...].
  const weights = (pose.weights || [])
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#9297a8" stroke="${OUTLINE}" stroke-width="2"/>`)
    .join("");
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
  // Hands drawn again on top of any bar/handle so the grip position reads.
  let grips = "";
  if ((pose.bar || pose.handles) && pose.joints) {
    grips = Object.keys(pose.joints)
      .filter((n) => /^hand(L|R)?$/.test(n))
      .map((n) => `<circle cx="${pose.joints[n][0]}" cy="${pose.joints[n][1]}" r="4.2" fill="${color}" stroke="${OUTLINE}" stroke-width="1.5"/>`)
      .join("");
  }
  return `<svg viewBox="${VIEWBOX}">${ground}${bench}${benchTop}${pads}${pose.ghost && pose.ghost.front ? "" : ghostSvg}${plateV}${cables}${body}${ropes}${handles}${bar}${plate}${weights}${grips}${pose.ghost && pose.ghost.front ? ghostSvg : ""}${guides}${guideLabel}${ghostLabel}</svg>`;
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
          joints: { shoulder: [60, 55], elbowL: [38, 78], handL: [33, 100], elbowR: [82, 78], handR: [87, 100],
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
          joints: { shoulder: [60, 55], elbowL: [38, 80], handL: [34, 103], elbowR: [82, 80], handR: [86, 103],
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
          joints: { shoulder: [60, 55], elbowL: [38, 80], handL: [31, 57], elbowR: [82, 80], handR: [89, 57],
                    hip: [60, 100], kneeL: [56, 130], footL: [54, 158], kneeR: [64, 130], footR: [66, 158] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { elbowBase: [38, 80], elbowG: [24, 62] },
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
          joints: { shoulder: [60, 50], elbowL: [41, 30], handL: [38, 10], elbowR: [79, 30], handR: [82, 10],
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
          joints: { shoulder: [60, 50], elbowL: [41, 30], handL: [35, 55], elbowR: [79, 30], handR: [85, 55],
                    hip: [60, 95], kneeL: [56, 125], footL: [54, 155], kneeR: [64, 125], footR: [66, 155] },
          bones: [["shoulder","elbowL"],["elbowL","handL"],["shoulder","elbowR"],["elbowR","handR"],
                   ["shoulder","hip"],["hip","kneeL"],["kneeL","footL"],["hip","kneeR"],["kneeR","footR"]],
          dots: ["shoulder","elbowL","elbowR","hip","kneeL","kneeR"],
          ghost: {
            joints: { elbowBase: [41, 30], elbowG: [16, 40] },
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

  // ---- Added with the exercise-library expansion (bodyweight / kettlebell / gym staples)
  pushUpSide: {
    frames: [
      {
        label: "Top — straight line, head to heels",
        pose: {
          head: [19, 92],
          ground: 141,
          joints: {shoulder:[32, 98], hand:[32, 140], hip:[66, 114], ankle:[100, 133], toe:[107, 140]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip"],
        },
      },
      {
        label: "Bottom — chest a fist from the floor",
        checkpoint: true,
        pose: {
          head: [19, 120],
          ground: 141,
          joints: {shoulder:[32, 125], elbow:[51, 118], hand:[34, 140], hip:[66, 131], ankle:[100, 137], toe:[107, 141]},
          bones: [["shoulder", "elbow"], ["elbow", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "elbow", "hip"],
          ghost: {
            joints: {hipBase:[66, 131], hipG:[64, 106]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips piking", labelPos: [38, 100],
          },
        },
      },
    ],
  },

  pikePushUpSide: {
    frames: [
      {
        label: "Start — hips high, inverted V",
        pose: {
          head: [36, 112],
          ground: 145,
          joints: {shoulder:[44, 100], hand:[34, 143], hip:[80, 68], ankle:[108, 141], toe:[115, 144]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip"],
        },
      },
      {
        label: "Bottom — head between hands",
        checkpoint: true,
        pose: {
          head: [38, 131],
          ground: 145,
          joints: {shoulder:[46, 118], elbow:[57, 128], hand:[36, 143], hip:[78, 76], ankle:[108, 141], toe:[115, 144]},
          bones: [["shoulder", "elbow"], ["elbow", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "elbow", "hip"],
          ghost: {
            joints: {hipBase:[78, 76], hipG:[78, 104]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips dropping", labelPos: [29, 112],
          },
        },
      },
    ],
  },

  invertedRowSide: {
    frames: [
      {
        label: "Start — arms straight, body flat",
        pose: {
          head: [28, 124],
          ground: 145,
          plate: [42, 85],
          joints: {shoulder:[42, 120], hand:[42, 85], hip:[76, 131], ankle:[108, 141], toe:[113, 145]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip"],
        },
      },
      {
        label: "Chest to bar — body stays straight",
        checkpoint: true,
        pose: {
          head: [30, 100],
          ground: 145,
          plate: [42, 85],
          joints: {shoulder:[44, 102], elbow:[58, 97], hand:[42, 85], hip:[76, 122], ankle:[108, 141], toe:[113, 145]},
          bones: [["shoulder", "elbow"], ["elbow", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "elbow", "hip"],
          ghost: {
            joints: {hipBase:[76, 122], hipG:[76, 138]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips sagging", labelPos: [33, 152],
          },
        },
      },
    ],
  },

  chestSupportedRowSide: {
    frames: [
      {
        label: "Start — chest on pad, arms hanging",
        pose: {
          head: [82, 82],
          ground: 150,
          pads: [[40, 148, 68, 113]],
          joints: {ankle:[36, 150], knee:[37, 136], hip:[44, 124], shoulder:[72, 92], hand:[82, 138]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Row — elbows up past torso",
        checkpoint: true,
        pose: {
          head: [82, 82],
          ground: 150,
          pads: [[40, 148, 68, 113]],
          joints: {ankle:[36, 150], knee:[37, 136], hip:[44, 124], shoulder:[72, 92], elbow:[60, 98], hand:[72, 120]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {shoulder:[72, 92], shoulderG:[62, 78]},
            bones: [["shoulder", "shoulderG"]],
            head: [72, 68],
            label: "avoid: chest peeling off", labelPos: [11, 60],
          },
        },
      },
    ],
  },

  straightArmPulldownSide: {
    frames: [
      {
        label: "Start — arms straight, up and forward",
        pose: {
          head: [70, 46],
          ground: 150,
          plate: [92, 38],
          joints: {ankle:[52, 150], knee:[53, 118], hip:[52, 92], shoulder:[64, 60], hand:[92, 38]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Sweep to thighs — arms stay straight",
        checkpoint: true,
        pose: {
          head: [70, 46],
          ground: 150,
          plate: [68, 98],
          joints: {ankle:[52, 150], knee:[53, 118], hip:[52, 92], shoulder:[64, 60], hand:[68, 98]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {shoulder:[64, 60], elbowG:[88, 80], handG:[68, 98]},
            bones: [["shoulder", "elbowG"], ["elbowG", "handG"]],
            label: "avoid: bending elbows", labelPos: [25, 116],
          },
        },
      },
    ],
  },

  backExtensionSide: {
    frames: [
      {
        label: "Bottom — hinged, back flat",
        pose: {
          head: [70, 144],
          pads: [[47, 94, 60, 107]],
          joints: {ankle:[20, 134], hip:[52, 100], shoulder:[64, 132]},
          bones: [["ankle", "hip"], ["hip", "shoulder"]],
          dots: ["shoulder", "hip"],
        },
      },
      {
        label: "Top — straight line, head to heels",
        checkpoint: true,
        pose: {
          head: [87, 66],
          pads: [[47, 94, 60, 107]],
          joints: {ankle:[20, 134], hip:[52, 100], shoulder:[76, 76]},
          bones: [["ankle", "hip"], ["hip", "shoulder"]],
          dots: ["shoulder", "hip"],
          ghost: {
            joints: {},
            curve: "M56,98 Q86,80 84,56",
            head: [86, 48],
            label: "avoid: arching past straight", labelPos: [2, 40],
          },
        },
      },
    ],
  },

  reversePecDeckFront: {
    frames: [
      {
        label: "Start — arms forward, hands together",
        pose: {
          head: [60, 36],
          bench: [35, 100, 85],
          joints: {shoulder:[60, 50], handL:[50, 70], handR:[70, 70], hip:[60, 98], kneeL:[50, 120], footL:[48, 150], kneeR:[70, 120], footR:[72, 150]},
          bones: [["shoulder", "handL"], ["shoulder", "handR"], ["shoulder", "hip"], ["hip", "kneeL"], ["kneeL", "footL"], ["hip", "kneeR"], ["kneeR", "footR"]],
          dots: ["shoulder", "hip", "kneeL", "kneeR"],
        },
      },
      {
        label: "Sweep out — squeeze shoulder blades",
        checkpoint: true,
        pose: {
          head: [60, 36],
          bench: [35, 100, 85],
          joints: {shoulder:[60, 50], handL:[14, 55], handR:[106, 55], hip:[60, 98], kneeL:[50, 120], footL:[48, 150], kneeR:[70, 120], footR:[72, 150]},
          bones: [["shoulder", "handL"], ["shoulder", "handR"], ["shoulder", "hip"], ["hip", "kneeL"], ["kneeL", "footL"], ["hip", "kneeR"], ["kneeR", "footR"]],
          dots: ["shoulder", "hip", "kneeL", "kneeR"],
          ghost: {
            joints: {},
            head: [60, 26],
            label: "avoid: shrugging up", labelPos: [33, 20],
          },
        },
      },
    ],
  },

  frontRaiseSide: {
    frames: [
      {
        label: "Start — weights at thighs",
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [66, 82],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], hand:[66, 82]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Raise to shoulder height",
        checkpoint: true,
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [92, 46],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], hand:[92, 46]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {},
            curve: "M57,76 Q46,60 42,44",
            head: [42, 36],
            label: "avoid: leaning back", labelPos: [2, 26],
          },
        },
      },
    ],
  },

  lungeSide: {
    frames: [
      {
        label: "Standing tall",
        pose: {
          head: [58, 30],
          ground: 150,
          joints: {ankle:[56, 150], toe:[72, 152], knee:[56, 113], hip:[57, 76], shoulder:[58, 42]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Bottom — both knees about 90°",
        checkpoint: true,
        pose: {
          head: [55, 58],
          ground: 150,
          joints: {shoulder:[55, 70], hip:[55, 108], frontKnee:[86, 113], frontAnkle:[88, 150], rearKnee:[32, 142], rearFoot:[8, 130]},
          bones: [["hip", "shoulder"], ["hip", "frontKnee"], ["frontKnee", "frontAnkle"], ["hip", "rearKnee"], ["rearKnee", "rearFoot"]],
          dots: ["shoulder", "hip", "frontKnee", "rearKnee"],
          ghost: {
            joints: {hip:[55, 108], shoulderG:[78, 76]},
            bones: [["hip", "shoulderG"]],
            head: [86, 68],
            label: "avoid: torso pitching", labelPos: [4, 44],
          },
        },
      },
    ],
  },

  stepUpSide: {
    frames: [
      {
        label: "Start — foot planted on the box",
        pose: {
          head: [58, 44],
          ground: 150,
          bench: [70, 114, 108],
          pads: [[74, 118, 74, 148], [104, 118, 104, 148]],
          joints: {shoulder:[58, 56], hip:[58, 90], frontKnee:[80, 100], frontAnkle:[88, 112], rearKnee:[56, 120], rearAnkle:[56, 150]},
          bones: [["hip", "shoulder"], ["hip", "frontKnee"], ["frontKnee", "frontAnkle"], ["hip", "rearKnee"], ["rearKnee", "rearAnkle"]],
          dots: ["shoulder", "hip", "frontKnee", "rearKnee"],
        },
      },
      {
        label: "Top — stand tall, back leg hangs",
        checkpoint: true,
        pose: {
          head: [86, 10],
          ground: 150,
          bench: [70, 114, 108],
          pads: [[74, 118, 74, 148], [104, 118, 104, 148]],
          joints: {shoulder:[86, 22], hip:[86, 56], frontKnee:[88, 84], frontAnkle:[88, 112], rearKnee:[76, 76], rearAnkle:[68, 102]},
          bones: [["hip", "shoulder"], ["hip", "frontKnee"], ["frontKnee", "frontAnkle"], ["hip", "rearKnee"], ["rearKnee", "rearAnkle"]],
          dots: ["shoulder", "hip", "frontKnee", "rearKnee"],
          ghost: {
            joints: {rearAnkle:[68, 102], rearG:[56, 148]},
            bones: [["rearAnkle", "rearG"]],
            label: "avoid: push off back foot", labelPos: [2, 24],
          },
        },
      },
    ],
  },

  hackSquatSide: {
    frames: [
      {
        label: "Top — legs extended",
        pose: {
          head: [62, 54],
          ground: 150,
          pads: [[26, 140, 52, 60]],
          joints: {shoulder:[57, 66], hip:[50, 104], knee:[60, 127], ankle:[66, 150], toe:[84, 152]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Bottom — thighs near parallel",
        checkpoint: true,
        pose: {
          head: [58, 74],
          ground: 150,
          pads: [[26, 140, 52, 60]],
          joints: {shoulder:[54, 86], hip:[46, 124], knee:[82, 120], ankle:[76, 150], toe:[94, 152]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {ankle:[76, 150], toeG:[76, 136]},
            bones: [["ankle", "toeG"]],
            label: "avoid: heels lifting", labelPos: [2, 24],
          },
        },
      },
    ],
  },

  seatedLegCurlSide: {
    frames: [
      {
        label: "Start — legs extended, thighs pinned",
        pose: {
          head: [40, 54],
          bench: [24, 110, 56],
          joints: {shoulder:[40, 66], hip:[42, 104], knee:[80, 104], ankle:[112, 112]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Curl — heels drive back under the seat",
        checkpoint: true,
        pose: {
          head: [40, 54],
          bench: [24, 110, 56],
          joints: {shoulder:[40, 66], hip:[42, 104], knee:[80, 104], ankle:[64, 140]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hipBase:[42, 104], hipG:[42, 88]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips lifting", labelPos: [2, 30],
          },
        },
      },
    ],
  },

  singleLegRdlSide: {
    frames: [
      {
        label: "Start — standing tall on one leg",
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [66, 84],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[56, 113], hip:[57, 76], shoulder:[58, 42], hand:[66, 84]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Hinge — free leg reaches back",
        checkpoint: true,
        pose: {
          head: [108, 76],
          ground: 150,
          plate: [92, 120],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[57, 118], hip:[60, 84], shoulder:[96, 80], hand:[92, 120], rearKnee:[40, 86], rearFoot:[20, 88]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"], ["hip", "rearKnee"], ["rearKnee", "rearFoot"]],
          dots: ["shoulder", "hip", "knee", "rearKnee"],
          ghost: {
            joints: {},
            curve: "M60,84 Q84,52 100,72",
            label: "avoid: rounding back", labelPos: [29, 44],
          },
        },
      },
    ],
  },

  nordicCurlSide: {
    frames: [
      {
        label: "Start — kneeling upright",
        pose: {
          head: [48, 60],
          ground: 150,
          pads: [[34, 153, 54, 153], [10, 138, 26, 138]],
          joints: {ankle:[20, 146], knee:[44, 148], hip:[46, 110], shoulder:[48, 74]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Lower slowly — body stays straight",
        checkpoint: true,
        pose: {
          head: [112, 116],
          ground: 150,
          pads: [[34, 153, 54, 153], [10, 138, 26, 138]],
          joints: {ankle:[20, 146], knee:[44, 148], hip:[70, 136], shoulder:[100, 124], hand:[106, 148]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {},
            curve: "M70,136 Q84,96 100,116",
            label: "avoid: folding at hips", labelPos: [2, 84],
          },
        },
      },
    ],
  },

  kbCleanPressSide: {
    frames: [
      {
        label: "Start — hinge, bell hangs between knees",
        pose: {
          head: [102, 56],
          ground: 150,
          plate: [88, 106],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[62, 118], hip:[68, 92], shoulder:[92, 66], hand:[88, 106]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Rack — bell at shoulder, elbow tucked",
        checkpoint: true,
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [66, 46],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], elbow:[66, 62], hand:[66, 46]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Press — arm locked out overhead",
        pose: {
          head: [56, 30],
          ground: 150,
          plate: [62, 6],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], hand:[62, 6]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
    ],
  },

  kbHaloSide: {
    frames: [
      {
        label: "Start — bell at chin, ribs down",
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [68, 48],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], elbow:[66, 62], hand:[68, 48]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Circle over the head",
        checkpoint: true,
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [56, 10],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], elbow:[72, 32], hand:[58, 12]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Behind the head — ribs stay down",
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [42, 36],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], elbow:[48, 58], hand:[42, 38]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {hip:[57, 76], shoulderG:[70, 44]},
            bones: [["hip", "shoulderG"]],
            label: "avoid: arching back", labelPos: [2, 22],
          },
        },
      },
    ],
  },

  preacherCurlSide: {
    frames: [
      {
        label: "Start — arm nearly straight on the pad",
        pose: {
          head: [46, 58],
          ground: 150,
          bench: [26, 120, 54],
          pads: [[60, 74, 78, 106]],
          plate: [86, 116],
          joints: {shoulder:[44, 72], hip:[42, 112], knee:[70, 120], ankle:[72, 150], elbow:[70, 90], hand:[86, 116]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Curl up — elbow stays on the pad",
        checkpoint: true,
        pose: {
          head: [46, 58],
          ground: 150,
          bench: [26, 120, 54],
          pads: [[60, 74, 78, 106]],
          plate: [62, 64],
          joints: {shoulder:[44, 72], hip:[42, 112], knee:[70, 120], ankle:[72, 150], elbow:[70, 90], hand:[62, 66]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {elbow:[70, 90], elbowG:[68, 72]},
            bones: [["elbow", "elbowG"]],
            label: "avoid: elbow lifting", labelPos: [2, 30],
          },
        },
      },
    ],
  },

  inclineCurlSide: {
    frames: [
      {
        label: "Start — arm hangs straight down",
        pose: {
          head: [60, 60],
          ground: 150,
          pads: [[30, 122, 46, 64], [24, 124, 46, 124]],
          plate: [62, 116],
          joints: {shoulder:[54, 74], hip:[42, 108], knee:[76, 112], ankle:[78, 150], hand:[62, 114]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Curl — elbow stays back",
        checkpoint: true,
        pose: {
          head: [60, 60],
          ground: 150,
          pads: [[30, 122, 46, 64], [24, 124, 46, 124]],
          plate: [74, 74],
          joints: {shoulder:[54, 74], hip:[42, 108], knee:[76, 112], ankle:[78, 150], elbow:[58, 96], hand:[74, 76]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {elbow:[58, 96], elbowG:[76, 90]},
            bones: [["elbow", "elbowG"]],
            label: "avoid: elbow drifting", labelPos: [2, 30],
          },
        },
      },
    ],
  },

  concentrationCurlSide: {
    frames: [
      {
        label: "Start — elbow braced on inner thigh",
        pose: {
          head: [70, 64],
          ground: 150,
          bench: [26, 120, 56],
          plate: [84, 130],
          joints: {shoulder:[62, 76], hip:[44, 112], knee:[84, 110], ankle:[86, 150], elbow:[76, 101], hand:[84, 128]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Curl up — squeeze at the top",
        checkpoint: true,
        pose: {
          head: [70, 64],
          ground: 150,
          bench: [26, 120, 56],
          plate: [72, 76],
          joints: {shoulder:[62, 76], hip:[44, 112], knee:[84, 110], ankle:[86, 150], elbow:[76, 101], hand:[72, 78]},
          bones: [["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {hip:[44, 112], shoulderG:[50, 62]},
            bones: [["hip", "shoulderG"]],
            head: [48, 52],
            label: "avoid: swinging torso", labelPos: [2, 24],
          },
        },
      },
    ],
  },

  kickbackSide: {
    frames: [
      {
        label: "Start — upper arm parallel to floor",
        pose: {
          head: [92, 86],
          ground: 150,
          plate: [52, 124],
          joints: {ankle:[42, 150], knee:[43, 122], hip:[40, 92], shoulder:[78, 90], elbow:[52, 94], hand:[52, 122]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Extend — arm straight back, elbow fixed",
        checkpoint: true,
        pose: {
          head: [92, 86],
          ground: 150,
          plate: [20, 98],
          joints: {ankle:[42, 150], knee:[43, 122], hip:[40, 92], shoulder:[78, 90], elbow:[52, 94], hand:[22, 98]},
          bones: [["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {elbow:[52, 94], elbowG:[52, 114]},
            bones: [["elbow", "elbowG"]],
            label: "avoid: elbow dropping", labelPos: [2, 30],
          },
        },
      },
    ],
  },

  benchDipSide: {
    frames: [
      {
        label: "Top — arms straight, hips off the bench",
        pose: {
          head: [46, 52],
          ground: 150,
          bench: [14, 102, 48],
          pads: [[22, 108, 22, 148]],
          joints: {shoulder:[46, 66], hand:[44, 100], hip:[56, 104], ankle:[104, 148], toe:[110, 151]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "hip"],
        },
      },
      {
        label: "Bottom — elbows about 90°",
        checkpoint: true,
        pose: {
          head: [48, 62],
          ground: 150,
          bench: [14, 102, 48],
          pads: [[22, 108, 22, 148]],
          joints: {shoulder:[48, 78], elbow:[34, 88], hand:[44, 101], hip:[58, 116], ankle:[104, 148], toe:[110, 151]},
          bones: [["shoulder", "elbow"], ["elbow", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"]],
          dots: ["shoulder", "elbow", "hip"],
          ghost: {
            joints: {hipBase:[58, 116], hipG:[76, 120]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips far from bench", labelPos: [2, 40],
          },
        },
      },
    ],
  },

  deadBugSide: {
    frames: [
      {
        label: "Start — arms up, knees over hips",
        pose: {
          head: [16, 128],
          ground: 140,
          joints: {shoulder:[30, 126], hip:[62, 126], hand:[30, 90], knee:[62, 94], foot:[90, 94]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["hip", "knee"], ["knee", "foot"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Extend opposite arm and leg — back flat",
        checkpoint: true,
        pose: {
          head: [16, 128],
          ground: 140,
          joints: {shoulder:[30, 126], hip:[62, 126], hand:[30, 90], handG:[2, 120], knee:[62, 94], foot:[90, 94], footG:[108, 124]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["shoulder", "handG"], ["hip", "knee"], ["knee", "foot"], ["hip", "footG"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hipBase:[46, 126], hipG:[46, 112]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: back arching", labelPos: [2, 84],
          },
        },
      },
    ],
  },

  bicycleCrunchSide: {
    frames: [
      {
        label: "Right knee in, left elbow across",
        pose: {
          head: [30, 106],
          ground: 140,
          joints: {shoulder:[42, 114], hip:[72, 128], elbow:[62, 100], hand:[34, 104], knee:[86, 104], foot:[98, 118], footG:[112, 130]},
          bones: [["shoulder", "hip"], ["shoulder", "elbow"], ["elbow", "hand"], ["hip", "knee"], ["knee", "foot"], ["hip", "footG"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Switch sides — slow, no neck pulling",
        checkpoint: true,
        pose: {
          head: [30, 106],
          ground: 140,
          joints: {shoulder:[42, 114], hip:[72, 128], elbow:[46, 94], hand:[34, 104], knee:[86, 104], foot:[98, 118], footG:[112, 130]},
          bones: [["shoulder", "hip"], ["shoulder", "elbow"], ["elbow", "hand"], ["hip", "knee"], ["knee", "foot"], ["hip", "footG"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
          ghost: {
            joints: {hand:[34, 104], handG:[22, 98]},
            bones: [["hand", "handG"]],
            label: "avoid: pulling the neck", labelPos: [2, 80],
          },
        },
      },
    ],
  },

  mountainClimberSide: {
    frames: [
      {
        label: "High plank — drive one knee in",
        pose: {
          head: [19, 92],
          ground: 141,
          joints: {shoulder:[32, 98], hand:[32, 140], hip:[66, 112], ankle:[100, 132], toe:[107, 140], frontKnee:[52, 124], frontFoot:[62, 140]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "ankle"], ["ankle", "toe"], ["hip", "frontKnee"], ["frontKnee", "frontFoot"]],
          dots: ["shoulder", "hip", "frontKnee"],
        },
      },
      {
        label: "Switch legs — hips stay level",
        checkpoint: true,
        pose: {
          head: [19, 92],
          ground: 141,
          joints: {shoulder:[32, 98], hand:[32, 140], hip:[66, 112], knee:[52, 124], foot:[62, 140], ankleG:[100, 132], toeG:[107, 140]},
          bones: [["shoulder", "hand"], ["shoulder", "hip"], ["hip", "knee"], ["knee", "foot"], ["hip", "ankleG"], ["ankleG", "toeG"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hipBase:[66, 112], hipG:[64, 88]},
            bones: [["hipBase", "hipG"]],
            label: "avoid: hips piking", labelPos: [2, 70],
          },
        },
      },
    ],
  },

  pallofPressSide: {
    frames: [
      {
        label: "Start — handle at your chest",
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [68, 52],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], elbow:[62, 62], hand:[68, 52]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "elbow"], ["elbow", "hand"]],
          dots: ["shoulder", "elbow", "hip", "knee"],
        },
      },
      {
        label: "Press out and hold — do not twist",
        checkpoint: true,
        pose: {
          head: [58, 30],
          ground: 150,
          plate: [100, 50],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], hand:[100, 50]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hip:[57, 76], shoulderG:[44, 46]},
            bones: [["hip", "shoulderG"]],
            head: [40, 36],
            label: "avoid: leaning away", labelPos: [2, 14],
          },
        },
      },
    ],
  },

  russianTwistFront: {
    frames: [
      {
        label: "Bell out to the right, chest tall",
        pose: {
          head: [62, 62],
          ground: 140,
          plate: [92, 104],
          joints: {shoulder:[62, 76], hip:[60, 120], hand:[92, 104], knee:[48, 100], foot:[50, 130], kneeG:[72, 100], footG:[70, 130]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["hip", "knee"], ["knee", "foot"], ["hip", "kneeG"], ["kneeG", "footG"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Rotate through the ribs to the left",
        checkpoint: true,
        pose: {
          head: [58, 62],
          ground: 140,
          plate: [28, 104],
          joints: {shoulder:[58, 76], hip:[60, 120], hand:[28, 104], knee:[48, 100], foot:[50, 130], kneeG:[72, 100], footG:[70, 130]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["hip", "knee"], ["knee", "foot"], ["hip", "kneeG"], ["kneeG", "footG"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hip:[60, 120], shoulderG:[76, 84]},
            bones: [["hip", "shoulderG"]],
            label: "avoid: arms only", labelPos: [2, 30],
          },
        },
      },
    ],
  },

  turkishGetUpSide: {
    frames: [
      {
        label: "Lying — bell straight up",
        pose: {
          head: [17, 140],
          ground: 150,
          plate: [30, 98],
          joints: {shoulder:[30, 138], hip:[62, 138], hand:[30, 100], knee:[78, 116], foot:[80, 142], ankleG:[104, 142]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["hip", "knee"], ["knee", "foot"], ["hip", "ankleG"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
      {
        label: "Sit up — propped on one hand",
        checkpoint: true,
        pose: {
          head: [51, 88],
          ground: 150,
          plate: [54, 58],
          joints: {shoulder:[54, 100], hip:[66, 136], hand:[54, 62], handG:[38, 136], knee:[80, 116], foot:[82, 142], ankleG:[104, 142]},
          bones: [["shoulder", "hip"], ["shoulder", "hand"], ["shoulder", "handG"], ["hip", "knee"], ["knee", "foot"], ["hip", "ankleG"]],
          dots: ["shoulder", "hip", "knee"],
          ghost: {
            joints: {hand:[54, 62], handG:[66, 64]},
            bones: [["hand", "handG"]],
            label: "avoid: arm drifting", labelPos: [2, 36],
          },
        },
      },
      {
        label: "Stand — bell locked overhead",
        pose: {
          head: [56, 30],
          ground: 150,
          plate: [60, 4],
          joints: {ankle:[55, 150], toe:[76, 152], knee:[55, 112], hip:[57, 76], shoulder:[58, 42], hand:[60, 4]},
          bones: [["ankle", "toe"], ["ankle", "knee"], ["knee", "hip"], ["hip", "shoulder"], ["shoulder", "hand"]],
          dots: ["shoulder", "hip", "knee"],
        },
      },
    ],
  },
};

// ===================== PER-EXERCISE TEXT =====================

// ===================== EXTRA VIEWS (front / top-down) =====================
// Side views can't show grip width, elbow flare, stance width or knee
// tracking, so some exercises get a second strip of frames from the front
// or from directly above. These families are built with small helpers
// (left-side joints are authored, right side is mirrored) and merged into
// POSE_FAMILIES; EXTRA_VIEWS maps exercise names to them.

const MID = 60;
const mirrorPt = ([x, y]) => [2 * MID - x, y];
// Where front-view arms attach (matches the arm-root offset in renderBody).
const armRoot = (shoulderY) => [MID - 14.5, shoulderY + 4];

// Builds a symmetric front/top pose. Pass LEFT-side limb joints (elbow,
// hand, knee, ankle, toe); right side is mirrored unless overridden with
// e.g. `handR`. Any other keys (bar, guides, ghost, ...) pass through.
function symPose(o) {
  const { head, shoulder, hip, elbow, hand, knee, ankle, toe, ...rest } = o;
  const joints = { shoulder, hip };
  const bones = [["shoulder", "hip"]];
  const pair = (name, p) => {
    if (!p) return false;
    joints[name + "L"] = p;
    joints[name + "R"] = rest[name + "R"] || mirrorPt(p);
    delete rest[name + "R"];
    return true;
  };
  if (pair("elbow", elbow) && pair("hand", hand)) {
    bones.push(["shoulder", "elbowL"], ["elbowL", "handL"], ["shoulder", "elbowR"], ["elbowR", "handR"]);
  }
  if (pair("knee", knee) && pair("ankle", ankle)) {
    bones.push(["hip", "kneeL"], ["kneeL", "ankleL"], ["hip", "kneeR"], ["kneeR", "ankleR"]);
    if (pair("toe", toe)) bones.push(["ankleL", "toeL"], ["ankleR", "toeR"]);
  }
  return { head, joints, bones, ...rest };
}

// Dashed shoulder-width reference lines.
const shoulderGuides = (shoulderY, bottomY) => {
  const [x] = armRoot(shoulderY);
  return {
    guides: [[x, 11, x, bottomY], [2 * MID - x, 11, 2 * MID - x, bottomY]],
    guideLabel: ["shoulder width", MID, 8],
  };
};

// Red dashed "wrong" upper arms (e.g. flared elbows), both sides.
const ghostArms = (shoulderY, elbowG, label, labelPos) => {
  const root = armRoot(shoulderY);
  return {
    joints: { sL: root, eL: elbowG, sR: mirrorPt(root), eR: mirrorPt(elbowG) },
    bones: [["sL", "eL"], ["sR", "eR"]],
    label, labelPos,
  };
};

// Red dashed "wrong" legs (e.g. knees caving in), both sides.
const ghostKnees = (hipY, kneeG, ankle, label, labelPos) => {
  const hipL = [MID - 4.5, hipY];
  return {
    joints: { hL: hipL, kL: kneeG, aL: ankle, hR: mirrorPt(hipL), kR: mirrorPt(kneeG), aR: mirrorPt(ankle) },
    bones: [["hL", "kL"], ["kL", "aL"], ["hR", "kR"], ["kR", "aR"]],
    label, labelPos,
    front: true, // legs would hide it otherwise
  };
};

// Shared bodies.
const LYING_TOP = { head: [60, 24], shoulder: [60, 38], hip: [60, 92], knee: [48, 116], ankle: [42, 134], toe: [40, 140], benchTop: [60, 16, 112, 30] };
const PRONE_TOP = { head: [60, 22], shoulder: [60, 36], hip: [60, 90], knee: [55, 122], ankle: [54, 150], toe: [54, 155] };
const STAND_FRONT = { head: [60, 26], shoulder: [60, 40], hip: [60, 90], knee: [51, 120], ankle: [51, 150], toe: [48, 156], ground: 157 };
const SQUAT_BOTTOM = { head: [60, 64], shoulder: [60, 78], hip: [60, 112], knee: [40, 118], ankle: [47, 150], toe: [42, 156], ground: 157 };
const SQUAT_STAND = { ...STAND_FRONT, knee: [49, 120], ankle: [48, 150], toe: [43, 156] };
const KNEES_CAVING = ghostKnees(112, [54, 128], [47, 150], "avoid: knees caving in", [26, 167]);

const EXTRA_VIEW_FAMILIES = {
  // Barbell Bench Press, Incline Barbell Bench Press
  benchTopBarbell: {
    title: "Top view — grip & elbows",
    frames: [
      {
        label: "Grip a bit wider than shoulders",
        pose: symPose({ ...LYING_TOP, elbow: [30, 64], hand: [32, 52], bar: [24, 52, 96], ...shoulderGuides(38, 84) }),
      },
      {
        label: "Elbows ~45° from torso",
        checkpoint: true,
        pose: symPose({
          ...LYING_TOP, elbow: [30, 64], hand: [32, 52], bar: [24, 52, 96],
          ghost: ghostArms(38, [20, 44], "avoid: elbows flared 90°", [16, 10]),
        }),
      },
    ],
  },

  // Close-Grip Bench Press
  closeGripBenchTop: {
    title: "Top view — hand spacing",
    frames: [
      {
        label: "Hands just inside shoulders",
        pose: symPose({
          ...LYING_TOP, elbow: [40, 72], hand: [50, 54], bar: [24, 54, 96], ...shoulderGuides(38, 84),
          ghost: {
            joints: { eL: [40, 72], hL: [57, 54], eR: [80, 72], hR: [63, 54] },
            bones: [["eL", "hL"], ["eR", "hR"]],
            label: "avoid: hands touching", labelPos: [20, 162],
          },
        }),
      },
      {
        label: "Elbows tucked to your sides",
        checkpoint: true,
        pose: symPose({
          ...LYING_TOP, elbow: [40, 72], hand: [50, 54], bar: [24, 54, 96],
          ghost: ghostArms(38, [20, 44], "avoid: elbows flared out", [18, 10]),
        }),
      },
    ],
  },

  // Dumbbell Bench Press, Incline Dumbbell Press, Kettlebell Floor Press
  benchTopDumbbell: {
    title: "Top view — elbow angle",
    frames: [
      {
        label: "Bottom — elbows ~45°",
        checkpoint: true,
        pose: symPose({
          ...LYING_TOP, elbow: [34, 62], hand: [36, 53], weights: [[36, 53], [84, 53]],
          ghost: ghostArms(38, [20, 44], "avoid: elbows flared 90°", [16, 10]),
        }),
      },
      {
        label: "Top — press up over chest",
        pose: symPose({ ...LYING_TOP, elbow: [44, 50], hand: [48, 50], weights: [[48, 50], [72, 50]] }),
      },
    ],
  },

  // Push-Up
  pushUpTop: {
    title: "Top view — hands & elbows",
    frames: [
      {
        label: "Hands just outside shoulders",
        pose: symPose({ ...PRONE_TOP, elbow: [38, 47], hand: [36, 51], ...shoulderGuides(36, 80) }),
      },
      {
        label: "Bottom — elbows back ~45°",
        checkpoint: true,
        pose: symPose({
          ...PRONE_TOP, elbow: [32, 64], hand: [36, 51],
          ghost: ghostArms(36, [18, 42], "avoid: elbows flared 90°", [16, 10]),
        }),
      },
    ],
  },

  // Diamond Push-Up
  diamondPushUpTop: {
    title: "Top view — hand placement",
    frames: [
      {
        label: "Hands together under chest",
        pose: symPose({ ...PRONE_TOP, elbow: [46, 52], hand: [55, 57], ...shoulderGuides(36, 80) }),
      },
      {
        label: "Elbows track back along ribs",
        checkpoint: true,
        pose: symPose({
          ...PRONE_TOP, elbow: [42, 72], hand: [55, 57],
          ghost: ghostArms(36, [20, 46], "avoid: elbows flared out", [18, 10]),
        }),
      },
    ],
  },

  // Barbell Back Squat
  squatFrontBar: {
    title: "Front view — stance & knees",
    frames: [
      {
        label: "Feet ~shoulder-width, toes slightly out",
        pose: symPose({ ...SQUAT_STAND, elbow: [40, 58], hand: [37, 42], bar: [22, 41, 98], ...shoulderGuides(40, 156) }),
      },
      {
        label: "Bottom — knees track over toes",
        checkpoint: true,
        pose: symPose({ ...SQUAT_BOTTOM, elbow: [40, 96], hand: [37, 80], bar: [22, 79, 98], ghost: KNEES_CAVING }),
      },
    ],
  },

  // Front Squat
  frontSquatFront: {
    title: "Front view — stance & knees",
    frames: [
      {
        label: "Feet ~shoulder-width, elbows up",
        pose: symPose({ ...SQUAT_STAND, elbow: [36, 50], hand: [44, 44], bar: [22, 44, 98], ...shoulderGuides(40, 156) }),
      },
      {
        label: "Bottom — knees track over toes",
        checkpoint: true,
        pose: symPose({ ...SQUAT_BOTTOM, elbow: [36, 88], hand: [44, 82], bar: [22, 82, 98], ghost: KNEES_CAVING }),
      },
    ],
  },

  // Goblet Squat
  gobletSquatFront: {
    title: "Front view — stance & knees",
    frames: [
      {
        label: "Feet ~shoulder-width, weight at chest",
        pose: symPose({ ...SQUAT_STAND, elbow: [44, 68], hand: [55, 58], plate: [60, 58], ...shoulderGuides(40, 156) }),
      },
      {
        label: "Bottom — elbows inside knees",
        checkpoint: true,
        pose: symPose({ ...SQUAT_BOTTOM, elbow: [47, 102], hand: [55, 92], plate: [60, 92], ghost: KNEES_CAVING }),
      },
    ],
  },

  // Conventional Deadlift
  deadliftFront: {
    title: "Front view — grip & stance",
    frames: [
      {
        label: "Grip just outside your legs",
        checkpoint: true,
        pose: symPose({
          head: [60, 64], shoulder: [60, 76], hip: [60, 100], knee: [51, 122], ankle: [51, 150], toe: [48, 156], ground: 157,
          elbow: [41, 104], hand: [40, 130], bar: [20, 130, 100],
          ghost: {
            joints: { eL: [41, 104], hL: [28, 130], eR: [79, 104], hR: [92, 130] },
            bones: [["eL", "hL"], ["eR", "hR"]],
            label: "avoid: grip too wide", labelPos: [30, 167],
          },
        }),
      },
      {
        label: "Lockout — bar on thighs",
        pose: symPose({ ...STAND_FRONT, elbow: [41, 68], hand: [40, 96], bar: [20, 96, 100] }),
      },
    ],
  },

  // Bulgarian Split Squat, Dumbbell Walking Lunge, Reverse Lunge
  lungeFront: {
    title: "Front view — knee tracking",
    frames: [
      {
        label: "Start — feet hip-width",
        pose: symPose({ ...STAND_FRONT, knee: [52, 120], ankle: [52, 150], toe: [50, 156], elbow: [38, 66], hand: [36, 90], weights: [[36, 92], [84, 92]] }),
      },
      {
        label: "Bottom — front knee over mid-foot",
        checkpoint: true,
        pose: symPose({
          head: [60, 48], shoulder: [60, 62], hip: [60, 108], ground: 157,
          knee: [50, 124], ankle: [50, 150], toe: [48, 156],
          kneeR: [68, 147], ankleR: [68, 151], toeR: [68, 153],
          elbow: [38, 88], hand: [36, 112], weights: [[36, 114], [84, 114]],
          ghost: {
            joints: { h: [55.5, 108], k: [64, 126], a: [50, 150] },
            bones: [["h", "k"], ["k", "a"]],
            front: true,
            label: "avoid: knee caving in", labelPos: [24, 167],
          },
        }),
      },
    ],
  },

  // Cable Triceps Pushdown (straight bar)
  pushdownFrontBar: {
    title: "Front view — elbows",
    frames: [
      {
        label: "Start — elbows pinned at sides",
        pose: symPose({ ...STAND_FRONT, elbow: [42, 70], hand: [50, 58], cables: [[60, 0, 60, 58]], handles: [[46, 58, 74, 58]] }),
      },
      {
        label: "Arms straight, elbows still",
        checkpoint: true,
        pose: symPose({
          ...STAND_FRONT, elbow: [42, 70], hand: [48, 96], cables: [[60, 0, 60, 96]], handles: [[44, 96, 76, 96]],
          ghost: ghostArms(40, [22, 64], "avoid: elbows flaring", [18, 10]),
        }),
      },
    ],
  },

  // Rope Triceps Pushdown
  pushdownFrontRope: {
    title: "Front view — elbows & rope",
    frames: [
      {
        label: "Start — elbows pinned at sides",
        pose: symPose({ ...STAND_FRONT, elbow: [42, 70], hand: [53, 60], cables: [[60, 0, 60, 52]], ropes: [[60, 52, 53, 60], [60, 52, 67, 60]] }),
      },
      {
        label: "Bottom — pull the rope apart",
        checkpoint: true,
        pose: symPose({
          ...STAND_FRONT, elbow: [42, 70], hand: [40, 98], cables: [[60, 0, 60, 76]], ropes: [[60, 76, 40, 98], [60, 76, 80, 98]],
          ghost: ghostArms(40, [22, 64], "avoid: elbows flaring", [18, 10]),
        }),
      },
    ],
  },

  // Face Pull
  facePullFront: {
    title: "Front view — elbow height",
    frames: [
      {
        label: "Start — arms reaching to cable",
        pose: symPose({ ...STAND_FRONT, elbow: [46, 52], hand: [53, 47], handles: [[53, 47, 67, 47]] }),
      },
      {
        label: "Finish — elbows high, hands by ears",
        checkpoint: true,
        pose: symPose({
          ...STAND_FRONT, elbow: [22, 42], hand: [36, 24],
          ghost: ghostArms(40, [34, 74], "avoid: elbows dropping", [16, 10]),
        }),
      },
    ],
  },
};
Object.assign(POSE_FAMILIES, EXTRA_VIEW_FAMILIES);

// Exercise name -> extra view families shown under the main diagram.
const EXTRA_VIEWS = {
  "Barbell Bench Press": ["benchTopBarbell"],
  "Incline Barbell Bench Press": ["benchTopBarbell"],
  "Close-Grip Bench Press": ["closeGripBenchTop"],
  "Dumbbell Bench Press": ["benchTopDumbbell"],
  "Incline Dumbbell Press": ["benchTopDumbbell"],
  "Kettlebell Floor Press": ["benchTopDumbbell"],
  "Push-Up": ["pushUpTop"],
  "Diamond Push-Up": ["diamondPushUpTop"],
  "Barbell Back Squat": ["squatFrontBar"],
  "Front Squat": ["frontSquatFront"],
  "Goblet Squat": ["gobletSquatFront"],
  "Conventional Deadlift": ["deadliftFront"],
  "Bulgarian Split Squat": ["lungeFront"],
  "Dumbbell Walking Lunge": ["lungeFront"],
  "Reverse Lunge": ["lungeFront"],
  "Cable Triceps Pushdown": ["pushdownFrontBar"],
  "Rope Triceps Pushdown": ["pushdownFrontRope"],
  "Face Pull": ["facePullFront"],
};


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

  // ---- Added in the exercise-library expansion (no `family` = text-only guidance, no diagram)
  "Dumbbell Bench Press": {
    family: "pressLyingSide",
    cue: "Lie back with the dumbbells at chest level, feet flat, shoulder blades pinched down into the bench. Press up until your arms are extended, then lower with control until your elbows are just below the bench.",
    mistakes: ["Letting the dumbbells drift wide of the chest instead of tracking over it", "Dropping the weights fast and bouncing out of the bottom", "Lifting the hips or shoulders off the bench to grind out reps"],
  },
  "Incline Barbell Bench Press": {
    family: "pressLyingSide",
    cue: "Set the bench to about 30 degrees. Lower the bar to your upper chest with elbows slightly tucked, then press it back up over your shoulders.",
    mistakes: ["Setting the bench too steep, which turns it into a shoulder press", "Bouncing the bar off the chest", "Flaring the elbows straight out to the sides"],
  },
  "Pec Deck": {
    family: "flyLyingSide",
    cue: "Adjust the seat so the handles sit at chest height. With a slight bend in your elbows, bring the handles together in front of your chest, squeeze, and return slowly until you feel a stretch.",
    mistakes: ["Seat too high, which shifts the work to the shoulders", "Letting the handles slam back and overstretching the shoulder joint", "Shrugging the shoulders toward the ears"],
  },
  "Push-Up": {
    family: "pushUpSide",
    cue: "Hands just outside shoulder width, body in one straight line from head to heels. Lower until your chest is about a fist from the floor, then press back up without letting the hips sag.",
    mistakes: ["Hips sagging or piking instead of holding a straight line", "Only going down a few inches", "Flaring the elbows straight out to 90 degrees"],
  },
  "Kettlebell Floor Press": {
    family: "pressLyingSide",
    cue: "Lie on the floor with the kettlebell held by the handle, forearm vertical. Lower until your upper arm touches the floor, pause briefly, then press back up.",
    mistakes: ["Letting the wrist bend back under the weight of the bell", "Bouncing the arm off the floor at the bottom", "Arching the lower back to press the bell up"],
  },
  "Chin-Up": {
    family: "hangPullFront",
    cue: "Grip the bar shoulder-width with palms facing you. Start from a full hang, pull your chest toward the bar until your chin clears it, then lower all the way down with control.",
    mistakes: ["Swinging or kipping to get over the bar", "Stopping short of a full hang at the bottom", "Craning the neck up to get the chin over"],
  },
  "Inverted Row": {
    family: "invertedRowSide",
    cue: "Set a bar at about waist height and hang underneath it with your body in a straight line. Pull your chest to the bar, squeezing your shoulder blades together, then lower with control.",
    mistakes: ["Hips sagging so the body stops being a straight line", "Pulling with the arms only instead of driving the elbows back", "Cutting the range short instead of reaching full arm extension"],
  },
  "Chest-Supported Dumbbell Row": {
    family: "chestSupportedRowSide",
    cue: "Lie chest-down on an incline bench with a dumbbell in each hand. Row the weights toward your hips, squeezing your shoulder blades together, then lower until your arms are fully extended.",
    mistakes: ["Lifting the chest off the pad to add momentum", "Shrugging the shoulders up instead of pulling the elbows back", "Not letting the arms fully extend between reps"],
  },
  "Straight-Arm Pulldown": {
    family: "straightArmPulldownSide",
    cue: "Stand facing a high cable with a straight bar, hinged forward slightly with arms nearly straight. Sweep the bar down to your thighs, feeling your lats squeeze, then let it rise back up with control.",
    mistakes: ["Bending the elbows until it becomes a triceps pushdown", "Using body swing instead of the lats", "Letting the bar rise past shoulder height and losing tension"],
  },
  "Machine Row": {
    family: "rowSideProfile",
    cue: "Sit with your chest against the pad and grab the handles. Pull your elbows back past your torso, squeeze your shoulder blades together, then return slowly to a full stretch.",
    mistakes: ["Leaning back to use momentum instead of the back muscles", "Shrugging the shoulders toward the ears", "Cutting the stretch short at the start of each rep"],
  },
  "Kettlebell Bent-Over Row": {
    family: "rowSideProfile",
    cue: "Hinge at the hips with a flat back, kettlebell hanging from one hand. Row the bell toward your hip, keeping the elbow close, then lower until your arm is straight.",
    mistakes: ["Rounding the lower back instead of keeping it flat", "Twisting the torso to swing the bell up", "Pulling toward the chest instead of the hip"],
  },
  "Back Extension": {
    family: "backExtensionSide",
    cue: "Set the pad at hip height and cross your arms over your chest. Lower your torso with a flat back until you feel a hamstring stretch, then raise until your body forms a straight line. Do not go past that.",
    mistakes: ["Hyperextending the lower back past a straight line at the top", "Rounding the back on the way down", "Swinging fast instead of a smooth, controlled tempo"],
  },
  "Arnold Press": {
    family: "overheadPressFront",
    cue: "Start with the dumbbells in front of your chest, palms facing you. As you press up, rotate your palms outward so they face forward at the top, then reverse the rotation on the way down.",
    mistakes: ["Rushing the rotation instead of turning smoothly through the press", "Leaning back and turning it into an incline press", "Using so much weight that the rotation is lost"],
  },
  "Machine Shoulder Press": {
    family: "overheadPressFront",
    cue: "Set the seat so the handles start at about shoulder height. Press up until your arms are extended without hard-locking the elbows, then lower with control.",
    mistakes: ["Seat set so low that the shoulders are stressed at the bottom", "Arching the lower back off the pad", "Shrugging the shoulders up during the press"],
  },
  "Pike Push-Up": {
    family: "pikePushUpSide",
    cue: "From a push-up position, walk the feet in and raise your hips so your body forms an upside-down V. Bend your elbows to lower your head toward the floor between your hands, then press back up.",
    mistakes: ["Keeping the hips low so it is just a regular push-up", "Flaring the elbows wide instead of tracking them back", "Landing on the neck instead of lowering the head between the hands"],
  },
  "Reverse Pec Deck": {
    family: "reversePecDeckFront",
    cue: "Sit facing the pad, arms extended at shoulder height. Sweep the handles back and out in a wide arc, squeezing your rear delts, then return slowly.",
    mistakes: ["Using the arms to pull instead of leading with the elbows", "Shrugging the shoulders up", "Using so much weight that the torso rocks back and forth"],
  },
  "Dumbbell Front Raise": {
    family: "frontRaiseSide",
    cue: "Stand tall with the dumbbells in front of your thighs. Raise them straight ahead to about shoulder height with a slight elbow bend, then lower with control.",
    mistakes: ["Swinging the torso to heave the weights up", "Raising the arms above shoulder height", "Dropping the weights fast on the way down"],
  },
  "Kettlebell Overhead Press": {
    family: "overheadPressFront",
    cue: "Hold the kettlebell in the rack position, resting against your forearm with your wrist straight. Squeeze your glutes and press it straight overhead until your arm is locked out beside your ear, then lower back to the rack.",
    mistakes: ["Leaning back and pressing with the lower back", "Letting the wrist bend so the bell tips backward", "Pressing the bell out in front of you instead of straight up"],
  },
  "Kettlebell Clean and Press": {
    family: "kbCleanPressSide",
    cue: "Start with the bell between your feet. Hinge and snap the hips forward, pulling the bell up to the rack position close to your body, then press it overhead. Lower it back to the rack and then down under control.",
    mistakes: ["Curling the bell up with the arm instead of driving with the hips", "Letting the bell swing out and bang against the wrist or forearm", "Skipping the reset and pressing from a loose, unstable rack position"],
  },
  "Kettlebell Halo": {
    family: "kbHaloSide",
    cue: "Hold the kettlebell upside down by the horns at chest height. Circle it around your head, keeping it close to your face and your ribs down, then reverse direction on the next set.",
    mistakes: ["Arching the lower back as the bell passes behind the head", "Letting the bell drift far from the head", "Rushing the circles instead of keeping a slow, smooth pace"],
  },
  "Goblet Squat": {
    family: "squatSideProfile",
    cue: "Hold the kettlebell by the horns against your chest. Sit down between your knees with your chest up and elbows inside the knees, then drive through your whole foot to stand.",
    mistakes: ["Letting the chest fall forward as you descend", "Heels lifting off the floor", "Knees caving inward on the way up"],
  },
  "Hack Squat": {
    family: "hackSquatSide",
    cue: "Place your shoulders under the pads with your feet forward on the platform. Lower until your thighs are at least parallel to the platform, then push through your whole foot to stand.",
    mistakes: ["Feet placed so far forward that the knees never bend", "Lifting the heels at the bottom", "Locking the knees hard at the top"],
  },
  "Dumbbell Walking Lunge": {
    family: "lungeSide",
    cue: "Hold a dumbbell in each hand. Step forward into a lunge until both knees are bent to about 90 degrees, then drive through the front heel to bring the back leg through into the next step.",
    mistakes: ["Taking steps so short that the front knee travels far past the toes", "Letting the torso lean forward instead of staying tall", "Front knee caving inward as you push up"],
  },
  "Reverse Lunge": {
    family: "lungeSide",
    cue: "Stand tall and step one foot straight back, lowering until both knees are bent to about 90 degrees. Push through the front heel to return to standing, and alternate legs.",
    mistakes: ["Stepping back onto a tightrope so balance is lost", "Letting the front knee cave inward", "Pushing off the back foot instead of driving through the front heel"],
  },
  "Step-Up": {
    family: "stepUpSide",
    cue: "Hold a dumbbell in each hand and place one foot fully on a bench or box. Drive through that heel to stand up tall, then lower back down slowly. Complete all reps on one side before switching.",
    mistakes: ["Pushing off the trailing foot instead of driving through the working leg", "Using a box so high that the hips rotate to get up", "Dropping back down instead of lowering with control"],
  },
  "Conventional Deadlift": {
    family: "hipHingeStandingSide",
    cue: "Stand with the bar over mid-foot, hinge down and grip just outside your legs. Brace your core, push the floor away, and stand tall with the bar dragging up your legs, then lower it the same way.",
    mistakes: ["Rounding the lower back off the floor", "Letting the bar drift away from the legs", "Jerking the bar off the floor instead of building tension first"],
  },
  "Dumbbell Romanian Deadlift": {
    family: "hipHingeStandingSide",
    cue: "Stand tall with a dumbbell in each hand. Push your hips back with soft knees, lowering the weights along your legs until you feel a hamstring stretch, then squeeze your glutes to stand.",
    mistakes: ["Bending the knees too much so it turns into a squat", "Rounding the back to reach the weights lower", "Letting the dumbbells drift away from the legs"],
  },
  "Good Morning": {
    family: "hipHingeStandingSide",
    cue: "With a barbell across your upper back, soften your knees and push your hips straight back, keeping your back flat, until your torso is near parallel to the floor. Drive your hips forward to stand.",
    mistakes: ["Rounding the lower back", "Bending the knees so much that it turns into a squat", "Loading heavy before the hinge pattern is solid"],
  },
  "Seated Leg Curl": {
    family: "seatedLegCurlSide",
    cue: "Sit with the pad resting just above your heels and your thighs held down. Curl your heels back and under the seat, squeeze your hamstrings, then return slowly.",
    mistakes: ["Lifting the hips or thighs off the seat", "Using momentum instead of a controlled curl", "Cutting the range short at the top"],
  },
  "Kettlebell Swing": {
    family: "hipHingeStandingSide",
    cue: "Hinge back with the bell between your legs, then snap your hips forward hard so the bell floats to about chest height. Let it swing back between your legs as you hinge again.",
    mistakes: ["Squatting the swing instead of hinging the hips back", "Lifting the bell with the arms instead of the hip snap", "Leaning back at the top instead of standing tall"],
  },
  "Kettlebell Deadlift": {
    family: "hipHingeStandingSide",
    cue: "Stand with the kettlebell between your feet. Hinge down and grab the handle with a flat back, push through the floor to stand tall, then lower it back down under control.",
    mistakes: ["Rounding the back to reach the bell", "Squatting down instead of hinging back", "Yanking the bell off the floor without tension"],
  },
  "Single-Leg Kettlebell RDL": {
    family: "singleLegRdlSide",
    cue: "Hold a kettlebell in one hand. Balance on the opposite leg, hinge at the hip and reach the bell toward the floor as your free leg extends behind you, then squeeze the glute to stand tall.",
    mistakes: ["Rotating the hips open instead of keeping them square", "Rounding the back to reach lower", "Bending the standing knee too much"],
  },
  "Glute Bridge": {
    family: "hipThrustSupineSide",
    cue: "Lie on your back with knees bent and feet flat. Press through your heels to lift the hips until your body forms a straight line from shoulders to knees, squeeze the glutes, then lower.",
    mistakes: ["Overarching the lower back at the top", "Pushing through the toes instead of the heels", "Rushing reps with no pause at the top"],
  },
  "Single-Leg Glute Bridge": {
    family: "hipThrustSupineSide",
    cue: "Lie on your back with one knee bent and the other leg extended. Press through the heel of the bent leg to lift the hips, squeeze the glute, then lower with control. Finish all reps on one side before switching.",
    mistakes: ["Letting the hips rotate or drop on the free side", "Overarching the lower back at the top", "Pushing through the toes instead of the heel"],
  },
  "Nordic Hamstring Curl": {
    family: "nordicCurlSide",
    cue: "Kneel with your ankles anchored under a pad or held by a partner. Keeping your body straight from knees to head, lower yourself toward the floor as slowly as you can, then catch yourself and push back up.",
    mistakes: ["Breaking at the hips instead of keeping the body straight", "Dropping fast with no control", "Skipping the hands-assisted push back up when needed"],
  },
  "Preacher Curl": {
    family: "preacherCurlSide",
    cue: "Sit with your upper arms flat on the pad and grip the bar shoulder-width. Curl the bar up without lifting your elbows, then lower until your arms are nearly straight.",
    mistakes: ["Lifting the elbows off the pad to swing the weight up", "Dropping the weight fast at the bottom, which stresses the elbows", "Cutting the range short instead of reaching full extension"],
  },
  "Incline Dumbbell Curl": {
    family: "inclineCurlSide",
    cue: "Sit back on a bench set to about 45-60 degrees with your arms hanging straight down. Curl the dumbbells up without letting your elbows drift forward, then lower fully to feel the stretch.",
    mistakes: ["Letting the elbows drift forward to shorten the range", "Swinging the weights up with the shoulders", "Not lowering all the way to the stretched position"],
  },
  "Concentration Curl": {
    family: "concentrationCurlSide",
    cue: "Sit on a bench and brace your elbow against the inside of your thigh. Curl the dumbbell up toward your shoulder, squeeze at the top, then lower under control.",
    mistakes: ["Swinging the torso to help lift the weight", "Letting the elbow lift off the thigh", "Rushing the lowering phase"],
  },
  "Rope Triceps Pushdown": {
    family: "tricepPushdownSide",
    cue: "Stand facing a high cable with the rope in both hands and elbows pinned at your sides. Push down and pull the ends of the rope apart at the bottom, squeezing your triceps, then return with control.",
    mistakes: ["Elbows flaring out or drifting forward", "Leaning over the rope and using body weight", "Not spreading the rope at the bottom, cutting the contraction short"],
  },
  "Triceps Kickback": {
    family: "kickbackSide",
    cue: "Hinge forward with a flat back and your upper arm parallel to the floor, elbow bent to 90 degrees. Extend your forearm back until the arm is straight, squeeze, then return without letting the elbow drop.",
    mistakes: ["Letting the upper arm drop so the elbow is no longer fixed", "Swinging the weight back with momentum", "Using a weight so heavy that the torso rocks"],
  },
  "Bench Dip": {
    family: "benchDipSide",
    cue: "Sit on the edge of a bench with hands gripping beside your hips and legs out in front. Slide your hips off the bench and lower until your elbows are bent to about 90 degrees, then press back up.",
    mistakes: ["Letting the shoulders roll forward and drop too deep", "Sliding the hips too far away from the bench", "Flaring the elbows instead of keeping them pointing back"],
  },
  "Diamond Push-Up": {
    family: "pushUpSide",
    cue: "Place your hands close together beneath your chest with the thumbs and index fingers forming a diamond. Keep your body in a straight line and lower your chest to your hands, then press back up.",
    mistakes: ["Hips sagging or piking instead of holding a straight line", "Flaring the elbows wide instead of tracking them back", "Only lowering halfway"],
  },
  "Kettlebell Overhead Triceps Extension": {
    family: "overheadTricepExtFront",
    cue: "Hold the kettlebell by the horns with both hands overhead. Keeping your elbows pointing forward, lower the bell behind your head, then extend your arms back to the top.",
    mistakes: ["Elbows flaring out to the sides", "Arching the lower back as the weight goes behind the head", "Using a weight so heavy that the elbows can't stay in"],
  },
  "Dead Bug": {
    family: "deadBugSide",
    cue: "Lie on your back with your arms pointing up and knees bent over your hips. Keeping your lower back flat on the floor, extend the opposite arm and leg away from you, then return and alternate sides.",
    mistakes: ["Letting the lower back arch off the floor", "Moving fast instead of slow and controlled", "Holding the breath instead of exhaling as the limbs extend"],
  },
  "Bicycle Crunch": {
    family: "bicycleCrunchSide",
    cue: "Lie on your back with your hands lightly behind your head. Bring one knee toward your chest while rotating the opposite elbow toward it, then switch sides in a slow pedaling motion.",
    mistakes: ["Pulling on the neck with the hands", "Rushing through the rotation", "Letting the lower back arch off the floor"],
  },
  "Hanging Knee Raise": {
    family: "hangingLegRaiseFront",
    cue: "Hang from a bar with a firm grip. Curl your knees up toward your chest by tilting the pelvis, then lower with control without swinging.",
    mistakes: ["Swinging the legs to build momentum", "Using only the hip flexors instead of curling the pelvis", "Dropping the legs fast at the bottom"],
  },
  "Mountain Climber": {
    family: "mountainClimberSide",
    cue: "Start in a high plank with hands under shoulders. Drive one knee toward your chest, then switch legs in a quick running motion while keeping your hips level. Count each knee drive as one rep.",
    mistakes: ["Hips piking up or sagging down", "Bouncing so much that the shoulders lose position", "Cutting each knee drive short"],
  },
  "Pallof Press": {
    family: "pallofPressSide",
    cue: "Stand side-on to a cable at chest height with the handle held to your chest. Press the handle straight out in front of you and hold it there without letting the cable rotate you, then return.",
    mistakes: ["Letting the torso twist toward the cable", "Leaning away from the cable", "Rushing instead of holding the extension for a beat"],
  },
  "Kettlebell Russian Twist": {
    family: "russianTwistFront",
    cue: "Sit with knees bent and your torso leaned back slightly, holding the kettlebell at your chest. Rotate your torso to tap the bell beside each hip, moving from your ribs rather than just swinging the arms.",
    mistakes: ["Swinging the arms while the torso stays still", "Rounding the back", "Letting the feet crash down when they are lifted"],
  },
  "Kettlebell Turkish Get-Up": {
    family: "turkishGetUpSide",
    cue: "Lie on your back holding the kettlebell straight up with one arm, eyes on the bell. Rise to sitting, lift the hips, sweep the leg under you, and stand up, then reverse each step to lie back down.",
    mistakes: ["Letting the arm bend or drift so the bell isn't stacked over the shoulder", "Rushing through the transitions", "Starting heavy before the movement pattern is smooth"],
  },
  "Single-Leg Calf Raise": {
    family: "calfRaiseStandingSide",
    cue: "Stand on the ball of one foot on a step, with a light hand on a wall for balance. Lower the heel below the step, then rise onto your toes as high as you can. Finish all reps on one side before switching.",
    mistakes: ["Bouncing at the bottom instead of a controlled stretch", "Only using a partial range of motion", "Rolling toward the outside of the foot"],
  },
  "Dumbbell Calf Raise": {
    family: "calfRaiseStandingSide",
    cue: "Stand on the balls of your feet on a step holding a dumbbell at your side. Rise onto your toes as high as you can, pause, then lower until you feel a stretch.",
    mistakes: ["Bouncing at the bottom", "Cutting the range short instead of full stretch to full raise", "Rushing through the reps"],
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
  // `family` is optional: entries without one get the text cue and common
  // mistakes but no stick-figure diagram.
  const family = entry.family ? POSE_FAMILIES[entry.family] : null;

  const stripHTML = (fam) =>
    `<div class="frames">${fam.frames.map((frame, i) => renderFrame(frame, i)).join('<span class="arrow">&rarr;</span>')}</div>`;

  let framesHTML = "";
  if (family) {
    // Extra front/top views (grip width, elbow flare, knee tracking...) go
    // under the main diagram; when present, each strip gets a view label.
    const extras = (entry.views || EXTRA_VIEWS[exerciseName] || [])
      .map((key) => POSE_FAMILIES[key])
      .filter(Boolean);
    if (extras.length) {
      const mainTitle = /Front/.test(entry.family) ? "Front view" : "Side view";
      framesHTML =
        `<p class="view-label">${mainTitle}</p>${stripHTML(family)}` +
        extras.map((fam) => `<p class="view-label">${fam.title || "Another angle"}</p>${stripHTML(fam)}`).join("");
    } else {
      framesHTML = stripHTML(family);
    }
  }

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
      ${framesHTML}
    </div>`;
}

function toggleFormGuidance(btn) {
  const section = btn.nextElementSibling;
  const isOpen = section.classList.toggle("open");
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}
