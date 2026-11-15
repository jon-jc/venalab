import { create } from "zustand";
import type { Built } from "@/lib/anatomy/geometry";
import { evaluate, type Palpation, type SimResult } from "@/lib/anatomy/sim";
import type { Vec3 } from "@/lib/anatomy/skin";
import type { LayerId, Pattern } from "@/lib/anatomy/structures";

export type Mode = "explore" | "sim";
export type Layers = Record<LayerId, number>;

const none: Layers = { skin: 0, fat: 0, veins: 0, fascia: 0, nerves: 0, arteries: 0, muscles: 0, bones: 0 };
const L = (p: Partial<Layers>): Layers => ({ ...none, ...p });

/** Label elements by structure id; the scene writes their screen positions every frame. */
export const labelEls = new Map<string, HTMLDivElement>();

export const PRESETS: { id: string; label: string; hint: string; layers: Layers }[] = [
  { id: "surface", label: "Surface", hint: "What you see at the bedside", layers: L({ skin: 1 }) },
  { id: "veinmap", label: "Vein map", hint: "Veins through translucent skin", layers: L({ skin: 0.42, veins: 1 }) },
  { id: "superficial", label: "Superficial", hint: "Veins and cutaneous nerves on the deep fascia", layers: L({ fat: 0.22, veins: 1, nerves: 1, fascia: 1 }) },
  { id: "neurovascular", label: "Neurovascular", hint: "Veins, arteries and nerves over the skeleton", layers: L({ skin: 0.12, veins: 1, arteries: 1, nerves: 1, bones: 1 }) },
  { id: "deep", label: "Muscles", hint: "Everything beneath the fascia", layers: L({ veins: 1, arteries: 1, nerves: 1, muscles: 1, bones: 1 }) },
  { id: "skeleton", label: "Skeleton", hint: "Veins against bony landmarks", layers: L({ skin: 0.1, veins: 1, bones: 1 }) },
];

export const TONES = [
  { name: "Light", color: "#f1cbb1", vis: 1 },
  { name: "Medium", color: "#d9a67f", vis: 0.72 },
  { name: "Tan", color: "#b07c55", vis: 0.42 },
  { name: "Deep", color: "#6d4733", vis: 0.14 },
];

export const VIEWS: Record<string, { label: string; target: Vec3; position: Vec3 }> = {
  full: { label: "Whole limb", target: [14, 1, 0], position: [15, 10, 128] },
  fossa: { label: "Antecubital fossa", target: [0.5, 0, 2], position: [2, -1, 40] },
  forearm: { label: "Anterior forearm", target: [13, 0, 1], position: [13, 0, 46] },
  dorsum: { label: "Dorsal hand", target: [33, 0.5, -1], position: [34, 3, -36] },
  wrist: { label: "Radial wrist", target: [25, 2, 0], position: [25, 26, 16] },
  medial: { label: "Medial elbow", target: [-1, -2, 1], position: [-1, -30, 24] },
  needle: { label: "Needle close-up", target: [0.5, 0, 3], position: [9, -9, 17] },
};

/** aim: needle hovers over the site · advancing: going in · done: in place · withdraw: coming out */
export type Phase = "aim" | "advancing" | "done" | "withdraw";

export interface SimState {
  entry: Vec3 | null;
  normal: Vec3 | null;
  angle: number;
  yaw: number;
  depth: number;
  gauge: 21 | 22 | 23;
  phase: Phase;
  reveal: boolean;
  result: SimResult | null;
  attempts: number;
  hits: number;
  total: number;
}

interface AtlasState {
  mode: Mode;
  layers: Layers;
  preset: string | null;
  pattern: Pattern;
  tone: number;
  labels: boolean;
  nir: boolean;
  flow: boolean;
  clip: number | null;
  tourniquet: boolean;
  selected: string | null;
  hovered: string | null;
  /** Camera request: a named view, or an explicit pose. */
  view: { id: string; n: number; target?: Vec3; position?: Vec3 };
  built: Built[];
  palp: Palpation | null;
  /** Caption of the guided demonstration while it is playing. */
  demo: { step: number; total: number; caption: string } | null;
  sim: SimState;
  set: (p: Partial<AtlasState>) => void;
  setLayer: (id: LayerId, v: number) => void;
  applyPreset: (id: string) => void;
  goto: (id: string) => void;
  setSim: (p: Partial<SimState>) => void;
  /** Start pushing the needle in; the scene calls `finish` when it arrives. */
  advance: () => void;
  finish: () => void;
  resetSim: () => void;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  mode: "sim",
  layers: PRESETS[1].layers,
  preset: "veinmap",
  pattern: "H",
  tone: 0,
  labels: true,
  nir: false,
  flow: false,
  clip: null,
  tourniquet: false,
  selected: null,
  hovered: null,
  view: { id: "full", n: 0 },
  built: [],
  palp: null,
  demo: null,
  sim: { entry: null, normal: null, angle: 25, yaw: 0, depth: 8, gauge: 21, phase: "aim", reveal: false, result: null, attempts: 0, hits: 0, total: 0 },
  set: (p) => set(p),
  setLayer: (id, v) => set({ layers: { ...get().layers, [id]: v }, preset: null }),
  applyPreset: (id) => {
    const p = PRESETS.find((x) => x.id === id);
    if (p) set({ layers: p.layers, preset: id, nir: false });
  },
  goto: (id) => set({ view: { id, n: get().view.n + 1 } }),
  setSim: (p) => set({ sim: { ...get().sim, ...p } }),
  advance: () => {
    const { sim } = get();
    if (sim.entry && sim.phase === "aim") set({ sim: { ...sim, phase: "advancing", result: null } });
  },
  finish: () => {
    const { sim, built, tourniquet, demo } = get();
    if (!sim.entry || !sim.normal) return;
    const result = evaluate(built, { entry: sim.entry, normal: sim.normal, angle: sim.angle, yaw: sim.yaw, depth: sim.depth, gauge: sim.gauge, tourniquet });
    const counted = demo ? 0 : 1;
    set({
      sim: {
        ...sim,
        phase: "done",
        result,
        reveal: true,
        attempts: sim.attempts + counted,
        hits: sim.hits + (result.outcome === "success" ? counted : 0),
        total: sim.total + result.score * counted,
      },
    });
  },
  resetSim: () => set({ sim: { ...get().sim, entry: null, normal: null, phase: "aim", result: null, reveal: false } }),
}));

/** Layer opacities actually drawn, after mode overrides. */
export function effectiveLayers(s: { mode: Mode; layers: Layers; nir: boolean; reveal: boolean }): Layers {
  if (s.nir) return L({ skin: 1 });
  if (s.mode === "sim") return s.reveal ? L({ skin: 0.24, veins: 1, arteries: 1, nerves: 1, muscles: 0.16, bones: 0.5 }) : L({ skin: 1 });
  return s.layers;
}
