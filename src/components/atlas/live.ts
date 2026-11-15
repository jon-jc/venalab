import * as THREE from "three";

/** The model is shifted along x so that the mid-forearm sits at the world origin. */
export const OFFSET = 14;

/** Live physiological state shared by shaders and animated parts. */
export const live = {
  /** Fractional increase in vein radius (tourniquet distension). */
  vein: { value: 0 },
  /** Fractional increase in artery radius (pulse wave). */
  artery: { value: 0 },
  /** Arterial pressure pulse, 0..1, at 72 beats per minute. */
  pulse: 0,
  /** Height (cm) by which the skin rises over a superficial vein. */
  bulge: { value: 0.03 },
  /** Where something is pressing on the skin (xyz, radius in cm) and how deep. */
  press: { value: new THREE.Vector4(0, 0, 0, 1) },
  pressDepth: { value: 0 },
  /** Where the alcohol wipe is on the skin, and when the pointer last moved it. */
  wipe: { p: new THREE.Vector3(), n: new THREE.Vector3(0, 0, 1), at: 0 },
  /** Millimetres of needle beneath the skin right now (negative while it hovers). */
  needle: -100,
};

export function heartbeat(t: number): number {
  const p = (t * 1.2) % 1;
  return Math.exp(-(((p - 0.12) / 0.07) ** 2)) + 0.32 * Math.exp(-(((p - 0.36) / 0.09) ** 2));
}
