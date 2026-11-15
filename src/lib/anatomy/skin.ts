/**
 * Implicit model of the left upper limb in anatomical position (forearm supinated).
 *
 * Units are centimetres.
 *   x  proximal (−) → distal (+); the elbow flexion crease is x = 0
 *   y  radial / lateral (+) → ulnar / medial (−)
 *   z  anterior / palmar (+) → posterior / dorsal (−)
 *
 * The skin is a signed distance field: a lofted super-elliptical tube for the
 * arm and palm, smoothly blended with round cones for the digits. Deeper tissue
 * planes are iso-surfaces of the same field, so every layer follows the skin.
 */

export type Vec3 = [number, number, number];

// [x, half-width (y), half-depth (z), super-ellipse exponent]
const KEYS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-18, 4.5, 4.6, 2],
  [-10, 4.6, 4.8, 2],
  [-4, 4.3, 4.0, 2],
  [0, 4.5, 3.5, 2],
  [4, 4.7, 3.9, 2],
  [10, 4.2, 3.5, 2],
  [17, 3.3, 2.7, 2],
  [23, 2.9, 2.1, 2.2],
  [26, 2.9, 1.9, 2.5],
  [29, 3.8, 1.6, 2.9],
  [32, 4.25, 1.5, 3.1],
  [35, 4.15, 1.35, 3.1],
  [36.6, 3.8, 1.1, 3.0],
];

export const X_PROXIMAL = KEYS[0][0];
const X_PALM_END = KEYS[KEYS.length - 1][0];

const SLOPES = KEYS.map((k, i) => {
  const p = KEYS[Math.max(i - 1, 0)];
  const n = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const dx = n[0] - p[0];
  return [(n[1] - p[1]) / dx, (n[2] - p[2]) / dx, (n[3] - p[3]) / dx];
});

const prof = { x: NaN, a: 1, b: 1, n: 2 };

/** Cross-section of the limb at x (cached for the last x queried). */
export function profile(x: number) {
  if (x === prof.x) return prof;
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
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const m0 = SLOPES[i];
  const m1 = SLOPES[i + 1];
  prof.x = x;
  prof.a = h00 * k0[1] + h10 * h * m0[0] + h01 * k1[1] + h11 * h * m1[0];
  prof.b = h00 * k0[2] + h10 * h * m0[1] + h01 * k1[2] + h11 * h * m1[1];
  prof.n = h00 * k0[3] + h10 * h * m0[2] + h01 * k1[3] + h11 * h * m1[2];
  return prof;
}

function armSDF(x: number, y: number, z: number): number {
  const { a, b, n } = profile(x);
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
  d = dx > 0 ? (d > 0 ? Math.hypot(dx, d) : dx) : Math.max(d, dx);
  return Math.max(d, X_PROXIMAL - x);
}

export interface Digit {
  name: string;
  joints: Vec3[];
  radii: number[];
}

/** Joint centres (CMC/MCP → tip) and soft-tissue radii for each digit. */
export const DIGITS: Digit[] = [
  {
    name: "Thumb",
    joints: [
      [28.5, 3.0, 0.6],
      [32.0, 5.6, 0.9],
      [34.8, 7.2, 1.0],
      [37.2, 8.3, 1.1],
    ],
    radii: [1.5, 1.15, 1.0, 0.8],
  },
  {
    name: "Index",
    joints: [
      [35.0, 3.05, 0],
      [39.6, 3.6, 0.15],
      [42.2, 3.95, 0.35],
      [44.3, 4.25, 0.6],
    ],
    radii: [0.92, 0.8, 0.72, 0.62],
  },
  {
    name: "Middle",
    joints: [
      [35.6, 1.0, 0],
      [40.6, 1.15, 0.15],
      [43.6, 1.25, 0.35],
      [46.0, 1.3, 0.6],
    ],
    radii: [0.95, 0.84, 0.75, 0.64],
  },
  {
    name: "Ring",
    joints: [
      [35.2, -1.0, 0],
      [39.8, -1.5, 0.15],
      [42.6, -1.8, 0.35],
      [44.9, -2.05, 0.6],
    ],
    radii: [0.9, 0.8, 0.7, 0.6],
  },
  {
    name: "Little",
    joints: [
      [34.2, -2.85, 0],
      [37.8, -3.6, 0.15],
      [39.9, -4.05, 0.3],
      [41.8, -4.45, 0.5],
    ],
    radii: [0.8, 0.7, 0.62, 0.54],
  },
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

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Surface landmarks that break the smooth loft: bony points you can see and
 * feel, and the main muscle bellies. [centre, radius, blend width]
 */
const LANDMARKS: ReadonlyArray<readonly [Vec3, number, number]> = [
  [[-10.5, 0.3, 2.7], 2.5, 1.2], // biceps belly
  [[-1.6, -0.7, -3.0], 1.4, 0.9], // olecranon
  [[-0.7, -3.55, -1.0], 1.2, 0.8], // medial epicondyle
  [[-0.5, 3.4, -0.9], 1.05, 0.8], // lateral epicondyle
  [[5.5, 2.75, 1.3], 2.0, 1.0], // brachioradialis / mobile wad
  [[6.0, -2.4, 1.5], 2.3, 1.0], // flexor–pronator mass
  [[25.2, -2.15, -1.2], 0.9, 0.6], // head of ulna
  [[26.2, 2.55, -0.15], 0.75, 0.6], // radial styloid
  [[30.6, -3.0, 0.7], 1.45, 0.9], // hypothenar eminence
  ...DIGITS.slice(1).map((d): readonly [Vec3, number, number] => [[d.joints[0][0] + 0.2, d.joints[0][1], -0.72], 0.82, 0.5]), // knuckles
];

/** Signed distance (cm) to the skin surface: negative inside the limb. */
export function skinSDF(x: number, y: number, z: number): number {
  let d = armSDF(x, y, z);
  for (const [c, r, k] of LANDMARKS) {
    const dx = x - c[0];
    const reach = r + k;
    if (dx > reach || dx < -reach) continue;
    const dd = Math.hypot(dx, y - c[1], z - c[2]) - r;
    if (dd < d + k) d = smin(d, dd, k);
  }
  if (x < 26) return d;
  let digits = 1e9;
  for (const cones of DIGIT_CONES) {
    let dd = 1e9;
    for (const c of cones) {
      if (x < c.min[0] || x > c.max[0] || y < c.min[1] || y > c.max[1] || z < c.min[2] || z > c.max[2]) continue;
      // Fingers are a little wider than they are thick; the thumb (first digit) stays round.
      const zc = (c.az + c.bz) / 2;
      dd = smin(dd, roundCone(c, x, y, cones === DIGIT_CONES[0] ? z : zc + (z - zc) * FINGER_FLATTEN), 0.25);
    }
    if (dd < digits) digits = dd;
  }
  if (digits < 1e8) d = smin(d, digits, BLEND);
  return d;
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

/** Point beneath the dorsal (posterior) skin of the hand at (x, y). */
export function onDorsum(x: number, y: number, depth: number): Vec3 {
  const z0 = 0.25;
  if (skinSDF(x, y, z0) > 0) return [x, y, 0];
  let lo = 0;
  let hi = 4;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (skinSDF(x, y, z0 - mid) < 0) lo = mid;
    else hi = mid;
  }
  return projectToDepth([x, y, z0 - lo], depth);
}

export interface Field {
  data: Float32Array;
  dims: [number, number, number];
  origin: Vec3;
  h: number;
}

let cachedField: Field | null = null;

/** Sample the skin field on a regular grid (computed once). */
export function skinField(h = 0.12): Field {
  if (cachedField && cachedField.h === h) return cachedField;
  const origin: Vec3 = [-19, -6.4, -6.2];
  const dims: [number, number, number] = [
    Math.ceil((47.4 - origin[0]) / h) + 1,
    Math.ceil((9.8 - origin[1]) / h) + 1,
    Math.ceil((6.4 - origin[2]) / h) + 1,
  ];
  const [nx, ny, nz] = dims;
  const data = new Float32Array(nx * ny * nz);
  for (let i = 0; i < nx; i++) {
    const x = origin[0] + i * h;
    for (let k = 0; k < nz; k++) {
      const z = origin[2] + k * h;
      for (let j = 0; j < ny; j++) {
        data[i + nx * (j + ny * k)] = skinSDF(x, origin[1] + j * h, z);
      }
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

/** Naive surface nets: extract the iso-surface `field = iso` as an indexed triangle mesh. */
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
        const v0 = at(i, j, k);
        const inside = v0 < 0;
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
