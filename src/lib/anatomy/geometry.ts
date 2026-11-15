import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { keepInside, onDorsum, onLimb, projectToDepth, skinField, skinSDF, surfaceNets, type Vec3 } from "./skin";
import { LAYER_COLOR, structuresFor, TENDON, type Part, type Pattern, type Pt, type Radius, type StructureDef } from "./structures";

/** Centre-line of a tubular structure with its radius at every sample. */
export interface Path {
  pts: Vec3[];
  radii: number[];
}

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
function resolve(pts: Pt[], centreMargin: (x: number) => number, perSpan = 12): Vec3[] {
  const ctrl: THREE.Vector3[] = [];
  const depth: (number | null)[] = [];
  for (const pt of pts) {
    if ("s" in pt) {
      ctrl.push(new THREE.Vector3(...onLimb(pt.s[0], pt.s[1], pt.s[2])));
      depth.push(pt.s[2]);
    } else if ("d" in pt) {
      ctrl.push(new THREE.Vector3(...onDorsum(pt.d[0], pt.d[1], pt.d[2])));
      depth.push(pt.d[2]);
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

function buildPart(part: Part, def: StructureDef): { g: THREE.BufferGeometry; path?: Path } {
  const margin = MARGIN[def.layer];
  if (part.kind === "blob") {
    const g = new THREE.SphereGeometry(1, 16, 12);
    g.deleteAttribute("uv");
    g.scale(part.r[0], part.r[1], part.r[2]);
    g.translate(part.c[0], part.c[1], part.c[2]);
    constrain(g, margin);
    if (def.layer === "muscles") paint(g, def, null);
    return { g };
  }
  const pts = resolve(part.pts, margin);
  const radii = pts.map((_, i) => {
    const t = i / (pts.length - 1);
    let bulge = 0;
    for (const v of part.valves ?? []) bulge = Math.max(bulge, Math.exp(-(((t - v) / 0.018) ** 2)));
    return radiusAt(part.r, t) * (1 + 0.18 * bulge);
  });
  if (def.layer === "veins") {
    // A distended vein must still sit under the skin, so deepen it where it would otherwise break the surface.
    for (let i = 0; i < pts.length; i++) {
      const need = radii[i] * VEIN_SWELL + 0.05;
      if (-skinSDF(pts[i][0], pts[i][1], pts[i][2]) < need) pts[i] = projectToDepth(pts[i], need);
    }
  }
  const radial = def.layer === "muscles" ? 18 : def.layer === "bones" ? 14 : 12;
  const g = tubeGeometry(pts, radii, part.flat ?? 1, radial);
  constrain(g, margin);
  if (def.layer !== "veins" && def.layer !== "arteries") g.deleteAttribute("aRadius");
  if (def.layer === "muscles") paint(g, def, { radii, radial });
  return { g, path: { pts, radii } };
}

/** Build renderable geometry and centre-line paths for every structure in the chosen venous pattern. */
export function buildStructures(pattern: Pattern): Built[] {
  return structuresFor(pattern).map((def) => {
    const built = def.parts.map((p) => buildPart(p, def));
    const geometry = mergeGeometries(built.map((b) => b.g), false)!;
    const paths = built.flatMap((b) => (b.path ? [b.path] : []));
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

/** Iso-surface of the skin field `depth` cm beneath the surface. */
const shellCache = new Map<number, THREE.BufferGeometry>();

export function buildShell(depth: number): THREE.BufferGeometry {
  const hit = shellCache.get(depth);
  if (hit) return hit;
  const m = surfaceNets(skinField(), -depth);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  shellCache.set(depth, g);
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
