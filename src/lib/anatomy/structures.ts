import { DIGITS, type Vec3 } from "./skin";

export type LayerId = "skin" | "fat" | "veins" | "fascia" | "nerves" | "arteries" | "muscles" | "bones";
export type Pattern = "H" | "M";
export type Rating = "first" | "second" | "third" | "alternate" | "avoid" | "hazard" | "landmark";

/** Control point: on the limb surface (x, θ°, depth), under the dorsal hand skin (x, y, depth), or absolute. */
export type Pt = { s: Vec3 } | { d: Vec3 } | { p: Vec3 };
const S = (x: number, theta: number, depth = 0.3): Pt => ({ s: [x, theta, depth] });
const D = (x: number, y: number, depth = 0.24): Pt => ({ d: [x, y, depth] });
const P = (x: number, y: number, z: number): Pt => ({ p: [x, y, z] });

/** Radius along a path: constant, or [t, r] keys with t in 0..1. */
export type Radius = number | [number, number][];

export type Part =
  | { kind: "tube"; pts: Pt[]; r: Radius; flat?: number; valves?: number[] }
  | { kind: "blob"; c: Vec3; r: Vec3 };

export interface StructureDef {
  id: string;
  name: string;
  layer: Exclude<LayerId, "skin" | "fat" | "fascia">;
  parts: Part[];
  color?: string;
  pattern?: Pattern;
  rating?: Rating;
  /** Shown as a floating label when labels are on. */
  label?: boolean;
  summary: string;
  clinical: string;
  stats?: [string, string][];
}

const tube = (pts: Pt[], r: Radius, flat?: number, valves?: number[]): Part => ({ kind: "tube", pts, r, flat, valves });
const blob = (c: Vec3, r: Vec3): Part => ({ kind: "blob", c, r });

export const RATING_LABEL: Record<Rating, string> = {
  first: "1st choice",
  second: "2nd choice",
  third: "Last resort",
  alternate: "Alternative site",
  avoid: "Do not use",
  hazard: "Hazard",
  landmark: "Landmark",
};

export const RATING_COLOR: Record<Rating, string> = {
  first: "#35e0c2",
  second: "#8fd14f",
  third: "#f5a524",
  alternate: "#7cb7ff",
  avoid: "#ff5a5f",
  hazard: "#ff5a5f",
  landmark: "#b9c4d6",
};

// ───────────────────────────── Veins ─────────────────────────────

const CEPHALIC_FOREARM: Pt[] = [D(29.6, 3.3), S(27, -48), S(23, -20), S(18, 15), S(12, 42), S(6, 56), S(3, 60)];
const CEPHALIC_ARM: Pt[] = [S(3, 60), S(0, 58), S(-5, 52), S(-12, 48), S(-18.4, 50)];
const BASILIC_FOREARM: Pt[] = [D(29.8, -3.0), S(27, 222), S(22, 212), S(15, 195), S(9, 170), S(4, 148), S(0, 138), S(-3, 135)];
const BASILIC_ARM: Pt[] = [S(-3, 135), S(-6, 138, 0.5), S(-9, 142, 1.0), S(-13, 148, 1.6), S(-18.4, 150, 1.9)];

/** Dorsal points over the 2nd, 3rd and 4th web spaces, where digital veins unite. */
const WEBS: Vec3[] = [
  [36.0, 2.05, 0.22],
  [36.2, 0.0, 0.22],
  [35.5, -1.95, 0.22],
];

/** Dorsal digital vein along one side of a finger (side +1 radial, −1 ulnar), ending at `end`. */
function digitalVein(digit: number, side: 1 | -1, end: Pt[]): Part {
  const j = DIGITS[digit].joints;
  const r = DIGITS[digit].radii;
  const at = (k: number, u: number) =>
    D(j[k][0] + (j[k + 1][0] - j[k][0]) * u, j[k][1] + (j[k + 1][1] - j[k][1]) * u + side * r[k] * 0.55, 0.2);
  return tube([at(2, 0.3), at(1, 0.5), at(0, 0.95), at(0, 0.5), ...end], 0.05);
}

const VEINS: StructureDef[] = [
  {
    id: "median-cubital",
    name: "Median cubital vein",
    layer: "veins",
    pattern: "H",
    rating: "first",
    label: true,
    parts: [tube([S(3, 60), S(1.8, 78, 0.28), S(0.3, 100, 0.28), S(-1.4, 120, 0.28), S(-3, 135)], 0.24, 1, [0.12, 0.88])],
    summary:
      "Oblique communication across the antecubital fossa, running upward and medially from the cephalic vein to the basilic vein.",
    clinical:
      "First-choice venipuncture site in the H-shaped pattern. It is large, close to the surface, well anchored by surrounding tissue so it rolls least, and is the least painful to enter. The bicipital aponeurosis lies directly beneath it and shields the brachial artery and median nerve — but only if the needle stays shallow (≤30°).",
    stats: [["Typical calibre", "4–6 mm with tourniquet"], ["Depth", "2–5 mm"], ["Needle", "21G straight, 15–30°"]],
  },
  {
    id: "cephalic",
    name: "Cephalic vein",
    layer: "veins",
    rating: "second",
    label: true,
    parts: [tube(CEPHALIC_FOREARM, [[0, 0.13], [0.5, 0.17], [1, 0.2]], 1, [0.3, 0.62, 0.93]), tube(CEPHALIC_ARM, [[0, 0.2], [1, 0.24]], 1, [0.45, 0.85])],
    summary:
      "Arises from the radial side of the dorsal venous network at the anatomical snuffbox, winds around the radial border of the forearm to its anterior surface, and ascends lateral to biceps to the deltopectoral groove.",
    clinical:
      "Second choice at the antecubital fossa (lateral, thumb side). Often the only palpable vein in patients with obesity. Less well anchored than the median cubital, so anchor firmly. Avoid the distal third near the wrist, where the superficial branch of the radial nerve crosses it. The lateral antebrachial cutaneous nerve runs alongside it at the elbow.",
    stats: [["Typical calibre", "3–5 mm"], ["Depth", "2–6 mm"], ["Side", "Lateral (radial)"]],
  },
  {
    id: "basilic",
    name: "Basilic vein",
    layer: "veins",
    rating: "third",
    label: true,
    parts: [tube(BASILIC_FOREARM, [[0, 0.13], [0.5, 0.18], [1, 0.24]], 1, [0.35, 0.66, 0.92]), tube(BASILIC_ARM, [[0, 0.24], [1, 0.3]], 1, [0.5])],
    summary:
      "Arises from the ulnar side of the dorsal venous network, ascends the posteromedial forearm, crosses to the anterior surface just below the elbow, and pierces the deep fascia in the mid-arm to join the brachial veins.",
    clinical:
      "Last choice at the antecubital fossa. It is large and often prominent, but poorly anchored (rolls), and lies close to the brachial artery, the median nerve and the medial antebrachial cutaneous nerve. Use only when no other antecubital vein is suitable, with a shallow angle and extra care.",
    stats: [["Typical calibre", "4–6 mm"], ["Depth", "3–8 mm"], ["Side", "Medial (ulnar)"]],
  },
  {
    id: "median-antebrachial",
    name: "Median antebrachial vein",
    layer: "veins",
    pattern: "H",
    rating: "alternate",
    label: true,
    parts: [tube([S(24.5, 96, 0.25), S(19, 93, 0.26), S(12, 92, 0.28), S(6, 97, 0.28), S(2.4, 99, 0.28), S(0.3, 100, 0.28)], [[0, 0.09], [1, 0.14]])],
    summary:
      "Drains the palmar venous plexus and ascends the middle of the anterior forearm to end in the median cubital or basilic vein.",
    clinical:
      "Usable in the mid-forearm when antecubital veins are unavailable, but punctures here are more painful and the vein is small. Never draw from the palmar side of the wrist: tendons, the median and ulnar nerves and both arteries lie just under the skin.",
    stats: [["Typical calibre", "2–3 mm"], ["Depth", "2–4 mm"]],
  },
  {
    id: "median-vein",
    name: "Median vein (M pattern)",
    layer: "veins",
    pattern: "M",
    rating: "first",
    label: true,
    parts: [tube([S(24.5, 96, 0.25), S(19, 93, 0.26), S(12, 92, 0.28), S(7, 94, 0.28), S(4.5, 95, 0.28)], [[0, 0.1], [1, 0.22]])],
    summary:
      "In the M-shaped pattern the median antebrachial vein is large and ascends the centre of the forearm before dividing below the elbow crease.",
    clinical:
      "First-choice site in the M-shaped pattern: centrally placed, well anchored, and furthest from the brachial artery and major nerves.",
    stats: [["Typical calibre", "3–5 mm"], ["Depth", "2–5 mm"]],
  },
  {
    id: "median-cephalic",
    name: "Median cephalic vein",
    layer: "veins",
    pattern: "M",
    rating: "second",
    label: true,
    parts: [tube([S(4.5, 95, 0.28), S(2.5, 84, 0.28), S(0, 68, 0.28), S(-2.5, 56, 0.3)], 0.21)],
    summary: "Lateral limb of the M: runs from the median vein upward and laterally to join the cephalic vein.",
    clinical:
      "Second choice in the M-shaped pattern. It lies away from the brachial artery and is less likely to roll than the median basilic. The lateral antebrachial cutaneous nerve is the structure at risk.",
    stats: [["Typical calibre", "3–5 mm"]],
  },
  {
    id: "median-basilic",
    name: "Median basilic vein",
    layer: "veins",
    pattern: "M",
    rating: "third",
    label: true,
    parts: [tube([S(4.5, 95, 0.28), S(2.5, 108, 0.28), S(0, 124, 0.28), S(-3, 135)], 0.23)],
    summary: "Medial limb of the M: runs from the median vein upward and medially to join the basilic vein.",
    clinical:
      "Last choice in the M-shaped pattern. It crosses directly over the brachial artery and median nerve, separated only by the bicipital aponeurosis, and is more painful to puncture.",
    stats: [["Typical calibre", "3–5 mm"]],
  },
  {
    id: "accessory-cephalic",
    name: "Accessory cephalic vein",
    layer: "veins",
    rating: "alternate",
    parts: [tube([S(17, -50, 0.26), S(12, -18, 0.27), S(7, 22, 0.28), S(4.2, 50, 0.3), S(3, 60)], [[0, 0.08], [1, 0.14]])],
    summary: "Arises from a plexus on the back of the forearm and joins the cephalic vein just below the elbow.",
    clinical:
      "A reasonable forearm alternative when it is straight and palpable. Being on the posterolateral forearm it is clear of major arteries and nerves.",
    stats: [["Typical calibre", "2–3 mm"]],
  },
  {
    id: "dorsal-arch",
    name: "Dorsal venous network",
    layer: "veins",
    rating: "alternate",
    label: true,
    parts: [tube([D(29.6, 3.3), D(31.2, 2.0), D(32.0, 0.3), D(31.4, -1.5), D(29.8, -3.0)], 0.12)],
    summary:
      "Arch on the back of the hand, proximal to the metacarpal heads, that collects the dorsal metacarpal veins. Its radial end becomes the cephalic vein and its ulnar end the basilic vein.",
    clinical:
      "Alternative site when antecubital and forearm veins are unsuitable. Veins here are thin-walled, mobile and more painful to puncture: use a 23G winged (butterfly) set at 10–15°, anchor by pulling the skin over the knuckles, and prefer smaller-volume tubes to avoid collapsing the vein.",
    stats: [["Typical calibre", "2–3 mm"], ["Depth", "1–3 mm"], ["Needle", "23G winged, 10–15°"]],
  },
  {
    id: "dorsal-metacarpal",
    name: "Dorsal metacarpal veins",
    layer: "veins",
    rating: "alternate",
    label: true,
    parts: [
      tube([D(...WEBS[0]), D(33.8, 1.95), D(31.2, 2.0)], [[0, 0.085], [1, 0.11]]),
      tube([D(...WEBS[1]), D(34.0, 0.15), D(32.0, 0.3)], [[0, 0.085], [1, 0.11]]),
      tube([D(...WEBS[2]), D(33.4, -1.8), D(31.4, -1.5)], [[0, 0.085], [1, 0.11]]),
    ],
    summary:
      "Three veins running in the intervals between the metacarpals on the back of the hand, formed by the union of dorsal digital veins.",
    clinical:
      "The usual targets for a hand draw. Choose a straight segment between the knuckles and the arch, away from the junctions where valves are common. Avoid in patients with poor peripheral circulation, and be gentle in older adults whose veins are fragile.",
    stats: [["Typical calibre", "1.5–3 mm"], ["Depth", "1–3 mm"]],
  },
  {
    id: "dorsal-digital",
    name: "Dorsal digital veins",
    layer: "veins",
    rating: "avoid",
    parts: [
      tube([D(35.3, 7.95), D(32.8, 6.45), D(30.7, 4.7), D(29.6, 3.3)], 0.06),
      tube([D(34.5, 6.55), D(32.2, 5.05), D(30.4, 3.95), D(29.6, 3.3)], 0.06),
      digitalVein(1, 1, [D(34.3, 3.8), D(31.9, 3.65), D(29.6, 3.3)]),
      digitalVein(1, -1, [D(...WEBS[0])]),
      digitalVein(2, 1, [D(...WEBS[0])]),
      digitalVein(2, -1, [D(...WEBS[1])]),
      digitalVein(3, 1, [D(...WEBS[1])]),
      digitalVein(3, -1, [D(...WEBS[2])]),
      digitalVein(4, 1, [D(...WEBS[2])]),
      digitalVein(4, -1, [D(33.3, -3.6), D(31.3, -3.45), D(29.8, -3.0)]),
    ],
    summary:
      "A pair of veins runs along the sides of the back of each finger. Veins from adjacent fingers unite at the web spaces to form the dorsal metacarpal veins; those from the radial side of the index finger and the thumb join the origin of the cephalic vein, and that from the ulnar side of the little finger joins the origin of the basilic vein.",
    clinical: "Too small and too painful for venipuncture. Finger (capillary) sampling uses the palmar pulp of the 3rd or 4th finger instead.",
  },
];

VEINS.push({
  id: "deep-veins",
  name: "Brachial veins & perforating vein",
  layer: "veins",
  color: "#2f3766",
  parts: [
    tube([P(-18.4, -2.38, 0.92), P(-9, -2.08, 1.52), P(-3, -1.08, 2.32), P(0.5, -0.38, 2.36), P(1.8, -0.1, 1.85)], 0.15),
    tube([P(-18.4, -2.92, 0.5), P(-9, -2.62, 1.08), P(-3, -1.62, 1.88), P(0.5, -0.95, 1.92), P(1.8, -0.65, 1.45)], 0.15),
    tube([S(0.3, 100, 0.34), P(0.45, -0.42, 2.72), P(0.5, -0.38, 2.36)], 0.09),
  ],
  summary:
    "Paired deep veins (venae comitantes) that travel on either side of the brachial artery beneath the deep fascia. In the fossa a perforating vein pierces the fascia to link them with the median cubital vein.",
  clinical:
    "Never a venipuncture target: they lie beside the artery and median nerve. The perforating vein is the reason the median cubital vein is so well anchored — it is tethered to the deep system and cannot roll.",
});

// ──────────────────────────── Arteries ───────────────────────────

const ARTERIES: StructureDef[] = [
  {
    id: "brachial-artery",
    name: "Brachial artery",
    layer: "arteries",
    rating: "hazard",
    label: true,
    parts: [tube([P(-18.4, -2.7, 0.8), P(-9, -2.4, 1.4), P(-3, -1.4, 2.2), P(0.5, -0.7, 2.25), P(2, -0.4, 1.7)], 0.28)],
    summary:
      "Main artery of the arm. Descends on the medial side of biceps and enters the cubital fossa medial to the biceps tendon, deep to the bicipital aponeurosis, where it divides into the radial and ulnar arteries.",
    clinical:
      "The principal hazard of medial antecubital draws. Always palpate for a pulse before puncturing near the basilic vein. Bright red, pulsing blood means arterial puncture: release the tourniquet, withdraw, apply firm direct pressure for at least 5 minutes, and report it.",
    stats: [["Calibre", "4–5 mm"], ["Depth at fossa", "≈10–15 mm"]],
  },
  {
    id: "radial-artery",
    name: "Radial artery",
    layer: "arteries",
    rating: "hazard",
    label: true,
    parts: [tube([P(2, -0.4, 1.7), P(5, 1.0, 1.4), P(12, 1.9, 1.3), P(20, 2.1, 1.2), P(25.5, 2.1, 1.25), P(27.6, 3.0, 0.1), P(29.6, 2.4, -0.4)], 0.17)],
    summary:
      "Runs down the radial side of the forearm under brachioradialis and becomes superficial at the wrist, where the radial pulse is felt, before crossing the snuffbox to the back of the hand.",
    clinical:
      "The site for arterial blood gas sampling — not for routine venous collection. Its superficial course at the wrist is one reason the palmar wrist is off-limits for venipuncture.",
    stats: [["Calibre", "2–3 mm"]],
  },
  {
    id: "ulnar-artery",
    name: "Ulnar artery & palmar arch",
    layer: "arteries",
    rating: "hazard",
    parts: [
      tube([P(2, -0.4, 1.7), P(5, -1.3, 0.7), P(12, -1.9, 0.7), P(20, -2.1, 0.9), P(26, -2.0, 1.0), P(29, -1.8, 0.75)], 0.17),
      tube([P(29, -1.8, 0.75), P(31.5, -0.9, 0.75), P(32.3, 0.6, 0.75), P(31.2, 2.0, 0.75)], 0.1),
    ],
    summary:
      "Larger terminal branch of the brachial artery. Runs deep to the flexor muscles, surfaces at the ulnar side of the wrist beside the ulnar nerve, and forms the superficial palmar arch.",
    clinical: "Provides collateral flow to the hand (the basis of the Allen test before radial arterial puncture).",
    stats: [["Calibre", "2–3 mm"]],
  },
];

// ───────────────────────────── Nerves ────────────────────────────

const NERVES: StructureDef[] = [
  {
    id: "median-nerve",
    name: "Median nerve",
    layer: "nerves",
    rating: "hazard",
    label: true,
    parts: [tube([P(-18.4, -3.0, 0.6), P(-9, -2.8, 1.2), P(-3, -1.95, 2.05), P(0.5, -1.3, 2.0), P(4, -0.6, 1.0), P(14, 0, 0.6), P(23, 0.1, 1.0), P(26.5, 0.1, 1.0), P(29.5, 0.2, 0.7)], 0.16)],
    summary:
      "Travels with the brachial artery, lying medial to it in the cubital fossa, then passes between the heads of pronator teres and down the centre of the forearm to the carpal tunnel.",
    clinical:
      "The nerve most often involved in serious venipuncture injuries, typically from deep or probing attempts at the basilic vein. A sudden electric-shock pain, tingling or numbness shooting down the arm means stop: release the tourniquet and withdraw the needle immediately. Never probe.",
    stats: [["Depth at fossa", "≈10–15 mm"]],
  },
  {
    id: "lacn",
    name: "Lateral antebrachial cutaneous nerve",
    layer: "nerves",
    rating: "hazard",
    label: true,
    parts: [tube([P(-3.5, 1.6, 2.0), S(-0.5, 66, 0.55), S(4, 64, 0.46), S(11, 50, 0.44), S(19, 24, 0.44), S(25, 2, 0.42)], 0.07)],
    summary:
      "Sensory continuation of the musculocutaneous nerve. Emerges lateral to the biceps tendon at the elbow and descends the radial forearm in close company with the cephalic vein.",
    clinical:
      "At risk during cephalic vein puncture at and below the elbow. It may pass over or under the vein, so its position cannot be assumed — a shallow angle and a single clean pass limit the risk.",
  },
  {
    id: "macn",
    name: "Medial antebrachial cutaneous nerve",
    layer: "nerves",
    rating: "hazard",
    label: true,
    parts: [
      tube([S(-13, 147, 1.3), S(-8, 141, 0.75), S(-4, 139, 0.5), S(1, 146, 0.46), S(9, 176, 0.44), S(19, 200, 0.44)], 0.07),
      tube([S(-4, 139, 0.5), S(0, 128, 0.46), S(6, 114, 0.45), S(16, 106, 0.44)], 0.06),
    ],
    summary:
      "Pierces the deep fascia alongside the basilic vein in the mid-arm, then divides into anterior and posterior branches over the medial elbow and forearm.",
    clinical:
      "Its branches run next to — and frequently across — the basilic and median cubital veins. This is a major reason the basilic vein is the last antecubital choice.",
  },
  {
    id: "superficial-radial",
    name: "Superficial branch of radial nerve",
    layer: "nerves",
    rating: "hazard",
    label: true,
    parts: [tube([P(2, 2.2, 0.8), P(7, 2.7, 0.95), S(13, 12, 0.75), S(18, -4, 0.5), S(23, -26, 0.42), S(26.5, -44, 0.4), D(29.4, 2.7, 0.4), D(33, 2.3, 0.38)], 0.07)],
    summary:
      "Emerges from under brachioradialis in the distal forearm and crosses the radial border of the wrist to supply the skin of the back of the hand.",
    clinical:
      "Lies directly beside the cephalic vein for the last 8–10 cm above the wrist. Punctures of the 'intern's vein' at the radial wrist are a classic cause of lasting pain and numbness — choose a site higher up.",
  },
  {
    id: "radial-nerve",
    name: "Radial nerve",
    layer: "nerves",
    parts: [
      tube([P(-18.4, 1.2, -2.0), P(-11, 2.9, -1.2), P(-5, 2.9, 0.3), P(-0.5, 2.35, 0.9), P(2, 2.2, 0.8)], 0.15),
      tube([P(2, 2.2, 0.8), P(4.5, 2.3, -0.6), P(10, 1.0, -1.4), P(20, 0.2, -1.0)], 0.09),
    ],
    summary:
      "Spirals around the back of the humerus, pierces the lateral intermuscular septum and enters the fossa between brachialis and brachioradialis, where it divides into a superficial (sensory) branch and a deep (posterior interosseous) branch.",
    clinical:
      "Deep to the lateral edge of the fossa and out of reach of a correctly angled needle. Its superficial branch is the one that matters to phlebotomists — at the radial wrist.",
  },
  {
    id: "ulnar-nerve",
    name: "Ulnar nerve",
    layer: "nerves",
    parts: [tube([P(-18.4, -3.1, -0.4), P(-8, -3.2, -1.1), P(-0.5, -3.5, -1.9), P(4, -3.0, -0.6), P(14, -2.5, 0.4), P(25, -2.4, 0.9), P(28.5, -2.2, 0.75)], 0.14)],
    summary:
      "Passes behind the medial epicondyle (the 'funny bone'), then runs down the ulnar forearm beside the ulnar artery to the hand.",
    clinical: "Deep to the usual venipuncture sites, but superficial at the palmar wrist — another reason that area is never used.",
  },
];

// ──────────────────────────── Muscles ────────────────────────────

const M1 = "#8a2f2a";
const M2 = "#7c2926";
const M3 = "#96362e";
/** Tendon and aponeurosis: dense collagen is pearly white. */
export const TENDON = "#e4dccb";

const MUSCLES: StructureDef[] = [
  {
    id: "biceps",
    name: "Biceps brachii & tendon",
    layer: "muscles",
    color: M1,
    rating: "landmark",
    label: true,
    parts: [tube([P(-18.6, 0.3, 2.2), P(-10, 0.3, 2.6), P(-3, 0.5, 2.1), P(1.6, 1.1, 0.7)], [[0, 1.9], [0.45, 2.4], [0.72, 1.5], [0.86, 0.5], [1, 0.3]], 0.75)],
    summary: "Flexor of the elbow and supinator of the forearm. Its tendon is the cord felt in the centre of the cubital fossa when the elbow is flexed.",
    clinical:
      "The biceps tendon is the key landmark of the fossa: the brachial artery and median nerve lie just medial to it, the cephalic system lateral to it. A firm, non-bouncy cord under your finger is tendon, not vein.",
  },
  {
    id: "bicipital-aponeurosis",
    name: "Bicipital aponeurosis",
    layer: "muscles",
    color: TENDON,
    rating: "landmark",
    parts: [tube([P(-1.2, 0.7, 2.6), P(0.4, -0.9, 3.0), P(2.6, -2.6, 2.5)], [[0, 0.75], [1, 1.1]], 0.1)],
    summary: "Flat fibrous sheet fanning medially from the biceps tendon into the deep fascia of the forearm.",
    clinical:
      "Separates the median cubital vein (above) from the brachial artery and median nerve (below). A needle angled too steeply or advanced too far passes straight through it.",
  },
  { id: "brachialis", name: "Brachialis", layer: "muscles", color: M2, parts: [tube([P(-12, 0.6, 0.8), P(-4, 0.2, 0.9), P(1.5, -0.9, -0.2)], [[0, 1.2], [0.5, 2.0], [1, 0.5]], 0.5)], summary: "Deep to biceps; the main flexor of the elbow.", clinical: "Forms part of the floor of the cubital fossa." },
  { id: "triceps", name: "Triceps brachii", layer: "muscles", color: M2, parts: [tube([P(-18.6, 0, -2.6), P(-9, 0, -2.8), P(-2.2, -0.6, -2.6)], [[0, 2.6], [0.5, 2.8], [0.85, 1.6], [1, 0.8]], 0.6)], summary: "Extensor of the elbow, filling the posterior compartment of the arm.", clinical: "Not relevant to routine venous access." },
  { id: "brachioradialis", name: "Brachioradialis", layer: "muscles", color: M3, rating: "landmark", parts: [tube([P(-5, 2.6, 0.2), P(3, 3.2, 1.2), P(12, 2.9, 1.0), P(24.5, 2.4, 0.4)], [[0, 0.6], [0.3, 1.25], [0.55, 0.8], [0.7, 0.3], [1, 0.2]], 0.7)], summary: "Forms the lateral border of the cubital fossa and the fleshy radial margin of the forearm.", clinical: "The cephalic vein runs along its surface; the radial artery lies beneath its medial edge." },
  { id: "pronator-teres", name: "Pronator teres", layer: "muscles", color: M1, rating: "landmark", parts: [tube([P(-0.8, -2.8, 0.4), P(4, -0.6, 1.3), P(10, 1.6, 0.6)], [[0, 0.6], [0.5, 0.9], [1, 0.3]], 0.6)], summary: "Forms the medial border of the cubital fossa.", clinical: "The median nerve passes between its two heads as it leaves the fossa." },
  { id: "fcr", name: "Flexor carpi radialis", layer: "muscles", color: M3, parts: [tube([P(-0.6, -2.9, 0.6), P(8, -0.4, 1.9), P(17, 0.9, 1.5), P(26.5, 1.3, 0.9)], [[0, 0.5], [0.3, 0.95], [0.55, 0.55], [0.7, 0.22], [1, 0.2]])], summary: "Wrist flexor; its tendon is prominent at the radial side of the palmar wrist.", clinical: "The radial pulse is felt just lateral to its tendon." },
  { id: "palmaris-longus", name: "Palmaris longus", layer: "muscles", color: M1, parts: [tube([P(-0.5, -3.0, 0.7), P(8, -1.1, 2.1), P(18, -0.1, 1.7), P(27, 0, 1.1)], [[0, 0.35], [0.25, 0.6], [0.5, 0.2], [1, 0.15]])], summary: "Slender wrist flexor, absent in roughly 15% of people.", clinical: "Its tendon lies directly over the median nerve at the wrist." },
  { id: "fcu", name: "Flexor carpi ulnaris", layer: "muscles", color: M2, parts: [tube([P(-0.4, -3.2, 0.2), P(8, -2.9, 0.9), P(18, -2.5, 0.9), P(26.8, -2.0, 0.8)], [[0, 0.5], [0.3, 1.0], [0.65, 0.5], [0.8, 0.25], [1, 0.22]])], summary: "Wrist flexor on the ulnar border of the forearm.", clinical: "The ulnar artery and nerve run under its lateral edge." },
  { id: "fds", name: "Flexor digitorum superficialis", layer: "muscles", color: M2, parts: [tube([P(0.5, -2.0, 0.5), P(9, -0.9, 1.0), P(18, -0.3, 0.9), P(26, -0.2, 0.7)], [[0, 0.7], [0.35, 1.5], [0.7, 1.0], [1, 0.6]], 0.5)], summary: "Flexor of the fingers, forming the intermediate layer of the anterior forearm.", clinical: "The median nerve descends on its deep surface." },
  { id: "ecrl", name: "Extensor carpi radialis", layer: "muscles", color: M3, parts: [tube([P(-3, 2.8, -0.6), P(4, 3.3, -0.4), P(13, 2.6, -1.0), P(26, 1.8, -0.9)], [[0, 0.5], [0.3, 1.1], [0.55, 0.5], [0.7, 0.22], [1, 0.2]])], summary: "Wrist extensor on the radial side of the posterior forearm.", clinical: "Not relevant to routine venous access." },
  { id: "extensor-digitorum", name: "Extensor digitorum", layer: "muscles", color: M1, parts: [tube([P(-0.5, 2.6, -1.3), P(8, 1.6, -2.2), P(18, 0.6, -1.6), P(26.5, 0.2, -1.1)], [[0, 0.5], [0.35, 1.25], [0.7, 0.7], [1, 0.5]], 0.5)], summary: "Extensor of the fingers; its tendons fan out across the back of the hand.", clinical: "Its tendons run beneath the dorsal hand veins — a firm cord that moves when the patient wiggles a finger is tendon." },
  { id: "ecu", name: "Extensor carpi ulnaris", layer: "muscles", color: M2, parts: [tube([P(-0.3, 2.0, -1.8), P(8, -1.2, -2.4), P(18, -1.9, -1.5), P(26.5, -2.1, -0.9)], [[0, 0.4], [0.35, 0.95], [0.7, 0.4], [1, 0.2]])], summary: "Wrist extensor on the ulnar side of the posterior forearm.", clinical: "Not relevant to routine venous access." },
  { id: "fdp", name: "Flexor digitorum profundus", layer: "muscles", color: M1, parts: [tube([P(1, -2.2, -0.3), P(10, -1.4, 0.0), P(20, -0.6, 0.3), P(26, -0.2, 0.4)], [[0, 0.7], [0.35, 1.4], [0.75, 0.9], [1, 0.55]], 0.5)], summary: "Deep flexor of the fingers, lying on the ulna and interosseous membrane.", clinical: "Not relevant to routine venous access." },
  { id: "fpl", name: "Flexor pollicis longus", layer: "muscles", color: M3, parts: [tube([P(6, 1.4, 0.1), P(14, 1.6, 0.2), P(22, 1.3, 0.4), P(27, 1.5, 0.6)], [[0, 0.3], [0.4, 0.7], [0.8, 0.3], [1, 0.2]])], summary: "Deep flexor of the thumb, lying on the radius.", clinical: "Not relevant to routine venous access." },
  { id: "pronator-quadratus", name: "Pronator quadratus", layer: "muscles", color: M2, parts: [tube([P(23, -2.0, 0.15), P(23, 0, 0.35), P(23, 1.9, 0.2)], 1.5, 0.2)], summary: "Flat square muscle bridging the distal radius and ulna.", clinical: "Not relevant to routine venous access." },
  { id: "supinator", name: "Supinator", layer: "muscles", color: M2, parts: [tube([P(0.5, 2.6, -1.2), P(3, 2.2, -0.2), P(6.5, 1.7, 0.3)], [[0, 0.5], [0.5, 0.9], [1, 0.4]], 0.5)], summary: "Wraps the upper third of the radius and forms part of the floor of the cubital fossa.", clinical: "The deep branch of the radial nerve passes through it." },
  { id: "ecrb", name: "Extensor carpi radialis brevis", layer: "muscles", color: M1, parts: [tube([P(-0.5, 2.9, -0.9), P(6, 3.0, -0.9), P(15, 2.3, -1.2), P(26.2, 1.2, -1.0)], [[0, 0.4], [0.3, 0.85], [0.55, 0.4], [0.7, 0.2], [1, 0.18]])], summary: "Wrist extensor lying beside extensor carpi radialis longus.", clinical: "Not relevant to routine venous access." },
  { id: "anconeus", name: "Anconeus", layer: "muscles", color: M3, parts: [tube([P(-0.8, 2.4, -1.6), P(1.5, 0.2, -2.4), P(4, -1.2, -2.0)], [[0, 0.4], [0.5, 0.8], [1, 0.3]], 0.5)], summary: "Small triangular muscle behind the elbow.", clinical: "Not relevant to routine venous access." },
  {
    id: "extensor-tendons",
    name: "Extensor tendons of the hand",
    layer: "muscles",
    color: TENDON,
    rating: "landmark",
    parts: DIGITS.slice(1).map((d) =>
      tube([P(26.5, 0.2 + d.joints[0][1] * 0.12, -1.1), P(30.5, d.joints[0][1] * 0.62, -0.75), P(d.joints[0][0], d.joints[0][1], -0.5), P(d.joints[1][0], d.joints[1][1], d.joints[1][2] - 0.45), P(d.joints[2][0], d.joints[2][1], d.joints[2][2] - 0.4)], 0.13, 0.45),
    ),
    summary: "Four tendons of extensor digitorum fan out from the wrist across the back of the hand to the fingers.",
    clinical:
      "They lie directly beneath the dorsal hand veins. A firm cord that moves when the patient extends a finger is tendon; a vein is soft, compressible and refills. Keep a hand-vein puncture shallow (10–15°) to stay above them.",
  },
  {
    id: "snuffbox-tendons",
    name: "Tendons of the anatomical snuffbox",
    layer: "muscles",
    color: TENDON,
    rating: "landmark",
    parts: [
      tube([P(22, 0.4, -1.4), P(27.2, 1.7, -1.0), P(30.6, 4.1, 0.0), P(34.7, 7.1, 0.55)], 0.13, 0.5),
      tube([P(20, 2.3, -1.0), P(26.4, 3.0, -0.1), P(29.2, 3.7, 0.55), P(32.1, 5.7, 0.6)], 0.15, 0.5),
    ],
    summary:
      "Extensor pollicis longus (ulnar border) and abductor pollicis longus with extensor pollicis brevis (radial border) outline the hollow at the base of the thumb.",
    clinical:
      "The cephalic vein begins over the snuffbox, the radial artery crosses its floor and branches of the superficial radial nerve cross its roof — a crowded place to put a needle.",
  },
  {
    id: "interossei",
    name: "Dorsal interossei",
    layer: "muscles",
    color: M2,
    parts: [2.15, 0.6, -0.55, -1.55].map((y, i) => tube([P(29.6, y * 0.75, -0.3), P(32.3, y, -0.4), P(34.6 - i * 0.25, y * 1.05, -0.3)], [[0, 0.2], [0.5, 0.42], [1, 0.2]], 0.6)),
    summary: "Small muscles filling the spaces between the metacarpals.",
    clinical: "The dorsal metacarpal veins lie on them, in the soft intervals between the bones.",
  },
  { id: "thenar", name: "Thenar & hypothenar muscles", layer: "muscles", color: M3, parts: [blob([30.6, 3.0, 0.9], [2.2, 1.3, 0.7]), blob([30.8, -2.8, 0.6], [2.3, 0.9, 0.6])], summary: "Intrinsic muscles forming the fleshy pads at the base of the thumb and little finger.", clinical: "Palmar structures are never used for venipuncture." },
];

// ───────────────────────────── Bones ─────────────────────────────

const BONE = "#ded3b6";
const dorsalShift = (j: Vec3): Pt => P(j[0], j[1], j[2] - 0.12);

const CARPAL_ROW: Vec3[] = [
  [28.5, 2.3, 0.2],
  [28.6, 1.2, 0],
  [28.5, 0.1, 0],
  [28.5, -1.1, 0],
  [28.4, -1.9, 0],
];

const BONES: StructureDef[] = [
  {
    id: "humerus",
    name: "Humerus",
    layer: "bones",
    color: BONE,
    rating: "landmark",
    parts: [
      tube([P(-18.6, 0.3, -0.5), P(-9, 0.1, -0.5), P(-1, 0, -0.7)], [[0, 1.05], [0.5, 0.95], [0.85, 1.3], [1, 1.5]]),
      blob([-0.9, -3.0, -1.0], [1.2, 1.0, 0.9]),
      blob([-0.7, 2.6, -0.9], [1.1, 0.9, 0.9]),
      blob([0, -1.0, -0.6], [1.0, 1.2, 1.0]),
      blob([0.1, 1.5, -0.4], [0.9, 0.9, 0.9]),
    ],
    summary: "Bone of the arm. Its medial and lateral epicondyles are the bony points on either side of the elbow.",
    clinical: "An imaginary line between the epicondyles marks the base of the cubital fossa. Tourniquets go 7.5–10 cm (3–4 in) above the intended site.",
  },
  {
    id: "radius",
    name: "Radius",
    layer: "bones",
    color: BONE,
    parts: [tube([P(1.2, 1.7, -0.5), P(4, 1.5, -0.3), P(14, 2.0, -0.1), P(25.6, 1.5, -0.1)], [[0, 0.95], [0.1, 0.6], [0.6, 0.65], [0.9, 1.0], [1, 1.3]], 0.75)],
    summary: "Lateral (thumb-side) bone of the forearm.",
    clinical: "The radial styloid marks the radial border of the wrist, near where the cephalic vein and superficial radial nerve cross.",
  },
  {
    id: "ulna",
    name: "Ulna",
    layer: "bones",
    color: BONE,
    parts: [tube([P(-2.0, -0.9, -2.0), P(1.5, -1.3, -1.4), P(12, -1.9, -0.9), P(25.2, -1.9, -0.4)], [[0, 1.2], [0.12, 0.95], [0.3, 0.7], [0.9, 0.5], [1, 0.65]])],
    summary: "Medial (little-finger-side) bone of the forearm; its olecranon forms the point of the elbow.",
    clinical: "The ulnar head is the bump on the back of the wrist where the basilic vein begins.",
  },
  {
    id: "carpals",
    name: "Carpal bones",
    layer: "bones",
    color: BONE,
    parts: [
      blob([27.0, 1.7, 0], [0.8, 0.75, 0.55]),
      blob([27.0, 0.3, 0], [0.7, 0.65, 0.55]),
      blob([27.1, -1.1, 0], [0.65, 0.65, 0.5]),
      blob([27.3, -1.95, 0.55], [0.45, 0.45, 0.4]),
      blob([28.5, 2.25, 0.2], [0.7, 0.6, 0.55]),
      blob([28.6, 1.2, 0], [0.55, 0.5, 0.5]),
      blob([28.5, 0.1, 0], [0.8, 0.65, 0.55]),
      blob([28.5, -1.15, 0], [0.7, 0.65, 0.55]),
    ],
    summary: "Eight small bones in two rows forming the wrist.",
    clinical: "The hollow of the anatomical snuffbox on the radial side overlies the scaphoid and is where the cephalic vein begins.",
  },
  {
    id: "metacarpals",
    name: "Metacarpals",
    layer: "bones",
    color: BONE,
    rating: "landmark",
    parts: DIGITS.map((d, i) =>
      tube([P(...CARPAL_ROW[i]), dorsalShift(d.joints[i === 0 ? 1 : 0])], [[0, 0.5], [0.2, 0.33], [0.8, 0.33], [1, 0.5]]),
    ),
    summary: "Five long bones of the palm; their heads form the knuckles.",
    clinical: "The dorsal metacarpal veins run in the soft intervals between these bones — puncture over the interval, not over the bone.",
  },
  {
    id: "phalanges",
    name: "Phalanges",
    layer: "bones",
    color: BONE,
    parts: DIGITS.flatMap((d, i) =>
      d.joints.slice(i === 0 ? 1 : 0, -1).map((a, j) => {
        const b = d.joints[(i === 0 ? 1 : 0) + j + 1];
        const r = 0.34 - j * 0.05;
        return tube([dorsalShift(a), dorsalShift(b)], [[0, r + 0.1], [0.25, r], [0.8, r], [1, r + 0.06]]);
      }),
    ),
    summary: "Bones of the fingers and thumb.",
    clinical: "For capillary sampling, puncture the palmar pulp of the 3rd or 4th finger slightly off-centre, across the fingerprint ridges, and no deeper than 2.0 mm.",
  },
];

export const STRUCTURES: StructureDef[] = [...VEINS, ...ARTERIES, ...NERVES, ...MUSCLES, ...BONES];

export const LAYER_COLOR: Record<LayerId, string> = {
  skin: "#e2b08f",
  fat: "#e2c36c",
  veins: "#39447c",
  fascia: "#d8d5cc",
  nerves: "#e9dfb4",
  arteries: "#a3212a",
  muscles: "#8a2f2a",
  bones: "#ded3b6",
};

export const LAYER_NAME: Record<LayerId, string> = {
  skin: "Skin",
  fat: "Subcutaneous tissue",
  veins: "Superficial veins",
  fascia: "Deep fascia",
  nerves: "Nerves",
  arteries: "Arteries",
  muscles: "Muscles & tendons",
  bones: "Bones",
};

export const LAYER_ORDER: LayerId[] = ["skin", "fat", "veins", "fascia", "nerves", "arteries", "muscles", "bones"];

export function structuresFor(pattern: Pattern) {
  return STRUCTURES.filter((s) => !s.pattern || s.pattern === pattern);
}
