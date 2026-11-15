"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { describe, locate } from "@/lib/anatomy/capillary";
import { DIGITS, skinNormal, skinSDF } from "@/lib/anatomy/skin";
import { useKit } from "./kit";
import { live } from "./live";
import { LEVELS, useAtlas } from "./store";
import { showHud } from "./Tools";

const FRONT = new THREE.Vector3(0, 0, 1);

/** The recommended places to puncture: either side of the midline on the pads of the middle and ring fingers. */
function goodSites() {
  const out: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  for (const digit of [2, 3]) {
    const d = DIGITS[digit];
    const a = new THREE.Vector3(...d.joints[2]);
    const axis = new THREE.Vector3(...d.joints[3]).sub(a);
    const o = a.clone().addScaledVector(axis, 0.68);
    axis.normalize();
    const pad = new THREE.Vector3(...d.back).negate();
    pad.addScaledVector(axis, -pad.dot(axis)).normalize();
    const side = new THREE.Vector3().crossVectors(pad, axis);
    for (const sign of [-1, 1]) {
      const ray = pad.clone().multiplyScalar(Math.cos(0.6)).addScaledVector(side, sign * Math.sin(0.6));
      let lo = 0;
      let hi = d.radii[2] * 2.2;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (skinSDF(o.x + ray.x * mid, o.y + ray.y * mid, o.z + ray.z * mid) < 0) lo = mid;
        else hi = mid;
      }
      const p = o.clone().addScaledVector(ray, lo);
      out.push({ p, q: new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(...skinNormal(p.x, p.y, p.z))) });
    }
  }
  return out;
}

/**
 * Capillary puncture: guides to the right place, a safety lancet that fires
 * into the fingertip and is lifted away, a drop of blood that wells up, and a
 * microcollection tube that takes it.
 */
export function Fingerstick() {
  const cap = useAtlas((s) => s.cap);
  const hints = useAtlas((s) => LEVELS[s.difficulty].hints);
  const kit = useKit();
  const device = useRef<THREE.Group>(null);
  const drop = useRef<THREE.Mesh>(null);
  const tube = useRef<THREE.Group>(null);
  const level = useRef<THREE.Mesh>(null);
  const welling = useRef(0);
  const fill = useRef(0);
  const hover = useRef(new THREE.Vector3());
  const guides = useMemo(goodSites, []);

  // A wiped finger starts a fresh drop.
  useEffect(() => {
    welling.current = performance.now();
  }, [cap.wiped, cap.puncturedAt]);
  useEffect(() => {
    fill.current = 0;
  }, [cap.site]);

  const q = useMemo(() => (cap.normal ? new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(...cap.normal)) : null), [cap.normal]);

  useFrame(({ camera, size }, dt) => {
    // While choosing a site, name the finger under the pointer.
    if (cap.step === 2 && (live.hover.held || performance.now() - live.hover.at < 250)) {
      hover.current.copy(live.hover.p);
      showHud(camera, size, hover.current, describe(locate([hover.current.x, hover.current.y, hover.current.z]), hints), "-260%");
    }
    const since = cap.puncturedAt ? (Date.now() - cap.puncturedAt) / 1000 : -1;
    if (device.current) {
      // Held just off the skin; on firing it presses in, then is lifted clear.
      const lift = since < 0 ? 0.32 : since < 0.15 ? 0.32 - 0.44 * (since / 0.15) : -0.12 + (since - 0.15) * 16;
      device.current.position.z = lift;
      device.current.visible = cap.step >= 4 && lift < 9;
    }
    const flow = (cap.warmed ? 1 : 0.5) * Math.min(cap.lancet / 2.2, 1.15);
    const size0 = since > 0.3 ? Math.min(0.26, 0.085 * flow * ((performance.now() - welling.current) / 1000)) : 0;
    if (drop.current) {
      drop.current.visible = size0 > 0.012;
      // Across the ridges the blood beads; along them it runs away down the grooves.
      if (cap.across) drop.current.scale.set(size0, size0, size0 * 0.85);
      else drop.current.scale.set(size0 * 2.8, size0 * 0.8, size0 * 0.3);
      drop.current.position.z = cap.across ? size0 * 0.55 : size0 * 0.1;
    }
    if (cap.phase === "collecting") fill.current = Math.min(1, fill.current + dt * 0.2 * flow * (cap.milking ? 1.7 : 1));
    if (tube.current) tube.current.visible = cap.phase === "collecting" || (cap.phase === "done" && fill.current > 0);
    if (level.current) {
      const h = Math.max(fill.current * 1.25, 0.001);
      level.current.scale.y = h;
      level.current.position.y = 0.62 + h / 2;
      level.current.visible = fill.current > 0.01;
    }
  });

  return (
    <>
      {hints && cap.step === 2 &&
        guides.map((g, i) => (
          <mesh key={i} position={g.p} quaternion={g.q} scale={[0.3, 0.3, 0.05]} renderOrder={8}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshBasicMaterial color="#35e0c2" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        ))}
      {cap.site && q && (
        <group position={cap.site} quaternion={q}>
          <mesh renderOrder={8}>
            <ringGeometry args={[0.16, 0.2, 32]} />
            <meshBasicMaterial color="#35e0c2" transparent opacity={cap.phase === "aim" ? 0.95 : 0} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
          {/* single-use safety lancet, its blade turned across or along the fingerprint ridges */}
          <group ref={device} visible={false}>
            <group rotation={[Math.PI / 2, 0, 0]}>
              <group rotation={[0, cap.across ? 0 : Math.PI / 2, 0]}>
                <mesh geometry={kit.LancetBody} castShadow>
                  <meshPhysicalMaterial color="#7fb2ff" roughness={0.32} clearcoat={0.6} />
                </mesh>
                <mesh geometry={kit.LancetGrip}>
                  <meshPhysicalMaterial color="#4f86e8" roughness={0.5} />
                </mesh>
                <mesh geometry={kit.LancetNozzle}>
                  <meshStandardMaterial color="#f1f4f8" roughness={0.45} />
                </mesh>
                <mesh geometry={kit.LancetButton}>
                  <meshPhysicalMaterial color="#f5a524" roughness={0.4} clearcoat={0.5} />
                </mesh>
              </group>
            </group>
          </group>
          <mesh ref={drop} visible={false}>
            <sphereGeometry args={[1, 28, 20]} />
            <meshPhysicalMaterial color="#8c0d1a" roughness={0.08} clearcoat={1} clearcoatRoughness={0.05} />
          </mesh>
          {/* microcollection tube, its scoop touching the drop */}
          <group ref={tube} visible={false} position={[0.3, 0, 0.3]} rotation={[0, 0, -Math.PI / 2 - 0.45]}>
            <mesh geometry={kit.MicroTube}>
              <meshPhysicalMaterial color="#ffffff" transparent opacity={0.28} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={kit.MicroCap}>
              <meshPhysicalMaterial color={cap.edtaFirst ? "#b79adf" : "#d6a53a"} roughness={0.55} />
            </mesh>
            <mesh ref={level} visible={false}>
              <cylinderGeometry args={[0.19, 0.24, 1, 20]} />
              <meshPhysicalMaterial color="#7a0c18" roughness={0.15} clearcoat={0.8} />
            </mesh>
          </group>
        </group>
      )}
    </>
  );
}
