"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAtlas } from "./store";

const FRONT = new THREE.Vector3(0, 0, 1);

/**
 * Capillary puncture: a spring-loaded lancet fires into the fingertip and lifts
 * away, a drop of blood wells up, and a microcollection tube takes it.
 */
export function Fingerstick() {
  const cap = useAtlas((s) => s.cap);
  const device = useRef<THREE.Group>(null);
  const drop = useRef<THREE.Mesh>(null);
  const tube = useRef<THREE.Group>(null);
  const level = useRef<THREE.Mesh>(null);
  const welling = useRef(0);
  const fill = useRef(0);

  // A wiped finger starts a fresh drop.
  useEffect(() => {
    welling.current = performance.now();
  }, [cap.wiped, cap.puncturedAt]);
  useEffect(() => {
    fill.current = 0;
  }, [cap.site]);

  const q = useMemo(() => (cap.normal ? new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(...cap.normal)) : null), [cap.normal]);

  useFrame((_, dt) => {
    const since = cap.puncturedAt ? (Date.now() - cap.puncturedAt) / 1000 : -1;
    if (device.current) {
      // Held just off the skin; on firing it presses in, then is lifted clear.
      const lift = since < 0 ? 0.3 : since < 0.15 ? 0.3 - 0.42 * (since / 0.15) : -0.12 + (since - 0.15) * 16;
      device.current.position.z = lift;
      device.current.visible = lift < 9;
    }
    const flow = (cap.warmed ? 1 : 0.5) * Math.min(cap.lancet / 2, 1.15);
    const bleeding = since > 0.3;
    const size = bleeding ? Math.min(0.26, 0.085 * flow * ((performance.now() - welling.current) / 1000)) : 0;
    if (drop.current) {
      drop.current.visible = size > 0.012;
      // Across the ridges the blood beads; along them it runs away down the grooves.
      if (cap.across) drop.current.scale.set(size, size, size * 0.85);
      else drop.current.scale.set(size * 2.8, size * 0.8, size * 0.3);
      drop.current.position.z = cap.across ? size * 0.55 : size * 0.1;
    }
    if (cap.phase === "collecting") fill.current = Math.min(1, fill.current + dt * 0.2 * flow * (cap.milking ? 1.7 : 1));
    if (tube.current) tube.current.visible = cap.phase === "collecting" || (cap.phase === "done" && fill.current > 0);
    if (level.current) {
      const h = Math.max(fill.current * 1.5, 0.001);
      level.current.scale.y = h;
      level.current.position.y = 0.35 + h / 2;
      level.current.visible = fill.current > 0.01;
    }
  });

  if (!cap.site || !q) return null;
  return (
    <group position={cap.site} quaternion={q}>
      <mesh renderOrder={8}>
        <ringGeometry args={[0.16, 0.2, 32]} />
        <meshBasicMaterial color="#35e0c2" transparent opacity={cap.phase === "aim" ? 0.95 : 0} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      {/* single-use safety lancet */}
      <group ref={device}>
        <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, cap.across ? 0 : Math.PI / 2]} castShadow>
          <boxGeometry args={[1.5, 3.4, 0.75]} />
          <meshPhysicalMaterial color="#7fb2ff" roughness={0.35} clearcoat={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.3, 0.28, 24]} />
          <meshStandardMaterial color="#eef2f7" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 3.75]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.3, 20]} />
          <meshStandardMaterial color="#f5a524" roughness={0.5} />
        </mesh>
      </group>
      <mesh ref={drop} visible={false}>
        <sphereGeometry args={[1, 28, 20]} />
        <meshPhysicalMaterial color="#8c0d1a" roughness={0.08} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      {/* microcollection tube, its scoop touching the drop */}
      <group ref={tube} visible={false} position={[0.42, 0, 0.3]} rotation={[0, 0, -Math.PI / 2 - 0.5]}>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.3, 0.2, 2.1, 24, 1, true]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.24} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.2, 0.34, 0.26, 24]} />
          <meshStandardMaterial color={cap.edtaFirst ? "#b79adf" : "#d6a53a"} roughness={0.6} />
        </mesh>
        <mesh ref={level} visible={false}>
          <cylinderGeometry args={[0.2, 0.2, 1, 20]} />
          <meshPhysicalMaterial color="#7a0c18" roughness={0.15} clearcoat={0.8} />
        </mesh>
      </group>
    </group>
  );
}
