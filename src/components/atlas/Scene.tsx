"use client";

import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Built } from "@/lib/anatomy/geometry";
import { DILATION, needleDir, palpate } from "@/lib/anatomy/sim";
import { onLimb, skinNormal, type Vec3 } from "@/lib/anatomy/skin";
import { LAYER_COLOR, LAYER_ORDER, type LayerId } from "@/lib/anatomy/structures";
import { heartbeat, live } from "./live";
import { arteryMaterial, boneMaterial, fasciaMaterial, fatMaterial, muscleMaterial, nerveMaterial, skinMaterial, skinUniforms, veinMaterial } from "./materials";
import { effectiveLayers, labelEls, TONES, useAtlas, VIEWS, type Layers } from "./store";
import { useAnatomy } from "./useAnatomy";

/** The model is shifted so the mid-forearm sits at the world origin. */
const OFFSET = 14;
const ORDER: Record<LayerId, number> = { bones: 0, muscles: 1, arteries: 2, nerves: 2, fascia: 3, veins: 4, fat: 5, skin: 6 };
const TISSUE = { veins: veinMaterial, arteries: arteryMaterial, nerves: nerveMaterial, muscles: muscleMaterial, bones: boneMaterial };
const noRaycast = () => null;
const meshRaycast = THREE.Mesh.prototype.raycast;
const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);

function Physiology() {
  const tourniquet = useAtlas((s) => s.tourniquet);
  useFrame(({ clock }, dt) => {
    const target = tourniquet ? DILATION - 1 : 0;
    live.vein.value += (target - live.vein.value) * (1 - Math.exp(-Math.min(dt, 0.05) * (tourniquet ? 1.1 : 2.2)));
    live.pulse = heartbeat(clock.elapsedTime);
    live.artery.value = 0.085 * live.pulse;
    live.bulge.value = 0.03 + 0.42 * live.vein.value;

    // The skin gives under a palpating fingertip, and tents under the needle until it punctures.
    const s = useAtlas.getState();
    let want = 0;
    if (s.mode === "sim" && s.sim.phase === "advancing" && s.sim.entry && live.needle < 3.5) {
      const e = s.sim.entry;
      live.press.value.set(e[0], e[1], e[2], 0.55);
      want = 0.2 * Math.min(Math.max((live.needle + 3) / 5, 0), 1);
    } else if (s.mode === "sim" && s.sim.phase === "aim" && s.palp?.p) {
      const p = s.palp.p;
      live.press.value.set(p[0], p[1], p[2], 0.95);
      want = s.palp.kind === "vein" ? 0.11 + 0.05 * Math.sin(clock.elapsedTime * 5) : s.palp.kind === "artery" ? 0.07 + 0.08 * live.pulse : 0.1;
    }
    live.pressDepth.value += (want - live.pressDepth.value) * (1 - Math.exp(-Math.min(dt, 0.05) * 14));
  });
  return null;
}

const ZERO: Layers = { skin: 0, fat: 0, veins: 0, fascia: 0, nerves: 0, arteries: 0, muscles: 0, bones: 0 };
/** Seconds after load at which each layer starts to appear, deepest first. */
const ASSEMBLE: Layers = { bones: 0.3, muscles: 0.9, arteries: 1.5, nerves: 1.5, veins: 1.9, fascia: 2.3, fat: 2.5, skin: 2.7 };

/** Layers cross-fade toward their targets, so presets peel away instead of snapping. */
function useAnimatedLayers(target: Layers, assemble: boolean): Layers {
  const [shown, setShown] = useState<Layers>(ZERO);
  const cur = useRef<Layers>(ZERO);
  const born = useRef<number | null>(null);
  useFrame(({ clock }, dt) => {
    born.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    let next: Layers | null = null;
    for (const id of LAYER_ORDER) {
      if (assemble && age < ASSEMBLE[id]) continue;
      const d = target[id] - cur.current[id];
      if (d === 0) continue;
      const step = Math.min(dt, 0.05) * 2.2;
      next ??= { ...cur.current };
      next[id] = Math.abs(d) <= step ? target[id] : cur.current[id] + Math.sign(d) * step;
    }
    if (next) {
      cur.current = next;
      setShown(next);
    }
  });
  return shown;
}

interface ClipProps {
  clippingPlanes: THREE.Plane[];
  side: THREE.Side;
}

function StructureMesh({ b, opacity, interactive, clip }: { b: Built; opacity: number; interactive: boolean; clip: ClipProps }) {
  const id = b.def.id;
  const layer = b.def.layer;
  const selected = useAtlas((s) => s.selected === id);
  const hovered = useAtlas((s) => s.hovered === id);
  const flow = useAtlas((s) => s.flow && s.mode === "explore");
  const muscle = layer === "muscles";
  const vessel = layer === "veins" || layer === "arteries";
  const color = muscle ? "#ffffff" : (b.def.color ?? LAYER_COLOR[layer]);
  const alpha = vessel && flow ? opacity * 0.3 : opacity;
  const set = useAtlas.getState().set;
  return (
    <mesh
      geometry={b.geometry}
      renderOrder={ORDER[layer]}
      castShadow={alpha >= 1}
      receiveShadow
      raycast={interactive ? meshRaycast : noRaycast}
      onPointerOver={(e) => {
        e.stopPropagation();
        set({ hovered: id });
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (useAtlas.getState().hovered === id) set({ hovered: null });
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        set({ selected: id });
      }}
    >
      <meshPhysicalMaterial
        key={`${clip.clippingPlanes.length}-${layer}-${alpha < 1}`}
        color={color}
        vertexColors={muscle}
        roughness={layer === "bones" ? 0.72 : muscle ? 0.5 : 0.34}
        clearcoat={layer === "bones" ? 0.05 : vessel ? 0.7 : 0.35}
        clearcoatRoughness={0.3}
        emissive={selected ? "#35e0c2" : hovered ? "#ffffff" : "#000000"}
        emissiveIntensity={selected ? 0.5 : hovered ? 0.16 : 0}
        transparent={alpha < 1}
        opacity={alpha}
        depthWrite={alpha >= 1}
        {...TISSUE[layer]}
        {...clip}
      />
    </mesh>
  );
}

/** Blood cells streaming along the vessel centre-lines: veins toward the heart, arteries away from it. */
function Flow({ built, layer }: { built: Built[]; layer: "veins" | "arteries" }) {
  const tourniquet = useAtlas((s) => s.tourniquet);
  const { lines, cells } = useMemo(() => {
    const lines: { pts: Vec3[]; radii: number[]; cum: number[]; len: number }[] = [];
    const cells: { line: number; s: number; k: number; jitter: number }[] = [];
    for (const b of built) {
      if (b.def.layer !== layer) continue;
      for (const path of b.paths) {
        const cum = [0];
        for (let i = 1; i < path.pts.length; i++) {
          const a = path.pts[i - 1];
          const c = path.pts[i];
          cum.push(cum[i - 1] + Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
        }
        const len = cum[cum.length - 1];
        const n = Math.max(2, Math.round(len / 0.7));
        for (let i = 0; i < n; i++) cells.push({ line: lines.length, s: ((i + Math.random() * 0.6) / n) * len, k: 0, jitter: 0.8 + Math.random() * 0.4 });
        lines.push({ pts: path.pts, radii: path.radii, cum, len });
      }
    }
    return { lines, cells };
  }, [built, layer]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((_, dtRaw) => {
    if (!mesh.current) return;
    const dt = Math.min(dtRaw, 0.05);
    const speed = layer === "arteries" ? 9 * (0.25 + 2.6 * live.pulse) : tourniquet ? 0.45 : 3.2;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const line = lines[c.line];
      c.s += speed * c.jitter * dt;
      if (c.s >= line.len) {
        c.s -= line.len;
        c.k = 0;
      }
      while (c.k < line.cum.length - 2 && line.cum[c.k + 1] < c.s) c.k++;
      const a = line.pts[c.k];
      const b = line.pts[c.k + 1];
      const u = (c.s - line.cum[c.k]) / Math.max(line.cum[c.k + 1] - line.cum[c.k], 1e-6);
      const r = line.radii[c.k] * 0.4 * (layer === "veins" ? 1 + live.vein.value : 1);
      m.makeScale(r * 1.25, r, r).setPosition(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
      mesh.current.setMatrixAt(i, m);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, cells.length]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshStandardMaterial color={layer === "arteries" ? "#c81e2a" : "#6a1220"} roughness={0.35} />
    </instancedMesh>
  );
}

function Tourniquet() {
  const geometry = useMemo(() => {
    const seg = 72;
    const pos: number[] = [];
    const idx: number[] = [];
    for (const x of [-9.7, -7.5])
      for (let j = 0; j < seg; j++) pos.push(...onLimb(x, (j / seg) * 360, -0.09));
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(j, j1, seg + j1, j, seg + j1, seg + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    // The strap is pulled snug: it starts loose and cinches down.
    t.current = Math.min(t.current + dt / 0.7, 1);
    const k = 1 + 0.35 * (1 - t.current) ** 2;
    ref.current?.scale.set(1, k, k);
  });
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={7}>
      <meshStandardMaterial color="#2b62c4" roughness={0.65} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** A fingertip on the skin: bounces over a vein, throbs with the pulse over an artery. */
function PalpationRing() {
  const palp = useAtlas((s) => s.palp);
  const active = useAtlas((s) => s.mode === "sim" && s.sim.phase === "aim");
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !palp?.p || !palp.n) return;
    const n = palp.n;
    ref.current.position.set(palp.p[0] + n[0] * 0.06, palp.p[1] + n[1] * 0.06, palp.p[2] + n[2] * 0.06);
    ref.current.quaternion.setFromUnitVectors(FRONT, new THREE.Vector3(n[0], n[1], n[2]));
    const k = palp.kind === "artery" ? 1 + 0.4 * live.pulse : palp.kind === "vein" ? 1 + 0.1 * Math.sin(clock.elapsedTime * 5) : 1;
    ref.current.scale.setScalar(k);
  });
  if (!active || !palp?.p) return null;
  const color = palp.kind === "artery" ? "#ff4d57" : palp.kind === "vein" ? "#7fa2ff" : palp.kind === "tendon" ? "#efe7d6" : "#9aa7bb";
  return (
    <group ref={ref}>
      <mesh renderOrder={9}>
        <ringGeometry args={[0.5, 0.6, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh renderOrder={9}>
        <circleGeometry args={[0.5, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

const GAUGE = { 21: { r: 0.041, hub: "#2f9e58" }, 22: { r: 0.036, hub: "#2a2d33" }, 23: { r: 0.032, hub: "#4da3ff" } };
const HOVER_MM = -7;

function Needle() {
  const sim = useAtlas((s) => s.sim);
  const group = useRef<THREE.Group>(null);
  const blood = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.MeshStandardMaterial>(null);
  const bruise = useRef<THREE.Mesh>(null);
  const shown = useRef(HOVER_MM - 25);
  const fill = useRef(0);
  const swell = useRef(0);

  const dir = useMemo(() => (sim.normal ? needleDir(sim.normal, sim.angle, sim.yaw) : null), [sim.normal, sim.angle, sim.yaw]);
  const outcome = sim.result?.outcome;
  const arterial = outcome === "artery";

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useAtlas.getState();
    if (!group.current || !sim.entry || !dir) return;
    const goal = sim.phase === "aim" ? HOVER_MM : sim.phase === "withdraw" ? -45 : sim.depth;
    const rate = sim.phase === "advancing" ? 11 : sim.phase === "withdraw" ? 55 : 90;
    const step = rate * dt;
    shown.current = Math.abs(goal - shown.current) <= step ? goal : shown.current + Math.sign(goal - shown.current) * step;
    live.needle = shown.current;
    if (sim.phase === "advancing" && shown.current === goal) s.finish();
    if (sim.phase === "withdraw" && shown.current === goal) s.resetSim();

    const L = shown.current / 10;
    group.current.position.set(sim.entry[0] + dir[0] * L, sim.entry[1] + dir[1] * L, sim.entry[2] + dir[2] * L);
    group.current.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-dir[0], -dir[1], -dir[2]));

    // Blood return: a steady venous fill, a fast pulsing arterial one, or a brief flash if the vein was transfixed.
    const want = sim.phase !== "done" ? (sim.phase === "withdraw" ? fill.current : 0) : outcome === "success" || arterial ? 1 : outcome === "through" ? 0.07 : 0;
    const speed = arterial ? 0.25 + 0.9 * live.pulse : 0.2;
    fill.current = want < fill.current ? want : Math.min(want, fill.current + speed * dt);
    if (blood.current) {
      const h = Math.max(fill.current * 6.4, 0.001);
      blood.current.scale.y = h;
      blood.current.position.y = 6.3 + h / 2;
      blood.current.visible = fill.current > 0.002;
    }
    if (flash.current) flash.current.emissiveIntensity = fill.current > 0 ? 0.5 : 0;

    const bruising = sim.phase === "done" && (outcome === "through" || arterial);
    swell.current = bruising ? Math.min(swell.current + dt / (arterial ? 3 : 6), 1) : 0;
    if (bruise.current && sim.normal) {
      const k = swell.current;
      bruise.current.visible = k > 0.01;
      bruise.current.scale.set(1.5 * k, 1.5 * k, 0.16 * k);
      bruise.current.quaternion.setFromUnitVectors(FRONT, new THREE.Vector3(sim.normal[0], sim.normal[1], sim.normal[2]));
    }
  });

  if (!sim.entry || !dir) return null;
  const g = GAUGE[sim.gauge];
  const r = g.r * 1.4;
  const bloodColor = arterial ? "#d21624" : "#5d0a15";
  return (
    <>
      <mesh position={sim.entry} renderOrder={8}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#35e0c2" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={bruise} position={sim.entry} visible={false} renderOrder={8}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#4b1f3f" transparent opacity={0.62} roughness={0.8} depthWrite={false} />
      </mesh>
      <group ref={group}>
        {/* bevelled tip and cannula */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[r, 0.004, 0.24, 12]} />
          <meshStandardMaterial color="#e3e8ef" metalness={0.95} roughness={0.2} />
        </mesh>
        <mesh position={[0, 2.02, 0]} castShadow>
          <cylinderGeometry args={[r, r, 3.56, 12]} />
          <meshStandardMaterial color="#e3e8ef" metalness={0.95} roughness={0.2} />
        </mesh>
        {/* colour-coded hub with flash chamber */}
        <mesh position={[0, 4.55, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.15, 1.5, 20]} />
          <meshStandardMaterial ref={flash} color={g.hub} emissive={bloodColor} emissiveIntensity={0} roughness={0.45} />
        </mesh>
        {/* tube holder */}
        <mesh position={[0, 7.8, 0]}>
          <cylinderGeometry args={[0.85, 0.85, 5, 32, 1, true]} />
          <meshPhysicalMaterial color="#d9ecff" transparent opacity={0.22} roughness={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 5.32, 0]}>
          <cylinderGeometry args={[0.85, 0.32, 0.06, 32]} />
          <meshStandardMaterial color="#cfe0f2" transparent opacity={0.5} />
        </mesh>
        {/* evacuated tube, its stopper, and the blood filling it */}
        <mesh position={[0, 9.6, 0]}>
          <cylinderGeometry args={[0.62, 0.62, 6.8, 28, 1, true]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.16} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 13.2, 0]}>
          <sphereGeometry args={[0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.16} roughness={0.05} depthWrite={false} />
        </mesh>
        <mesh position={[0, 5.95, 0]} castShadow>
          <cylinderGeometry args={[0.7, 0.7, 0.7, 28]} />
          <meshStandardMaterial color="#b79adf" roughness={0.6} />
        </mesh>
        <mesh ref={blood} visible={false}>
          <cylinderGeometry args={[0.56, 0.56, 1, 24]} />
          <meshStandardMaterial color={bloodColor} roughness={0.25} />
        </mesh>
      </group>
    </>
  );
}

function Arm() {
  const pattern = useAtlas((s) => s.pattern);
  const tourniquet = useAtlas((s) => s.tourniquet);
  const tone = useAtlas((s) => s.tone);
  const nir = useAtlas((s) => s.nir);
  const clipX = useAtlas((s) => s.clip);
  const mode = useAtlas((s) => s.mode);
  const flow = useAtlas((s) => s.flow);
  const reveal = useAtlas((s) => s.sim.reveal);
  const userLayers = useAtlas((s) => s.layers);
  const target = useMemo(() => effectiveLayers({ mode, layers: userLayers, nir, reveal }), [mode, userLayers, nir, reveal]);
  const [assemble] = useState(() => useAtlas.getState().mode === "explore");
  const layers = useAnimatedLayers(target, assemble);

  // Meshes are built in a background worker; nothing is drawn until the first arrives.
  const anatomy = useAnatomy(pattern);
  const built = useMemo(() => anatomy?.built ?? [], [anatomy]);
  const shells = useMemo(() => ({ skin: anatomy?.skin ?? null, fat: anatomy?.fat ?? null, fascia: anatomy?.fascia ?? null }), [anatomy]);
  const shade = (anatomy?.skin.getAttribute("aVein")?.array as Float32Array | undefined) ?? null;

  useEffect(() => {
    const tone = new THREE.Color(TONES[useAtlas.getState().tone].color);
    skinUniforms.uPalm.value.copy(nir ? new THREE.Color("#2fbf86") : tone.clone().lerp(new THREE.Color("#f4c6b6"), 0.55));
    skinUniforms.uRim.value.set(nir ? "#000000" : "#5a1a12");
  }, [tone, nir]);
  useEffect(() => {
    useAtlas.getState().set({ built });
  }, [built]);
  const ready = !!anatomy;

  // Veins show through the skin as a blue-green tint; a tourniquet makes them stand out.
  const tinted = useRef(-1);
  const tint = (swell: number) => {
    if (!shells.skin || !shade) return;
    let attr = shells.skin.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!attr) {
      attr = new THREE.BufferAttribute(new Float32Array(shade.length * 3), 3);
      shells.skin.setAttribute("color", attr);
    }
    const col = attr.array as Float32Array;
    const hue = nir ? [0.03, 0.1, 0.07] : [0.56, 0.74, 0.86];
    const gain = nir ? 1.3 : 0.78 * TONES[tone].vis * (1 + 2.2 * swell);
    for (let i = 0; i < shade.length; i++) {
      const w = Math.min(shade[i] * gain, 1);
      col[i * 3] = 1 + (hue[0] - 1) * w;
      col[i * 3 + 1] = 1 + (hue[1] - 1) * w;
      col[i * 3 + 2] = 1 + (hue[2] - 1) * w;
    }
    attr.needsUpdate = true;
    tinted.current = swell;
  };
  useLayoutEffect(() => tint(live.vein.value), [shade, tone, nir, anatomy]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (Math.abs(live.vein.value - tinted.current) > 0.004) tint(live.vein.value);
  });

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  if (clipX !== null) plane.constant = clipX - OFFSET;
  const clipping = clipX !== null;
  const clip: ClipProps = useMemo(
    () => ({ clippingPlanes: clipping ? [plane] : [], side: clipping ? THREE.DoubleSide : THREE.FrontSide }),
    [clipping, plane],
  );

  const lastPalp = useRef(0);
  const onSkinMove = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== "sim" || useAtlas.getState().demo) return;
    e.stopPropagation();
    const now = performance.now();
    if (now - lastPalp.current < 60) return;
    lastPalp.current = now;
    const p: Vec3 = [e.point.x + OFFSET, e.point.y, e.point.z];
    useAtlas.getState().set({ palp: { ...palpate(built, p, tourniquet), p, n: skinNormal(p[0], p[1], p[2]) } });
  };
  const onSkinClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = useAtlas.getState();
    if (mode !== "sim" || e.delta > 4 || s.demo || s.sim.phase !== "aim") return;
    const p: Vec3 = [e.point.x + OFFSET, e.point.y, e.point.z];
    s.setSim({ entry: p, normal: skinNormal(p[0], p[1], p[2]), result: null, reveal: false });
  };

  const shellMaterial = (id: "fat" | "fascia") => (
    <meshPhysicalMaterial
      key={`${clip.clippingPlanes.length}-${layers[id] < 1}`}
      color={LAYER_COLOR[id]}
      roughness={id === "fat" ? 0.42 : 0.5}
      clearcoat={id === "fat" ? 0.5 : 0.25}
      clearcoatRoughness={0.35}
      sheen={id === "fascia" ? 0.6 : 0}
      {...(id === "fat" ? fatMaterial : fasciaMaterial)}
      transparent={layers[id] < 1}
      opacity={layers[id]}
      depthWrite={layers[id] >= 1}
      {...clip}
    />
  );
  const blocks = (id: "skin" | "fat" | "fascia") => (mode === "sim" && id === "skin") || layers[id] >= 0.9;
  const block = (e: ThreeEvent<MouseEvent | PointerEvent>) => e.stopPropagation();
  const showFlow = flow && mode === "explore" && !nir;

  if (!ready || !shells.skin) return null;
  return (
    <group position={[-OFFSET, 0, 0]}>
      {layers.skin > 0 && (
        <mesh
          geometry={shells.skin}
          renderOrder={ORDER.skin}
          castShadow={layers.skin >= 1}
          receiveShadow
          raycast={blocks("skin") ? meshRaycast : noRaycast}
          onPointerMove={onSkinMove}
          onPointerOver={block}
          onPointerOut={() => !useAtlas.getState().demo && useAtlas.getState().set({ palp: null })}
          onClick={onSkinClick}
        >
          <meshPhysicalMaterial
            key={`${clip.clippingPlanes.length}-${nir}-${layers.skin < 1}`}
            vertexColors
            color={nir ? "#2fbf86" : TONES[tone].color}
            emissive={nir ? "#0f5c3d" : "#000000"}
            emissiveIntensity={nir ? 0.55 : 0}
            roughness={nir ? 0.9 : 0.56}
            clearcoat={nir ? 0 : 0.14}
            clearcoatRoughness={0.55}
            sheen={nir ? 0 : 0.4}
            sheenColor="#ffd9c7"
            transparent={layers.skin < 1}
            opacity={layers.skin}
            depthWrite={layers.skin >= 1}
            {...skinMaterial}
            {...clip}
          />
        </mesh>
      )}
      {layers.skin > 0.5 && !nir && (
        <mesh geometry={anatomy.nails} renderOrder={ORDER.skin} raycast={noRaycast} receiveShadow>
          <meshPhysicalMaterial
            key={`${layers.skin < 1}`}
            color={new THREE.Color(TONES[tone].color).lerp(new THREE.Color("#f7d6cd"), 0.62)}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.12}
            transparent={layers.skin < 1}
            opacity={layers.skin}
            depthWrite={layers.skin >= 1}
          />
        </mesh>
      )}
      {layers.fat > 0 && shells.fat && (
        <mesh geometry={shells.fat} renderOrder={ORDER.fat} raycast={blocks("fat") ? meshRaycast : noRaycast} onClick={block} onPointerOver={block}>
          {shellMaterial("fat")}
        </mesh>
      )}
      {layers.fascia > 0 && shells.fascia && (
        <mesh geometry={shells.fascia} renderOrder={ORDER.fascia} raycast={blocks("fascia") ? meshRaycast : noRaycast} onClick={block} onPointerOver={block}>
          {shellMaterial("fascia")}
        </mesh>
      )}
      {built.map((b) =>
        layers[b.def.layer] > 0 ? (
          <StructureMesh key={b.def.id} b={b} opacity={layers[b.def.layer]} interactive={mode === "explore"} clip={clip} />
        ) : null,
      )}
      {showFlow && layers.veins > 0 && <Flow built={built} layer="veins" />}
      {showFlow && layers.arteries > 0 && <Flow built={built} layer="arteries" />}
      {tourniquet && <Tourniquet />}
      {mode === "sim" && <Needle />}
      <PalpationRing />
    </group>
  );
}

/** Floating labels are plain DOM nodes; this keeps them pinned to their structures. */
function LabelProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!labelEls.size) return;
    const built = useAtlas.getState().built;
    for (const [id, el] of labelEls) {
      const b = built.find((x) => x.def.id === id);
      if (!b) continue;
      v.set(b.anchor[0] - OFFSET, b.anchor[1], b.anchor[2]).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.visibility = v.z > 1 ? "hidden" : "visible";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
    }
  });
  return null;
}

function Rig() {
  const view = useAtlas((s) => s.view);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ p: THREE.Vector3; t: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const v = view.target && view.position ? { target: view.target, position: view.position } : VIEWS[view.id];
    goal.current = {
      p: new THREE.Vector3(v.position[0] - OFFSET, v.position[1], v.position[2]),
      t: new THREE.Vector3(v.target[0] - OFFSET, v.target[1], v.target[2]),
    };
  }, [view]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4.5);
    const from = camera.position.clone().sub(controls.target);
    const to = g.p.clone().sub(g.t);
    const r = THREE.MathUtils.lerp(from.length(), to.length(), k);
    const q = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
    from.normalize().applyQuaternion(new THREE.Quaternion().slerp(q, k)).multiplyScalar(r);
    controls.target.lerp(g.t, k);
    camera.position.copy(controls.target).add(from);
    controls.update();
    if (camera.position.distanceTo(g.p) < 0.05 && controls.target.distanceTo(g.t) < 0.05) goal.current = null;
  });
  return null;
}

/** Soft shadow under the limb; hidden when the camera drops below it. */
function Ground() {
  const ref = useRef<THREE.Group>(null);
  const nir = useAtlas((s) => s.nir);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = !nir && camera.position.y > -6;
  });
  return (
    <group ref={ref}>
      <ContactShadows position={[0, -7.6, 0]} scale={120} far={16} blur={2.6} opacity={0.6} resolution={512} color="#000000" />
    </group>
  );
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [1, 10, 128], fov: 30, near: 0.5, far: 800 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true;
      }}
      onPointerMissed={() => useAtlas.getState().set({ selected: null })}
    >
      <hemisphereLight args={["#fff4ea", "#3a2c28", 0.75]} />
      <directionalLight
        position={[20, 30, 50]}
        intensity={1.9}
        color="#fff6ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
      <directionalLight position={[-30, -12, 24]} intensity={0.55} color="#bcd4ff" />
      <directionalLight position={[0, 14, -50]} intensity={1.2} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[0, 12, 4]} rotation-x={-Math.PI / 2} scale={[24, 10, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-14, 2, 10]} rotation-y={Math.PI / 3} scale={[10, 10, 1]} color="#dfe9ff" />
        <Lightformer form="rect" intensity={0.9} position={[14, 0, 10]} rotation-y={-Math.PI / 3} scale={[10, 10, 1]} color="#ffe9dc" />
        <Lightformer form="ring" intensity={1.3} position={[0, 4, -14]} scale={8} />
      </Environment>
      <Physiology />
      <Arm />
      <Ground />
      <Rig />
      <LabelProjector />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={8} maxDistance={220} rotateSpeed={0.8} />
    </Canvas>
  );
}
