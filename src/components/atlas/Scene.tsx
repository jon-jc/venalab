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
import { Fingerstick } from "./Fingerstick";
import { effectiveLayers, labelEls, needleHud, TONES, useAtlas, VIEWS, type Layers } from "./store";
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
    // The skin gives under a palpating fingertip, and tents under the needle until it punctures.
    const s = useAtlas.getState();
    live.bulge.value = (0.03 + 0.42 * live.vein.value) * s.patient.visibility;
    let want = 0;
    if (s.mode === "sim" && s.procedure === "venous" && s.sim.entry && s.sim.phase !== "withdraw" && live.needle > -3 && live.needle < 3.5) {
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
    for (const x of [-10.2, -7.8])
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
  const active = useAtlas((s) => s.mode === "sim" && s.procedure === "venous" && s.sim.phase === "aim" && s.sim.depth <= 0);
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

/** A gauze pad left on the site once the needle is out. */
function Gauze() {
  const gauze = useAtlas((s) => s.sim.gauze);
  const q = useMemo(() => (gauze ? new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(...gauze.n)) : null), [gauze]);
  if (!gauze || !q) return null;
  const p = gauze.p, n = gauze.n;
  return (
    <mesh position={[p[0] + n[0] * 0.08, p[1] + n[1] * 0.08, p[2] + n[2] * 0.08]} quaternion={q} castShadow receiveShadow>
      <boxGeometry args={[2.2, 2.2, 0.16, 6, 6, 1]} />
      <meshStandardMaterial color="#f4f1ea" roughness={0.95} />
    </mesh>
  );
}

/**
 * The needle, holder and tube, held in the hand. Drag it to tilt and aim about
 * the puncture site; once it is in the skin, dragging slides it along its own
 * axis. Scrolling over it, or the arrow keys, also advance and withdraw it.
 */
function Needle() {
  const sim = useAtlas((s) => s.sim);
  const demo = useAtlas((s) => !!s.demo);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const group = useRef<THREE.Group>(null);
  const tube = useRef<THREE.Group>(null);
  const blood = useRef<THREE.Mesh>(null);
  const jet = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.MeshStandardMaterial>(null);
  const bruise = useRef<THREE.Mesh>(null);
  const shown = useRef(-70);
  const fill = useRef(0);
  const seat = useRef(0);
  const swell = useRef(0);
  /** A grab in progress: sliding along the axis, or swinging about the site at the radius it was grabbed. */
  const drag = useRef<{ push: boolean; s0: number; d0: number; radius: number; offset: THREE.Quaternion } | null>(null);
  const [hover, setHover] = useState<"aim" | "push" | null>(null);
  const basis = useMemo(() => new THREE.Matrix4(), []);
  const pose = useMemo(() => new THREE.Quaternion(), []);
  const posed = useRef(false);

  const dir = useMemo(() => (sim.normal ? needleDir(sim.normal, sim.angle, sim.yaw) : null), [sim.normal, sim.angle, sim.yaw]);
  const state = sim.result ?? sim.live;
  const arterial = state?.outcome === "artery";
  const inVessel = state?.outcome === "success" || arterial;
  const held = sim.phase === "aim" && !demo;

  // A fresh site gets a fresh needle, brought in from above.
  const site = sim.entry;
  useEffect(() => {
    shown.current = -70;
    fill.current = 0;
    seat.current = 0;
    swell.current = 0;
    posed.current = false;
  }, [site]);

  useEffect(() => {
    if (!held || !sim.entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const s = useAtlas.getState();
      s.setDepth(s.sim.depth + (e.key === "ArrowUp" ? 0.5 : -0.5));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held, sim.entry]);

  useFrame(({ clock, camera, size }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = useAtlas.getState();
    if (!group.current || !sim.entry || !sim.normal || !dir) return;
    const goal = sim.phase === "withdraw" ? -70 : sim.depth;
    const far = Math.abs(goal - shown.current);
    // Slow and deliberate through the skin, quicker through the air.
    const rate = sim.phase === "advancing" ? 11 : sim.phase === "withdraw" ? 60 : Math.max(22, far * 5);
    const step = rate * dt;
    shown.current = far <= step ? goal : shown.current + Math.sign(goal - shown.current) * step;
    live.needle = shown.current;
    if (sim.phase === "advancing" && shown.current === goal) s.finish();
    if (sim.phase === "withdraw" && shown.current === goal) s.resetSim();

    // Pose: the shaft lies along the direction of travel with the bevel facing away from the skin.
    const back = new THREE.Vector3(-dir[0], -dir[1], -dir[2]);
    const n = new THREE.Vector3(sim.normal[0], sim.normal[1], sim.normal[2]);
    const up = n.addScaledVector(back, -n.dot(back)).normalize();
    const side = new THREE.Vector3().crossVectors(back, up);
    // The instrument has a little weight: it eases toward where the hand is taking it.
    pose.setFromRotationMatrix(basis.makeBasis(side, back, up));
    if (posed.current) group.current.quaternion.slerp(pose, 1 - Math.exp(-dt * 28));
    else group.current.quaternion.copy(pose);
    posed.current = true;
    if (held && !drag.current && shown.current < -2) {
      // Nobody's hand is perfectly still in the air; once the needle is in the arm it is braced and steady.
      const t = clock.elapsedTime;
      group.current.rotateX(0.004 * Math.sin(t * 6.3) + 0.002 * Math.sin(t * 13.1));
      group.current.rotateZ(0.004 * Math.sin(t * 5.1 + 1.7));
    }
    const L = shown.current / 10;
    group.current.position.set(sim.entry[0] + dir[0] * L, sim.entry[1] + dir[1] * L, sim.entry[2] + dir[2] * L);

    // Readout beside the hub: the angle to the skin and how much needle is in.
    const hud = needleHud.el;
    if (hud) {
      const show = (held || sim.phase === "advancing") && shown.current > -30;
      hud.style.visibility = show ? "visible" : "hidden";
      if (show) {
        const at = new THREE.Vector3(0, 4.7, 0).applyQuaternion(group.current.quaternion).add(group.current.position);
        at.x -= OFFSET;
        at.project(camera);
        hud.style.transform = `translate(${((at.x + 1) / 2) * size.width}px, ${((1 - at.y) / 2) * size.height}px) translate(-50%, -260%)`;
        const text = `${sim.angle}°  ·  ${shown.current > 0 ? `${shown.current.toFixed(1)} mm in` : "above the skin"}`;
        if (hud.textContent !== text) hud.textContent = text;
      }
    }

    // The tube is pushed home once blood shows in the hub, then fills for as long as the tip stays in the vessel.
    const flowing = inVessel && shown.current > 0 && sim.phase !== "withdraw";
    seat.current += ((flowing || fill.current > 0.01 ? 1 : 0) - seat.current) * (1 - Math.exp(-dt * 5));
    if (tube.current) tube.current.position.y = (1 - seat.current) * 3.4;
    const filling = flowing && seat.current > 0.92;
    if (filling) fill.current = Math.min(1, fill.current + (arterial ? 0.25 + 0.9 * live.pulse : 0.17) * dt);
    else if (state?.outcome === "through" && shown.current > 0) fill.current = Math.max(fill.current, 0.05);
    if (blood.current) {
      const h = Math.max(fill.current * 6.4, 0.001);
      // The surface rocks a little while blood is running in.
      blood.current.scale.set(1, h, 1);
      blood.current.position.y = 6.3 + h / 2;
      blood.current.rotation.z = filling ? 0.03 * Math.sin(clock.elapsedTime * 9) : 0;
      blood.current.visible = fill.current > 0.002;
    }
    if (jet.current) {
      jet.current.visible = filling && fill.current < 0.97;
      jet.current.scale.x = jet.current.scale.z = arterial ? 1 + 1.4 * live.pulse : 1;
    }
    if (flash.current) flash.current.emissiveIntensity = (flowing || fill.current > 0 ? 0.55 : 0) * (arterial ? 0.7 + 0.6 * live.pulse : 1);

    const leak = sim.worst?.outcome === "through" || sim.worst?.outcome === "artery";
    swell.current = leak ? Math.min(swell.current + dt / (sim.worst?.outcome === "artery" ? 3 : 6), 1) : 0;
    if (bruise.current) {
      const k = swell.current;
      bruise.current.visible = k > 0.01;
      bruise.current.scale.set(1.5 * k, 1.5 * k, 0.16 * k);
      bruise.current.quaternion.setFromUnitVectors(FRONT, new THREE.Vector3(sim.normal[0], sim.normal[1], sim.normal[2]));
    }
  });

  if (!sim.entry || !sim.normal || !dir) return null;
  const entry = sim.entry;
  const normal = sim.normal;
  const g = GAUGE[sim.gauge];
  const r = g.r * 1.4;
  const bloodColor = arterial ? "#d21624" : "#5d0a15";

  /** Where along the needle's own axis (cm past the site) the pointer ray passes closest. */
  const alongAxis = (ray: THREE.Ray) => {
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]);
    const w = new THREE.Vector3(entry[0] - OFFSET, entry[1], entry[2]).sub(ray.origin);
    const b = d.dot(ray.direction);
    const denom = 1 - b * b;
    return denom < 1e-4 ? 0 : (b * ray.direction.dot(w) - d.dot(w)) / denom;
  };
  /** Where the pointer ray meets the sphere, about the site, on which the grabbed point travels. */
  const onSphere = (ray: THREE.Ray, radius: number) => {
    const centre = new THREE.Vector3(entry[0] - OFFSET, entry[1], entry[2]);
    const oc = ray.origin.clone().sub(centre);
    const b = oc.dot(ray.direction);
    const disc = b * b - (oc.lengthSq() - radius * radius);
    // Off the edge of the sphere, follow its outline.
    if (disc < 0) return ray.closestPointToPoint(centre, new THREE.Vector3()).sub(centre).normalize();
    const root = Math.sqrt(disc);
    const near = ray.at(-b - root, new THREE.Vector3()).sub(centre).normalize();
    const far = ray.at(-b + root, new THREE.Vector3()).sub(centre).normalize();
    // Of the two crossings, keep to the side of the sphere the holder is already on.
    const now = new THREE.Vector3(-dir[0], -dir[1], -dir[2]);
    return near.dot(now) >= far.dot(now) ? near : far;
  };
  /** Swing the holder to follow the pointer, pivoting about the puncture site. */
  const aimAt = (ray: THREE.Ray, radius: number, offset: THREE.Quaternion) => {
    const back = onSphere(ray, radius).applyQuaternion(offset).normalize();
    const n = new THREE.Vector3(normal[0], normal[1], normal[2]);
    const angle = THREE.MathUtils.clamp((Math.asin(THREE.MathUtils.clamp(back.dot(n), -1, 1)) * 180) / Math.PI, 3, 85);
    const travel = back.clone().negate().addScaledVector(n, back.dot(n));
    if (travel.lengthSq() < 1e-6) return;
    travel.normalize();
    // Same reference directions as the simulation: 0° points up the limb, toward the heart.
    const t0 = new THREE.Vector3(-1 + n.x * n.x, n.x * n.y, n.x * n.z).normalize();
    const c = new THREE.Vector3().crossVectors(n, t0);
    const yaw = (Math.atan2(travel.dot(c), travel.dot(t0)) * 180) / Math.PI;
    useAtlas.getState().aim({ angle: Math.round(angle), yaw: Math.round(yaw) });
  };
  const release = () => {
    drag.current = null;
    if (controls) controls.enabled = true;
    document.body.style.cursor = "grab";
  };
  /** Pointer handlers for one of the two places the instrument can be taken hold of. */
  const grip = (zone: "aim" | "push") => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      if (!held) return;
      e.stopPropagation();
      if (controls) controls.enableZoom = false;
      setHover(zone);
      if (!drag.current) document.body.style.cursor = "grab";
    },
    onPointerOut: () => {
      if (controls) controls.enableZoom = true;
      setHover(null);
      if (!drag.current) document.body.style.cursor = "";
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (!held) return;
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      const centre = new THREE.Vector3(entry[0] - OFFSET, entry[1], entry[2]);
      const radius = Math.max(e.point.distanceTo(centre), 2);
      // The grabbed point is on the surface of the holder, a little off its axis; remember by how much,
      // so the needle stays exactly where it is until the pointer moves.
      const offset = new THREE.Quaternion().setFromUnitVectors(onSphere(e.ray, radius), new THREE.Vector3(-dir[0], -dir[1], -dir[2]));
      // The back of the tube pushes; so does anything once the needle is in the skin, where it must not be levered.
      const push = zone === "push" || e.shiftKey || sim.depth > 1.5;
      drag.current = { push, s0: alongAxis(e.ray), d0: sim.depth, radius, offset };
      document.body.style.cursor = "grabbing";
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      if (d.push) useAtlas.getState().setDepth(d.d0 + (alongAxis(e.ray) - d.s0) * 10);
      else aimAt(e.ray, d.radius, d.offset);
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      (e.target as Element).releasePointerCapture(e.pointerId);
      release();
    },
    onWheel: (e: ThreeEvent<WheelEvent>) => {
      if (!held) return;
      e.stopPropagation();
      const s = useAtlas.getState();
      s.setDepth(s.sim.depth - Math.sign(e.deltaY) * 0.5);
    },
  });
  const pushing = sim.depth > 1.5;

  return (
    <>
      <mesh position={entry} renderOrder={8}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color="#35e0c2" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={bruise} position={entry} visible={false} renderOrder={8}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#4b1f3f" transparent opacity={0.62} roughness={0.8} depthWrite={false} />
      </mesh>
      <group ref={group}>
        {/* Two places to take hold: the holder, to tilt and aim; the end of the tube, to push in and draw back. */}
        <mesh position={[0, 6.6, 0]} {...grip("aim")}>
          <cylinderGeometry args={[1.6, 1.0, 5.6, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, 11.9, 0]} {...grip("push")}>
          <cylinderGeometry args={[1.5, 1.6, 5.0, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {held && (
          <>
            <mesh position={[0, 7.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.95, hover === "aim" && !pushing ? 0.07 : 0.035, 10, 48]} />
              <meshBasicMaterial color="#35e0c2" transparent opacity={pushing ? 0.12 : hover === "aim" ? 1 : 0.5} />
            </mesh>
            <mesh position={[0, 13.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.72, hover === "push" || (pushing && hover) ? 0.07 : 0.035, 10, 48]} />
              <meshBasicMaterial color="#ffc23d" transparent opacity={hover === "push" || (pushing && hover) ? 1 : 0.55} />
            </mesh>
          </>
        )}

        {/* cannula with a ground bevel: the point lies on the side nearest the skin, the opening faces up */}
        <mesh position={[0, 0.16, 0]} geometry={BEVEL} scale={[r, 1, r]}>
          <meshStandardMaterial color="#e6ebf2" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh position={[0, 2.06, 0]} castShadow>
          <cylinderGeometry args={[r, r, 3.48, 16]} />
          <meshStandardMaterial color="#e6ebf2" metalness={0.95} roughness={0.18} />
        </mesh>
        {/* colour-coded hub; its flash chamber shows the first blood */}
        <mesh position={[0, 4.0, 0]}>
          <cylinderGeometry args={[0.13, 0.1, 0.42, 16]} />
          <meshStandardMaterial color={g.hub} roughness={0.45} />
        </mesh>
        <mesh position={[0, 4.72, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.16, 1.04, 24]} />
          <meshPhysicalMaterial ref={flash} color={g.hub} emissive={bloodColor} emissiveIntensity={0} roughness={0.35} clearcoat={0.6} transparent opacity={0.92} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 4.72, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[0.7, 0.9, 0.05]} />
            <meshStandardMaterial color={g.hub} roughness={0.45} />
          </mesh>
        ))}
        {/* holder with its finger flange */}
        <mesh position={[0, 7.8, 0]}>
          <cylinderGeometry args={[0.85, 0.85, 5, 40, 1, true]} />
          <meshPhysicalMaterial color="#d9ecff" transparent opacity={0.22} roughness={0.06} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 5.32, 0]}>
          <cylinderGeometry args={[0.85, 0.32, 0.08, 40]} />
          <meshPhysicalMaterial color="#cfe0f2" transparent opacity={0.5} roughness={0.1} />
        </mesh>
        <mesh position={[0, 10.3, 0]} scale={[1.9, 1, 1]} castShadow>
          <cylinderGeometry args={[0.95, 0.95, 0.12, 40]} />
          <meshPhysicalMaterial color="#cfe0f2" transparent opacity={0.55} roughness={0.1} />
        </mesh>
        {/* inner needle in its rubber sleeve, which pierces the tube stopper */}
        <mesh position={[0, 5.95, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 1.2, 12]} />
          <meshStandardMaterial color="#7d8794" roughness={0.7} />
        </mesh>
        {/* evacuated tube: slides home when blood shows, then fills */}
        <group ref={tube}>
          <mesh position={[0, 9.6, 0]}>
            <cylinderGeometry args={[0.62, 0.62, 6.8, 40, 1, true]} />
            <meshPhysicalMaterial color="#ffffff" transparent opacity={0.16} roughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, 13.0, 0]}>
            <sphereGeometry args={[0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color="#ffffff" transparent opacity={0.16} roughness={0.04} depthWrite={false} />
          </mesh>
          <mesh position={[0, 6.0, 0]} castShadow>
            <cylinderGeometry args={[0.72, 0.72, 0.75, 32]} />
            <meshStandardMaterial color="#b79adf" roughness={0.6} />
          </mesh>
          <mesh position={[0, 9.4, 0.615]} rotation={[0, 0, 0]}>
            <planeGeometry args={[0.9, 3.4]} />
            <meshStandardMaterial color="#f6f4ee" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={jet} position={[0, 9.5, 0]} visible={false}>
            <cylinderGeometry args={[0.045, 0.045, 6.4, 8]} />
            <meshStandardMaterial color={bloodColor} roughness={0.2} />
          </mesh>
          <mesh ref={blood} visible={false}>
            <cylinderGeometry args={[0.56, 0.56, 1, 32]} />
            <meshPhysicalMaterial color={bloodColor} roughness={0.15} clearcoat={0.8} />
          </mesh>
        </group>
      </group>
    </>
  );
}

/** Needle point: a cone sheared so its tip sits at one side, like a ground bevel. Unit radius, 0.32 cm long. */
const BEVEL = (() => {
  const g = new THREE.ConeGeometry(1, 0.32, 20, 1, false);
  g.rotateX(Math.PI);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - (0.5 - p.getY(i) / 0.32));
  g.computeVertexNormals();
  return g;
})();

/** Alcohol on the skin: a wet sheen over the site that dries away in a few seconds. */
function Swab() {
  const site = useAtlas((s) => (s.procedure === "capillary" ? s.cap.site : s.sim.entry));
  const normal = useAtlas((s) => (s.procedure === "capillary" ? s.cap.normal : s.sim.normal));
  const at = useAtlas((s) => (s.procedure === "capillary" ? s.cap.cleansedAt : s.sim.cleansedAt));
  const small = useAtlas((s) => s.procedure === "capillary");
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame(() => {
    if (!mesh.current || !mat.current) return;
    const wet = at ? Math.max(0, 1 - (Date.now() - at) / 5000) : 0;
    mesh.current.visible = wet > 0;
    mat.current.opacity = 0.5 * wet;
  });
  if (!site || !normal || !at) return null;
  const r = small ? 0.75 : 1.7;
  return (
    <mesh ref={mesh} position={site} quaternion={new THREE.Quaternion().setFromUnitVectors(FRONT, new THREE.Vector3(...normal))} scale={[r, r, r * 0.16]} renderOrder={7}>
      <sphereGeometry args={[1, 32, 16]} />
      <meshPhysicalMaterial ref={mat} color="#e4f4ff" transparent opacity={0.5} roughness={0.02} clearcoat={1} depthWrite={false} />
    </mesh>
  );
}

function Arm() {
  const pattern = useAtlas((s) => s.pattern);
  const tourniquet = useAtlas((s) => s.tourniquet);
  const tone = useAtlas((s) => s.tone);
  const nir = useAtlas((s) => s.nir);
  const clipX = useAtlas((s) => s.clip);
  const mode = useAtlas((s) => s.mode);
  const procedure = useAtlas((s) => s.procedure);
  const flow = useAtlas((s) => s.flow);
  const reveal = useAtlas((s) => s.sim.reveal);
  const userLayers = useAtlas((s) => s.layers);
  const target = useMemo(() => effectiveLayers({ mode, layers: userLayers, nir, reveal }), [mode, userLayers, nir, reveal]);
  const [assemble] = useState(() => useAtlas.getState().mode === "explore");
  const layers = useAnimatedLayers(target, assemble);

  // Meshes are built in a background worker; nothing is drawn until the first arrives.
  const patient = useAtlas((s) => s.patient);
  const body = useMemo(() => ({ girth: patient.girth, veinDepth: patient.veinDepth, calibre: patient.calibre }), [patient]);
  const anatomy = useAnatomy(pattern, body);
  const built = useMemo(() => anatomy?.built ?? [], [anatomy]);
  const shells = useMemo(() => ({ skin: anatomy?.skin ?? null, fat: anatomy?.fat ?? null, fascia: anatomy?.fascia ?? null }), [anatomy]);
  const shade = (anatomy?.skin.getAttribute("aVein")?.array as Float32Array | undefined) ?? null;

  useEffect(() => {
    const tone = new THREE.Color(TONES[useAtlas.getState().tone].color);
    skinUniforms.uPalm.value.copy(nir ? new THREE.Color("#2fbf86") : tone.clone().lerp(new THREE.Color("#f4c6b6"), 0.55));
    skinUniforms.uRim.value.set(nir ? "#000000" : "#34100b");
    skinUniforms.uScatter.value.setRGB(nir ? 0 : 0.16, nir ? 0 : 0.035, nir ? 0 : 0.02);
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
    const gain = nir ? 1.3 : 0.78 * TONES[tone].vis * patient.visibility * (1 + 2.2 * swell);
    for (let i = 0; i < shade.length; i++) {
      const w = Math.min(shade[i] * gain, 1);
      col[i * 3] = 1 + (hue[0] - 1) * w;
      col[i * 3 + 1] = 1 + (hue[1] - 1) * w;
      col[i * 3 + 2] = 1 + (hue[2] - 1) * w;
    }
    attr.needsUpdate = true;
    tinted.current = swell;
  };
  useLayoutEffect(() => tint(live.vein.value), [shade, tone, nir, anatomy, patient]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // A new site can be chosen while the needle is in the air, not once it is in the arm.
    const busy = s.procedure === "venous" ? s.sim.phase !== "aim" || s.sim.depth > 0 : s.cap.phase !== "aim";
    if (mode !== "sim" || e.delta > 4 || s.demo || busy) return;
    const p: Vec3 = [e.point.x + OFFSET, e.point.y, e.point.z];
    s.mark(p, skinNormal(p[0], p[1], p[2]));
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
            vertexColors
            side={THREE.DoubleSide}
            color={new THREE.Color(TONES[tone].color).lerp(new THREE.Color("#fbe7e0"), 0.72)}
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
      {tourniquet && <Tourniquet key={anatomy.body.girth} />}
      {mode === "sim" && procedure === "venous" && <Needle />}
      {mode === "sim" && procedure === "venous" && <Gauze />}
      {mode === "sim" && procedure === "capillary" && <Fingerstick />}
      {mode === "sim" && <Swab />}
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
      camera={{ position: [-0.5, 12, 132], fov: 30, near: 0.5, far: 800 }}
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
