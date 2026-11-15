import { idealPuncture } from "@/lib/anatomy/sim";
import { useAtlas } from "./store";

let run = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEMO_STEPS = 9;

function restore() {
  const s = useAtlas.getState();
  s.set({ demo: null, palp: null, tourniquet: false });
  s.resetSim();
}

export function stopDemo() {
  run++;
  restore();
}

/** Plays a narrated, textbook venipuncture of the first-choice vein on the current patient. */
export async function playDemo() {
  const me = ++run;
  const s = () => useAtlas.getState();
  const alive = () => me === run;
  const step = async (i: number, caption: string, ms: number, act?: () => void) => {
    if (!alive()) throw new Error("stopped");
    act?.();
    s().set({ demo: { step: i, caption } });
    await wait(ms);
    if (!alive()) throw new Error("stopped");
  };

  try {
    const H = s().pattern === "H";
    const plan = idealPuncture(s().built, H ? "median-cubital" : "median-vein", 25, H ? 0.32 : 0.86);
    if (!plan) return;
    const [x, y, z] = plan.entry;
    const look = (dx: number, dy: number, dz: number) => s().set({ view: { id: "demo", n: s().view.n + 1, target: [x, y, z], position: [x + dx, y + dy, z + dz] } });

    s().set({ mode: "sim", nir: false, tourniquet: false, palp: null });
    s().resetSim();

    await step(0, "Identify the patient, explain the procedure, and support the arm straight with the palm up.", 3200, () => look(4, 1, 44));
    await step(1, "Apply the tourniquet 7.5–10 cm above the site. The veins distend within seconds — it must not stay on longer than 1 minute.", 4800, () => s().set({ tourniquet: true }));
    await step(2, "Palpate with the tip of your index finger. The vein feels soft and bouncy, and springs back when you press.", 4200, () => {
      look(3, -2, 26);
      s().set({ palp: { kind: "vein", text: "Soft, bouncy and resilient.", p: plan.entry, n: plan.normal } });
    });
    await step(3, "Know what lies beneath: the vein crosses the bicipital aponeurosis, which shields the brachial artery and median nerve.", 5200, () => s().setSim({ reveal: true }));
    await step(4, "Cleanse with 70% isopropyl alcohol and let it air-dry. Do not touch the site again.", 3400, () => {
      s().setSim({ reveal: false });
      s().set({ palp: null });
    });
    await step(5, "Anchor the vein below the site. Bevel up, 15–30° to the skin, in line with the vein.", 4200, () => {
      look(7, -8, 15);
      s().setSim({ entry: plan.entry, normal: plan.normal, angle: plan.angle, yaw: plan.yaw, depth: plan.depth, gauge: 21, phase: "aim", result: null });
    });
    await step(6, "Advance smoothly in one motion until you feel the ‘give’ and see the flash of blood.", 600, () => {
      s().setSim({ reveal: true });
      s().advance();
    });
    while (alive() && s().sim.phase !== "done") await wait(80);
    await step(7, "Blood flows into the tube. Release the tourniquet now, and fill tubes in the correct order of draw.", 5600, () => s().set({ tourniquet: false }));
    await step(8, "Remove the last tube, withdraw the needle, activate the safety device, and apply pressure with gauze. Label the tubes at the bedside.", 4600, () => s().setSim({ phase: "withdraw" }));
  } catch {
    return;
  }
  if (alive()) restore();
}
