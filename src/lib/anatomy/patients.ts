import type { Pattern } from "./structures";

export type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";

/**
 * An arm to practise on. Everything here changes what the collector sees,
 * feels or has to do. Every patient is invented: a description of a kind of
 * arm, never a record of a person.
 */
export interface Patient {
  id: string;
  title: string;
  /** What to expect, as a colleague might tell you at the bedside. */
  brief: string;
  /** Index into the skin tones. */
  tone: number;
  pattern: Pattern;
  /** Soft-tissue build of the arm; 1 is average. */
  girth: number;
  /** Extra depth of the superficial veins beneath the skin, cm. */
  veinDepth: number;
  /** Vein calibre relative to average. */
  calibre: number;
  /** How well the veins show through the skin, 0 (invisible) to 1. */
  visibility: number;
  /** How readily the veins roll away from the needle unless anchored, 0 to 1. */
  rolling: number;
  /** Thin-walled veins that bruise and collapse easily. */
  fragile: boolean;
}

export const PATIENTS: Patient[] = [
  {
    id: "athletic",
    title: "Athletic adult",
    brief: "Lean arm with large, superficial veins that stand out as soon as the tourniquet goes on. A good arm to learn on.",
    tone: 0, pattern: "H", girth: 0.97, veinDepth: 0, calibre: 1.12, visibility: 1, rolling: 0, fragile: false,
  },
  {
    id: "average",
    title: "Average adult",
    brief: "Typical arm. The veins show faintly and are easy to feel once distended.",
    tone: 1, pattern: "H", girth: 1, veinDepth: 0.03, calibre: 1, visibility: 0.75, rolling: 0, fragile: false,
  },
  {
    id: "m-pattern",
    title: "Adult with an M-shaped pattern",
    brief: "There is no median cubital vein here. The median vein divides below the crease into median cephalic and median basilic limbs — find the central one.",
    tone: 1, pattern: "M", girth: 1, veinDepth: 0.04, calibre: 1, visibility: 0.7, rolling: 0, fragile: false,
  },
  {
    id: "deep-tone",
    title: "Adult with deep skin tone",
    brief: "The veins are a normal size but cannot be seen through the skin. Trust your fingertip, not your eyes.",
    tone: 3, pattern: "H", girth: 1.02, veinDepth: 0.05, calibre: 1, visibility: 0.5, rolling: 0, fragile: false,
  },
  {
    id: "larger",
    title: "Adult of higher body weight",
    brief: "More subcutaneous tissue: the veins lie deeper and do not show. The cephalic vein is often the easiest to feel. Expect to advance a little further.",
    tone: 1, pattern: "H", girth: 1.17, veinDepth: 0.3, calibre: 1, visibility: 0.12, rolling: 0, fragile: false,
  },
  {
    id: "dehydrated",
    title: "Dehydrated adult",
    brief: "Small, flat veins that barely fill under the tourniquet. Take your time palpating, and choose a finer needle.",
    tone: 2, pattern: "H", girth: 0.98, veinDepth: 0.06, calibre: 0.7, visibility: 0.4, rolling: 0.2, fragile: false,
  },
  {
    id: "older",
    title: "Slender older adult",
    brief: "Thin skin, so the veins are easy to see — but they are fragile and they roll. Anchor firmly, keep the angle low and use a fine needle.",
    tone: 0, pattern: "H", girth: 0.93, veinDepth: 0, calibre: 0.86, visibility: 0.95, rolling: 0.8, fragile: true,
  },
  {
    id: "obese",
    title: "Adult with obesity",
    brief: "Deep veins beneath a thick layer of tissue: nothing to see and little to feel. Palpate slowly with firm pressure, and expect to go deeper than usual.",
    tone: 2, pattern: "M", girth: 1.3, veinDepth: 0.55, calibre: 0.95, visibility: 0, rolling: 0.1, fragile: false,
  },
  {
    id: "frail",
    title: "Frail elderly patient",
    brief: "Small, mobile, paper-thin veins under loose skin, in a patient who bruises easily. One clean pass with a fine needle, or not at all.",
    tone: 1, pattern: "M", girth: 0.9, veinDepth: 0.02, calibre: 0.72, visibility: 0.7, rolling: 1, fragile: true,
  },
];

const POOLS: Record<Difficulty, string[]> = {
  beginner: ["athletic", "average"],
  intermediate: ["average", "m-pattern", "deep-tone", "athletic"],
  advanced: ["larger", "deep-tone", "dehydrated", "older", "m-pattern"],
  expert: ["obese", "frail", "dehydrated", "older", "larger"],
};

/** A patient for the level, different from the last one seen. */
export function nextPatient(level: Difficulty, previous?: string): Patient {
  const pool = POOLS[level].filter((id) => id !== previous);
  const id = pool[Math.floor(Math.random() * pool.length)];
  return PATIENTS.find((p) => p.id === id)!;
}
