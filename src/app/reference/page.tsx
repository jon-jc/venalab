import type { Metadata } from "next";
import Link from "next/link";
import { Cite } from "@/components/reference/Cite";
import OrderOfDraw from "@/components/reference/OrderOfDraw";
import { SOURCES } from "@/lib/reference/sources";
import { TUBES } from "@/lib/reference/tubes";

export const metadata: Metadata = {
  title: "Bedside reference — VenaLab",
  description: "Order of draw, venipuncture procedure, site selection and complications for phlebotomy students.",
};

const STEPS: [string, string][] = [
  ["Prepare", "Review the request and assemble the equipment. Every needle, holder and lancet is sterile and used once, for one patient."],
  ["Identify", "Ask the patient to state their full name and date of birth. Match both to the request and the wristband — never ask a yes/no question."],
  ["Screen", "Check fasting status, allergies (latex, adhesive, antiseptic), anticoagulants, previous fainting, and whether either arm must be avoided."],
  ["Position and tourniquet", "Support the arm straight and angled downward. Apply the tourniquet 7.5–10 cm above the site, tight enough to slow venous flow but not the pulse. Ask the patient to close their hand without pumping."],
  ["Select the vein", "Palpate with your index finger for a vein that is soft, bouncy and well anchored: median cubital first, then cephalic, then basilic. If this takes more than a minute, release the tourniquet and wait two minutes before reapplying."],
  ["Clean hands, gloves, cleanse", "Clean your hands and put on gloves. Scrub the site with 70% isopropyl alcohol and let it air-dry completely — about 30 seconds. Do not blow on it, fan it, or touch the site again."],
  ["Puncture", "Anchor the vein by pulling the skin taut 2.5–5 cm below the site. Insert the needle bevel up, in line with the vein, at 30° or less, in one smooth motion."],
  ["Collect", "Engage tubes in the order of draw. Release the tourniquet as soon as blood flows, and always within one minute. Gently invert each tube as it comes off."],
  ["Withdraw", "Remove the last tube before the needle. Lay gauze over the site, withdraw, activate the safety device, then press firmly. Keep the arm straight — bending it encourages a haematoma."],
  ["Dispose", "Drop the needle and holder into the sharps container as one unit, immediately. Never recap."],
  ["Label", "Label every tube at the bedside, in front of the patient: full name, identifier, date, time and your initials."],
  ["Finish", "Check that bleeding has stopped, apply a dressing and thank the patient. Remove your gloves, clean your hands, and send the samples promptly."],
];

const AVOID: [string, string][] = [
  ["Palmar wrist and palm", "Tendons, the median and ulnar nerves and both arteries lie just under the skin."],
  ["Radial side of the wrist", "The superficial radial nerve crosses the cephalic vein within the last 8–10 cm of the forearm."],
  ["Side of a mastectomy or lymph node clearance", "Risk of lymphoedema and infection; results may also be altered. Use the other arm."],
  ["Arm with a fistula or graft", "Never use for venipuncture or a tourniquet."],
  ["Above a running infusion", "The sample will be diluted. Use the other arm, or draw below the IV after it has been paused for at least 2 minutes."],
  ["Haematoma, burns, scars, oedema, infection", "Painful, hard to palpate, and likely to give altered results."],
  ["Feet and ankles", "Only with a clinician's permission: higher risk of thrombosis and infection, especially in diabetes."],
  ["Any site with a pulse", "A pulse means artery."],
];

const COMPLICATIONS: [string, string, string][] = [
  ["Haematoma", "Swelling at the site during or after the draw: the needle passed through the vein, sat partly outside it, or pressure was inadequate.", "Release the tourniquet, remove the needle, and apply firm pressure for several minutes. A cold pack limits swelling."],
  ["Arterial puncture", "Bright red blood that pulses into the tube.", "Release the tourniquet, withdraw, and press firmly for at least 5 minutes. Check the site and distal pulse, tell the nurse or clinician, and label the sample as arterial."],
  ["Nerve injury", "Sudden sharp, electric or shooting pain, tingling or numbness travelling down the arm.", "Stop at once: release the tourniquet and remove the needle. Do not redirect. Document it and follow your incident procedure."],
  ["Fainting (vasovagal syncope)", "Pallor, sweating, nausea, light-headedness, then loss of consciousness.", "Remove the needle and tourniquet, protect the patient from falling, lay them flat or lower the head, and call for help. Stay until they have recovered."],
  ["Haemolysis", "Pink or red serum or plasma. Causes include a needle that is too small, pulling hard on a syringe, shaking tubes, and puncturing through wet alcohol.", "Recollect. Use an appropriate gauge, let alcohol dry, and invert tubes gently."],
  ["Haemoconcentration", "Falsely raised proteins, cells and potassium from a tourniquet left on too long or from fist pumping.", "Keep tourniquet time under one minute and ask for a closed, relaxed hand."],
  ["Collapsed vein", "Flow stops and the vein flattens: the vacuum is too strong for a small or fragile vein.", "Remove the tube to let the vein refill, then use a smaller tube, a winged set, or a syringe."],
  ["No blood return", "The bevel is against the vein wall, beside the vein, or through it.", "You may ease back or advance slightly, once. Never probe sideways. If that fails, withdraw and choose a new site — and stop after two attempts."],
  ["Prolonged bleeding", "Bleeding beyond five minutes, usually in a patient on anticoagulants or with a clotting disorder.", "Keep pressure on and tell the nurse or clinician. Do not leave the patient."],
  ["Petechiae", "Tiny red spots below the tourniquet, suggesting fragile capillaries or low platelets.", "Expect the site to bleed longer; hold pressure accordingly."],
];

const FACTS: [string, string][] = [
  ["Needle angle", "15–30° at the elbow · 10–15° on the hand"],
  ["Standard needle", "21G · 23G winged for small or fragile veins"],
  ["Tourniquet", "7.5–10 cm above the site · 1 minute at most"],
  ["Attempts", "Two, then ask a colleague"],
  ["Arterial bleed", "Firm pressure for at least 5 minutes"],
  ["Citrate tube", "Fill to the line — 9:1 blood to additive"],
];

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="scroll-mt-20 text-xl font-semibold tracking-tight">
    {children}
  </h2>
);

export default function ReferencePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Bedside reference</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Venipuncture, start to finish</h1>
      <p className="mt-3 max-w-3xl text-slate-300">
        The essentials to know before you practise: which tube comes first, what to do at each step, where never to put a needle, and how to recognise trouble. Each section names the standard or guideline it follows, and <a href="#sources" className="text-accent hover:underline">the full list of sources</a> is at the foot of the page. Your own institution&apos;s policy always takes precedence.
      </p>
      <nav className="mt-5 flex flex-wrap gap-2 text-sm">
        {[["order", "Order of draw"], ["procedure", "Procedure"], ["sites", "Site selection"], ["complications", "Complications"], ["sources", "Sources"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="chip">{label}</a>
        ))}
      </nav>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACTS.map(([k, v]) => (
          <div key={k} className="panel px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{k}</dt>
            <dd className="mt-1 text-sm font-medium text-white">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <H2 id="order">Order of draw</H2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Additives carried from one tube into the next can change results. Build the sequence yourself, then check it against the table.</p>
        <Cite ids={["clsi-venous", "clsi-order"]} className="mt-1" />
        <div className="panel mt-4 p-4">
          <OrderOfDraw />
        </div>
        {/* On a phone each tube is a card; a table this wide would have to be scrolled sideways. */}
        <ol className="mt-4 space-y-2 sm:hidden">
          {TUBES.map((t, i) => (
            <li key={t.id} className="panel flex gap-3 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-ink-950" style={{ background: t.cap }}>
                {i + 1}
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-white">{t.name}</p>
                <p className="text-slate-300">{t.additive}</p>
                <p className="mt-1 text-slate-400">{t.use}</p>
                <p className="mt-1 text-xs text-slate-500">Invert {t.inversions} times</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="panel mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Tube</th>
                <th className="px-4 py-3">Additive</th>
                <th className="px-4 py-3">Typical tests</th>
                <th className="px-4 py-3">Inversions</th>
              </tr>
            </thead>
            <tbody>
              {TUBES.map((t, i) => (
                <tr key={t.id} className="border-t border-white/10">
                  <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: t.cap }} />
                    {t.name}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{t.additive}</td>
                  <td className="px-4 py-3 text-slate-300">{t.use}</td>
                  <td className="px-4 py-3 text-slate-300">{t.inversions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-500">
          The sequence is the CLSI order of draw. The number of inversions is set by each tube&apos;s manufacturer: the figures here are typical, so check the insert for the tubes you use. With a winged (butterfly) set, draw a discard tube before a citrate tube that would otherwise be first, so the air in the tubing does not leave it under-filled.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="procedure">Procedure</H2>
        <Cite ids={["clsi-venous", "who", "cdc-hands", "cdc-injection", "osha"]} className="mt-2" />
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="panel flex gap-3 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent">{i + 1}</span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-400">
          Watch every step performed on the model: <Link href="/atlas?mode=sim" className="text-accent hover:underline">open Practice and play the guided venipuncture</Link>.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="sites">Site selection</H2>
        <Cite ids={["clsi-venous", "who"]} className="mt-2" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <h3 className="text-sm font-semibold text-emerald-300">Where to look, in order</h3>
            <ol className="mt-3 space-y-3 text-sm text-slate-300">
              <li><b className="text-white">1 · Median cubital vein</b> (or the median vein in the M pattern). Large, superficial, anchored, least painful, and furthest from artery and nerve.</li>
              <li><b className="text-white">2 · Cephalic vein</b> (or median cephalic). Lateral, thumb side. Often the only palpable vein in a larger arm; anchor it firmly.</li>
              <li><b className="text-white">3 · Basilic vein</b> (or median basilic). Medial. Only when the others are ruled out in both arms: it rolls, and the brachial artery and median nerve lie beneath it.</li>
              <li><b className="text-white">4 · Dorsal hand veins.</b> A 23G winged set at 10–15°, with smaller tubes. More painful and more fragile.</li>
            </ol>
            <p className="mt-3 text-sm text-slate-400">Choose by feel, not by sight. A good vein is soft, bouncy and refills; a tendon is a hard cord; an artery pulses.</p>
          </div>
          <div className="panel p-4">
            <h3 className="text-sm font-semibold text-rose-300">Where not to draw</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {AVOID.map(([site, why]) => (
                <li key={site}>
                  <b className="text-white">{site}.</b> <span className="text-slate-300">{why}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          See these relationships in three dimensions: <Link href="/atlas?mode=explore" className="text-accent hover:underline">take the guided anatomy tour</Link>.
        </p>
      </section>

      <section className="mt-12">
        <H2 id="complications">Complications</H2>
        <Cite ids={["clsi-venous", "who"]} className="mt-2" />
        <div className="mt-4 space-y-3">
          {COMPLICATIONS.map(([name, sign, action]) => (
            <div key={name} className="panel grid gap-3 p-4 md:grid-cols-[180px_1fr_1fr]">
              <h3 className="text-sm font-semibold">{name}</h3>
              <p className="text-sm leading-relaxed text-slate-300"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-500">Recognise</span>{sign}</p>
              <p className="text-sm leading-relaxed text-slate-300"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-500">Respond</span>{action}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <H2 id="sources">Sources</H2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The teaching content in VenaLab — this page, the steps and marking in Practice, and the notes on each structure — is written from the documents below. Where they differ, the stricter figure is used.
        </p>
        <ol className="mt-4 space-y-3">
          {SOURCES.map((s, i) => (
            <li key={s.id} className="panel flex gap-3 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-slate-300">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{s.org}</p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-sm font-semibold text-accent hover:underline">
                  {s.title}
                </a>
                <p className="mt-0.5 text-xs text-slate-400">{s.edition}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                  <span className="text-slate-500">Used here for: </span>
                  {s.use}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-slate-500">
          The CLSI standards are sold, not free to read: the figures attributed to them are those taught from them in phlebotomy training, so check the current edition before relying on one. VenaLab is not reviewed, approved or endorsed by any of these organisations.
        </p>
      </section>

      <p className="mt-12 text-xs leading-relaxed text-slate-500">
        Educational summary only — not medical advice. Tube colours, additives and sequences vary between manufacturers and laboratories; follow your laboratory&apos;s collection manual and your institution&apos;s procedures.
      </p>
    </div>
  );
}
