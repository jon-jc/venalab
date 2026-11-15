/**
 * Implicit model of the left upper limb in anatomical position (forearm supinated).
 *
 * Units are centimetres.
 *   x  proximal (−) → distal (+); the elbow flexion crease is x = 0
 *   y  radial / lateral (+) → ulnar / medial (−)
 *   z  anterior / palmar (+) → posterior / dorsal (−)
 *
 * The skin is a signed distance field. The arm and palm are a loft of
 * cross-sections measured at stations along the limb; each section has its own
 * extent in the four anatomical directions, so the biceps, triceps and forearm
 * muscle masses bulge where they should. Digits are chains of round cones, and
 * bony points, tendons and hollows are blended in on top. Deeper tissue planes
 * are iso-surfaces of the same field, so every layer follows the skin.
 */

export type Vec3 = [number, number, number];

/**
 * Cross-sections of an average adult limb:
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

export const X_PROXIMAL = KEYS[0][0];
const X_PALM_END = KEYS[KEYS.length - 1][0];

const SLOPES = KEYS.map((_, i) => {
  const p = KEYS[Math.max(i - 1, 0)];
  const n = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const dx = n[0] - p[0];
  return [1, 2, 3, 4, 5].map((c) => (n[c] - p[c]) / dx);
});

/** Section at x: [radial, ulnar, anterior, posterior, squareness], cached for the last x queried. */
const section = [1, 1, 1, 1, 2];
let sectionX = NaN;

function loadSection(x: number) {
  if (x === sectionX) return;
  sectionX = x;
  const xc = Math.min(Math.max(x, X_PROXIMAL), X_PALM_END);
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
  for (let c = 0; c < 5; c++) section[c] = h00 * k0[c + 1] + h10 * SLOPES[i][c] + h01 * k1[c + 1] + h11 * SLOPES[i + 1][c];
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function armSDF(x: number, y: number, z: number): number {
  loadSection(x);
  const a = y >= 0 ? section[0] : section[1];
  const b = z >= 0 ? section[2] : section[3];
  const n = section[4];
  const ay = Math.abs(y) / a;
  const az = Math.abs(z) / b;
  let k: number;
  let g: number;
  if (n < 2.001) {
    k = Math.sqrt(ay * ay + az * az);
    g = k > 1e-6 ? Math.hypot(y / (a * a), z / (b * b)) / k : 1 / Math.min(a, b);
  } else {
    const s = Math.pow(ay, n) + Math.pow(az, n);
    k = Math.pow(s, 1 / n);
    if (k > 1e-6) {
      const kk = Math.pow(k, 1 - n);
      g = Math.hypot((kk * Math.pow(ay, n - 1)) / a, (kk * Math.pow(az, n - 1)) / b);
    } else {
      g = 1 / Math.min(a, b);
    }
  }
  let d = (k - 1) / Math.max(g, 1e-6);
  const dx = x - X_PALM_END;
  // The distal edge of the palm is rounded off; the fingers grow out of it.
  d = dx > 0 ? (d > 0 ? Math.hypot(dx, d) : dx) : dx > d - 0.6 ? -smin(-d, -dx, 0.6) : d;
  // The limb is cut through the upper arm; the rim of the cut is rounded.
  const cut = X_PROXIMAL - x;
  return cut > d - 0.7 ? -smin(-d, -cut, 0.7) : d;
}

export interface Digit {
  name: string;
  joints: Vec3[];
  radii: number[];
}

/**
 * A finger in the relaxed, slightly flexed posture of a resting hand: from the
 * knuckle, three phalanges of the given lengths, each curling further toward the palm.
 */
function finger(name: string, knuckle: Vec3, lengths: number[], spreadDeg: number, curlDeg: number[], radii: number[]): Digit {
  const joints: Vec3[] = [knuckle];
  const spread = (spreadDeg * Math.PI) / 180;
  for (let k = 0; k < 3; k++) {
    const curl = (curlDeg[k] * Math.PI) / 180;
    const p = joints[k];
    joints.push([
      p[0] + lengths[k] * Math.cos(curl) * Math.cos(spread),
      p[1] + lengths[k] * Math.cos(curl) * Math.sin(spread),
      p[2] + lengths[k] * Math.sin(curl),
    ]);
  }
  return { name, joints, radii };
}

/** Joint centres (CMC/MCP → tip) and soft-tissue radii for each digit. */
export const DIGITS: Digit[] = [
  {
    // The thumb sits in front of the palm and points away from the fingers.
    name: "Thumb",
    joints: [
      [28.0, 2.6, 0.9],
      [31.6, 5.0, 1.9],
      [34.4, 6.5, 2.5],
      [36.6, 7.5, 2.9],
    ],
    radii: [1.45, 1.1, 1.0, 0.8],
  },
  finger("Index", [34.6, 3.0, 0.1], [4.5, 2.6, 2.3], 5, [8, 22, 34], [0.93, 0.83, 0.75, 0.62]),
  finger("Middle", [35.0, 1.0, 0.1], [4.9, 3.0, 2.5], 0.5, [9, 24, 36], [0.96, 0.86, 0.77, 0.64]),
  finger("Ring", [34.5, -0.95, 0.1], [4.5, 2.8, 2.4], -4.5, [10, 26, 38], [0.9, 0.8, 0.72, 0.6]),
  finger("Little", [33.5, -2.75, 0.05], [3.6, 2.0, 2.1], -10, [11, 27, 39], [0.8, 0.7, 0.63, 0.53]),
];

interface Cone {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r1: number; r2: number;
  l2: number; rr: number; a2: number; il2: number;
  min: Vec3; max: Vec3;
}

const BLEND = 0.55;
/** Ratio of finger width to finger thickness. */
export const FINGER_FLATTEN = 1.12;

const DIGIT_CONES: Cone[][] = DIGITS.map((d) =>
  d.joints.slice(0, -1).map((a, i) => {
    const b = d.joints[i + 1];
    const r1 = d.radii[i];
    const r2 = d.radii[i + 1];
    const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2;
    const rr = r1 - r2;
    const m = Math.max(r1, r2) + BLEND + 0.6;
    return {
      ax: a[0], ay: a[1], az: a[2],
      bx: b[0], by: b[1], bz: b[2],
      r1, r2, l2, rr, a2: l2 - rr * rr, il2: 1 / l2,
      min: [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m],
      max: [Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m],
    };
  }),
);

function roundCone(c: Cone, x: number, y: number, z: number): number {
  const px = x - c.ax, py = y - c.ay, pz = z - c.az;
  const bax = c.bx - c.ax, bay = c.by - c.ay, baz = c.bz - c.az;
  const yy = px * bax + py * bay + pz * baz;
  const zz = yy - c.l2;
  const qx = px * c.l2 - bax * yy, qy = py * c.l2 - bay * yy, qz = pz * c.l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * c.l2;
  const z2 = zz * zz * c.l2;
  const k = Math.sign(c.rr) * c.rr * c.rr * x2;
  if (Math.sign(zz) * c.a2 * z2 > k) return Math.sqrt(x2 + z2) * c.il2 - c.r2;
  if (Math.sign(yy) * c.a2 * y2 < k) return Math.sqrt(x2 + y2) * c.il2 - c.r1;
  return (Math.sqrt(x2 * c.a2 * c.il2) + yy * c.rr) * c.il2 - c.r1;
}

type Ball = readonly [centre: Vec3, radius: number, blend: number];
type Cord = readonly [from: Vec3, to: Vec3, radius: number, blend: number];

/** Bony points and soft pads that rise from the loft. */
const LANDMARKS: Ball[] = [
  [[-1.4, -0.5, -3.15], 1.25, 1.0], // olecranon
  [[-0.9, -3.75, -0.6], 1.0, 0.9], // medial epicondyle
  [[25.2, -2.0, -1.0], 0.9, 0.6], // head of ulna
  [[26.2, 2.3, -0.1], 0.8, 0.6], // radial styloid
  [[30.0, 2.7, 1.15], 1.7, 1.0], // thenar eminence
  [[30.4, -3.0, 0.75], 1.45, 0.9], // hypothenar eminence
  ...DIGITS.slice(1).map((d): Ball => [[d.joints[0][0] + 0.1, d.joints[0][1], -0.85], 0.8, 0.5]), // knuckles
  // Interphalangeal joints are a little broader than the phalanges on either side of them.
  ...DIGITS.flatMap((d) => [1, 2].map((k): Ball => [d.joints[k], d.radii[k] * 0.9, 0.15])),
];

/** Cords that stand out under thin skin. */
const RIDGES: Cord[] = [
  // extensor tendons fanning across the back of the hand to each knuckle
  ...DIGITS.slice(1).map((d): Cord => [[27.4, d.joints[0][1] * 0.28, -1.28], [d.joints[0][0] - 0.5, d.joints[0][1], -0.86], 0.4, 0.5]),
  [[20, 0.0, 2.35], [26.4, 0.05, 1.82], 0.3, 0.55], // palmaris longus
  [[20, 1.15, 2.15], [26.4, 1.3, 1.62], 0.32, 0.55], // flexor carpi radialis
  [[21, -2.3, 1.42], [26.6, -2.2, 1.12], 0.34, 0.55], // flexor carpi ulnaris
  [[-4.5, 0.5, 3.6], [1.2, 0.9, 2.6], 0.5, 0.8], // biceps tendon
];

/** Hollows pressed into the surface. */
const HOLLOWS: Ball[] = [
  [[2.3, 0.9, 5.2], 2.0, 1.1], // cubital fossa, beside brachioradialis
  [[2.6, -1.3, 5.15], 1.8, 1.1], // cubital fossa, medial to the biceps tendon
  [[32.3, 0.4, 3.1], 2.0, 0.9], // hollow of the palm
];

/** The primitives that can influence a given part of the limb. */
interface Active {
  balls: Ball[];
  cords: Cord[];
  hollows: Ball[];
  cones: Cone[][];
}

const EVERYTHING: Active = { balls: LANDMARKS, cords: RIDGES, hollows: HOLLOWS, cones: DIGIT_CONES };

/** Only what can reach the plane at x: the grid is filled slice by slice, so most primitives drop out. */
function activeAt(x: number): Active {
  return {
    balls: LANDMARKS.filter(([c, r, k]) => Math.abs(x - c[0]) <= r + k),
    cords: RIDGES.filter(([a, b, r, k]) => x >= Math.min(a[0], b[0]) - r - k && x <= Math.max(a[0], b[0]) + r + k),
    hollows: HOLLOWS.filter(([c, r, k]) => Math.abs(x - c[0]) <= r + k),
    cones: DIGIT_CONES.map((cones) => cones.filter((c) => x >= c.min[0] && x <= c.max[0])),
  };
}

function evaluate(x: number, y: number, z: number, act: Active): number {
  let d = armSDF(x, y, z);
  // Nothing added to the arm reaches further than this from the loft.
  if (x < 26 && (d > 2.4 || d < -3.2)) return d;
  for (const [c, r, k] of act.balls) {
    const dd = Math.hypot(x - c[0], y - c[1], z - c[2]) - r;
    if (dd < d + k) d = smin(d, dd, k);
  }
  for (const [a, b, r, k] of act.cords) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const t = Math.min(Math.max(((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / (abx * abx + aby * aby + abz * abz), 0), 1);
    const dd = Math.hypot(x - a[0] - abx * t, y - a[1] - aby * t, z - a[2] - abz * t) - r;
    if (dd < d + k) d = smin(d, dd, k);
  }
  for (const [c, r, k] of act.hollows) {
    // Carving is a smooth maximum of the limb and the inside of the sphere.
    const inside = r - Math.hypot(x - c[0], y - c[1], z - c[2]);
    if (inside > d - k) d = -smin(-d, -inside, k);
  }
  if (x < 26) return d;
  let digits = 1e9;
  for (let n = 0; n < act.cones.length; n++) {
    let dd = 1e9;
    for (const c of act.cones[n]) {
      if (y < c.min[1] || y > c.max[1] || z < c.min[2] || z > c.max[2] || x < c.min[0] || x > c.max[0]) continue;
      // Fingers are a little wider than they are thick; the thumb stays round.
      const zc = (c.az + c.bz) / 2;
      dd = smin(dd, roundCone(c, x, y, n === 0 ? z : zc + (z - zc) * FINGER_FLATTEN), 0.25);
    }
    if (dd < digits) digits = dd;
  }
  if (digits < 1e8) d = smin(d, digits, BLEND);
  return d;
}

/** Signed distance (cm) to the skin surface: negative inside the limb. */
export function skinSDF(x: number, y: number, z: number): number {
  return evaluate(x, y, z, EVERYTHING);
}

const E = 0.04;

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

/** Point on the limb at station x, `thetaDeg` around the long axis (0° radial, 90° anterior). */
export function onLimb(x: number, thetaDeg: number, depth: number): Vec3 {
  const t = (thetaDeg * Math.PI) / 180;
  const cy = Math.cos(t);
  const cz = Math.sin(t);
  let lo = 0;
  let hi = 9;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (skinSDF(x, cy * mid, cz * mid) < 0) lo = mid;
    else hi = mid;
  }
  return projectToDepth([x, cy * lo, cz * lo], depth);
}

/** Point beneath the dorsal (posterior) skin of the hand or a finger at (x, y). */
export function onDorsum(x: number, y: number, depth: number): Vec3 {
  // Fingers curl toward the palm, so look down through the hand for where it starts and ends.
  const step = 0.08;
  let z = 5;
  while (z > -4 && skinSDF(x, y, z) > 0) z -= step;
  if (z <= -4) return [x, y, 0];
  while (z > -4 && skinSDF(x, y, z) <= 0) z -= step;
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

/** Sample the skin field on a regular grid (computed once). */
export function skinField(h = 0.11): Field {
  if (cachedField && cachedField.h === h) return cachedField;
  const origin: Vec3 = [X_PROXIMAL - 1, -6.4, -6.2];
  const dims: [number, number, number] = [
    Math.ceil((48.6 - origin[0]) / h) + 1,
    Math.ceil((9.6 - origin[1]) / h) + 1,
    Math.ceil((6.4 - origin[2]) / h) + 1,
  ];
  const [nx, ny, nz] = dims;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) {
    const x = origin[0] + i * h;
    const act = activeAt(x);
    for (let k = 0; k < nz; k++) {
      const z = origin[2] + k * h;
      for (let j = 0; j < ny; j++) data[i + nx * (j + ny * k)] = evaluate(x, origin[1] + j * h, z, act);
    }
  }
  cachedField = { data, dims, origin, h };
  return cachedField;
}

const CUBE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Naive surface nets: extract the iso-surface `field = iso` as an indexed triangle mesh.
 * With `skinNormals`, normals come from the analytic skin field rather than the mesh.
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
