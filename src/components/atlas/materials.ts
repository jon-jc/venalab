import * as THREE from "three";
import { DIGITS } from "@/lib/anatomy/skin";
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
for (const d of DIGITS.slice(1)) CREASES.push({ at: new THREE.Vector4(d.joints[0][0] + 0.2, d.joints[0][1], -0.9, 1.15), dir: new THREE.Vector4(1, 0, 0, -1) });
CREASES.push({ at: new THREE.Vector4(26.3, 0, 0.8, 3.7), dir: new THREE.Vector4(1, 0, 0, 1) }); // wrist
CREASES.push({ at: new THREE.Vector4(0.2, 0, 2.4, 4.8), dir: new THREE.Vector4(1, 0, 0, 1) }); // elbow

export const skinUniforms = {
  uBulge: live.bulge,
  uPress: live.press,
  uPressDepth: live.pressDepth,
  uCrease: { value: CREASES.map((c) => c.at) },
  uCreaseDir: { value: CREASES.map((c) => c.dir) },
  /** Colour of palmar skin, which is paler and pinker than the rest. */
  uPalm: { value: new THREE.Color("#f3c4b4") },
  /** Red light scattered back out of the skin at grazing angles. */
  uRim: { value: new THREE.Color("#5a1a12") },
};

/** Skin: rises over veins, dimples when pressed, and carries pores, fine lines and creases. */
export const skinMaterial = tissue({
  key: "skin",
  uniforms: skinUniforms,
  vertexHead: "attribute float aVein;\nattribute vec3 aVeinGrad;\nuniform float uBulge;\nuniform vec4 uPress;\nuniform float uPressDepth;",
  vertexNormal: /* glsl */ `
    vec3 pressOffset = position - uPress.xyz;
    float pressR2 = uPress.w * uPress.w;
    float pressed = uPressDepth * exp(-dot(pressOffset, pressOffset) / pressR2);
    vec3 slope = uBulge * aVeinGrad + 2.0 * pressed * pressOffset / pressR2;
    objectNormal = normalize(objectNormal - (slope - dot(slope, objectNormal) * objectNormal));`,
  vertexPosition: "transformed += normalize(normal) * (uBulge * aVein - pressed);",
  fragmentHead: `uniform vec4 uCrease[${CREASES.length}];\nuniform vec4 uCreaseDir[${CREASES.length}];\nuniform vec3 uPalm;\nuniform vec3 uRim;`,
  surface: /* glsl */ `
    vec3 sp = vObjPos;
    vec3 sn = normalize(vObjNormal);
    float mottle = fbm(sp * 0.55);
    float pores = vnoise(sp * 30.0);
    float lines = fbm(sp * vec3(26.0, 7.0, 7.0));
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
      float wrinkles = (0.5 + 0.5 * cos(d * 40.0)) * exp(-d * d / 0.07);
      crease = max(crease, reach * onFace * mix(fold, 0.7 * wrinkles, face == 0.0 ? back : step(face, 0.0)));
    }
    float relief = 0.006 * pores + 0.011 * lines - 0.035 * crease;
    float palm = smoothstep(26.0, 29.5, sp.x) * smoothstep(-0.2, 0.45, sn.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, uPalm * vColor.rgb, palm * 0.7);
    diffuseColor.rgb *= (0.92 + 0.15 * mottle) * (0.97 + 0.06 * pores) * (1.0 - 0.24 * crease);`,
  glow: "totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6) * diffuseColor.a;",
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
