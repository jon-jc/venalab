"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useKit } from "./kit";
import { live, OFFSET } from "./live";
import { needleHud, useAtlas } from "./store";

const projected = new THREE.Vector3();

/** Show the floating readout beside a point on the model (in model coordinates). */
export function showHud(camera: THREE.Camera, size: { width: number; height: number }, p: THREE.Vector3, text: string, lift = "-230%") {
  const el = needleHud.el;
  if (!el) return;
  projected.set(p.x - OFFSET, p.y, p.z).project(camera);
  el.style.visibility = "visible";
  el.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, ${lift})`;
  if (el.textContent !== text) el.textContent = text;
}

/** A frame on the skin whose z is the surface normal and whose y runs along the skin toward the bottom of the screen, where the collector is. */
function towardViewer(camera: THREE.Camera, at: THREE.Vector3, normal: THREE.Vector3, out: THREE.Quaternion) {
  const y = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion);
  y.addScaledVector(normal, -y.dot(normal));
  // Looking straight along the skin, fall back to the direction of the camera itself.
  if (y.lengthSq() < 0.02) {
    y.set(camera.position.x + OFFSET, camera.position.y, camera.position.z).sub(at);
    y.addScaledVector(normal, -y.dot(normal));
  }
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, normal);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, normal));
}

const FEEL = { vein: "#7fa2ff", artery: "#ff4d57", tendon: "#efe7d6", none: "#9aa7bb" };

/**
 * The palpating fingertip: a gloved index finger that follows the pointer over
 * the arm, pressing into the skin. It springs back over a vein and throbs with
 * the pulse over an artery, and what it feels is written beside it.
 */
export function Fingertip() {
  const palp = useAtlas((s) => s.palp);
  const active = useAtlas((s) => s.mode === "sim" && s.procedure === "venous" && (s.sim.stage === "palpate" || !!s.demo));
  const kit = useKit();
  const group = useRef<THREE.Group>(null);
  const finger = useRef<THREE.Group>(null);
  const at = useRef(new THREE.Vector3());
  const settled = useRef(false);
  const q = useRef(new THREE.Quaternion());

  useFrame(({ clock, camera, size }, dt) => {
    if (!group.current || !finger.current || !active || !palp?.p || !palp.n) {
      settled.current = false;
      return;
    }
    const target = new THREE.Vector3(palp.p[0], palp.p[1], palp.p[2]);
    const normal = new THREE.Vector3(palp.n[0], palp.n[1], palp.n[2]);
    if (settled.current) at.current.lerp(target, 1 - Math.exp(-dt * 24));
    else at.current.copy(target);
    towardViewer(camera, at.current, normal, q.current);
    if (settled.current) group.current.quaternion.slerp(q.current, 1 - Math.exp(-dt * 14));
    else group.current.quaternion.copy(q.current);
    settled.current = true;
    group.current.position.copy(at.current);
    const t = clock.elapsedTime;
    const press = palp.kind === "vein" ? 0.1 + 0.07 * Math.sin(t * 5) : palp.kind === "artery" ? 0.05 + 0.11 * live.pulse : 0.09 + 0.02 * Math.sin(t * 3);
    finger.current.position.z = 0.42 - press;
    showHud(camera, size, at.current, palp.label ?? palp.text, "-420%");
  });

  if (!active || !palp?.p) return null;
  return (
    <group ref={group}>
      <mesh renderOrder={9}>
        <ringGeometry args={[0.62, 0.7, 48]} />
        <meshBasicMaterial color={FEEL[palp.kind]} transparent opacity={0.9} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the finger rises from the skin and leans back toward the collector */}
      <group ref={finger} rotation={[0.55, 0, 0]}>
        <mesh geometry={kit.Finger} castShadow>
          <meshPhysicalMaterial color="#5878d8" roughness={0.42} clearcoat={0.45} clearcoatRoughness={0.3} sheen={0.4} sheenColor="#c9d6ff" />
        </mesh>
      </group>
    </group>
  );
}
