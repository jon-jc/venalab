"use client";

import { useEffect, useState } from "react";
import type { Difficulty } from "@/lib/anatomy/patients";
import type { SimResult } from "@/lib/anatomy/sim";
import { Cite } from "@/components/reference/Cite";
import { playDemo, stopDemo } from "./demo";
import { HOVER_MM, LEVELS, STAGES, useAtlas, type Stage } from "./store";

const TONE_STYLE = { good: "border-emerald-400/40 bg-emerald-400/10", warn: "border-amber-400/40 bg-amber-400/10", bad: "border-rose-400/50 bg-rose-400/10" };
const PALP_COLOR = { vein: "#7fa2ff", artery: "#ff4d57", tendon: "#efe7d6", none: "#64748b" };
const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced", "expert"];

/** One step of the procedure. Only the current step is open; finished steps show a one-line summary. */
function Step({ n, title, state = "now", summary, onOpen, children }: { n: number; title: string; state?: "done" | "now" | "next"; summary?: React.ReactNode; onOpen?: () => void; children: React.ReactNode }) {
  const open = state === "now";
  return (
    <section className={`border-b border-white/10 px-4 py-3 last:border-0 ${state === "next" ? "opacity-45" : ""}`}>
      <button className="flex w-full items-center gap-2 text-left disabled:cursor-default" disabled={open || !onOpen} onClick={onOpen}>
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${state === "done" ? "bg-emerald-400/20 text-emerald-300" : open ? "bg-accent text-ink-950" : "bg-white/10 text-slate-400"}`}>
          {state === "done" ? "✓" : n}
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-widest ${open ? "text-white" : "text-slate-400"}`}>{title}</span>
        {!open && summary && <span className="ml-auto text-xs text-slate-400">{summary}</span>}
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </section>
  );
}

const Chip = ({ on, onClick, disabled, children }: { on?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button className="chip disabled:cursor-not-allowed disabled:opacity-40" data-on={!!on} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);

/** Re-renders a few times a second while a clock is running. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

/** How long ago the site was cleansed, in words. */
function Drying({ at, now }: { at: number | null; now: number }) {
  if (!at) return <span className="text-slate-400">Not cleansed yet.</span>;
  const left = 4 - (now - at) / 1000;
  return left > 0 ? <span className="text-amber-300">Wet — drying… {Math.ceil(left)} s</span> : <span className="text-emerald-300">Cleansed and dry.</span>;
}

/** How far the scrubbing has got. */
function Scrub() {
  const scrub = useAtlas((s) => s.scrub);
  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded bg-white/10">
        <div className="h-full rounded bg-accent transition-[width] duration-150" style={{ width: `${Math.round(scrub * 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{scrub >= 1 ? "Clean." : scrub > 0 ? "Keep rubbing, back and forth." : "The wipe follows your pointer on the skin."}</p>
    </div>
  );
}

function Debrief({ r, children }: { r: SimResult; children?: React.ReactNode }) {
  return (
    <section className="px-4 py-3">
      <div className="flex items-center justify-between">
        <h3 className={`text-base font-semibold ${r.outcome === "success" ? "text-emerald-300" : "text-rose-300"}`}>{r.title}</h3>
        <span className="rounded-lg bg-white/10 px-2 py-1 text-sm font-bold">{r.score}/100</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {r.notes.map((n, i) => (
          <li key={i} className={`rounded-lg border px-3 py-2 text-[13px] leading-snug text-slate-100 ${TONE_STYLE[n.tone]}`}>
            {n.text}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

function Venous() {
  const sim = useAtlas((s) => s.sim);
  const palp = useAtlas((s) => s.palp);
  const tourniquet = useAtlas((s) => s.tourniquet);
  const tourniquetAt = useAtlas((s) => s.tourniquetAt);
  const demo = useAtlas((s) => s.demo);
  const level = useAtlas((s) => LEVELS[s.difficulty]);
  const { set, setSim, aim, setDepth, finish, withdraw, newPatient, stageTo } = useAtlas.getState();
  const now = useNow(tourniquet || !!sim.cleansedAt);

  const stage = sim.stage;
  const at = STAGES.indexOf(stage);
  const state = (s: Stage) => (STAGES.indexOf(s) < at ? "done" : s === stage ? "now" : "next");
  const held = sim.phase === "aim" && !demo;
  const inSkin = sim.depth > 0;
  const free = held && !inSkin;
  const onTime = tourniquetAt ? Math.round((now - tourniquetAt) / 1000) : 0;
  const clock = <span className={`font-semibold tabular-nums ${onTime > 60 ? "text-rose-300" : onTime > 45 ? "text-amber-300" : "text-slate-200"}`}>{onTime} s</span>;
  const live = sim.live?.outcome;
  const status = !inSkin ? "Needle above the skin." : live === "success" || live === "artery" ? "Blood in the hub. Hold still and let the tube fill." : live === "through" ? "The flash has stopped." : "In the tissue — no blood yet.";
  const release = tourniquet && (
    <div className="mt-2 flex items-center gap-3 text-xs">
      <Chip on onClick={() => set({ tourniquet: false })}>
        Release tourniquet
      </Chip>
      {clock}
    </div>
  );

  return (
    <>
      <div className="border-b border-white/10 px-4 py-3">
        <button className="btn btn-ghost w-full" onClick={() => (demo ? stopDemo() : playDemo())}>
          {demo ? "■  Stop demonstration" : "▶  Watch a guided venipuncture"}
        </button>
      </div>

      <div className={demo ? "pointer-events-none opacity-50" : ""}>
        <Step n={1} title="Tourniquet" state={state("tourniquet")} summary={tourniquet ? <>On · {clock}</> : "Not applied"} onOpen={free ? () => stageTo("tourniquet") : undefined}>
          <p className="text-sm text-slate-200">Apply it 7.5–10 cm above where you expect to draw. The veins fill within seconds.</p>
          <div className="mt-3 flex gap-2">
            <button
              className="btn flex-1"
              onClick={() => {
                set({ tourniquet: true });
                stageTo("palpate");
              }}
            >
              Apply tourniquet
            </button>
            <button className="btn btn-ghost" onClick={() => stageTo("palpate")}>
              Skip
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">It must not stay on for more than 1 minute — a clock starts as soon as it is on.</p>
          <Cite ids={["clsi-venous"]} className="mt-1" />
        </Step>

        <Step n={2} title="Find the vein" state={state("palpate")} summary={sim.entry ? "Site marked" : "—"} onOpen={free ? () => stageTo("palpate") : undefined}>
          <p className="text-sm text-slate-200">Run your fingertip over the arm. When you have found the vein you want, click it to mark the puncture site.</p>
          <div className="mt-2 flex min-h-[52px] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALP_COLOR[palp?.kind ?? "none"] }} />
            <span className="text-slate-200">
              {palp?.text ?? "Move the pointer over the arm to palpate."}
              {level.numbers && palp?.detail && <span className="block text-[11px] text-slate-400">{palp.detail}</span>}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">A vein is soft and bouncy. A pulse means artery. A hard cord is tendon.</p>
          <Cite ids={["clsi-venous", "who"]} className="mt-1" />
          {release}
        </Step>

        <Step n={3} title="Cleanse the site" state={state("cleanse")} summary={<Drying at={sim.cleansedAt} now={now} />} onOpen={free && sim.entry ? () => stageTo("cleanse") : undefined}>
          <p className="text-sm text-slate-200">You are holding a 70% isopropyl alcohol wipe. Rub it back and forth over the marked site until it is clean, then let the skin dry.</p>
          <Scrub />
          <p className="mt-2 text-[11px] text-slate-500">At the bedside the alcohol needs about 30 seconds to dry. Here it takes a few.</p>
          <Cite ids={["clsi-venous", "who"]} className="mt-1" />
          <button className="btn btn-ghost mt-3 w-full" onClick={() => stageTo("needle")}>
            Skip cleansing
          </button>
        </Step>

        <Step n={4} title="Needle" state={state("needle")} summary={sim.result ? "Attempt finished" : "—"}>
          <div className="flex items-center justify-between text-xs">
            <Drying at={sim.cleansedAt} now={now} />
            {free && (
              <button className="text-slate-400 underline-offset-2 hover:text-white hover:underline" onClick={() => stageTo("palpate")}>
                Choose another site
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {([21, 22, 23] as const).map((g) => (
              <Chip key={g} on={sim.gauge === g} disabled={!free} onClick={() => setSim({ gauge: g })}>
                {g}G{g === 23 ? " winged" : ""}
              </Chip>
            ))}
            <Chip on={sim.anchor} disabled={!free} onClick={() => setSim({ anchor: !sim.anchor })}>
              Anchor vein
            </Chip>
          </div>
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-slate-300">
            <b className="text-white">Hold the needle:</b> drag the holder (teal ring) to tilt and aim it about the site. Drag the end of the tube (amber ring) to push it in and draw it back — or scroll over it, or press ↑ ↓.
          </p>
          <div className={`mt-2 space-y-2 text-xs text-slate-300 ${held ? "" : "pointer-events-none opacity-50"}`}>
            <label className="block">
              <span className="flex justify-between"><span>Angle to skin</span><b>{sim.angle}°</b></span>
              <input type="range" min={3} max={85} value={sim.angle} disabled={sim.depth > 1.5} onChange={(e) => aim({ angle: +e.target.value })} />
            </label>
            <label className="block">
              <span className="flex justify-between"><span>Direction (0° is toward the heart)</span><b>{sim.yaw}°</b></span>
              <input type="range" min={-180} max={180} value={sim.yaw} disabled={sim.depth > 1.5} onChange={(e) => aim({ yaw: +e.target.value })} />
            </label>
            <label className="block">
              <span className="flex justify-between"><span>Needle in the skin</span><b>{inSkin ? `${sim.depth.toFixed(1)} mm` : "—"}</b></span>
              <input type="range" min={HOVER_MM} max={30} step={0.5} value={sim.depth} onChange={(e) => setDepth(+e.target.value)} />
            </label>
          </div>
          {level.hints && held && <p className={`mt-2 text-xs ${live === "success" ? "text-emerald-300" : "text-slate-400"}`}>{status}</p>}
          <Cite ids={["clsi-venous", "who"]} className="mt-2" />
          {release}
          <div className="mt-3 flex gap-2">
            <button className="btn flex-1" disabled={!held || !inSkin} onClick={finish}>
              {sim.phase === "advancing" ? "Advancing…" : "Finish attempt"}
            </button>
            <button className="btn btn-ghost" disabled={!level.xray} title={level.xray ? "" : "Not available at this level until you finish"} onClick={() => setSim({ reveal: !sim.reveal })}>
              {sim.reveal ? "Hide anatomy" : "X-ray"}
            </button>
          </div>
        </Step>
      </div>

      {sim.result && !demo && (
        <Debrief r={sim.result}>
          <p className="mt-2 text-[11px] text-slate-400">Needle tip {sim.result.tipDepthMm.toFixed(1)} mm beneath the skin.</p>
          {release}
          <div className="mt-3 flex gap-2">
            {sim.phase === "done" && (
              <button className="btn flex-1" onClick={withdraw}>
                Withdraw needle
              </button>
            )}
            <button className="btn btn-ghost flex-1" onClick={() => setSim({ reveal: !sim.reveal })}>
              {sim.reveal ? "Hide anatomy" : "X-ray"}
            </button>
          </div>
          <button className="btn btn-ghost mt-2 w-full" onClick={newPatient}>
            Next patient
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Afterwards: activate the safety device and drop the needle and holder into the sharps container as one unit. Never recap a used needle, and never use one twice.</p>
          <Cite ids={["clsi-venous", "who", "osha", "cdc-injection"]} className="mt-1" />
        </Debrief>
      )}
    </>
  );
}

function Capillary() {
  const cap = useAtlas((s) => s.cap);
  const hints = useAtlas((s) => LEVELS[s.difficulty].hints);
  const { setCap, capPuncture, capFinish, capReset, capStep, goto, newPatient } = useAtlas.getState();
  const now = useNow(!!cap.cleansedAt);
  const step = cap.step;
  const state = (n: number) => (n < step ? "done" : n === step ? "now" : "next");
  const before = cap.phase === "aim";

  return (
    <>
      <Step n={1} title="Prepare the hand" state={state(1)} summary={cap.warmed ? "Warmed" : "Not warmed"} onOpen={before ? () => capStep(1) : undefined}>
        <p className="text-sm text-slate-200">A cold hand barely bleeds. Three to five minutes of warmth increases capillary flow several-fold.</p>
        <Cite ids={["clsi-capillary"]} className="mt-1" />
        <div className="mt-3 flex gap-2">
          <button
            className="btn flex-1"
            onClick={() => {
              setCap({ warmed: true });
              capStep(2);
            }}
          >
            Warm the hand
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setCap({ warmed: false });
              capStep(2);
            }}
          >
            Skip
          </button>
        </div>
      </Step>

      <Step n={2} title="Choose the site" state={state(2)} summary={cap.site ? "Site marked" : "—"} onOpen={before ? () => capStep(2) : undefined}>
        <p className="text-sm text-slate-200">Click the spot on a fingertip where the lancet should go. The finger under your pointer is named as you move.</p>
        {hints && <p className="mt-2 rounded-lg bg-accent/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-100">The green patches show the recommended places: the pad of the middle or ring finger, a little to one side of the midline.</p>}
        <button className="btn btn-ghost mt-3 w-full" onClick={() => goto("fingers")}>
          View the fingertips
        </button>
        <Cite ids={["who-capillary", "clsi-capillary"]} className="mt-2" />
      </Step>

      <Step n={3} title="Cleanse the site" state={state(3)} summary={<Drying at={cap.cleansedAt} now={now} />} onOpen={before && cap.site ? () => capStep(3) : undefined}>
        <p className="text-sm text-slate-200">You are holding a 70% isopropyl alcohol wipe. Rub it back and forth over the ringed site until it is clean, then let the skin dry.</p>
        <Scrub />
        <Cite ids={["who-capillary"]} className="mt-2" />
        <button className="btn btn-ghost mt-3 w-full" onClick={() => capStep(4)}>
          Skip cleansing
        </button>
      </Step>

      <Step n={4} title="Lancet" state={state(4)} summary={`${cap.lancet.toFixed(1)} mm · ${cap.across ? "across" : "along"}`}>
        <div className="text-xs">
          <Drying at={cap.cleansedAt} now={now} />
        </div>
        <p className="mb-1.5 mt-2 text-[11px] text-slate-400">Puncture depth — this patient is an adult</p>
        <div className="flex flex-wrap gap-1.5">
          {[1.0, 1.5, 2.2, 2.8].map((d) => (
            <Chip key={d} on={cap.lancet === d} onClick={() => setCap({ lancet: d })}>
              {d.toFixed(1)} mm
            </Chip>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-[11px] text-slate-400">Blade, relative to the fingerprint ridges</p>
        <div className="flex gap-1.5">
          <Chip on={cap.across} onClick={() => setCap({ across: true })}>
            Across
          </Chip>
          <Chip on={!cap.across} onClick={() => setCap({ across: false })}>
            Along
          </Chip>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn flex-1" onClick={capPuncture}>
            Fire the lancet
          </button>
          <button className="btn btn-ghost" onClick={() => capStep(2)}>
            Change site
          </button>
        </div>
        <Cite ids={["who-capillary"]} className="mt-2" />
      </Step>

      <Step n={5} title="Collect" state={cap.phase === "done" ? "done" : state(5)} summary={cap.phase === "done" ? "Finished" : "—"}>
        <p className="text-sm text-slate-200">A drop is forming. Decide how to collect it.</p>
        <div className="mt-2">
          <Chip on={cap.wiped} disabled={cap.phase !== "punctured"} onClick={() => setCap({ wiped: true })}>
            {cap.wiped ? "First drop wiped away" : "Wipe away the first drop"}
          </Chip>
        </div>
        <p className="mb-1.5 mt-3 text-[11px] text-slate-400">Pressure on the finger</p>
        <div className="flex gap-1.5">
          <Chip on={!cap.milking} onClick={() => setCap({ milking: false })}>
            Gentle, intermittent
          </Chip>
          <Chip on={cap.milking} onClick={() => setCap({ milking: true })}>
            Squeeze hard
          </Chip>
        </div>
        <p className="mb-1.5 mt-3 text-[11px] text-slate-400">Tube to fill first</p>
        <div className="flex gap-1.5">
          <Chip on={cap.edtaFirst} disabled={cap.phase !== "punctured"} onClick={() => setCap({ edtaFirst: true })}>
            EDTA (lavender)
          </Chip>
          <Chip on={!cap.edtaFirst} disabled={cap.phase !== "punctured"} onClick={() => setCap({ edtaFirst: false })}>
            Serum (gold)
          </Chip>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost flex-1" disabled={cap.phase !== "punctured"} onClick={() => setCap({ phase: "collecting" })}>
            Collect the drop
          </button>
          <button className="btn flex-1" disabled={cap.phase !== "collecting"} onClick={capFinish}>
            Finish
          </button>
        </div>
        <Cite ids={["who-capillary", "clsi-capillary"]} className="mt-2" />
      </Step>

      {cap.result && (
        <Debrief r={cap.result}>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={capReset}>
              Try again
            </button>
            <button className="btn btn-ghost flex-1" onClick={newPatient}>
              Next patient
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">Afterwards: the lancet goes straight into the sharps container. It is used once, on one patient.</p>
          <Cite ids={["who-capillary", "osha", "cdc-injection"]} className="mt-1" />
        </Debrief>
      )}
    </>
  );
}

export function PracticePanel() {
  const procedure = useAtlas((s) => s.procedure);
  const difficulty = useAtlas((s) => s.difficulty);
  const patient = useAtlas((s) => s.patient);
  const sim = useAtlas((s) => s.sim);
  const demo = useAtlas((s) => s.demo);
  const { set, setDifficulty, newPatient, goto } = useAtlas.getState();

  return (
    <div className="panel thin-scroll w-full lg:max-h-full lg:w-[350px] lg:overflow-y-auto">
      <div className="border-b border-white/10 px-4 py-3">
        <div className={`flex gap-1 rounded-lg bg-white/5 p-1 ${demo ? "pointer-events-none opacity-40" : ""}`}>
          {(
            [
              ["venous", "Venipuncture"],
              ["capillary", "Fingerstick"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                set({ procedure: id, palp: null, tourniquet: false });
                goto(id === "capillary" ? "fingers" : "full");
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${procedure === id ? "bg-accent text-ink-950" : "text-slate-300 hover:bg-white/5"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`border-b border-white/10 px-4 py-3 ${demo ? "pointer-events-none opacity-40" : ""}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Difficulty</h3>
          <span className="text-xs text-slate-300">
            <b className="text-sm text-white">{sim.hits}</b>/{sim.attempts} successful
            {sim.attempts > 0 && <span className="ml-1.5 text-slate-400">· avg {Math.round(sim.total / sim.attempts)}</span>}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((d) => (
            <Chip key={d} on={difficulty === d} onClick={() => setDifficulty(d)}>
              {LEVELS[d].label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{LEVELS[difficulty].blurb}</p>
      </div>

      <div className={`border-b border-white/10 px-4 py-3 ${demo ? "pointer-events-none opacity-40" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Patient
              <span className="rounded-full border border-white/20 px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-slate-300">Synthetic</span>
            </h3>
            <p className="mt-0.5 text-sm font-semibold text-white">{patient.title}</p>
          </div>
          <button className="chip shrink-0" onClick={newPatient}>
            Next patient
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{patient.brief}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">An invented case for practice, not a real person. VenaLab holds no patient data.</p>
      </div>

      {procedure === "venous" ? <Venous /> : <Capillary />}
    </div>
  );
}
