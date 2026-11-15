"use client";

import { LAYER_COLOR, LAYER_NAME, LAYER_ORDER, RATING_COLOR, RATING_LABEL, type StructureDef } from "@/lib/anatomy/structures";
import { playTour, stopDemo } from "./demo";
import { PRESETS, TONES, useAtlas, VIEWS, type Mode } from "./store";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-white/10 px-4 py-3 last:border-0">
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
    {children}
  </section>
);

const Toggle = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <button className="chip" data-on={on} onClick={() => onChange(!on)}>
    {children}
  </button>
);

export function ModeTabs() {
  const mode = useAtlas((s) => s.mode);
  const set = useAtlas((s) => s.set);
  const tabs: [Mode, string][] = [["sim", "Practice"], ["explore", "Explore anatomy"]];
  return (
    <div className="panel flex gap-1 p-1">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          onClick={() => {
            stopDemo();
            set({ mode: id, selected: null, nir: false });
          }}
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition lg:px-4 lg:text-sm ${mode === id ? "bg-accent text-ink-950" : "text-slate-300 hover:bg-white/5"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function ControlPanel() {
  const s = useAtlas();
  const explore = s.mode === "explore";
  return (
    <div className="panel thin-scroll max-h-full w-[250px] overflow-y-auto lg:w-[280px]">
      <Section title="Camera">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(VIEWS).map(([id, v]) => (
            <button key={id} className="chip" data-on={s.view.id === id} onClick={() => s.goto(id)}>
              {v.label}
            </button>
          ))}
        </div>
      </Section>

      {explore && (
        <>
          <Section title="Dissection presets">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id} title={p.hint} className="chip" data-on={!s.nir && s.preset === p.id} onClick={() => s.applyPreset(p.id)}>
                  {p.label}
                </button>
              ))}
              <button className="chip" title="Simulated near-infrared vein illuminator" data-on={s.nir} onClick={() => s.set({ nir: !s.nir })}>
                Vein illuminator
              </button>
              <button className="chip" title="Watch blood move: veins toward the heart, arteries pulsing away from it" data-on={s.flow} onClick={() => s.set({ flow: !s.flow })}>
                Blood flow
              </button>
            </div>
          </Section>

          <Section title="Layers">
            <div className={`space-y-2 ${s.nir ? "pointer-events-none opacity-40" : ""}`}>
              {LAYER_ORDER.map((id) => (
                <div key={id} className="flex items-center gap-2">
                  <button
                    onClick={() => s.setLayer(id, s.layers[id] > 0 ? 0 : 1)}
                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/30"
                    style={{ background: s.layers[id] > 0 ? LAYER_COLOR[id] : "transparent" }}
                    aria-label={`Toggle ${LAYER_NAME[id]}`}
                  />
                  <span className="w-[108px] shrink-0 text-xs text-slate-200">{LAYER_NAME[id]}</span>
                  <input type="range" min={0} max={1} step={0.02} value={s.layers[id]} onChange={(e) => s.setLayer(id, +e.target.value)} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Cross-section">
            <div className="flex items-center gap-2">
              <Toggle on={s.clip !== null} onChange={(v) => s.set({ clip: v ? 4 : null })}>
                Cut
              </Toggle>
              <input type="range" min={-20} max={45} step={0.25} disabled={s.clip === null} value={s.clip ?? 4} onChange={(e) => s.set({ clip: +e.target.value })} />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Removes everything distal to the cut so you can look up the limb.</p>
          </Section>
        </>
      )}

      {explore && (
      <Section title="Arm">
        <div className="space-y-2.5">
          <div>
            <p className="mb-1 text-[11px] text-slate-400">Antecubital vein pattern</p>
            <div className="flex gap-1.5">
              <Toggle on={s.pattern === "H"} onChange={() => s.set({ pattern: "H", selected: null })}>
                H-shaped (~70%)
              </Toggle>
              <Toggle on={s.pattern === "M"} onChange={() => s.set({ pattern: "M", selected: null })}>
                M-shaped
              </Toggle>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] text-slate-400">Skin tone — changes how visible veins are</p>
            <div className="flex gap-2">
              {TONES.map((t, i) => (
                <button
                  key={t.name}
                  title={t.name}
                  onClick={() => s.set({ tone: i })}
                  className={`h-6 w-6 rounded-full border-2 ${s.tone === i ? "border-accent" : "border-white/20"}`}
                  style={{ background: t.color }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Toggle on={s.tourniquet} onChange={(v) => s.set({ tourniquet: v })}>
              Tourniquet
            </Toggle>
            {explore && (
              <Toggle on={s.labels} onChange={(v) => s.set({ labels: v })}>
                Labels
              </Toggle>
            )}
          </div>
        </div>
      </Section>
      )}
    </div>
  );
}

const RatingBadge = ({ def }: { def: StructureDef }) =>
  def.rating ? (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${RATING_COLOR[def.rating]}22`, color: RATING_COLOR[def.rating], border: `1px solid ${RATING_COLOR[def.rating]}66` }}>
      {RATING_LABEL[def.rating]}
    </span>
  ) : null;

const viewFor = (anchor: number[]) => (anchor[0] > 27 ? (anchor[2] < 0 ? "dorsum" : "full") : anchor[0] > 8 ? "forearm" : "fossa");

export function InfoPanel() {
  const built = useAtlas((s) => s.built);
  const selected = useAtlas((s) => s.selected);
  const set = useAtlas((s) => s.set);
  const goto = useAtlas((s) => s.goto);
  const demo = useAtlas((s) => s.demo);
  const b = built.find((x) => x.def.id === selected);

  if (b && !demo) {
    const d = b.def;
    return (
      <div className="panel thin-scroll w-full p-4 lg:max-h-full lg:w-[340px] lg:overflow-y-auto">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: d.color ?? LAYER_COLOR[d.layer] }}>
              {LAYER_NAME[d.layer]}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold leading-tight">{d.name}</h2>
          </div>
          <button className="text-slate-400 hover:text-white" onClick={() => set({ selected: null })} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mt-2">
          <RatingBadge def={d} />
        </div>
        <h4 className="mt-4 text-xs font-semibold text-slate-400">Anatomy</h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{d.summary}</p>
        <h4 className="mt-4 text-xs font-semibold text-slate-400">At the bedside</h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-200">{d.clinical}</p>
        {d.stats && (
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {d.stats.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/5 p-2">
                <dt className="text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <button className="btn btn-ghost mt-4 w-full" onClick={() => goto(viewFor(b.anchor))}>
          Focus camera here
        </button>
      </div>
    );
  }

  const order = ["first", "second", "third", "alternate"];
  const sites = built
    .filter((x) => x.def.layer === "veins" && x.def.rating && order.includes(x.def.rating))
    .sort((a, c) => order.indexOf(a.def.rating!) - order.indexOf(c.def.rating!));
  const hazards = built.filter((x) => x.def.rating === "hazard");
  const pick = (x: (typeof built)[number]) => {
    set({ selected: x.def.id });
    goto(viewFor(x.anchor));
  };
  return (
    <div className="panel thin-scroll w-full p-4 lg:max-h-full lg:w-[340px] lg:overflow-y-auto">
      <button className="btn btn-ghost mb-4 w-full" onClick={() => (demo ? stopDemo() : playTour())}>
        {demo ? "■  Stop tour" : "▶  Take the guided anatomy tour"}
      </button>
      <h2 className="text-base font-semibold">Site selection</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">Click any structure on the model, or pick one below. Veins are listed in the order you should consider them.</p>
      <ul className="mt-3 space-y-1.5">
        {sites.map((x) => (
          <li key={x.def.id}>
            <button onClick={() => pick(x)} className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-sm transition hover:bg-white/10">
              <span>{x.def.name}</span>
              <RatingBadge def={x.def} />
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Structures at risk</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {hazards.map((x) => (
          <li key={x.def.id}>
            <button className="chip" onClick={() => pick(x)}>
              <span className="h-2 w-2 rounded-full" style={{ background: LAYER_COLOR[x.def.layer] }} />
              {x.def.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Narration shown while the guided demonstration plays. */
export function DemoCaption() {
  const demo = useAtlas((s) => s.demo);
  if (!demo) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center px-4">
      <div className="panel max-w-2xl px-6 py-4 text-center">
        <div className="mb-2 flex justify-center gap-1.5">
          {Array.from({ length: demo.total }, (_, i) => (
            <span key={i} className={`h-1 w-7 rounded-full ${i <= demo.step ? "bg-accent" : "bg-white/15"}`} />
          ))}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">Step {demo.step + 1} of {demo.total}</p>
        <p className="mt-1 text-base leading-snug text-white">{demo.caption}</p>
      </div>
    </div>
  );
}
