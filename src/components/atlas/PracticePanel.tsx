"use client";

import { useEffect, useState } from "react";
import type { Difficulty } from "@/lib/anatomy/patients";
import type { SimResult } from "@/lib/anatomy/sim";
import { playDemo, stopDemo } from "./demo";
import { HOVER_MM, LEVELS, useAtlas } from "./store";

const TONE_STYLE = { good: "border-emerald-400/40 bg-emerald-400/10", warn: "border-amber-400/40 bg-amber-400/10", bad: "border-rose-400/50 bg-rose-400/10" };
const PALP_COLOR = { vein: "#7fa2ff", artery: "#ff4d57", tendon: "#efe7d6", none: "#64748b" };
const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced", "expert"];

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="border-b border-white/10 px-4 py-3 last:border-0">
    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/20 text-[10px] text-accent">{n}</span>
      {title}
    </h3>
    {children}
  </section>
);

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
  const { set, setSim, aim, setDepth, cleanse, finish, withdraw, newPatient } = useAtlas.getState();
  const now = useNow(tourniquet || !!sim.cleansedAt);

  const held = sim.phase === "aim" && !demo;
  const inSkin = sim.depth > 0;
  const onTime = tourniquetAt ? Math.round((now - tourniquetAt) / 1000) : 0;
  const live = sim.live?.outcome;
  const status = !inSkin ? "Needle above the skin." : live === "success" || live === "artery" ? "Blood in the hub. Hold still and let the tube fill." : live === "through" ? "The flash has stopped." : "In the tissue — no blood yet.";

  return (
    <>
      <div className="border-b border-white/10 px-4 py-3">
        <button className="btn btn-ghost w-full" onClick={() => (demo ? stopDemo() : playDemo())}>
          {demo ? "■  Stop demonstration" : "▶  Watch a guided venipuncture"}
        </button>
      </div>

      <div className={demo ? "pointer-events-none opacity-40" : ""}>
        <Step n={1} title="Tourniquet">
          <div className="flex items-center gap-3">
            <Chip on={tourniquet} onClick={() => set({ tourniquet: !tourniquet })}>
              {tourniquet ? "Release tourniquet" : "Apply tourniquet"}
            </Chip>
            {tourniquet && <span className={`text-sm font-semibold tabular-nums ${onTime > 60 ? "text-rose-300" : onTime > 45 ? "text-amber-300" : "text-slate-200"}`}>{onTime} s</span>}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">No longer than 1 minute. Release it as soon as blood is flowing.</p>
        </Step>

        <Step n={2} title="Palpate">
          <p className="text-xs text-slate-400">Move the pointer over the arm. Veins are soft and bouncy, arteries pulse, tendons are hard cords.</p>
          <div className="mt-2 flex min-h-[52px] items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALP_COLOR[palp?.kind ?? "none"] }} />
            <span className="text-slate-200">
              {palp?.text ?? "Hover over the arm to palpate."}
              {level.numbers && palp?.detail && <span className="block text-[11px] text-slate-400">{palp.detail}</span>}
            </span>
          </div>
        </Step>

        <Step n={3} title="Site and cleansing">
          <p className="text-sm text-slate-200">{sim.entry ? "Site marked. Click elsewhere on the skin to move it." : "Click the skin where the needle should enter."}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <Chip onClick={cleanse} disabled={!sim.entry || inSkin}>
              Cleanse with alcohol
            </Chip>
            <Drying at={sim.cleansedAt} now={now} />
          </div>
        </Step>

        <Step n={4} title="Needle">
          <div className="flex flex-wrap items-center gap-1.5">
            {([21, 22, 23] as const).map((g) => (
              <Chip key={g} on={sim.gauge === g} disabled={inSkin || !held} onClick={() => setSim({ gauge: g })}>
                {g}G{g === 23 ? " winged" : ""}
              </Chip>
            ))}
            <Chip on={sim.anchor} disabled={inSkin || !held} onClick={() => setSim({ anchor: !sim.anchor })}>
              Anchor vein
            </Chip>
          </div>
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-slate-300">
            <b className="text-white">Hold the needle:</b> drag the holder (teal ring) to tilt and aim it about the site. Drag the end of the tube (amber ring) to push it in and draw it back — or scroll over it, or press ↑ ↓.
          </p>
          <div className={`mt-2 space-y-2 text-xs text-slate-300 ${held && sim.entry ? "" : "pointer-events-none opacity-50"}`}>
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
          {level.hints && sim.entry && held && <p className={`mt-2 text-xs ${live === "success" ? "text-emerald-300" : "text-slate-400"}`}>{status}</p>}
          <div className="mt-3 flex gap-2">
            {sim.phase === "done" ? (
              <button className="btn flex-1" onClick={withdraw}>
                Withdraw needle
              </button>
            ) : (
              <button className="btn flex-1" disabled={!held || !inSkin} onClick={finish}>
                {sim.phase === "advancing" ? "Advancing…" : "Finish attempt"}
              </button>
            )}
            <button className="btn btn-ghost" disabled={!level.xray && !sim.result} title={level.xray || sim.result ? "" : "Not available at this level until you finish"} onClick={() => setSim({ reveal: !sim.reveal })}>
              {sim.reveal ? "Hide anatomy" : "X-ray"}
            </button>
          </div>
        </Step>
      </div>

      {sim.result && !demo && (
        <Debrief r={sim.result}>
          <p className="mt-2 text-[11px] text-slate-400">Needle tip {sim.result.tipDepthMm.toFixed(1)} mm beneath the skin.</p>
          <button className="btn btn-ghost mt-3 w-full" onClick={newPatient}>
            Next patient
          </button>
        </Debrief>
      )}
    </>
  );
}

function Capillary() {
  const cap = useAtlas((s) => s.cap);
  const { setCap, cleanse, capPuncture, capFinish, capReset, goto, newPatient } = useAtlas.getState();
  const now = useNow(!!cap.cleansedAt);
  const aiming = cap.phase === "aim";
  const bleeding = cap.phase === "punctured" || cap.phase === "collecting";

  return (
    <>
      <Step n={1} title="Prepare">
        <div className="flex flex-wrap gap-1.5">
          <Chip on={cap.warmed} disabled={!aiming} onClick={() => setCap({ warmed: !cap.warmed })}>
            Warm the hand
          </Chip>
          <Chip onClick={() => goto("fingers")}>View the fingertips</Chip>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Three to five minutes of warmth increases capillary flow several-fold.</p>
      </Step>

      <Step n={2} title="Site and cleansing">
        <p className="text-sm text-slate-200">{cap.site ? "Site marked. Click another spot to move it." : "Click the spot on a finger where the lancet should go."}</p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <Chip onClick={cleanse} disabled={!cap.site || !aiming}>
            Cleanse with alcohol
          </Chip>
          <Drying at={cap.cleansedAt} now={now} />
        </div>
      </Step>

      <Step n={3} title="Lancet">
        <p className="mb-1.5 text-[11px] text-slate-400">Puncture depth</p>
        <div className="flex flex-wrap gap-1.5">
          {[1.0, 1.5, 2.0, 2.4].map((d) => (
            <Chip key={d} on={cap.lancet === d} disabled={!aiming} onClick={() => setCap({ lancet: d })}>
              {d.toFixed(1)} mm
            </Chip>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-[11px] text-slate-400">Blade, relative to the fingerprint ridges</p>
        <div className="flex gap-1.5">
          <Chip on={cap.across} disabled={!aiming} onClick={() => setCap({ across: true })}>
            Across
          </Chip>
          <Chip on={!cap.across} disabled={!aiming} onClick={() => setCap({ across: false })}>
            Along
          </Chip>
        </div>
        <button className="btn mt-3 w-full" disabled={!cap.site || !aiming} onClick={capPuncture}>
          Fire the lancet
        </button>
      </Step>

      <Step n={4} title="Collect">
        <div className={bleeding ? "" : "pointer-events-none opacity-40"}>
          <Chip on={cap.wiped} disabled={cap.phase !== "punctured"} onClick={() => setCap({ wiped: true })}>
            {cap.wiped ? "First drop wiped away" : "Wipe away the first drop"}
          </Chip>
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
        </div>
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
    <div className="panel thin-scroll max-h-full w-[350px] overflow-y-auto">
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
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Patient</h3>
            <p className="mt-0.5 text-sm font-semibold text-white">{patient.title}</p>
          </div>
          <button className="chip shrink-0" onClick={newPatient}>
            Next patient
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{patient.brief}</p>
      </div>

      {procedure === "venous" ? <Venous /> : <Capillary />}
    </div>
  );
}
