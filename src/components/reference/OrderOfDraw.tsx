"use client";

import { useMemo, useState } from "react";
import { TUBES, type Tube } from "@/lib/reference/tubes";

function shuffled<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const TubeIcon = ({ cap }: { cap: string }) => (
  <svg width="26" height="64" viewBox="0 0 26 64" aria-hidden>
    <rect x="2" y="0" width="22" height="12" rx="3" fill={cap} />
    <rect x="5" y="12" width="16" height="50" rx="8" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" />
    <rect x="7" y="34" width="12" height="26" rx="6" fill="#7a1220" opacity="0.85" />
  </svg>
);

export default function OrderOfDraw() {
  const [round, setRound] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rack = useMemo(() => (round === 0 ? [TUBES[3], TUBES[5], TUBES[1], TUBES[4], TUBES[0], TUBES[2]] : shuffled(TUBES)), [round]);
  const [done, setDone] = useState(0);
  const [wrong, setWrong] = useState<Tube | null>(null);
  const [misses, setMisses] = useState(0);
  const next = TUBES[done];

  const pick = (t: Tube) => {
    if (t.id === next.id) {
      setDone(done + 1);
      setWrong(null);
    } else {
      setWrong(t);
      setMisses(misses + 1);
    }
  };
  const restart = () => {
    setRound(round + 1);
    setDone(0);
    setWrong(null);
    setMisses(0);
  };

  return (
    <div>
      <div className="flex min-h-[92px] flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
        {TUBES.slice(0, done).map((t, i) => (
          <div key={t.id} className="flex flex-col items-center gap-1 text-center">
            <TubeIcon cap={t.cap} />
            <span className="text-[10px] text-slate-400">{i + 1}. {t.name}</span>
          </div>
        ))}
        {done < TUBES.length && <span className="self-center px-2 text-xs text-slate-500">{done === 0 ? "Tap the tube you would fill first" : "…and next?"}</span>}
      </div>

      {done < TUBES.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {rack.filter((t) => TUBES.indexOf(t) >= done).map((t) => (
            <button key={t.id} onClick={() => pick(t)} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition hover:border-accent/60 sm:px-3 ${wrong?.id === t.id ? "border-rose-400/70 bg-rose-400/10" : "border-white/15 bg-white/5"}`}>
              <TubeIcon cap={t.cap} />
              <span>
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-[11px] text-slate-400">{t.additive}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3">
          <p className="text-sm text-emerald-100">{misses === 0 ? "Perfect — correct order with no mistakes." : `Correct order, with ${misses} wrong pick${misses === 1 ? "" : "s"} along the way.`}</p>
          <button className="btn btn-ghost" onClick={restart}>Shuffle and retry</button>
        </div>
      )}

      {wrong && done < TUBES.length && (
        <p className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-50">
          Not yet. <b>{next.name}</b> comes before {wrong.name.toLowerCase()}. {next.why}
        </p>
      )}
    </div>
  );
}
