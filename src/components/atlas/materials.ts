import * as THREE from "three";
import { DIGITS, fit } from "@/lib/anatomy/skin";
import { live } from "./live";

/**
 * Procedural surface detail for every tissue. Each material is a standard
 * physically based material with a little GLSL spliced in: a height field that
 * bends the shading normal (pores, fibres, lobules) and an albedo variation.
 * Nothing is textured from images, so detail holds at any zoom.
 */

type Shader = { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string };
type Uniforms = Record<string, { value: unknown }>;

const NOISE = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vObjNormal;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}
// Bend the shading normal by the screen-space gradient of a height field (cm).
vec3 bumpNormal(vec3 pos, vec3 n, float h) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
`;

interface Recipe {
  key: string;
  uniforms?: Uniforms;
  /** Extra vertex declarations (attributes, uniforms, varyings). */
  vertexHead?: string;
  /** Runs after the object normal is set up; may change \`objectNormal\`. */
  vertexNormal?: string;
  /** Runs after \`transformed\` is initialised; may displace it. */
  vertexPosition?: string;
  fragmentHead?: string;
  /** Must declare \`float relief\` (height in cm) and may tint \`diffuseColor\`. */
  surface: string;
  /** Runs once the shading normal is final; may add to \`totalEmissiveRadiance\`. */
  glow?: string;
  /** May adjust \`roughnessFactor\`. */
  finish?: string;
}

function tissue(r: Recipe) {
  return {
    customProgramCacheKey: () => r.key,
    onBeforeCompile: (shader: Shader) => {
      Object.assign(shader.uniforms, r.uniforms);
      shader.vertexShader =
        `varying vec3 vObjPos;\nvarying vec3 vObjNormal;\n${r.vertexHead ?? ""}\n` +
        shader.vertexShader
          .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${r.vertexNormal ?? ""}`)
          .replace("#include <begin_vertex>", `#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;\n${r.vertexPosition ?? ""}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NOISE}\n${r.fragmentHead ?? ""}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${r.surface}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${r.finish ?? ""}`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\nnormal = bumpNormal(-vViewPosition, normal, relief);`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${r.glow ?? ""}`);
    },
  };
}

// ───────────────────────────── Skin ─────────────────────────────

/** Flexion creases and knuckle wrinkles: centre + reach, direction + which face (1 palmar, −1 dorsal, 0 both). */
const CREASES: { at: THREE.Vector4; dir: THREE.Vector4 }[] = [];
for (const d of DIGITS) {
  for (const k of [1, 2]) {
    const a = d.joints[k - 1];
    const b = d.joints[k + 1];
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    CREASES.push({ at: new THREE.Vector4(...d.joints[k], d.radii[k] * 1.6), dir: new THREE.Vector4(dir.x, dir.y, dir.z, 0) });
  }
}
for (const d of DIGITS.slice(1)) CREASES.push({ at: new THREE.Vector4(...d.knuckle, 1.15), dir: new THREE.Vector4(1, 0, 0, -1) });
CREASES.push({ at: new THREE.Vector4(...fit([26.3, 0, 0.8]), 3.7), dir: new THREE.Vector4(1, 0, 0, 1) }); // wrist
CREASES.push({ at: new THREE.Vector4(...fit([0.2, 0.2, 3.2]), 3.1), dir: new THREE.Vector4(1, 0, 0, 1) }); // elbow

/**
 * The three main palmar creases, each a curve through points in the plane of
 * the palm: [x, y, how deeply it is marked there]. They are deepest in the
 * middle of the palm and fade out toward its edges.
 */
const PALM_CREASES: [number, number, number][][] = [
  // distal transverse crease: from the ulnar border, curving up between the index and middle fingers
  [[33.2, -3.9, 0.45], [33.4, -2.5, 0.9], [33.8, -0.9, 1], [34.5, 0.7, 0.85], [35.2, 1.8, 0.3]],
  // proximal transverse crease: from the radial border across to the hypothenar eminence
  [[34.0, 3.7, 0.5], [33.3, 2.3, 0.95], [32.6, 0.7, 1], [32.0, -1.1, 0.7], [31.6, -2.5, 0.2]],
  // thenar crease: around the base of the thumb toward the wrist
  [[34.0, 3.7, 0.5], [32.8, 2.5, 0.95], [31.2, 1.6, 1], [29.5, 1.05, 0.75], [27.8, 0.9, 0.25]],
];
const PALM_LINES: THREE.Vector4[] = [];
const PALM_ENDS: THREE.Vector2[] = [];
for (const crease of PALM_CREASES)
  for (let i = 0; i < crease.length - 1; i++) {
    const a = fit([crease[i][0], crease[i][1], 0]);
    const b = fit([crease[i + 1][0], crease[i + 1][1], 0]);
    PALM_LINES.push(new THREE.Vector4(a[0], a[1], b[0], b[1]));
    PALM_ENDS.push(new THREE.Vector2(crease[i][2], crease[i + 1][2]));
  }

/** Where blood shows through thin skin and the surface looks pinker: centre and radius. */
const BLUSH = [
  ...DIGITS.map((d) => new THREE.Vector4(...d.joints[3], 1.25)),
  ...DIGITS.map((d) => new THREE.Vector4(d.joints[1][0] + d.back[0] * d.radii[1] * 0.7, d.joints[1][1] + d.back[1] * d.radii[1] * 0.7, d.joints[1][2] + d.back[2] * d.radii[1] * 0.7, 0.85)),
  ...DIGITS.slice(1).map((d) => new THREE.Vector4(...d.knuckle, 1.0)),
  new THREE.Vector4(...fit([-1.6, -0.7, -3.5]), 2.4),
];

export const skinUniforms = {
  uBulge: live.bulge,
  uPress: live.press,
  uPressDepth: live.pressDepth,
  uCrease: { value: CREASES.map((c) => c.at) },
  uCreaseDir: { value: CREASES.map((c) => c.dir) },
  uPalmLine: { value: PALM_LINES },
  uPalmEnds: { value: PALM_ENDS },
  uBlush: { value: BLUSH },
  /** Colour of palmar skin, which is paler and pinker than the rest. */
  uPalm: { value: new THREE.Color("#f3c4b4") },
  /** Red light scattered back out of the skin at grazing angles. */
  uRim: { value: new THREE.Color("#34100b") },
  /** Light that bleeds red through the skin around the shadow line. */
  uScatter: { value: new THREE.Color(0.16, 0.035, 0.02) },
  /** Direction of the key light, in model space. */
  uKey: { value: new THREE.Vector3(20, 30, 50).normalize() },
};

/** Skin: rises over veins, dimples when pressed, and carries pores, a lattice of fine lines, creases and blush. */
export const skinMaterial = tissue({
  key: "skin",
  uniforms: skinUniforms,
  vertexHead: "attribute float aVein;\nattribute vec3 aVeinGrad;\nattribute float aAO;\nvarying float vAO;\nuniform float uBulge;\nuniform vec4 uPress;\nuniform float uPressDepth;",
  vertexNormal: /* glsl */ `
    vec3 pressOffset = position - uPress.xyz;
    float pressR2 = uPress.w * uPress.w;
    float pressed = uPressDepth * exp(-dot(pressOffset, pressOffset) / pressR2);
    vec3 slope = uBulge * aVeinGrad + 2.0 * pressed * pressOffset / pressR2;
    objectNormal = normalize(objectNormal - (slope - dot(slope, objectNormal) * objectNormal));`,
  vertexPosition: "vAO = aAO;\ntransformed += normalize(normal) * (uBulge * aVein - pressed);",
  fragmentHead: `uniform vec4 uCrease[${CREASES.length}];\nuniform vec4 uCreaseDir[${CREASES.length}];\nuniform vec4 uPalmLine[${PALM_LINES.length}];\nuniform vec2 uPalmEnds[${PALM_LINES.length}];\nuniform vec4 uBlush[${BLUSH.length}];\nuniform vec3 uPalm;\nuniform vec3 uRim;\nuniform vec3 uScatter;\nuniform vec3 uKey;\nvarying float vAO;`,
  surface: /* glsl */ `
    vec3 sp = vObjPos;
    vec3 sn = normalize(vObjNormal);
    float micro = clamp(0.05 / max(length(fwidth(sp)), 1e-4) - 0.35, 0.0, 1.0);
    float mottle = fbm(sp * 0.55);
    float pores = mix(0.5, vnoise(sp * 30.0), micro);
    float lines = mix(0.5, fbm(sp * vec3(26.0, 7.0, 7.0)), micro);
    // Skin is scored by two families of fine furrows that cross to leave tiny diamonds.
    float warp = 3.0 * vnoise(sp * 5.0);
    float furrowA = abs(sin(dot(sp, vec3(19.0, 15.0, 15.0)) + warp));
    float furrowB = abs(sin(dot(sp, vec3(-19.0, 15.0, 15.0)) + warp * 1.3 + 2.0));
    float lattice = mix(0.6, sqrt(min(furrowA, furrowB)), micro);
    float crease = 0.0;
    for (int i = 0; i < ${CREASES.length}; i++) {
      vec3 q = sp - uCrease[i].xyz;
      float reach = 1.0 - smoothstep(uCrease[i].w * 0.7, uCrease[i].w, length(q));
      if (reach <= 0.0) continue;
      float d = dot(q, uCreaseDir[i].xyz);
      float face = uCreaseDir[i].w;
      float onFace = face == 0.0 ? 1.0 : smoothstep(0.0, 0.4, sn.z * face);
      float back = smoothstep(0.1, 0.55, -sn.z);
      float fold = exp(-d * d / 0.007) + 0.55 * exp(-(d - 0.16) * (d - 0.16) / 0.005);
      float wrinkles = (0.5 + 0.5 * cos(d * 34.0 + 5.0 * vnoise(sp * 3.0))) * exp(-d * d / 0.04);
      crease = max(crease, reach * onFace * mix(fold, 0.45 * wrinkles, face == 0.0 ? back : step(face, 0.0)));
    }
    float palmar = smoothstep(26.8, 28.5, sp.x) * smoothstep(0.2, 0.6, sn.z);
    float palmLine = 0.0;
    // No crease is ruled: each wanders a little as it crosses the palm.
    vec2 pp = sp.xy + 0.07 * (vec2(vnoise(sp * 1.5), vnoise(sp * 1.5 + 9.0)) - 0.5);
    for (int i = 0; i < ${PALM_LINES.length}; i++) {
      vec2 pa = pp - uPalmLine[i].xy;
      vec2 ba = uPalmLine[i].zw - uPalmLine[i].xy;
      float along = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      vec2 off = pa - ba * along;
      palmLine = max(palmLine, mix(uPalmEnds[i].x, uPalmEnds[i].y, along) * exp(-dot(off, off) / 0.0045));
    }
    crease = max(crease, 0.6 * palmLine * palmar);
    float blush = 0.0;
    for (int i = 0; i < ${BLUSH.length}; i++) {
      vec3 q = sp - uBlush[i].xyz;
      blush += exp(-dot(q, q) / (uBlush[i].w * uBlush[i].w));
    }
    blush = min(blush, 1.0);
    float freckle = smoothstep(0.8, 0.9, vnoise(sp * 8.0)) * smoothstep(0.45, 0.8, fbm(sp * 0.7 + 3.0)) * smoothstep(0.0, 0.5, -sn.z);
    float relief = 0.003 * pores + 0.006 * lines + 0.005 * lattice - 0.03 * crease;
    float palm = smoothstep(26.0, 29.5, sp.x) * smoothstep(-0.2, 0.45, sn.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uPalm * vColor.rgb, palm * 0.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.9, 0.88), blush * 0.22);
    diffuseColor.rgb *= (0.92 + 0.15 * mottle) * (0.985 + 0.03 * pores) * (1.0 - 0.16 * crease) * (1.0 - 0.2 * freckle);
    // Folds and web spaces receive less light, and what reaches them has passed through skin, so it is warmer.
    diffuseColor.rgb *= mix(vec3(0.7, 0.55, 0.5), vec3(1.0), vAO);`,
  finish: "roughnessFactor = clamp(roughnessFactor * (0.9 + 0.18 * pores) * (1.0 - 0.18 * palmar), 0.18, 1.0);",
  glow: /* glsl */ `
    float keyLight = dot(normalize(vObjNormal), uKey);
    float shadowLine = smoothstep(-0.5, 0.0, keyLight) * (1.0 - smoothstep(0.0, 0.55, keyLight));
    totalEmissiveRadiance += (uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6) + diffuseColor.rgb * uScatter * shadowLine * vAO) * diffuseColor.a;`,
});

// ─────────────────────── Deeper tissues ───────────────────────

const swell = (uniform: { value: number }) => ({
  uniforms: { uSwell: uniform },
  vertexHead: "attribute float aRadius;\nuniform float uSwell;",
  vertexPosition: "transformed += normalize(objectNormal) * aRadius * uSwell;",
});

const WET = /* glsl */ `
  float relief = 0.007 * fbm(vObjPos * 7.0);
  diffuseColor.rgb *= 0.88 + 0.2 * fbm(vObjPos * 2.3);`;

/** Veins distend with the tourniquet; arteries pulse. */
export const veinMaterial = tissue({ key: "vein", ...swell(live.vein), surface: WET });
export const arteryMaterial = tissue({ key: "artery", ...swell(live.artery), surface: WET });

/** Nerves: pale cords with faint longitudinal fascicles. */
export const nerveMaterial = tissue({
  key: "nerve",
  surface: /* glsl */ `
    float strand = fbm(vObjPos * vec3(1.5, 22.0, 22.0));
    float relief = 0.006 * strand;
    diffuseColor.rgb *= 0.86 + 0.2 * strand;`,
});

/** Muscle: fibres run the length of each belly; tendons keep the same grain. */
export const muscleMaterial = tissue({
  key: "muscle",
  vertexHead: "attribute vec2 aFiber;\nvarying vec2 vFiber;",
  vertexPosition: "vFiber = aFiber;",
  fragmentHead: "varying vec2 vFiber;",
  surface: /* glsl */ `
    float grain = fbm(vec3(cos(vFiber.y) * 7.0, sin(vFiber.y) * 7.0, vFiber.x * 3.5));
    float fibres = 0.5 + 0.5 * sin(vFiber.y * 72.0 + grain * 10.0);
    float bundles = 0.5 + 0.5 * sin(vFiber.y * 13.0 + grain * 4.0);
    float relief = 0.012 * fibres + 0.02 * bundles + 0.008 * fbm(vObjPos * 4.0);
    diffuseColor.rgb *= (0.78 + 0.2 * fibres) * (0.9 + 0.14 * bundles) * (0.92 + 0.16 * grain);`,
});

/** Bone: ivory with faint mottling and pitting. */
export const boneMaterial = tissue({
  key: "bone",
  surface: /* glsl */ `
    float mott = fbm(vObjPos * 1.7);
    float pits = vnoise(vObjPos * 24.0);
    float relief = 0.008 * pits + 0.01 * mott;
    diffuseColor.rgb *= (0.88 + 0.17 * mott) * (0.96 + 0.06 * pits);`,
});

/** Subcutaneous fat: soft yellow lobules separated by paler septa. */
export const fatMaterial = tissue({
  key: "fat",
  surface: /* glsl */ `
    float cell = 1.0 - abs(2.0 * vnoise(vObjPos * 2.8) - 1.0);
    float lobule = cell * cell;
    float fine = fbm(vObjPos * 10.0);
    float relief = 0.06 * lobule + 0.012 * fine;
    diffuseColor.rgb *= mix(vec3(0.78, 0.66, 0.46), vec3(1.07, 1.03, 0.9), lobule) * (0.92 + 0.14 * fine);`,
});

/** Deep fascia: a silvery sheet of mostly longitudinal collagen fibres. */
export const fasciaMaterial = tissue({
  key: "fascia",
  surface: /* glsl */ `
    float along = fbm(vObjPos * vec3(1.1, 17.0, 17.0));
    float across = fbm(vObjPos * vec3(12.0, 2.0, 2.0));
    float relief = 0.014 * along + 0.006 * across;
    diffuseColor.rgb *= (0.82 + 0.24 * along) * (0.95 + 0.08 * across);`,
});
