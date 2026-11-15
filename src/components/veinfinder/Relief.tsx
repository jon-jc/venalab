"use client";

import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { Analysis } from "@/lib/veinfinder/pipeline";

const COLORS = ["#35e0c2", "#9be15d", "#f5a524", "#9fb3c8", "#9fb3c8"];

/**
 * The analysed photograph as a 3D relief: the limb is raised from the
 * background by its distance from the outline, veins stand proud of the skin,
 * and the needle is posed at each suggested site.
 */
function Surface({ a, texture, selected, angle }: { a: Analysis; texture: HTMLCanvasElement; selected: number; angle: number }) {
  const { geometry, heightAt, toWorld } = useMemo(() => {
    const { width: w, height: h, inset, vessel, limbWidthPx } = a;
    const R = limbWidthPx / 2;
    const gx = Math.min(w, 260);
    const gy = Math.max(2, Math.round((gx * h) / w));
    const aspect = h / w;
    const height = (px: number, py: number) => {
      const x = Math.min(w - 1, Math.max(0, Math.round(px)));
      const y = Math.min(h - 1, Math.max(0, Math.round(py)));
      let acc = 0, v = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const d = inset[yy * w + xx];
          acc += d > 0 ? Math.pow(d, 0.72) * Math.pow(R, 0.28) : 0;
          v += vessel[yy * w + xx];
          c++;
        }
      return ((acc / c) * 0.62 + (v / c) * R * 0.09) / w;
    };
    const pos = new Float32Array((gx + 1) * (gy + 1) * 3);
    const uv = new Float32Array((gx + 1) * (gy + 1) * 2);
    for (let j = 0; j <= gy; j++)
      for (let i = 0; i <= gx; i++) {
        const k = j * (gx + 1) + i;
        const u = i / gx, v = j / gy;
        pos[k * 3] = u - 0.5;
        pos[k * 3 + 1] = (0.5 - v) * aspect;
        pos[k * 3 + 2] = height(u * (w - 1), v * (h - 1));
        uv[k * 2] = u;
        uv[k * 2 + 1] = 1 - v;
      }
    const idx: number[] = [];
    for (let j = 0; j < gy; j++)
      for (let i = 0; i < gx; i++) {
        const p = j * (gx + 1) + i;
        idx.push(p, p + gx + 1, p + 1, p + 1, p + gx + 1, p + gx + 2);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    const toWorld = (px: number, py: number, lift = 0): [number, number, number] => [px / (w - 1) - 0.5, (0.5 - py / (h - 1)) * aspect, height(px, py) + lift];
    return { geometry, heightAt: height, toWorld };
  }, [a]);

  const map = useMemo(() => {
    const t = new THREE.CanvasTexture(texture);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [texture]);
  useEffect(() => () => map.dispose(), [map]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  void heightAt;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial map={map} roughness={0.62} clearcoat={0.12} clearcoatRoughness={0.6} />
      </mesh>
      {a.candidates.map((c, i) => {
        const pts = c.points.filter((_, k) => k % 2 === 0).map((p) => toWorld(p[0], p[1], 0.004));
        const on = i === selected;
        const tip = toWorld(c.target[0], c.target[1], 0.001);
        const rad = (angle * Math.PI) / 180;
        // Direction of needle travel: along the vein toward the heart, tilted down into the skin.
        const travel = new THREE.Vector3(c.direction[0], -c.direction[1], 0).normalize().multiplyScalar(Math.cos(rad)).add(new THREE.Vector3(0, 0, -Math.sin(rad)));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), travel.clone().negate());
        return (
          <group key={c.rank}>
            <Line points={pts} color={COLORS[i]} lineWidth={on ? 4 : 2} transparent opacity={on ? 1 : 0.7} />
            <mesh position={tip}>
              <sphereGeometry args={[on ? 0.008 : 0.005, 16, 16]} />
              <meshBasicMaterial color={COLORS[i]} />
            </mesh>
            {on && (
              <group position={tip} quaternion={q}>
                <mesh position={[0, 0.06, 0]} castShadow>
                  <cylinderGeometry args={[0.0016, 0.0016, 0.12, 10]} />
                  <meshStandardMaterial color="#e3e8ef" metalness={0.95} roughness={0.2} />
                </mesh>
                <mesh position={[0, 0.14, 0]} castShadow>
                  <cylinderGeometry args={[0.011, 0.006, 0.045, 16]} />
                  <meshStandardMaterial color="#2f9e58" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.235, 0]}>
                  <cylinderGeometry args={[0.03, 0.03, 0.15, 24, 1, true]} />
                  <meshPhysicalMaterial color="#d9ecff" transparent opacity={0.25} roughness={0.1} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

export default function Relief({ analysis, texture, selected, angle }: { analysis: Analysis; texture: HTMLCanvasElement; selected: number; angle: number }) {
  return (
    <Canvas shadows camera={{ position: [0, -0.62, 0.72], fov: 38, near: 0.01, far: 10, up: [0, 0, 1] }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[0.5, 0.6, 1.2]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-0.7}
        shadow-camera-right={0.7}
        shadow-camera-top={0.7}
        shadow-camera-bottom={-0.7}
        shadow-camera-near={0.1}
        shadow-camera-far={4}
        shadow-bias={-0.0006}
      />
      <directionalLight position={[-0.8, -0.4, 0.5]} intensity={0.6} color="#bcd4ff" />
      <Surface a={analysis} texture={texture} selected={selected} angle={angle} />
      <OrbitControls enableDamping target={[0, 0, 0.03]} minDistance={0.25} maxDistance={2.2} maxPolarAngle={Math.PI * 0.49} />
    </Canvas>
  );
}
