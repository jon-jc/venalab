import type { Note, SimResult } from "./sim";
import { DIGITS, type Vec3 } from "./skin";

/**
 * Capillary (fingerstick) puncture. The right place is the palmar pulp of the
 * middle or ring finger, a little to one side of the midline, punctured across
 * the fingerprint ridges and no deeper than 2 mm.
 */

export interface CapillaryChoices {
  /** Lancet depth, mm. */
  lancet: number;
  /** Blade across the fingerprint ridges rather than along them. */
  across: boolean;
  warmed: boolean;
  /** First drop wiped away before collecting. */
  wiped: boolean;
  /** Hard, repeated squeezing to force blood out. */
  milking: boolean;
  /** EDTA tube filled before other tubes. */
  edtaFirst: boolean;
}

export interface FingerSite {
  digit: number;
  name: string;
  /** Position along the distal phalanx: 0 at the last joint, 1 at the centre of the tip. */
  along: number;
  /** Degrees around the finger from the middle of the pad (0) to the nail (180). */
  around: number;
  /** Whether the point is on a fingertip at all. */
  onTip: boolean;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Which fingertip a point on the skin belongs to, and where on it. */
export function locate(p: Vec3): FingerSite {
  let best: FingerSite & { gap: number } = { digit: -1, name: "", along: 0, around: 0, onTip: false, gap: Infinity };
  DIGITS.forEach((d, i) => {
    const a = d.joints[2];
    const b = d.joints[3];
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    const along = dot(sub(p, a), ab) / len2;
    const t = Math.min(Math.max(along, 0), 1);
    const radial = sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
    const gap = Math.hypot(radial[0], radial[1], radial[2]) - d.radii[3];
    if (gap >= best.gap) return;
    const axis = unit(ab);
    // The pad faces the palm; the thumb is turned, so its pad faces across the hand.
    const facing: Vec3 = i === 0 ? [0, -0.72, 0.7] : [0, 0, 1];
    const k = dot(facing, axis);
    const pad = unit([facing[0] - axis[0] * k, facing[1] - axis[1] * k, facing[2] - axis[2] * k]);
    const around = (Math.acos(Math.min(1, Math.max(-1, dot(unit(radial), pad)))) * 180) / Math.PI;
    best = { digit: i, name: d.name, along, around, onTip: along > 0.05 && gap < 0.45, gap };
  });
  return best;
}

/** A few words naming the finger under the pointer and, where hints are given, the part of it. */
export function describe(at: FingerSite, hints: boolean): string {
  if (!at.onTip) return "Not a fingertip";
  const finger = at.digit === 0 ? "Thumb" : `${at.name} finger`;
  if (!hints) return finger;
  const where =
    at.around > 115 ? "back of the finger"
    : at.around > 70 ? "side of the finger"
    : at.along > 1.12 ? "very tip"
    : at.along < 0.3 ? "near the joint crease"
    : at.around < 14 ? "centre of the pad"
    : "pad, just off-centre";
  return `${finger} — ${where}`;
}

export function evaluateCapillary(site: Vec3, c: CapillaryChoices, timing: { cleansedAt: number | null; puncturedAt: number | null }): SimResult {
  const at = locate(site);
  const notes: Note[] = [];
  let score = 100;
  let failed = false;
  const add = (tone: Note["tone"], text: string, cost = 0) => {
    notes.push({ tone, text });
    score -= cost;
  };

  if (!at.onTip) {
    return {
      outcome: "miss",
      title: "Not a fingerstick site",
      score: 0,
      tipDepthMm: c.lancet,
      notes: [{ tone: "bad", text: "A capillary puncture goes into the fleshy pad of the last segment of a finger. This site is not on a fingertip." }],
    };
  }

  // Which finger
  const finger = at.name.toLowerCase();
  if (at.digit === 2 || at.digit === 3) add("good", `The ${finger} finger is a correct choice: well padded and less used than the index finger.`);
  else if (at.digit === 0) add("bad", "The thumb has a pulse and thick, calloused skin. Use the middle or ring finger.", 30);
  else if (at.digit === 1) add("warn", "The index finger is the most sensitive and most calloused, and the patient uses it constantly. Prefer the middle or ring finger.", 15);
  else add("bad", "The little finger has too little tissue over the bone. Use the middle or ring finger.", 30);

  // Where on the fingertip
  if (at.around > 115) {
    add("bad", "This is the back of the finger, over the nail bed. Puncture the palmar pad.", 45);
    failed = true;
  } else if (at.around > 70) add("bad", "This is the side of the finger. There is little tissue here, and the digital artery and nerve run along it. Stay on the pad, just off the midline.", 30);
  else if (at.along > 1.12) add("bad", "This is the very tip of the finger, where the bone lies closest to the skin. Puncture the pad, short of the tip.", 30);
  else if (at.along < 0.3) add("warn", "This is close to the joint crease. The fullest part of the pad is further toward the tip.", 12);
  else if (at.around < 14) add("warn", "Dead centre of the pad works, but it is the most sensitive spot and the one the patient presses on all day. Go slightly to one side.", 8);
  else add("good", "Good site: on the palmar pad, slightly to one side of the midline.");

  // Lancet
  if (c.lancet > 2.0) add("bad", `A ${c.lancet.toFixed(1)} mm puncture is too deep for a finger: the bone may be less than 2.4 mm beneath the skin, and bone injury can lead to osteomyelitis. Never exceed 2.0 mm.`, 30);
  else if (c.lancet < 1.5) add("warn", `A ${c.lancet.toFixed(1)} mm puncture is shallow for an adult finger; flow is likely to be poor and tempt you to squeeze.`, 10);
  else add("good", `Lancet depth ${c.lancet.toFixed(1)} mm is appropriate.`);
  if (c.across) add("good", "Blade across the fingerprint ridges, so the blood beads into a round drop.");
  else add("warn", "With the blade along the fingerprint ridges, blood runs down the grooves instead of forming a drop. Turn the lancet to cut across them.", 10);

  // Preparation and collection
  if (!timing.cleansedAt) add("bad", "The site was not cleansed.", 15);
  else if ((timing.puncturedAt ?? Date.now()) - timing.cleansedAt < 4000) add("warn", "The alcohol was still wet: it stings, haemolyses the sample and stops a drop forming.", 8);
  if (c.warmed) add("good", "Warming the hand first increases blood flow several-fold.");
  else add("warn", "The hand was not warmed. A few minutes of warmth makes the difference between a free-flowing drop and a struggle.", 6);
  if (c.wiped) add("good", "First drop wiped away: it contains tissue fluid and traces of alcohol.");
  else add("bad", "The first drop was collected. It is contaminated with tissue fluid and must be wiped away with dry gauze.", 15);
  if (c.milking) add("bad", "Hard, repeated squeezing (‘milking’) forces tissue fluid into the sample and breaks red cells. Use gentle, intermittent pressure and let the finger refill.", 15);
  else add("good", "Gentle, intermittent pressure, with the hand held below the heart.");
  if (c.edtaFirst) add("good", "EDTA tube filled first. Capillary blood clots quickly, so the order is the reverse of a venous draw: EDTA, then other additives, then serum.");
  else add("warn", "For capillary samples the EDTA tube is filled first, before platelets clump — the reverse of the venous order of draw.", 10);

  score = Math.max(0, score);
  const ok = !failed && score >= 60;
  return {
    outcome: ok ? "success" : "miss",
    title: failed ? "No usable sample" : score >= 85 ? "Good capillary sample" : score >= 60 ? "Sample collected — technique needs work" : "Poor-quality sample",
    score,
    notes,
    structure: `${at.name} finger`,
    tipDepthMm: c.lancet,
  };
}
