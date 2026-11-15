import { create } from "zustand";
import { evaluateCapillary, type CapillaryChoices } from "@/lib/anatomy/capillary";
import type { Built } from "@/lib/anatomy/geometry";
import { nextPatient, PATIENTS, type Difficulty, type Patient } from "@/lib/anatomy/patients";
import { evaluate, type Note, type Palpation, type SimResult } from "@/lib/anatomy/sim";
import type { Vec3 } from "@/lib/anatomy/skin";
import type { LayerId, Pattern } from "@/lib/anatomy/structures";

export type Mode = "explore" | "sim";
export type Procedure = "venous" | "capillary";
export type Layers = Record<LayerId, number>;

const none: Layers = { skin: 0, fat: 0, veins: 0, fascia: 0, nerves: 0, arteries: 0, muscles: 0, bones: 0 };
const L = (p: Partial<Layers>): Layers => ({ ...none, ...p });

/** Label elements by structure id; the scene writes their screen positions every frame. */
export const labelEls = new Map<string, HTMLDivElement>();
/** The readout that floats beside the needle; the scene positions it and writes its text. */
export const needleHud: { el: HTMLDivElement | null } = { el: null };

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
  full: { label: "Whole limb", target: [12.5, 1, 0.5], position: [13.5, 12, 132] },
  fossa: { label: "Antecubital fossa", target: [0.5, 0, 2], position: [2, -1, 40] },
  forearm: { label: "Anterior forearm", target: [13, 0, 1], position: [13, 0, 46] },
  dorsum: { label: "Dorsal hand", target: [34, 0.8, 0], position: [36, 6, -38] },
  fingers: { label: "Fingertips", target: [41.5, 0.3, 2.6], position: [40, -1, 19] },
  wrist: { label: "Radial wrist", target: [25, 2, 0], position: [25, 26, 16] },
  medial: { label: "Medial elbow", target: [-1, -2, 1], position: [-1, -30, 24] },
};

/** How much help each level gives, and how strictly the procedure is marked. */
export const LEVELS: Record<Difficulty, { label: string; blurb: string; xray: boolean; numbers: boolean; hints: boolean; strict: boolean }> = {
  beginner: { label: "Beginner", blurb: "Easy arms. X-ray, measurements and hints are all available.", xray: true, numbers: true, hints: true, strict: false },
  intermediate: { label: "Intermediate", blurb: "Everyday arms, including the M pattern and deep skin tones. Palpation no longer gives measurements.", xray: true, numbers: false, hints: true, strict: false },
  advanced: { label: "Advanced", blurb: "Deep, small or rolling veins. No X-ray until you finish, no hints, and every step of the procedure counts.", xray: false, numbers: false, hints: false, strict: true },
  expert: { label: "Expert", blurb: "Difficult venous access: obesity, dehydration and frail, mobile veins. Marked as at the bedside.", xray: false, numbers: false, hints: false, strict: true },
};

export const HOVER_MM = -7;

/** Where the collector is in a venipuncture. Each stage puts a different tool in the hand. */
export type Stage = "tourniquet" | "palpate" | "cleanse" | "needle" | "done";
export const STAGES: Stage[] = ["tourniquet", "palpate", "cleanse", "needle", "done"];

/** aim: needle in the hand · advancing: demonstration only · done: attempt finished · withdraw: coming out */
export type Phase = "aim" | "advancing" | "done" | "withdraw";

export interface SimState {
  entry: Vec3 | null;
  normal: Vec3 | null;
  angle: number;
  yaw: number;
  /** Millimetres of needle beneath the skin; negative while it hovers above the site. */
  depth: number;
  gauge: 21 | 22 | 23;
  phase: Phase;
  stage: Stage;
  reveal: boolean;
  /** Skin pulled taut below the site to hold the vein still. */
  anchor: boolean;
  cleansedAt: number | null;
  puncturedAt: number | null;
  /** What the needle is doing right now, and the worst thing it has done on this attempt. */
  live: SimResult | null;
  worst: SimResult | null;
  result: SimResult | null;
  gauze: { p: Vec3; n: Vec3 } | null;
  attempts: number;
  hits: number;
  total: number;
}

export type CapPhase = "aim" | "punctured" | "collecting" | "done";

export interface CapState extends CapillaryChoices {
  site: Vec3 | null;
  normal: Vec3 | null;
  /** The alcohol wipe is in the hand. */
  wiping: boolean;
  /** Which step of the fingerstick is open: 1 prepare, 2 site, 3 cleanse, 4 lancet, 5 collect. */
  step: number;
  phase: CapPhase;
  cleansedAt: number | null;
  puncturedAt: number | null;
  result: SimResult | null;
}

interface AtlasState {
  mode: Mode;
  procedure: Procedure;
  difficulty: Difficulty;
  patient: Patient;
  layers: Layers;
  preset: string | null;
  pattern: Pattern;
  tone: number;
  labels: boolean;
  nir: boolean;
  flow: boolean;
  clip: number | null;
  tourniquet: boolean;
  tourniquetAt: number | null;
  /** How thoroughly the site has been scrubbed with the wipe, 0 to 1. */
  scrub: number;
  selected: string | null;
  hovered: string | null;
  /** Camera request: a named view, or an explicit pose. */
  view: { id: string; n: number; target?: Vec3; position?: Vec3 };
  built: Built[];
  palp: Palpation | null;
  /** Caption of the guided demonstration while it is playing. */
  demo: { step: number; total: number; caption: string } | null;
  sim: SimState;
  cap: CapState;
  set: (p: Partial<AtlasState>) => void;
  setLayer: (id: LayerId, v: number) => void;
  applyPreset: (id: string) => void;
  goto: (id: string) => void;
  setSim: (p: Partial<SimState>) => void;
  setCap: (p: Partial<CapState>) => void;
  setDifficulty: (d: Difficulty) => void;
  newPatient: () => void;
  /** Mark where the needle (or lancet) will enter. */
  mark: (p: Vec3, n: Vec3) => void;
  cleanse: () => void;
  /** The wipe has been rubbed a little further over the site. */
  scrubbed: (amount: number) => void;
  /** Go back to an earlier stage, or on to the next, while the needle is not in the arm. */
  stageTo: (stage: Stage) => void;
  aim: (p: { angle?: number; yaw?: number }) => void;
  setDepth: (mm: number) => void;
  /** Demonstration: push the needle in to a set depth; the scene calls `finish` when it arrives. */
  advance: (to: number) => void;
  finish: () => void;
  withdraw: () => void;
  resetSim: () => void;
  capPuncture: () => void;
  capFinish: () => void;
  capReset: () => void;
  /** Open a step of the fingerstick, before the lancet has been fired. */
  capStep: (step: number) => void;
}

const freshSim = { entry: null, normal: null, angle: 25, yaw: 0, depth: HOVER_MM, phase: "aim" as Phase, stage: "tourniquet" as Stage, reveal: false, anchor: false, cleansedAt: null, puncturedAt: null, live: null, worst: null, result: null };
const freshCap: CapState = { site: null, normal: null, wiping: false, step: 1, phase: "aim", lancet: 2.0, across: true, warmed: false, wiped: false, milking: false, edtaFirst: true, cleansedAt: null, puncturedAt: null, result: null };
const SEVERITY = { artery: 3, nerve: 2, through: 1 } as Record<string, number>;

export const useAtlas = create<AtlasState>((set, get) => {
  /** Work out what the needle is in at its present depth, and remember the worst event so far. */
  const probe = (sim: SimState): SimState => {
    const { built, tourniquet, patient } = get();
    if (!sim.entry || !sim.normal || sim.depth <= 0.4) return { ...sim, live: null };
    const live = evaluate(built, { entry: sim.entry, normal: sim.normal, angle: sim.angle, yaw: sim.yaw, depth: sim.depth, gauge: sim.gauge, tourniquet, rolling: patient.rolling, anchored: sim.anchor });
    const worse = (SEVERITY[live.outcome] ?? 0) > (sim.worst ? (SEVERITY[sim.worst.outcome] ?? 0) : 0);
    return { ...sim, live, worst: worse ? live : sim.worst, puncturedAt: sim.puncturedAt ?? Date.now() };
  };

  /** Add the parts of the procedure that happen away from the needle tip. */
  const procedure = (base: SimResult): SimResult => {
    const { sim, tourniquetAt, difficulty, patient } = get();
    const notes: Note[] = [...base.notes];
    let score = base.score;
    const add = (tone: Note["tone"], text: string, cost = 0) => {
      notes.push({ tone, text });
      score -= cost;
    };
    const ok = base.outcome === "success";
    const at = sim.puncturedAt ?? Date.now();
    if (!sim.cleansedAt) add("bad", "The site was not cleansed. Scrub with 70% isopropyl alcohol before every puncture.", 15);
    else if (at - sim.cleansedAt < 4000) add("warn", "The alcohol was still wet. Wet alcohol stings, and can haemolyse the sample — let it air-dry.", 6);
    else add("good", "Site cleansed and allowed to dry.");
    if (tourniquetAt && at - tourniquetAt > 60000) add("warn", `The tourniquet had been on for ${Math.round((at - tourniquetAt) / 1000)} s. Beyond a minute, haemoconcentration alters results — release it, wait two minutes and start again.`, 8);
    if (ok && !sim.anchor && (LEVELS[difficulty].strict || patient.rolling > 0.3)) add("warn", "The vein was not anchored. Pull the skin taut 2.5–5 cm below the site with your thumb so the vein cannot move.", 6);
    if (ok && sim.anchor) add("good", "Vein anchored before the puncture.");
    if (ok && patient.fragile && sim.gauge === 21) add("warn", "These veins are fragile. A 21G needle and a full-size vacuum tube are likely to collapse or tear them — use a 23G winged set.", 8);
    return { ...base, notes, score: Math.max(0, score) };
  };

  return {
    mode: "sim",
    procedure: "venous",
    difficulty: "beginner",
    patient: PATIENTS[0],
    layers: PRESETS[1].layers,
    preset: "veinmap",
    pattern: PATIENTS[0].pattern,
    tone: PATIENTS[0].tone,
    labels: true,
    nir: false,
    flow: false,
    clip: null,
    tourniquet: false,
    tourniquetAt: null,
    scrub: 0,
    selected: null,
    hovered: null,
    view: { id: "full", n: 0 },
    built: [],
    palp: null,
    demo: null,
    sim: { ...freshSim, gauge: 21, gauze: null, attempts: 0, hits: 0, total: 0 },
    cap: freshCap,
    set: (p) => set(p),
    setLayer: (id, v) => set({ layers: { ...get().layers, [id]: v }, preset: null }),
    applyPreset: (id) => {
      const p = PRESETS.find((x) => x.id === id);
      if (p) set({ layers: p.layers, preset: id, nir: false });
    },
    goto: (id) => set({ view: { id, n: get().view.n + 1 } }),
    setSim: (p) => set({ sim: { ...get().sim, ...p } }),
    setCap: (p) => set({ cap: { ...get().cap, ...p } }),
    setDifficulty: (difficulty) => {
      set({ difficulty, sim: { ...get().sim, attempts: 0, hits: 0, total: 0 } });
      get().newPatient();
    },
    newPatient: () => {
      const patient = nextPatient(get().difficulty, get().patient.id);
      set({ patient, pattern: patient.pattern, tone: patient.tone, tourniquet: false, palp: null, scrub: 0, cap: freshCap, sim: { ...get().sim, ...freshSim, gauze: null } });
    },
    mark: (p, n) => {
      const capillary = get().procedure === "capillary";
      set({ scrub: 0 });
      const last = capillary ? get().cap.site : get().sim.entry;
      if (capillary) set({ cap: { ...get().cap, site: p, normal: n, phase: "aim", step: 3, wiping: true, cleansedAt: null, puncturedAt: null, result: null } });
      else set({ sim: { ...get().sim, ...freshSim, stage: "cleanse", entry: p, normal: n, angle: get().sim.angle, anchor: get().sim.anchor, gauze: null } });
      // Bring the camera in close, looking down on the site from the patient's hand, unless it is already there.
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 6) return;
      const back = capillary ? 13 : 21;
      const along = capillary ? 5 : 11;
      set({ view: { id: "site", n: get().view.n + 1, target: p, position: [p[0] + n[0] * back + along, p[1] + n[1] * back - 4, p[2] + n[2] * back] } });
    },
    scrubbed: (amount) => {
      const s = get();
      const wiping = s.procedure === "venous" ? s.sim.stage === "cleanse" : s.cap.wiping;
      if (!wiping) return;
      if (s.scrub + amount >= 1) s.cleanse();
      else set({ scrub: s.scrub + amount });
    },
    cleanse: () => {
      set({ scrub: 1 });
      if (get().procedure === "capillary") set({ cap: { ...get().cap, cleansedAt: Date.now(), wiping: false, step: 4 } });
      else set({ sim: { ...get().sim, cleansedAt: Date.now(), stage: get().sim.stage === "cleanse" ? "needle" : get().sim.stage } });
    },
    stageTo: (stage) => {
      const sim = get().sim;
      if (sim.phase !== "aim" || sim.depth > 0) return;
      if (stage === "tourniquet" || stage === "palpate") set({ palp: null, sim: { ...sim, ...freshSim, stage, anchor: sim.anchor, gauze: sim.gauze } });
      else if (sim.entry && stage === "cleanse") set({ scrub: 0, sim: { ...sim, stage, cleansedAt: null } });
      else if (sim.entry && stage === "needle") set({ sim: { ...sim, stage } });
    },
    aim: (p) => {
      const sim = get().sim;
      // Once the needle is in the skin it must not be levered about.
      if (sim.phase === "aim" && sim.stage === "needle" && sim.depth <= 1.5) set({ sim: probe({ ...sim, ...p }) });
    },
    setDepth: (mm) => {
      const sim = get().sim;
      if (sim.phase !== "aim" || sim.stage !== "needle" || !sim.entry) return;
      set({ sim: probe({ ...sim, depth: Math.min(32, Math.max(HOVER_MM, Math.round(mm * 10) / 10)) }) });
    },
    advance: (to) => {
      const { sim } = get();
      if (sim.entry && sim.phase === "aim") set({ sim: { ...sim, phase: "advancing", stage: "needle", depth: to, result: null, puncturedAt: Date.now() } });
    },
    finish: () => {
      const { sim, demo } = get();
      if (!sim.entry || !sim.normal) return;
      const probed = probe({ ...sim, depth: Math.max(sim.depth, 0.5) });
      const base = probed.worst ?? probed.live!;
      const result = demo ? base : procedure(base);
      const counted = demo ? 0 : 1;
      set({
        sim: {
          ...probed,
          phase: "done",
          stage: "done",
          result,
          reveal: true,
          attempts: sim.attempts + counted,
          hits: sim.hits + (result.outcome === "success" ? counted : 0),
          total: sim.total + result.score * counted,
        },
      });
    },
    withdraw: () => {
      const { sim, tourniquet, demo } = get();
      if (!sim.entry || !sim.normal) return;
      let result = sim.result;
      if (result && tourniquet && !demo)
        result = {
          ...result,
          score: Math.max(0, result.score - 8),
          notes: [...result.notes, { tone: "warn", text: "The needle came out with the tourniquet still on. Venous pressure is high, so the site bleeds into the tissue — always release the tourniquet first." }],
        };
      set({ sim: { ...sim, phase: "withdraw", result, gauze: { p: sim.entry, n: sim.normal } } });
    },
    resetSim: () => set({ sim: { ...get().sim, ...freshSim, stage: get().sim.result ? "done" : "tourniquet", result: get().sim.result, reveal: get().sim.reveal && !!get().sim.result } }),
    capPuncture: () => {
      const cap = get().cap;
      if (cap.site && cap.phase === "aim") set({ cap: { ...cap, phase: "punctured", step: 5, puncturedAt: Date.now(), wiped: false } });
    },
    capFinish: () => {
      const { cap, sim } = get();
      if (!cap.site || !cap.normal) return;
      const result = evaluateCapillary(cap.site, cap, { cleansedAt: cap.cleansedAt, puncturedAt: cap.puncturedAt });
      set({ cap: { ...cap, phase: "done", result }, sim: { ...sim, attempts: sim.attempts + 1, hits: sim.hits + (result.outcome === "success" ? 1 : 0), total: sim.total + result.score } });
    },
    capReset: () => set({ scrub: 0, cap: { ...freshCap, lancet: get().cap.lancet, warmed: get().cap.warmed, step: 2 } }),
    capStep: (step) => {
      const cap = get().cap;
      if (cap.phase !== "aim") return;
      if (step <= 2) set({ scrub: 0, cap: { ...cap, step, site: null, normal: null, wiping: false, cleansedAt: null } });
      else if (cap.site && step === 3) set({ scrub: 0, cap: { ...cap, step, wiping: true, cleansedAt: null } });
      else if (cap.site && step === 4) set({ cap: { ...cap, step, wiping: false } });
    },
  };
});

// The clock on the tourniquet starts the moment it goes on.
useAtlas.subscribe((s, prev) => {
  if (s.tourniquet !== prev.tourniquet) useAtlas.setState({ tourniquetAt: s.tourniquet ? Date.now() : null });
});

/** Layer opacities actually drawn, after mode overrides. */
export function effectiveLayers(s: { mode: Mode; layers: Layers; nir: boolean; reveal: boolean }): Layers {
  if (s.nir) return L({ skin: 1 });
  if (s.mode === "sim") return s.reveal ? L({ skin: 0.24, veins: 1, arteries: 1, nerves: 1, muscles: 0.16, bones: 0.5 }) : L({ skin: 1 });
  return s.layers;
}
