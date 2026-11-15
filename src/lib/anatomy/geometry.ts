import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DIGITS, FINGER_FLATTEN, girth, keepInside, onDorsum, onLimb, projectToDepth, skinField, skinSDF, surfaceNets, type Field, type Vec3 } from "./skin";
import { LAYER_COLOR, structuresFor, TENDON, type Part, type Pattern, type Pt, type Radius, type StructureDef } from "./structures";

/** Centre-line of a tubular structure with its radius at every sample. */
export interface Path {
  pts: Vec3[];
  radii: number[];
}

/** What varies from one arm to the next. */
export interface Body {
  /** Soft-tissue build; 1 is average. */
  girth: number;
  /** Extra depth of the superficial veins, cm. */
  veinDepth: number;
  /** Vein calibre relative to average. */
  calibre: number;
}
export const AVERAGE: Body = { girth: 1, veinDepth: 0, calibre: 1 };

/** Largest factor by which a vein's radius grows under a tourniquet. */
export const VEIN_SWELL = 1.28;

export interface Built {
  def: StructureDef;
  geometry: THREE.BufferGeometry;
  paths: Path[];
  anchor: Vec3;
}

function radiusAt(r: Radius, t: number): number {
  if (typeof r === "number") return r;
  if (t <= r[0][0]) return r[0][1];
  for (let i = 0; i < r.length - 1; i++) {
    const [t0, r0] = r[i];
    const [t1, r1] = r[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return r0 + (r1 - r0) * s;
    }
  }
  return r[r.length - 1][1];
}

/** Turn control points into a densely sampled centre-line that hugs its tissue plane. */
function resolve(pts: Pt[], centreMargin: (x: number) => number, perSpan = 18, deeper = 0): Vec3[] {
  const ctrl: THREE.Vector3[] = [];
  const depth: (number | null)[] = [];
  for (const pt of pts) {
    if ("s" in pt) {
      ctrl.push(new THREE.Vector3(...onLimb(pt.s[0], pt.s[1], pt.s[2])));
      depth.push(pt.s[2] + deeper);
    } else if ("d" in pt) {
      ctrl.push(new THREE.Vector3(...onDorsum(pt.d[0], pt.d[1], pt.d[2])));
      depth.push(pt.d[2] + deeper);
    } else {
      ctrl.push(new THREE.Vector3(...pt.p));
      depth.push(null);
    }
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
  const n = (ctrl.length - 1) * perSpan;
  const out: Vec3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPoint(u, v);
    const f = u * (ctrl.length - 1);
    const i0 = Math.min(Math.floor(f), ctrl.length - 2);
    const d0 = depth[i0];
    const d1 = depth[i0 + 1];
    let p: Vec3 = [v.x, v.y, v.z];
    if (d0 !== null && d1 !== null) p = projectToDepth(p, d0 + (d1 - d0) * (f - i0));
    else p = keepInside(p, centreMargin(p[0]) + 0.25);
    out.push(p);
  }
  return out;
}

function tubeGeometry(pts: Vec3[], radii: number[], flat: number, radial: number): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array((n * radial + 2) * 3);
  const rad = new Float32Array(n * radial + 2);
  const fib = new Float32Array((n * radial + 2) * 2);
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, n - 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.set(0, p[1], p[2]);
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-4) {
      N.set(0, 0, 1);
      N.addScaledVector(T, -N.dot(T));
    }
    N.normalize();
    B.crossVectors(T, N);
    const ra = radii[i];
    const rb = radii[i] * flat;
    for (let j = 0; j < radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const c = Math.cos(phi) * ra;
      const s = Math.sin(phi) * rb;
      rad[i * radial + j] = ra;
      fib[(i * radial + j) * 2] = i / (n - 1);
      fib[(i * radial + j) * 2 + 1] = phi;
      const o = (i * radial + j) * 3;
      pos[o] = p[0] + B.x * c + N.x * s;
      pos[o + 1] = p[1] + B.y * c + N.y * s;
      pos[o + 2] = p[2] + B.z * c + N.z * s;
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j1;
      const c = (i + 1) * radial + j1;
      const d = (i + 1) * radial + j;
      idx.push(a, c, b, a, d, c);
    }
  const c0 = n * radial;
  const c1 = c0 + 1;
  pos.set(pts[0], c0 * 3);
  pos.set(pts[n - 1], c1 * 3);
  for (let j = 0; j < radial; j++) {
    const j1 = (j + 1) % radial;
    idx.push(c0, j, j1);
    idx.push(c1, (n - 1) * radial + j1, (n - 1) * radial + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aRadius", new THREE.BufferAttribute(rad, 1));
  g.setAttribute("aFiber", new THREE.BufferAttribute(fib, 2));
  g.setIndex(idx);
  return g;
}

function constrain(g: THREE.BufferGeometry, margin: (x: number) => number) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const p = keepInside([x, pos.getY(i), pos.getZ(i)], margin(x));
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  g.computeVertexNormals();
}

const MARGIN: Record<StructureDef["layer"], (x: number) => number> = {
  veins: () => 0.03,
  nerves: () => 0.2,
  arteries: () => 0.22,
  muscles: (x) => (x > 26.5 ? 0.3 : 0.6),
  bones: (x) => (x > 26.5 ? 0.26 : 0.65),
};

/** Vertex colours for muscle: red belly fading to pearly tendon where the muscle narrows. */
function paint(g: THREE.BufferGeometry, def: StructureDef, tube: { radii: number[]; radial: number } | null) {
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  const belly = new THREE.Color(def.color ?? LAYER_COLOR.muscles);
  const tendon = new THREE.Color(TENDON);
  const c = new THREE.Color();
  const rings = tube ? tube.radii.length : 0;
  const max = tube ? Math.max(...tube.radii) : 1;
  for (let i = 0; i < n; i++) {
    let t = 0;
    if (tube) {
      // The two vertices after the rings are the end-cap centres.
      const ring = i < rings * tube.radial ? Math.floor(i / tube.radial) : i === rings * tube.radial ? 0 : rings - 1;
      const u = Math.min(Math.max((tube.radii[ring] / max - 0.2) / 0.28, 0), 1);
      t = 1 - u * u * (3 - 2 * u);
    }
    c.copy(belly).lerp(tendon, t);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

function buildPart(part: Part, def: StructureDef, body: Body): { g: THREE.BufferGeometry; path?: Path } {
  const margin = MARGIN[def.layer];
  if (part.kind === "blob") {
    const g = new THREE.SphereGeometry(1, 40, 28);
    g.deleteAttribute("uv");
    g.scale(part.r[0], part.r[1], part.r[2]);
    g.translate(part.c[0], part.c[1], part.c[2]);
    constrain(g, margin);
    if (def.layer === "muscles") {
      paint(g, def, null);
      g.setAttribute("aFiber", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    }
    return { g };
  }
  const superficial = def.layer === "veins" && def.id !== "deep-veins";
  const pts = resolve(part.pts, margin, 18, superficial ? body.veinDepth : 0);
  const radii = pts.map((_, i) => {
    const t = i / (pts.length - 1);
    let bulge = 0;
    for (const v of part.valves ?? []) bulge = Math.max(bulge, Math.exp(-(((t - v) / 0.018) ** 2)));
    return radiusAt(part.r, t) * (1 + 0.18 * bulge) * (superficial ? body.calibre : 1);
  });
  if (def.layer === "veins" || def.layer === "arteries") {
    // Vessel walls are never perfectly even.
    const seed = pts[0][0] * 1.7 + pts[0][1] * 3.1;
    for (let i = 0; i < radii.length; i++) radii[i] *= 1 + 0.055 * Math.sin(i * 0.43 + seed) * Math.sin(i * 0.17 + seed * 2.3);
  }
  if (def.layer === "veins") {
    // A distended vein must still sit under the skin, so deepen it where it would otherwise break the surface.
    for (let i = 0; i < pts.length; i++) {
      const need = radii[i] * VEIN_SWELL + 0.05;
      if (-skinSDF(pts[i][0], pts[i][1], pts[i][2]) < need) pts[i] = projectToDepth(pts[i], need);
    }
  }
  const radial = def.layer === "muscles" ? 40 : def.layer === "nerves" ? 16 : 24;
  const g = tubeGeometry(pts, radii, part.flat ?? 1, radial);
  constrain(g, margin);
  if (def.layer !== "veins" && def.layer !== "arteries") g.deleteAttribute("aRadius");
  if (def.layer !== "muscles") g.deleteAttribute("aFiber");
  if (def.layer === "muscles") paint(g, def, { radii, radial });
  return { g, path: { pts, radii } };
}

type Prim = { a: Vec3; b: Vec3; r1: number; r2: number } | { c: Vec3; r: Vec3 };

/**
 * Mesh a smooth union of tapered capsules and ellipsoids. Bones are built this
 * way so that shafts flare into their ends and condyles blend into the shaft,
 * instead of being separate primitives pushed through each other.
 */
function sdfMesh(prims: Prim[], blend: number, h: number): THREE.BufferGeometry {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const boxes = prims.map((p) => {
    const min: Vec3 = [0, 0, 0];
    const max: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      if ("c" in p) {
        min[k] = p.c[k] - p.r[k];
        max[k] = p.c[k] + p.r[k];
      } else {
        const r = Math.max(p.r1, p.r2);
        min[k] = Math.min(p.a[k], p.b[k]) - r;
        max[k] = Math.max(p.a[k], p.b[k]) + r;
      }
      lo[k] = Math.min(lo[k], min[k]);
      hi[k] = Math.max(hi[k], max[k]);
    }
    return { min, max };
  });
  const pad = blend + 3 * h;
  const origin: Vec3 = [lo[0] - pad, lo[1] - pad, lo[2] - pad];
  const dims: [number, number, number] = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k] + 2 * pad) / h) + 1) as [number, number, number];
  const [nx, ny] = dims;
  const data = new Float32Array(dims[0] * dims[1] * dims[2]).fill(9);
  prims.forEach((p, n) => {
    const i0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((boxes[n].min[k] - blend - origin[k]) / h)));
    const i1 = [0, 1, 2].map((k) => Math.min(dims[k] - 1, Math.ceil((boxes[n].max[k] + blend - origin[k]) / h)));
    for (let k = i0[2]; k <= i1[2]; k++)
      for (let j = i0[1]; j <= i1[1]; j++)
        for (let i = i0[0]; i <= i1[0]; i++) {
          const x = origin[0] + i * h, y = origin[1] + j * h, z = origin[2] + k * h;
          let d: number;
          if ("c" in p) {
            const qx = (x - p.c[0]) / p.r[0], qy = (y - p.c[1]) / p.r[1], qz = (z - p.c[2]) / p.r[2];
            const k0 = Math.hypot(qx, qy, qz);
            const k1 = Math.hypot(qx / p.r[0], qy / p.r[1], qz / p.r[2]);
            d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(p.r[0], p.r[1], p.r[2]);
          } else {
            const [t2, t] = segDist2([x, y, z], p.a, p.b);
            d = Math.sqrt(t2) - (p.r1 + (p.r2 - p.r1) * t);
          }
          const at = i + nx * (j + ny * k);
          const cur = data[at];
          const w = Math.max(blend - Math.abs(cur - d), 0) / blend;
          data[at] = Math.min(cur, d) - w * w * blend * 0.25;
        }
  });
  const field: Field = { data, dims, origin, h };
  const m = surfaceNets(field, 0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  return g;
}

/** Bones: every part becomes implicit primitives; parts of one bone are fused, separate bones stay separate. */
function buildBone(def: StructureDef): { geometry: THREE.BufferGeometry; paths: Path[] } {
  const margin = MARGIN.bones;
  const paths: Path[] = [];
  const groups: Prim[][] = [];
  const fuse = def.parts.some((p) => p.kind === "blob") && def.parts.some((p) => p.kind === "tube");
  for (const part of def.parts) {
    const prims: Prim[] = [];
    if (part.kind === "blob") prims.push({ c: part.c, r: part.r });
    else {
      const pts = resolve(part.pts, margin, 10);
      const radii = pts.map((_, i) => radiusAt(part.r, i / (pts.length - 1)));
      paths.push({ pts, radii });
      // Separate bones stop just short of the joint centre, leaving a joint space between neighbours.
      const gap = fuse ? 0 : 1;
      for (let i = gap; i < pts.length - 2 - gap; i += 2) prims.push({ a: pts[i], b: pts[i + 2], r1: radii[i], r2: radii[i + 2] });
    }
    if (fuse && groups.length) groups[0].push(...prims);
    else groups.push(prims);
  }
  const meshes = groups.map((prims) => {
    const g = sdfMesh(prims, fuse ? 0.45 : 0.12, 0.07);
    constrain(g, margin);
    return g;
  });
  return { geometry: mergeGeometries(meshes, false)!, paths };
}

export interface Packed {
  attributes: Record<string, { array: Float32Array; itemSize: number }>;
  index: Uint16Array | Uint32Array | null;
}

/** Plain-data form of a geometry, for posting between a worker and the page. */
export function pack(g: THREE.BufferGeometry): Packed {
  const attributes: Packed["attributes"] = {};
  for (const [name, attr] of Object.entries(g.attributes)) attributes[name] = { array: attr.array as Float32Array, itemSize: attr.itemSize };
  return { attributes, index: (g.getIndex()?.array as Uint16Array | Uint32Array | undefined) ?? null };
}

export function unpack(p: Packed): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(p.attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize));
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Build renderable geometry and centre-line paths for every structure in the chosen venous pattern. */
export function buildStructures(pattern: Pattern, body: Body = AVERAGE): Built[] {
  return structuresFor(pattern).map((def) => {
    const bone = def.layer === "bones" ? buildBone(def) : null;
    const built = bone ? [] : def.parts.map((p) => buildPart(p, def, body));
    const geometry = bone ? bone.geometry : mergeGeometries(built.map((b) => b.g), false)!;
    const paths = bone ? bone.paths : built.flatMap((b) => (b.path ? [b.path] : []));
    let anchor: Vec3;
    if (paths.length) {
      const p = paths[0].pts;
      anchor = p[Math.floor(p.length * 0.5)];
    } else {
      const part = def.parts[0];
      anchor = part.kind === "blob" ? part.c : [0, 0, 0];
    }
    return { def, geometry, paths, anchor };
  });
}

/**
 * Fingernails. Each nail is a thin plate laid on the skin of the fingertip
 * itself: a grid of points is cast from the axis of the last phalanx out to the
 * surface, so the plate follows the curve of the finger and never sinks into it.
 */
export function buildNails(): THREE.BufferGeometry {
  const NU = 20;
  const NV = 16;
  const step = (a: number, b: number, v: number) => {
    const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  const parts = DIGITS.map((d, i) => {
    const a = new THREE.Vector3(...d.joints[2]);
    const b = new THREE.Vector3(...d.joints[3]);
    const axis = b.clone().sub(a);
    const len = axis.length();
    axis.normalize();
    // The thumb is turned: its nail faces outward as much as backward.
    const back = (i === 0 ? new THREE.Vector3(0, 0.72, -0.7) : new THREE.Vector3(0, 0, -1)).clone();
    back.addScaledVector(axis, -back.dot(axis)).normalize();
    const side = new THREE.Vector3().crossVectors(back, axis);
    const tip = d.radii[3];
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const o = new THREE.Vector3();
    const ray = new THREE.Vector3();
    for (let iu = 0; iu <= NU; iu++)
      for (let iv = 0; iv <= NV; iv++) {
        // A square grid pulled into the outline of a nail: rounded at the root, squarer at the free edge.
        const s = -1 + (2 * iv) / NV;
        const t = -1 + (2 * iu) / NU;
        const across = s * Math.sqrt(1 - 0.5 * t * t * (t < 0 ? 1 : 0.3));
        const along = t * Math.sqrt(1 - 0.5 * s * s * (t < 0 ? 1 : 0.18));
        // From 42% of the way along the phalanx to just over the end of the finger.
        const reach = len * 0.42 + ((along + 1) / 2) * (len * 0.58 + tip * 0.6);
        const over = Math.max(reach - len, 0) / tip;
        const phi = across * 0.9;
        o.copy(a).addScaledVector(axis, Math.min(reach, len));
        ray.copy(back).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi));
        ray.multiplyScalar(Math.cos(over)).addScaledVector(axis, Math.sin(over)).normalize();
        let lo = 0;
        let hi = tip * 2.4;
        for (let k = 0; k < 22; k++) {
          const mid = (lo + hi) / 2;
          if (skinSDF(o.x + ray.x * mid, o.y + ray.y * mid, o.z + ray.z * mid) < 0) lo = mid;
          else hi = mid;
        }
        // Raised a hair above the skin, with a little extra arch across the nail.
        const r = lo + 0.03 + 0.022 * (1 - across * across);
        pos.push(o.x + ray.x * r, o.y + ray.y * r, o.z + ray.z * r);
        // Pink nail bed, a paler lunula at the root and a white free edge.
        const edge = step(0.66, 0.82, along);
        const lunula = 1 - step(0.3, 0.5, Math.hypot(along + 1.05, across * 0.85));
        const bed = [0.98, 0.76, 0.74];
        const pale = [1, 0.95, 0.93];
        for (let c = 0; c < 3; c++) col.push((bed[c] + (pale[c] - bed[c]) * lunula) * (1 - edge) + edge);
      }
    for (let iu = 0; iu < NU; iu++)
      for (let iv = 0; iv < NV; iv++) {
        const p = iu * (NV + 1) + iv;
        idx.push(p, p + 1, p + NV + 2, p, p + NV + 2, p + NV + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
  return mergeGeometries(parts, false)!;
}

/** Iso-surface of the skin field `depth` cm beneath the surface. */
const shellCache = new Map<string, THREE.BufferGeometry>();

export function buildShell(depth: number): THREE.BufferGeometry {
  const key = `${girth()}:${depth}`;
  const hit = shellCache.get(key);
  if (hit) return hit;
  const m = surfaceNets(skinField(), -depth);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  shellCache.set(key, g);
  return g;
}

/** Squared distance from p to segment ab, and the parameter of the closest point. */
export function segDist2(p: Vec3, a: Vec3, b: Vec3): [number, number] {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 0 ? Math.min(Math.max((apx * abx + apy * aby + apz * abz) / l2, 0), 1) : 0;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return [dx * dx + dy * dy + dz * dz, t];
}

/**
 * Ambient occlusion of the skin (1 open, lower in folds), from the distance
 * field itself: where the surface is concave, the field grows more slowly along
 * the normal than the distance travelled. Darkens web spaces, creases and
 * hollows the way soft light does.
 */
export function skinAO(g: THREE.BufferGeometry): Float32Array {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  const H = [0.15, 0.4, 0.8, 1.4, 2.2];
  const W = [0.34, 0.26, 0.18, 0.13, 0.09];
  for (let i = 0; i < pos.count; i++) {
    let occluded = 0;
    for (let k = 0; k < H.length; k++) {
      const d = skinSDF(pos.getX(i) + nor.getX(i) * H[k], pos.getY(i) + nor.getY(i) * H[k], pos.getZ(i) + nor.getZ(i) * H[k]);
      occluded += W[k] * Math.max(0, 1 - d / H[k]);
    }
    out[i] = Math.min(1, Math.max(0.25, 1 - 1.5 * occluded));
  }
  return out;
}

/**
 * Surface gradient of a per-vertex scalar (per cm), estimated from mesh edges.
 * Lets the skin shader tilt its normals where veins raise the surface.
 */
export function surfaceGradient(g: THREE.BufferGeometry, value: Float32Array): Float32Array {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const idx = g.getIndex()!.array;
  const out = new Float32Array(pos.count * 3);
  const valence = new Uint16Array(pos.count);
  const edge = (i: number, j: number) => {
    const ex = pos.getX(j) - pos.getX(i), ey = pos.getY(j) - pos.getY(i), ez = pos.getZ(j) - pos.getZ(i);
    const k = (value[j] - value[i]) / Math.max(ex * ex + ey * ey + ez * ez, 1e-8);
    out[i * 3] += ex * k;
    out[i * 3 + 1] += ey * k;
    out[i * 3 + 2] += ez * k;
    valence[i]++;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    edge(a, b); edge(b, c); edge(c, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const k = 2 / Math.max(valence[i], 1);
    out[i * 3] *= k;
    out[i * 3 + 1] *= k;
    out[i * 3 + 2] *= k;
  }
  return out;
}

/**
 * How strongly each skin vertex shows an underlying superficial vein (0..1).
 * Used to tint the skin so veins are faintly visible, as on a real arm.
 */
export function veinShade(skin: THREE.BufferGeometry, built: Built[]): Float32Array {
  const pos = skin.getAttribute("position") as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  const bins = new Map<number, { a: Vec3; b: Vec3; r: number }[]>();
  for (const s of built) {
    if (s.def.layer !== "veins") continue;
    for (const path of s.paths)
      for (let i = 0; i < path.pts.length - 1; i++) {
        const a = path.pts[i];
        const b = path.pts[i + 1];
        if (-skinSDF(a[0], a[1], a[2]) > 0.7) continue;
        const seg = { a, b, r: (path.radii[i] + path.radii[i + 1]) / 2 };
        for (let x = Math.floor(Math.min(a[0], b[0])) - 1; x <= Math.floor(Math.max(a[0], b[0])) + 1; x++) {
          if (!bins.has(x)) bins.set(x, []);
          bins.get(x)!.push(seg);
        }
      }
  }
  for (let i = 0; i < pos.count; i++) {
    const p: Vec3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const segs = bins.get(Math.floor(p[0]));
    if (!segs) continue;
    let best = 0;
    for (const s of segs) {
      const d = Math.sqrt(segDist2(p, s.a, s.b)[0]);
      const w = Math.min(Math.max(1 - (d - s.r * 0.5) / (0.28 + s.r), 0), 1) * Math.min(0.45 + s.r * 2.6, 1);
      if (w > best) best = w;
    }
    out[i] = best * best * (3 - 2 * best);
  }
  return out;
}
