import { segDist2, VEIN_SWELL, type Built } from "./geometry";
import { projectToDepth, skinNormal, skinSDF, type Vec3 } from "./skin";

export interface NeedleInput {
  entry: Vec3;
  normal: Vec3;
  /** Angle between needle and skin, degrees. */
  angle: number;
  /** Rotation about the skin normal, degrees. 0 points proximally, along the limb. */
  yaw: number;
  /** Length of needle advanced beneath the skin, mm. */
  depth: number;
  gauge: 21 | 22 | 23;
  tourniquet: boolean;
  /** How readily this patient's veins roll (0–1), and whether the skin is held taut to stop them. */
  rolling?: number;
  anchored?: boolean;
}

export type Outcome = "success" | "through" | "miss" | "artery" | "nerve";
export interface Note {
  tone: "good" | "warn" | "bad";
  text: string;
}
export interface SimResult {
  outcome: Outcome;
  title: string;
  score: number;
  notes: Note[];
  structure?: string;
  tipDepthMm: number;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Direction of needle travel for a given skin normal, insertion angle and yaw. */
export function needleDir(n: Vec3, angleDeg: number, yawDeg: number): Vec3 {
  const t0 = norm([-1 + n[0] * n[0], n[0] * n[1], n[0] * n[2]]);
  const c = cross(n, t0);
  const y = (yawDeg * Math.PI) / 180;
  const a = (angleDeg * Math.PI) / 180;
  const t: Vec3 = [
    t0[0] * Math.cos(y) + c[0] * Math.sin(y),
    t0[1] * Math.cos(y) + c[1] * Math.sin(y),
    t0[2] * Math.cos(y) + c[2] * Math.sin(y),
  ];
  return norm([
    t[0] * Math.cos(a) - n[0] * Math.sin(a),
    t[1] * Math.cos(a) - n[1] * Math.sin(a),
    t[2] * Math.cos(a) - n[2] * Math.sin(a),
  ]);
}

interface Near {
  s: Built;
  d: number;
  r: number;
  pt: Vec3;
  tan: Vec3;
}

/** How much a tourniquet distends the superficial veins. */
export const DILATION = VEIN_SWELL;

function nearest(s: Built, p: Vec3, scale = 1): Near | null {
  let best: Near | null = null;
  for (const path of s.paths)
    for (let i = 0; i < path.pts.length - 1; i++) {
      const a = path.pts[i];
      const b = path.pts[i + 1];
      const [d2, t] = segDist2(p, a, b);
      if (!best || d2 < best.d * best.d) {
        best = {
          s,
          d: Math.sqrt(d2),
          r: (path.radii[i] + (path.radii[i + 1] - path.radii[i]) * t) * scale,
          pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
          tan: norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        };
      }
    }
  return best;
}

const mm = (cm: number) => `${(cm * 10).toFixed(1)} mm`;
const isHand = (id: string) => id.startsWith("dorsal");

/** Advance the needle and work out what it met on the way. */
export function evaluate(built: Built[], input: NeedleInput): SimResult {
  const dir = needleDir(input.normal, input.angle, input.yaw);
  const L = input.depth / 10;
  const steps = Math.max(2, Math.ceil(L / 0.02));
  const targets = built.filter((b) => b.def.layer === "veins" || b.def.layer === "arteries" || b.def.layer === "nerves");
  const track = new Map<string, { entered: boolean; tipInside: boolean; gap: number; near: Near }>();
  // A vein that is free to roll offers the needle a much smaller target.
  const rolled = !!input.rolling && !input.anchored;
  const veinScale = (input.tourniquet ? DILATION : 1) * (rolled ? 1 - 0.5 * input.rolling! : 1);
  const tip: Vec3 = [input.entry[0] + dir[0] * L, input.entry[1] + dir[1] * L, input.entry[2] + dir[2] * L];

  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * L;
    const p: Vec3 = [input.entry[0] + dir[0] * u, input.entry[1] + dir[1] * u, input.entry[2] + dir[2] * u];
    for (const s of targets) {
      const n = nearest(s, p, s.def.layer === "veins" ? veinScale : 1);
      if (!n) continue;
      const pad = s.def.layer === "nerves" ? 0.03 : 0;
      const inside = n.d < n.r + pad;
      const gap = n.d - n.r;
      const rec = track.get(s.def.id);
      if (!rec) track.set(s.def.id, { entered: inside, tipInside: inside && i === steps, gap, near: n });
      else {
        rec.entered ||= inside;
        if (i === steps) rec.tipInside = inside;
        if (gap < rec.gap) {
          rec.gap = gap;
          rec.near = n;
        }
      }
    }
  }

  const tipDepthMm = Math.max(0, -skinSDF(tip[0], tip[1], tip[2]) * 10);
  const all = [...track.values()];
  const artery = all.find((r) => r.near.s.def.layer === "arteries" && r.entered);
  const nerve = all.find((r) => r.near.s.def.layer === "nerves" && r.entered);
  const veins = all.filter((r) => r.near.s.def.layer === "veins");
  const inVein = veins.find((r) => r.tipInside);
  const through = veins.find((r) => r.entered && !r.tipInside);
  const closestHazard = all
    .filter((r) => r.near.s.def.layer !== "veins")
    .sort((a, b) => a.gap - b.gap)[0];
  const palmar = input.entry[0] > 23 && input.normal[2] > 0.3;
  const notes: Note[] = [];

  if (artery) {
    return {
      outcome: "artery",
      title: "Arterial puncture",
      score: 0,
      structure: artery.near.s.def.name,
      tipDepthMm,
      notes: [
        { tone: "bad", text: `The needle entered the ${artery.near.s.def.name.toLowerCase()}. Blood would be bright red and pulse into the tube.` },
        { tone: "bad", text: "Release the tourniquet, withdraw the needle, and apply firm direct pressure for at least 5 minutes. Check the site and distal pulse, then report and document." },
        { tone: "warn", text: "Always palpate for a pulse before puncturing, keep the angle at 30° or less, and never advance blindly on the medial side of the fossa." },
      ],
    };
  }
  if (nerve) {
    return {
      outcome: "nerve",
      title: "Nerve contact",
      score: 0,
      structure: nerve.near.s.def.name,
      tipDepthMm,
      notes: [
        { tone: "bad", text: `The needle struck the ${nerve.near.s.def.name.toLowerCase()}. The patient would report a sharp electric-shock pain, tingling or numbness.` },
        { tone: "bad", text: "Stop immediately: release the tourniquet and remove the needle. Do not reposition or probe. Document the event and follow your incident policy." },
        { tone: "warn", text: "Risk falls with a shallow angle, a single pass, and choosing the median cubital or cephalic vein before the basilic." },
      ],
    };
  }

  if (inVein) {
    const def = inVein.near.s.def;
    let score = 100;
    const hand = isHand(def.id);
    notes.push({ tone: "good", text: `Flash of blood: the bevel is in the lumen of the ${def.name.toLowerCase()} (${mm(inVein.near.r * 2)} calibre, ${mm(-skinSDF(...inVein.near.pt))} deep).` });
    if (def.id === "deep-veins") { score -= 40; notes.push({ tone: "bad", text: "You reached a deep brachial vein. That is far below the superficial veins and right beside the brachial artery and median nerve — the needle went much too deep." }); }
    else if (def.rating === "first") notes.push({ tone: "good", text: "This is the preferred vein: well anchored, and furthest from the artery and major nerves." });
    else if (def.rating === "second") { score -= 5; notes.push({ tone: "good", text: "Acceptable second-choice vein. Anchor it firmly — it is less fixed than the median cubital." }); }
    else if (def.rating === "third") { score -= 18; notes.push({ tone: "warn", text: "Last-choice vein. The brachial artery and median nerve lie close by; use it only when the median and cephalic veins have been ruled out in both arms." }); }
    else if (def.rating === "avoid") { score -= 45; notes.push({ tone: "bad", text: "This vein is too small for venipuncture and should not be used." }); }
    else if (hand) { score -= 8; notes.push({ tone: "warn", text: "Hand veins are an alternative site: more painful and more fragile. Use them when antecubital veins are unsuitable." }); }
    else { score -= 8; notes.push({ tone: "warn", text: "Forearm alternative. Check the antecubital veins of both arms first." }); }

    const [lo, hi] = hand ? [8, 18] : [15, 30];
    if (input.angle > 30) { score -= 20; notes.push({ tone: "bad", text: `Angle ${input.angle}° is too steep. Above 30° the needle is likely to pass through the back wall and reach deeper structures.` }); }
    else if (input.angle > hi) { score -= 8; notes.push({ tone: "warn", text: `Angle ${input.angle}° is steep for a hand vein; aim for 10–15°.` }); }
    else if (input.angle < lo) { score -= 8; notes.push({ tone: "warn", text: `Angle ${input.angle}° is very shallow; the bevel may enter the vein wall rather than the lumen. Aim for ${lo === 8 ? "10–15" : "15–30"}°.` }); }
    else notes.push({ tone: "good", text: `Insertion angle ${input.angle}° is within the recommended range.` });

    if (dir[0] > 0.25) { score -= 15; notes.push({ tone: "warn", text: "The needle points toward the hand. Enter in the direction of venous flow, toward the heart." }); }
    const align = (Math.acos(Math.min(1, Math.abs(dot(dir, inVein.near.tan)))) * 180) / Math.PI;
    if (align - input.angle > 25) { score -= 12; notes.push({ tone: "warn", text: "The needle crosses the vein rather than following it. Line the needle up with the direction of the vein to avoid transfixing it." }); }
    if (inVein.near.d / inVein.near.r > 0.75) { score -= 6; notes.push({ tone: "warn", text: "The tip sits against the vein wall. Flow may be slow or stop — centre the bevel in the lumen." }); }
    if (!input.tourniquet) { score -= 10; notes.push({ tone: "warn", text: "No tourniquet applied. Apply it 7.5–10 cm above the site (for no more than 1 minute) to distend the vein." }); }
    if (hand && input.gauge === 21) { score -= 8; notes.push({ tone: "warn", text: "A 21G needle is large for a hand vein. Use a 23G winged (butterfly) set." }); }
    if (!hand && input.gauge === 23 && inVein.near.r > 0.2) notes.push({ tone: "warn", text: "A 23G needle works but slows flow and raises haemolysis risk with large vacuum tubes; 21G is standard for a vein this size." });
    if (closestHazard && closestHazard.gap < 0.4) { score -= 12; notes.push({ tone: "warn", text: `Close call: the needle passed ${mm(Math.max(closestHazard.gap, 0))} from the ${closestHazard.near.s.def.name.toLowerCase()}.` }); }
    if (palmar) { score -= 40; notes.push({ tone: "bad", text: "The palmar surface of the wrist and hand must never be used for venipuncture." }); }
    return { outcome: "success", title: score >= 85 ? "Successful venipuncture" : "Blood obtained — technique needs work", score: Math.max(score, 5), notes, structure: def.name, tipDepthMm };
  }

  if (through) {
    const def = through.near.s.def;
    notes.push({ tone: "bad", text: `The needle went through both walls of the ${def.name.toLowerCase()}: a brief flash, then no flow. Blood leaking from the back wall forms a haematoma.` });
    notes.push({ tone: "warn", text: "Withdraw slowly until flow returns. If the site swells, release the tourniquet, remove the needle and apply pressure." });
    notes.push({ tone: "warn", text: input.angle > 30 ? "The angle was too steep — keep it at 30° or less." : "You advanced too far — stop as soon as you feel the 'give' or see the flash." });
    return { outcome: "through", title: "Through the vein", score: 25, notes, structure: def.name, tipDepthMm };
  }

  const near = veins.sort((a, b) => a.gap - b.gap)[0];
  if (near) {
    const n = nearest(near.near.s, tip, veinScale)!;
    const dDepth = -skinSDF(...n.pt) - -skinSDF(...tip);
    const dy = n.pt[1] - tip[1];
    const parts: string[] = [];
    if (Math.abs(dDepth) > 0.08) parts.push(`${mm(Math.abs(dDepth))} ${dDepth > 0 ? "deeper than" : "shallower than"} the tip`);
    if (Math.abs(dy) > 0.1) parts.push(`${mm(Math.abs(dy))} toward the ${dy > 0 ? "thumb (radial)" : "little-finger (ulnar)"} side`);
    notes.push({ tone: "bad", text: `No blood return. The nearest vein is the ${near.near.s.def.name.toLowerCase()}, ${mm(Math.max(n.d - n.r, 0))} from the needle tip${parts.length ? ` — it lies ${parts.join(" and ")}` : ""}.` });
  } else notes.push({ tone: "bad", text: "No blood return: there is no vein near this site." });
  if (rolled && near && near.gap < 0.25) notes.push({ tone: "warn", text: "The vein rolled away from the needle. Anchor it: pull the skin taut 2.5–5 cm below the site with your thumb, then enter in one smooth motion." });
  notes.push({ tone: "warn", text: "Do not probe. You may pull back to just under the skin and redirect once; if that fails, remove the needle and select a new site." });
  if (closestHazard && closestHazard.gap < 0.4) notes.push({ tone: "warn", text: `The needle passed ${mm(Math.max(closestHazard.gap, 0))} from the ${closestHazard.near.s.def.name.toLowerCase()}.` });
  if (palmar) notes.push({ tone: "bad", text: "The palmar surface of the wrist and hand must never be used for venipuncture." });
  return { outcome: "miss", title: "Missed the vein", score: 10, notes, tipDepthMm };
}

export interface Palpation {
  kind: "vein" | "artery" | "tendon" | "none";
  text: string;
  /** Measurements, shown only at levels that give them. */
  detail?: string;
  /** Where on the skin the finger is, and the surface normal there. */
  p?: Vec3;
  n?: Vec3;
}

/** A textbook puncture of the named vein: entry point, needle heading and depth. */
export function idealPuncture(built: Built[], id: string, angle = 25, along = 0.32) {
  const vein = built.find((b) => b.def.id === id);
  if (!vein) return null;
  const pts = vein.paths[0].pts;
  const k = Math.floor(pts.length * along);
  const entry = projectToDepth(pts[k], 0);
  const normal = skinNormal(entry[0], entry[1], entry[2]);
  const ahead = pts[Math.min(k + 4, pts.length - 1)];
  const want = norm([ahead[0] - pts[k][0], ahead[1] - pts[k][1], ahead[2] - pts[k][2]]);
  let best = { yaw: 0, depth: 8, d: Infinity };
  for (let yaw = -90; yaw <= 90; yaw += 2) {
    const dir = needleDir(normal, angle, yaw);
    if (dot(dir, want) < 0.5) continue;
    for (let depth = 3; depth <= 20; depth += 0.5) {
      const L = depth / 10;
      const n = nearest(vein, [entry[0] + dir[0] * L, entry[1] + dir[1] * L, entry[2] + dir[2] * L]);
      if (n && n.d < best.d) best = { yaw, depth, d: n.d };
    }
  }
  return { entry, normal, angle, yaw: best.yaw, depth: best.depth };
}

/** What a fingertip pressed on the skin at p would feel. */
export function palpate(built: Built[], p: Vec3, tourniquet: boolean): Palpation {
  let vein: Near | null = null;
  let artery: Near | null = null;
  let tendon: Near | null = null;
  for (const s of built) {
    const layer = s.def.layer;
    if (layer !== "veins" && layer !== "arteries" && s.def.id !== "biceps") continue;
    const n = nearest(s, p, layer === "veins" && tourniquet ? DILATION : 1);
    if (!n) continue;
    if (layer === "veins" && s.def.id !== "deep-veins" && (!vein || n.d - n.r < vein.d - vein.r)) vein = n;
    if (layer === "arteries" && (!artery || n.d < artery.d)) artery = n;
    if (s.def.id === "biceps" && n.r < 0.7) tendon = n;
  }
  const gap = vein ? vein.d - vein.r : Infinity;
  if (vein && vein.r > 0.085 && gap < (tourniquet ? 1.0 : 0.28)) {
    const depth = Math.max(-skinSDF(...vein.pt) - vein.r, 0.05);
    const feel = !tourniquet
      ? "Faintly bouncy — hard to define without a tourniquet."
      : gap < 0.42
        ? "Soft, bouncy and resilient — springs back when pressed."
        : "Deep and faint: a soft fullness you only find with firm, slow pressure.";
    return { kind: "vein", text: feel, detail: `Vein ≈ ${mm(vein.r * 2)} wide, ≈ ${mm(depth)} under the skin.` };
  }
  if (artery && artery.d < 1.35) return { kind: "artery", text: "Pulsatile beneath your finger — this is an artery. Do not puncture here." };
  if (tendon && tendon.d < 1.0) return { kind: "tendon", text: "Firm and cord-like with no bounce — tendon, not vein." };
  return { kind: "none", text: "Nothing distinct — no palpable vessel here." };
}
