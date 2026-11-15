import { idealPuncture } from "@/lib/anatomy/sim";
import { siteView, useAtlas } from "./store";

let run = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const s = () => useAtlas.getState();

function restore() {
  s().set({ demo: null, palp: null, tourniquet: false, flow: false, selected: null });
  s().setSim({ result: null, reveal: false, gauze: null });
  s().resetSim();
}

export function stopDemo() {
  if (!s().demo) return;
  run++;
  restore();
}

/** Runs a narrated sequence; each step shows its caption for `ms` after `act` has run. */
function sequence(total: number) {
  const me = ++run;
  const alive = () => me === run;
  const step = async (i: number, caption: string, ms: number, act?: () => void) => {
    if (!alive()) throw new Error("stopped");
    const first = !s().demo;
    s().set({ demo: { step: i, total, caption } });
    // The page is laid out differently while a demonstration plays; let it settle before the camera is placed.
    if (first) await wait(80);
    if (!alive()) throw new Error("stopped");
    act?.();
    await wait(ms);
    if (!alive()) throw new Error("stopped");
  };
  return { alive, step };
}

/** Plays a narrated, textbook venipuncture of the first-choice vein on the current patient. It runs for about 30 seconds. */
export async function playDemo() {
  const { alive, step } = sequence(9);
  try {
    const H = s().pattern === "H";
    const plan = idealPuncture(s().built, H ? "median-cubital" : "median-vein", 25, H ? 0.32 : 0.86);
    if (!plan) return;
    // Each shot is fitted to the screen it is playing on: so many centimetres of skin around the site, or the whole needle.
    const look = (around: number, needle?: { angle: number; yaw: number }) => s().set({ view: { id: "demo", n: s().view.n + 1, ...siteView(plan.entry, plan.normal, needle ?? null, around) } });

    s().set({ mode: "sim", procedure: "venous", nir: false, tourniquet: false, palp: null });
    s().resetSim();

    await step(0, "Identify the patient and support the arm straight, palm up.", 2600, () => look(12));
    await step(1, "Tourniquet 7.5–10 cm above the site, on for no more than 1 minute. The veins fill.", 3600, () => s().set({ tourniquet: true }));
    await step(2, "Palpate with a fingertip: a vein is soft and bouncy, and springs back.", 3400, () => {
      look(5.5);
      s().stageTo("palpate");
      s().set({ palp: { kind: "vein", text: "Soft, bouncy and resilient.", p: plan.entry, n: plan.normal } });
    });
    await step(3, "Beneath it lie the brachial artery and median nerve, shielded by the bicipital aponeurosis.", 3400, () => {
      s().set({ palp: null });
      s().setSim({ reveal: true });
    });
    await step(4, "Clean hands, gloves, then cleanse with 70% isopropyl alcohol and let it air-dry.", 2800, () => {
      s().mark(plan.entry, plan.normal);
      s().setSim({ reveal: false });
      s().cleanse();
    });
    await step(5, "Anchor the vein. Bevel up, 15–30° to the skin, in line with the vein.", 3200, () => {
      look(0, plan);
      s().setSim({ angle: plan.angle, yaw: plan.yaw, gauge: 21, anchor: true });
    });
    await step(6, "Advance in one smooth motion until blood flashes in the hub.", 400, () => s().advance(plan.depth));
    while (alive() && s().sim.phase !== "done") await wait(80);
    await step(7, "Blood flows: release the tourniquet and fill the tubes in the order of draw.", 4000, () => s().set({ tourniquet: false }));
    await step(8, "Withdraw, activate the safety device, press with gauze, and label the tubes at the bedside.", 3400, () => s().withdraw());
  } catch {
    return;
  }
  if (alive()) {
    restore();
    s().goto("full");
  }
}

/** A fly-through of the anatomy a phlebotomist needs, peeling the limb layer by layer. */
export async function playTour() {
  const { alive, step } = sequence(8);
  const H = s().pattern === "H";
  const first = H ? "median-cubital" : "median-vein";
  const second = H ? "cephalic" : "median-cephalic";
  const third = H ? "basilic" : "median-basilic";
  try {
    s().set({ mode: "explore", nir: false, flow: false, clip: null, selected: null, tourniquet: false, labels: true });

    await step(0, "At the surface, veins show only as a faint blue-green tint — fainter still in darker skin. That is why you palpate rather than look.", 5200, () => {
      s().applyPreset("surface");
      s().goto("full");
    });
    await step(1, "Peel the skin away. The superficial veins run in the subcutaneous tissue, on top of the deep fascia, with the cutaneous nerves beside them.", 6000, () => {
      s().applyPreset("superficial");
      s().goto("fossa");
    });
    await step(2, H ? "First choice: the median cubital vein. Large, close to the surface, and tethered to the deep veins so it does not roll." : "First choice in the M pattern: the median vein. Central, well anchored and furthest from artery and nerve.", 5600, () => s().set({ selected: first }));
    await step(3, "Second choice: the lateral, thumb-side vein. Often the only one you can feel in a larger arm — anchor it well.", 5200, () => s().set({ selected: second }));
    await step(4, "Last choice: the medial vein. Strip the fascia and you see why — the brachial artery and median nerve lie directly beneath it.", 7000, () => {
      s().applyPreset("neurovascular");
      s().set({ selected: third });
      s().goto("medial");
    });
    await step(5, "Veins carry dark blood slowly back toward the heart. Arteries pulse bright blood away from it — a pulse under your finger means do not puncture.", 7000, () => {
      s().set({ selected: null, flow: true });
      s().goto("forearm");
    });
    await step(6, "On the back of the hand, digital veins join at the web spaces to form the dorsal metacarpal veins — the alternative site, with a 23G winged set at 10–15°.", 6500, () => {
      s().applyPreset("veinmap");
      s().set({ flow: false, selected: "dorsal-metacarpal" });
      s().goto("dorsum");
    });
    await step(7, "Deeper still are muscle, tendon and bone. A firm cord under your finger is tendon; a vein is soft and refills.", 6000, () => {
      s().applyPreset("deep");
      s().set({ selected: null });
      s().goto("full");
    });
  } catch {
    return;
  }
  if (alive()) {
    restore();
    s().applyPreset("veinmap");
  }
}
