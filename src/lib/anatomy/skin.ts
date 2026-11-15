/**
 * The skin of the left upper limb in anatomical position (forearm supinated).
 *
 * Units are centimetres.
 *   x  proximal (−) → distal (+); the elbow flexion crease is x = 0
 *   y  radial / lateral (+) → ulnar / medial (−)
 *   z  anterior / palmar (+) → posterior / dorsal (−)
 *
 * The shape is a modelled human arm and hand, held as a signed distance field
 * sampled on a regular grid. Deeper tissue planes are iso-surfaces of the same
 * field, so every layer follows the skin.
 *
 * The anatomy in structures.ts is laid out on a simpler reference limb, a loft
 * of measured cross-sections. `fit` carries a point of that layout onto this
 * limb, so the layout does not depend on the exact shape of the arm.
 */

import { DIGITS, SECTIONS, WRIST, type Digit, type Vec3 } from "./limb";

export { DIGITS };
export type { Digit, Vec3 };

/** The limb is shown from the middle of the upper arm. */
export const X_PROXIMAL = -21;

// ───────────────────────── The distance field ─────────────────────────

interface Grid {
  data: Int16Array;
  nx: number;
  ny: number;
  nz: number;
  ox: number;
  oy: number;
  oz: number;
  h: number;
  /** Centimetres per stored step. */
  unit: number;
}

const SOURCE = "/models/limb.bin.gz";
let grid: Grid | null = null;
let pending: Promise<void> | null = null;

/** Fetch the distance field. Nothing here gives a meaningful answer until this has resolved. */
export function loadLimb(): Promise<void> {
  pending ??= (async () => {
    let buf = await (await fetch(SOURCE)).arrayBuffer();
    // Some hosts unpack the file on the way; others hand over the gzip stream as it is.
    const magic = new Uint8Array(buf, 0, 2);
    if (magic[0] === 0x1f && magic[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint32(0, true) !== 0x424d4c56) throw new Error("Unrecognised limb file");
    const [nx, ny, nz] = [v.getUint32(4, true), v.getUint32(8, true), v.getUint32(12, true)];
    grid = {
      data: new Int16Array(buf, 36, nx * ny * nz),
      nx, ny, nz,
      ox: v.getFloat32(16, true),
      oy: v.getFloat32(20, true),
      oz: v.getFloat32(24, true),
      h: v.getFloat32(28, true),
      unit: v.getFloat32(32, true),
    };
    cachedField = null;
  })();
  return pending;
}

/** Trilinear sample of the stored field. */
function sample(x: number, y: number, z: number): number {
  const g = grid!;
  let fx = (x - g.ox) / g.h;
  let fy = (y - g.oy) / g.h;
  let fz = (z - g.oz) / g.h;
  // Beyond the grid the nearest stored value is carried outward. Above its
  // proximal face the arm simply continues as it was.
  let out = 0;
  if (fx < 0) fx = 0;
  else if (fx > g.nx - 1) { out += (fx - g.nx + 1) ** 2; fx = g.nx - 1; }
  if (fy < 0) { out += fy * fy; fy = 0; }
  else if (fy > g.ny - 1) { out += (fy - g.ny + 1) ** 2; fy = g.ny - 1; }
  if (fz < 0) { out += fz * fz; fz = 0; }
  else if (fz > g.nz - 1) { out += (fz - g.nz + 1) ** 2; fz = g.nz - 1; }
  const i = Math.min(fx | 0, g.nx - 2);
  const j = Math.min(fy | 0, g.ny - 2);
  const k = Math.min(fz | 0, g.nz - 2);
  const tx = fx - i;
  const ty = fy - j;
  const tz = fz - k;
  const d = g.data;
  const sy = g.nx;
  const sz = g.nx * g.ny;
  const a = i + sy * j + sz * k;
  const c00 = d[a] + (d[a + 1] - d[a]) * tx;
  const c10 = d[a + sy] + (d[a + sy + 1] - d[a + sy]) * tx;
  const c01 = d[a + sz] + (d[a + sz + 1] - d[a + sz]) * tx;
  const c11 = d[a + sz + sy] + (d[a + sz + sy + 1] - d[a + sz + sy]) * tx;
  const c0 = c00 + (c10 - c00) * ty;
  const c1 = c01 + (c11 - c01) * ty;
  const v = (c0 + (c1 - c0) * tz) * g.unit;
  return out > 0 ? Math.max(v, 0) + Math.sqrt(out) * g.h : v;
}

// ───────────────────────── Cross-sections ─────────────────────────

const S0 = SECTIONS[0][0];
/** x of the last section that has a width (the wrist). */
const S_WRIST = SECTIONS.findIndex((s) => s[3] === 0) - 1 + S0;

/** Section of this limb at x, for an average build: centre y, centre z, half-width, half-depth. */
let secY = 0;
let secZ = 0;
let secW = 1;
let secD = 1;

function section(x: number) {
  const at = (f: number, c: 1 | 2 | 3 | 4) => {
    const g = Math.min(Math.max(f - S0, 0), SECTIONS.length - 1);
    const i = Math.min(g | 0, SECTIONS.length - 2);
    return SECTIONS[i][c] + (SECTIONS[i + 1][c] - SECTIONS[i][c]) * (g - i);
  };
  secY = at(x, 1);
  secZ = at(x, 2);
  secW = at(Math.min(x, S_WRIST), 3);
  secD = at(x, 4);
}

/**
 * The reference limb the anatomy is laid out on:
 * [x, radial, ulnar, anterior, posterior extent, squareness].
 * Squareness 2 is an ellipse; higher values approach a rounded rectangle (the palm).
 */
const KEYS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-21, 4.7, 4.5, 4.5, 4.8, 2], // below the deltoid insertion
  [-17, 4.7, 4.5, 4.8, 4.8, 2],
  [-13, 4.75, 4.55, 5.05, 4.8, 2], // biceps and triceps bellies
  [-8, 4.5, 4.4, 4.7, 4.5, 2],
  [-4, 4.3, 4.3, 4.0, 4.05, 2], // tapering toward the elbow
  [-1.5, 4.45, 4.7, 3.5, 3.9, 2], // epicondyles: wide side to side, shallow front to back
  [0, 4.55, 4.6, 3.4, 3.95, 2], // flexion crease
  [2.5, 4.9, 4.6, 3.6, 3.85, 2], // brachioradialis laterally, flexor–pronator mass medially
  [6, 4.9, 4.5, 4.0, 3.7, 2], // greatest girth of the forearm
  [10, 4.5, 4.2, 3.8, 3.4, 2],
  [14, 3.9, 3.8, 3.3, 3.0, 2],
  [18, 3.4, 3.4, 2.8, 2.6, 2.05], // muscle gives way to tendon
  [22, 3.05, 3.1, 2.3, 2.2, 2.2],
  [24.5, 2.95, 3.0, 2.05, 2.0, 2.35],
  [26, 2.95, 3.0, 1.95, 1.95, 2.5], // wrist crease
  [27.5, 3.25, 3.3, 1.9, 1.8, 2.8], // carpus
  [29.5, 3.8, 3.9, 1.75, 1.65, 3.0],
  [32, 4.2, 4.2, 1.55, 1.55, 3.1],
  [34.5, 4.25, 4.0, 1.4, 1.45, 3.2], // metacarpal heads
  [35.7, 4.1, 3.8, 1.2, 1.15, 3.0],
  [36.6, 3.8, 3.5, 0.95, 0.8, 2.6], // the palm thins into the roots of the fingers
];

const SLOPES = KEYS.map((_, i) => {
  const p = KEYS[Math.max(i - 1, 0)];
  const n = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const dx = n[0] - p[0];
  return [1, 2, 3, 4, 5].map((c) => (n[c] - p[c]) / dx);
});

/** Section of the reference limb at x: [radial, ulnar, anterior, posterior, squareness]. */
const ref = [1, 1, 1, 1, 2];
let refX = NaN;

function reference(x: number) {
  if (x === refX) return;
  refX = x;
  const xc = Math.min(Math.max(x, KEYS[0][0]), KEYS[KEYS.length - 1][0]);
  let i = 0;
  while (i < KEYS.length - 2 && xc > KEYS[i + 1][0]) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const h = k1[0] - k0[0];
  const t = (xc - k0[0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = (t3 - 2 * t2 + t) * h;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = (t3 - t2) * h;
  for (let c = 0; c < 5; c++) ref[c] = h00 * k0[c + 1] + h10 * SLOPES[i][c] + h01 * k1[c + 1] + h11 * SLOPES[i + 1][c];
}

/** The reference hand: wrist crease, and the knuckles of the index and little fingers. */
const REF_WRIST = 26;
const REF_KNUCKLE_X = (34.6 + 35.0 + 34.5 + 33.5) / 4;
const REF_INDEX_Y = 3.0;
const REF_LITTLE_Y = -2.75;

const HAND_X = WRIST[0] - 0.4;
const HAND_KX = (DIGITS.slice(1).reduce((s, d) => s + d.joints[0][0], 0) / 4 - HAND_X) / (REF_KNUCKLE_X - REF_WRIST);
const HAND_KY = (DIGITS[1].joints[0][1] - DIGITS[4].joints[0][1]) / (REF_INDEX_Y - REF_LITTLE_Y);
const HAND_Y = (DIGITS[1].joints[0][1] + DIGITS[4].joints[0][1]) / 2;
const REF_HAND_Y = (REF_INDEX_Y + REF_LITTLE_Y) / 2;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Carry a point laid out on the reference limb onto this one. Along the arm
 * each cross-section is stretched to fit; in the hand the palm is, from the
 * wrist to the knuckles and from the index to the little finger.
 */
export function fit(p: Vec3): Vec3 {
  const x = p[0];
  reference(x);
  const refY = (ref[0] - ref[1]) / 2;
  const refW = (ref[0] + ref[1]) / 2;
  const refZ = (ref[2] - ref[3]) / 2;
  const refD = (ref[2] + ref[3]) / 2;
  const hand = smoothstep(24, 28, x);
  let ay = 0;
  let az = 0;
  if (hand < 1) {
    section(x);
    ay = secY + (p[1] - refY) * (secW / refW);
    az = secZ + (p[2] - refZ) * (secD / refD);
    if (hand === 0) return [x, ay, az];
  }
  const hx = HAND_X + (x - REF_WRIST) * HAND_KX;
  section(hx);
  const hy = HAND_Y + (p[1] - REF_HAND_Y) * HAND_KY;
  const hz = secZ + (p[2] - refZ) * (secD / refD);
  return [x + (hx - x) * hand, ay + (hy - ay) * hand, az + (hz - az) * hand];
}

// ───────────────────────── The skin ─────────────────────────

let GIRTH = 1;

/** How much thicker than average the soft tissue is at x. The hand keeps its size. */
function bulk(x: number): number {
  const t = Math.min(Math.max((27 - x) / 6, 0), 1);
  return 1 + (GIRTH - 1) * t * t * (3 - 2 * t);
}

/** The build the limb is currently modelled with; 1 is average. */
export const girth = () => GIRTH;

/** Change the soft-tissue build of the arm. Everything derived from the field must be rebuilt afterwards. */
export function setGirth(g: number) {
  if (g === GIRTH) return;
  GIRTH = g;
  cachedField = null;
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Signed distance (cm) to the skin surface: negative inside the limb. */
export function skinSDF(x: number, y: number, z: number): number {
  if (!grid) return 1;
  let d: number;
  const s = GIRTH === 1 ? 1 : bulk(x);
  if (s === 1) d = sample(x, y, z);
  else {
    // A heavier or leaner arm is the same section, scaled about its centre.
    section(x);
    d = s * sample(x, secY + (y - secY) / s, secZ + (z - secZ) / s);
  }
  // The limb is cut through the upper arm; the rim of the cut is rounded.
  const cut = X_PROXIMAL - x;
  return cut > d - 0.7 ? -smin(-d, -cut, 0.7) : d;
}

const E = 0.15;

/** Unit outward normal of the skin field at a point. */
export function skinNormal(x: number, y: number, z: number): Vec3 {
  const gx = skinSDF(x + E, y, z) - skinSDF(x - E, y, z);
  const gy = skinSDF(x, y + E, z) - skinSDF(x, y - E, z);
  const gz = skinSDF(x, y, z + E) - skinSDF(x, y, z - E);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

/** Move a point along the field gradient until it sits `depth` cm beneath the skin. */
export function projectToDepth(p: Vec3, depth: number, iterations = 4): Vec3 {
  let [x, y, z] = p;
  for (let i = 0; i < iterations; i++) {
    const err = -depth - skinSDF(x, y, z);
    if (Math.abs(err) < 1e-3) break;
    const n = skinNormal(x, y, z);
    x += n[0] * err;
    y += n[1] * err;
    z += n[2] * err;
  }
  return [x, y, z];
}

/** Push a point inwards if it is closer than `margin` cm to the skin. */
export function keepInside(p: Vec3, margin: number): Vec3 {
  return skinSDF(p[0], p[1], p[2]) > -margin ? projectToDepth(p, margin, 3) : p;
}

/**
 * Point on the limb at station x, `thetaDeg` around the long axis of the
 * reference limb (0° radial, 90° anterior), `depth` cm beneath the skin.
 */
export function onLimb(x: number, thetaDeg: number, depth: number): Vec3 {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Where that direction meets the skin of the reference limb…
  reference(x);
  const n = ref[4];
  const k = Math.pow(Math.pow(Math.abs(c) / (c >= 0 ? ref[0] : ref[1]), n) + Math.pow(Math.abs(s) / (s >= 0 ? ref[2] : ref[3]), n), 1 / n);
  const refY = (ref[0] - ref[1]) / 2;
  const refZ = (ref[2] - ref[3]) / 2;
  // …and the same place on the section of this limb.
  section(x);
  const cy = secY;
  const cz = secZ;
  const dy = (c / k - refY) * (secW / ((ref[0] + ref[1]) / 2));
  const dz = (s / k - refZ) * (secD / ((ref[2] + ref[3]) / 2));
  let lo = 0;
  let hi = 2.4 * bulk(x);
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (skinSDF(x, cy + dy * mid, cz + dz * mid) < 0) lo = mid;
    else hi = mid;
  }
  return projectToDepth([x, cy + dy * lo, cz + dz * lo], depth);
}

/** Point beneath the dorsal (posterior) skin of the hand or a finger at (x, y). */
export function onDorsum(x: number, y: number, depth: number): Vec3 {
  // Fingers curl toward the palm, so look down through the hand for where it starts and ends.
  const step = 0.08;
  let z = 7;
  while (z > -5 && skinSDF(x, y, z) > 0) z -= step;
  if (z <= -5) return [x, y, 0];
  while (z > -5 && skinSDF(x, y, z) <= 0) z -= step;
  let lo = z + step;
  let hi = z;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (skinSDF(x, y, mid) < 0) lo = mid;
    else hi = mid;
  }
  return projectToDepth([x, y, lo], depth);
}

export interface Field {
  data: Float32Array;
  dims: [number, number, number];
  origin: Vec3;
  h: number;
}

let cachedField: Field | null = null;

/** Sample the skin field on a regular grid (computed once for each build of the arm). */
export function skinField(h = 0.11): Field {
  if (cachedField && cachedField.h === h) return cachedField;
  const g = grid!;
  // Room for the hand as stored, and for the arm at its present build.
  const lo: Vec3 = [X_PROXIMAL - 1, g.oy + 0.4, g.oz + 0.4];
  const hi: Vec3 = [g.ox + (g.nx - 1) * g.h - 0.4, g.oy + (g.ny - 1) * g.h - 0.4, g.oz + (g.nz - 1) * g.h - 0.4];
  for (const s of SECTIONS) {
    if (s[3] === 0) break;
    const f = bulk(s[0]);
    lo[1] = Math.min(lo[1], s[1] - s[3] * f - 0.5);
    hi[1] = Math.max(hi[1], s[1] + s[3] * f + 0.5);
    lo[2] = Math.min(lo[2], s[2] - s[4] * f - 0.5);
    hi[2] = Math.max(hi[2], s[2] + s[4] * f + 0.5);
  }
  const dims: [number, number, number] = [
    Math.ceil((hi[0] - lo[0]) / h) + 1,
    Math.ceil((hi[1] - lo[1]) / h) + 1,
    Math.ceil((hi[2] - lo[2]) / h) + 1,
  ];
  const [nx, ny, nz] = dims;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) {
    const x = lo[0] + i * h;
    for (let k = 0; k < nz; k++) {
      const z = lo[2] + k * h;
      for (let j = 0; j < ny; j++) data[i + nx * (j + ny * k)] = skinSDF(x, lo[1] + j * h, z);
    }
  }
  cachedField = { data, dims, origin: lo, h };
  return cachedField;
}

const CUBE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Naive surface nets: extract the iso-surface `field = iso` as an indexed triangle mesh.
 * With `skinNormals`, normals come from the skin field rather than the mesh.
 */
export function surfaceNets(f: Field, iso: number, skinNormals = true) {
  const [nx, ny, nz] = f.dims;
  const { data, origin, h } = f;
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];
  const v = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = data[i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + ((c >> 2) & 1)))] - iso;
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [c0, c1] of CUBE_EDGES) {
          const v0 = v[c0], v1 = v[c1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          sx += (c0 & 1) + t * ((c1 & 1) - (c0 & 1));
          sy += ((c0 >> 1) & 1) + t * (((c1 >> 1) & 1) - ((c0 >> 1) & 1));
          sz += ((c0 >> 2) & 1) + t * (((c1 >> 2) & 1) - ((c0 >> 2) & 1));
          n++;
        }
        cell[i + nx * (j + ny * k)] = pos.length / 3;
        pos.push(origin[0] + (i + sx / n) * h, origin[1] + (j + sy / n) * h, origin[2] + (k + sz / n) * h);
      }

  const at = (i: number, j: number, k: number) => data[i + nx * (j + ny * k)] - iso;
  const cellAt = (i: number, j: number, k: number) => cell[i + nx * (j + ny * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };

  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const inside = at(i, j, k) < 0;
        if (inside !== at(i + 1, j, k) < 0)
          quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), !inside);
        if (inside !== at(i, j + 1, k) < 0)
          quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), !inside);
        if (inside !== at(i, j, k + 1) < 0)
          quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), !inside);
      }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(skinNormals ? pos.length : 0);
  for (let p = 0; p < normals.length; p += 3) {
    const n = skinNormal(pos[p], pos[p + 1], pos[p + 2]);
    normals[p] = n[0];
    normals[p + 1] = n[1];
    normals[p + 2] = n[2];
  }
  return { positions, normals, indices: new Uint32Array(idx) };
}
