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
 * The palpating hand: a gloved hand whose index finger follows the pointer over
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
    // The modelled fingertip sits 4 mm clear of its origin; bring the pad down onto the skin and press.
    finger.current.position.z = -0.3 - press;
    showHud(camera, size, at.current, palp.label ?? palp.text, "-420%");
  });

  if (!active || !palp?.p) return null;
  return (
    <group ref={group}>
      <mesh renderOrder={9}>
        <ringGeometry args={[0.62, 0.7, 48]} />
        <meshBasicMaterial color={FEEL[palp.kind]} transparent opacity={0.9} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      {/* the hand reaches in from the collector's side, index finger on the skin */}
      <group ref={finger}>
        <group rotation={[0, 0, Math.PI]}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={kit.Hand} castShadow>
              <meshPhysicalMaterial color="#4f73d9" roughness={0.4} clearcoat={0.5} clearcoatRoughness={0.28} sheen={0.5} sheenColor="#c9d6ff" />
            </mesh>
            <mesh geometry={kit.HandCuff} castShadow>
              <meshPhysicalMaterial color="#4467c9" roughness={0.45} clearcoat={0.4} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

const FRONT = new THREE.Vector3(0, 0, 1);

/**
 * Cleansing: an alcohol wipe that follows the pointer over the skin, a ring
 * marking the site to be cleaned, and the wet sheen the alcohol leaves, which
 * spreads as the site is scrubbed and dries away afterwards.
 */
export function Cleansing() {
  const capillary = useAtlas((s) => s.procedure === "capillary");
  const wiping = useAtlas((s) => !s.demo && (s.procedure === "venous" ? s.sim.stage === "cleanse" : s.cap.wiping));
  const site = useAtlas((s) => (s.procedure === "capillary" ? s.cap.site : s.sim.entry));
  const normal = useAtlas((s) => (s.procedure === "capillary" ? s.cap.normal : s.sim.normal));
  const cleansedAt = useAtlas((s) => (s.procedure === "capillary" ? s.cap.cleansedAt : s.sim.cleansedAt));
  const kit = useKit();
  const pad = useRef<THREE.Group>(null);
  const sheen = useRef<THREE.Mesh>(null);
  const wet = useRef<THREE.MeshPhysicalMaterial>(null);
  const at = useRef(new THREE.Vector3());
  const q = useRef(new THREE.Quaternion());
  const settled = useRef(false);

  useFrame(({ camera, size }, dt) => {
    const scrub = useAtlas.getState().scrub;
    if (sheen.current && wet.current) {
      // Alcohol evaporates from the skin in a few seconds.
      const amount = wiping ? scrub : cleansedAt ? Math.max(0, 1 - (Date.now() - cleansedAt) / 5000) : 0;
      sheen.current.visible = amount > 0.01;
      wet.current.opacity = 0.5 * amount;
    }
    if (!pad.current || !wiping || !site || !normal) {
      settled.current = false;
      return;
    }
    // In the hand over the skin; otherwise waiting just above the site.
    const onSkin = performance.now() - live.wipe.at < 1500;
    const n = onSkin ? live.wipe.n : new THREE.Vector3(normal[0], normal[1], normal[2]);
    const target = onSkin ? live.wipe.p : new THREE.Vector3(site[0], site[1], site[2]).addScaledVector(n, 1.6);
    if (settled.current) at.current.lerp(target, 1 - Math.exp(-dt * 26));
    else at.current.copy(target);
    towardViewer(camera, at.current, n, q.current);
    if (settled.current) pad.current.quaternion.slerp(q.current, 1 - Math.exp(-dt * 12));
    else pad.current.quaternion.copy(q.current);
    settled.current = true;
    pad.current.position.copy(at.current);
    showHud(camera, size, at.current, scrub > 0 ? `Scrubbing… ${Math.round(scrub * 100)}%` : "Rub the wipe over the site", "-330%");
  });

  if (!site || !normal) return null;
  const facing = new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(normal[0], normal[1], normal[2]));
  const r = capillary ? 0.75 : 1.8;
  return (
    <>
      <group position={site} quaternion={facing}>
        {wiping && (
          <mesh renderOrder={8}>
            <ringGeometry args={[r * 0.92, r, 56]} />
            <meshBasicMaterial color="#35e0c2" transparent opacity={0.8} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
        )}
        <mesh ref={sheen} visible={false} scale={[r, r, r * 0.16]} renderOrder={7}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshPhysicalMaterial ref={wet} color="#e4f4ff" transparent opacity={0} roughness={0.02} clearcoat={1} depthWrite={false} />
        </mesh>
      </group>
      {wiping && (
        <group ref={pad} scale={capillary ? 0.55 : 1}>
          <mesh geometry={kit.Wipe} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <meshPhysicalMaterial color="#f2f7fc" roughness={0.9} sheen={1} sheenColor="#ffffff" sheenRoughness={0.6} />
          </mesh>
        </group>
      )}
    </>
  );
}
