"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { analyse, type Analysis, type Region } from "@/lib/veinfinder/pipeline";
import { drawSample, SAMPLES } from "@/lib/veinfinder/samples";

const Relief = dynamic(() => import("./Relief"), { ssr: false });

type View = "photo" | "enhanced" | "map" | "relief";
const VIEWS: [View, string][] = [["photo", "Photo"], ["enhanced", "Enhanced"], ["map", "Vein map"], ["relief", "3D relief"]];
const REGIONS: [Region, string][] = [["antecubital", "Inner elbow"], ["forearm", "Forearm"], ["hand", "Back of hand"]];
const COLORS = ["#35e0c2", "#9be15d", "#f5a524", "#9fb3c8", "#9fb3c8"];
const MAX_SIDE = 640;
const CONFIDENCE = {
  high: ["High confidence", "text-emerald-300"],
  moderate: ["Moderate confidence", "text-amber-300"],
  low: ["Low confidence", "text-orange-300"],
  none: ["No veins traced", "text-rose-300"],
} as const;

/** Paint the chosen view of the analysis; `marks` adds the ranked centre-lines and puncture targets. */
function paint(canvas: HTMLCanvasElement, src: HTMLCanvasElement, a: Analysis, view: View, selected: number, marks: boolean) {
  const { width: w, height: h } = a;
  const s = 2;
  canvas.width = w * s;
  canvas.height = h * s;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";

  if (view === "enhanced") {
    const img = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = a.mask[i] ? Math.min(1, Math.max(0, 0.5 + a.enhanced[i] / 4.5)) : 0;
      img.data[i * 4] = v * 70;
      img.data[i * 4 + 1] = v * 255;
      img.data[i * 4 + 2] = v * 170;
      img.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, w * s, h * s);
  } else {
    ctx.drawImage(src, 0, 0, w * s, h * s);
    if (view !== "photo") {
      if (marks) {
        ctx.fillStyle = "rgba(4,8,16,0.45)";
        ctx.fillRect(0, 0, w * s, h * s);
      }
      const img = new ImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = Math.min(1, a.vessel[i] * 1.6);
        img.data[i * 4] = 60;
        img.data[i * 4 + 1] = 235;
        img.data[i * 4 + 2] = 210;
        img.data[i * 4 + 3] = v * v * (marks ? 255 : 170);
      }
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      tmp.getContext("2d")!.putImageData(img, 0, 0);
      ctx.drawImage(tmp, 0, 0, w * s, h * s);
    }
  }
  if (!marks) return;

  ctx.save();
  ctx.scale(s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  [...a.candidates].reverse().forEach((c) => {
    const i = c.rank - 1;
    const on = i === selected;
    ctx.strokeStyle = COLORS[i];
    ctx.globalAlpha = on ? 1 : 0.75;
    ctx.lineWidth = on ? 3.2 : 2;
    ctx.beginPath();
    c.points.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();

    const [x, y] = c.target;
    const len = a.limbWidthPx * (on ? 0.3 : 0.2);
    // The needle enters short of the target and travels along the vein toward the heart.
    const bx = x - c.direction[0] * len, by = y - c.direction[1] * len;
    ctx.globalAlpha = 1;
    ctx.lineWidth = on ? 2.4 : 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(x, y);
    ctx.stroke();
    const ang = Math.atan2(c.direction[1], c.direction[0]);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9 * Math.cos(ang - 0.4), y - 9 * Math.sin(ang - 0.4));
    ctx.lineTo(x - 9 * Math.cos(ang + 0.4), y - 9 * Math.sin(ang + 0.4));
    ctx.fill();

    ctx.fillStyle = COLORS[i];
    ctx.beginPath();
    ctx.arc(bx, by, on ? 10 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#04221d";
    ctx.font = `700 ${on ? 12 : 10}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(c.rank), bx, by + 0.5);
  });
  ctx.restore();
}

const Meter = ({ label, value }: { label: string; value: number }) => (
  <div>
    <div className="flex justify-between text-[11px] text-slate-400">
      <span>{label}</span>
      <span>{Math.round(value * 100)}%</span>
    </div>
    <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
      <div className="h-full rounded" style={{ width: `${Math.round(value * 100)}%`, background: value > 0.6 ? "#35e0c2" : value > 0.35 ? "#f5a524" : "#ff5a5f" }} />
    </div>
  </div>
);

export default function VeinFinder() {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [region, setRegion] = useState<Region>("forearm");
  const [heart, setHeart] = useState<1 | -1 | 0>(0);
  const [view, setView] = useState<View>("photo");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [texture, setTexture] = useState<HTMLCanvasElement | null>(null);

  const load = useCallback((image: CanvasImageSource, iw: number, ih: number) => {
    const k = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    const c = document.createElement("canvas");
    c.width = Math.round(iw * k);
    c.height = Math.round(ih * k);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, c.width, c.height);
    setHeart(0);
    setSelected(0);
    setSource(c);
  }, []);

  const loadFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      load(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
    },
    [load],
  );

  // Analyse whenever the image or its settings change. Everything stays in this browser tab.
  useEffect(() => {
    if (!source) return;
    setBusy(true);
    const id = setTimeout(() => {
      const ctx = source.getContext("2d", { willReadFrequently: true })!;
      const result = analyse(ctx.getImageData(0, 0, source.width, source.height), region, heart);
      setAnalysis(result);
      setSelected((s) => Math.min(s, Math.max(result.candidates.length - 1, 0)));
      setBusy(false);
    }, 30);
    return () => clearTimeout(id);
  }, [source, region, heart]);

  useEffect(() => {
    if (!source || !analysis) return;
    if (view === "relief") {
      const t = document.createElement("canvas");
      paint(t, source, analysis, "map", selected, false);
      setTexture(t);
    } else if (canvas.current) paint(canvas.current, source, analysis, view, selected, true);
  }, [source, analysis, view, selected]);

  const pick = analysis?.candidates[selected];
  const angle = region === "hand" ? 12 : 22;

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)_360px]">
      {/* ── Input ── */}
      <aside className="space-y-4">
        <div className="panel p-4">
          <h1 className="text-lg font-semibold">Photo vein finder</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Maps the veins visible in a photograph of an arm or hand and ranks candidate puncture sites. The image is analysed in your browser and never uploaded.
          </p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]); }}
            className={`mt-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${drag ? "border-accent bg-accent/10" : "border-white/20 hover:border-accent/60"}`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent" aria-hidden>
              <path d="M12 16V4m0 0 4 4m-4-4L8 8M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="mt-2 text-sm font-medium">Upload or drop a photo</span>
            <span className="mt-0.5 text-[11px] text-slate-400">JPEG, PNG, HEIC · or take one with your camera</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Or try a practice image</p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                className="chip"
                onClick={() => {
                  const c = drawSample(s);
                  setRegion(s.region);
                  load(c, c.width, c.height);
                  setHeart(-1);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">What is in the photo?</p>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map(([id, label]) => (
              <button key={id} className="chip" data-on={region === id} onClick={() => setRegion(id)}>
                {label}
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Needle direction</p>
          <button className="chip" disabled={!analysis} onClick={() => analysis && setHeart(heart === 0 ? (analysis.axis.dx >= 0 ? -1 : 1) : heart === 1 ? -1 : 1)}>
            ⇄ Flip: the heart is the other way
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The needle always travels with venous flow, toward the heart. The direction is guessed from the taper of the limb — flip it if the arrows point toward the fingers.</p>
        </div>

        <div className="panel p-4 text-xs leading-relaxed text-slate-400">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">For the clearest map</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Fill the frame with the limb on a plain background</li>
            <li>Use even, diffuse light — no flash glare</li>
            <li>Apply a tourniquet and let the arm hang down first</li>
            <li>Near-infrared images work too</li>
          </ul>
        </div>
      </aside>

      {/* ── Image ── */}
      <section className="panel relative flex min-h-[420px] flex-col self-start overflow-hidden lg:sticky lg:top-[72px]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="flex gap-1">
            {VIEWS.map(([id, label]) => (
              <button key={id} disabled={!analysis} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-40 ${view === id ? "bg-accent text-ink-950" : "text-slate-300 hover:bg-white/5"}`}>
                {label}
              </button>
            ))}
          </div>
          {analysis && <span className="text-[11px] text-slate-500">{analysis.width}×{analysis.height} · {Math.round(analysis.ms)} ms · ≈ {(1 / analysis.mmPerPx).toFixed(1)} px/mm</span>}
        </div>
        <div className="relative grid min-h-[380px] flex-1 place-items-center bg-black/30 p-3">
          {!source && (
            <div className="max-w-sm text-center text-sm text-slate-400">
              <p className="text-base font-medium text-slate-200">No image yet</p>
              <p className="mt-1">Upload a photo of an inner elbow, forearm or the back of a hand, or load a practice image to see how the analysis works.</p>
            </div>
          )}
          {source && view !== "relief" && <canvas ref={canvas} className="max-h-[72vh] w-full rounded-lg object-contain" style={{ aspectRatio: `${source.width} / ${source.height}` }} />}
          {source && analysis && view === "relief" && texture && (
            <div className="h-[72vh] w-full overflow-hidden rounded-lg bg-gradient-to-b from-ink-800 to-ink-950">
              <Relief analysis={analysis} texture={texture} selected={selected} angle={angle} />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/60">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
            </div>
          )}
        </div>
        {view === "relief" && analysis && <p className="border-t border-white/10 px-3 py-2 text-[11px] text-slate-500">Relief reconstructed from the photo: the limb is raised by its distance from the outline and veins stand proud. Drag to orbit, scroll to zoom. The needle is posed at {angle}° on the selected site.</p>}
      </section>

      {/* ── Results ── */}
      <aside className="space-y-4">
        {!analysis ? (
          <div className="panel p-4 text-sm text-slate-400">Ranked puncture sites, measurements and image-quality checks appear here after analysis.</div>
        ) : (
          <>
            <div className="panel p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold">Candidate sites</h2>
                <span className={`text-xs font-semibold ${CONFIDENCE[analysis.confidence][1]}`}>{CONFIDENCE[analysis.confidence][0]}</span>
              </div>
              {!analysis.candidates.length && <p className="mt-2 text-sm text-slate-300">No vein segment was long, straight and distinct enough to recommend.</p>}
              <ul className="mt-3 space-y-2">
                {analysis.candidates.map((c, i) => (
                  <li key={c.rank}>
                    <button onClick={() => setSelected(i)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${i === selected ? "border-accent/70 bg-accent/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-ink-950" style={{ background: COLORS[i] }}>{c.rank}</span>
                        <span className="text-sm font-medium">{i === 0 ? "Best candidate" : `Alternative ${i}`}</span>
                        <span className="ml-auto text-sm font-bold">{c.score}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
                        <div><b className="block text-sm text-white">≈ {c.widthMm.toFixed(1)} mm</b>calibre</div>
                        <div><b className="block text-sm text-white">{Math.round(c.straightness * 100)}%</b>straight</div>
                        <div><b className="block text-sm text-white">≈ {Math.round(c.lengthMm)} mm</b>visible</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {pick && (
              <div className="panel p-4">
                <h3 className="text-sm font-semibold">Site {pick.rank} — how to approach it</h3>
                <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100">{pick.equipment}</p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {pick.reasons.map((r) => (
                    <li key={r} className="flex gap-2 text-emerald-200"><span>✓</span><span>{r}</span></li>
                  ))}
                  {pick.cautions.map((r) => (
                    <li key={r} className="flex gap-2 text-amber-200"><span>!</span><span>{r}</span></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">Enter at the numbered dot, bevel up, and advance along the white arrow in line with the vein. Stop at the first flash of blood.</p>
              </div>
            )}

            <div className="panel space-y-2.5 p-4">
              <h3 className="text-sm font-semibold">Image quality</h3>
              <Meter label="Vein signal" value={Math.min(1, analysis.quality.signal / 0.6)} />
              <Meter label="Sharpness" value={analysis.quality.sharpness} />
              <Meter label="Even lighting" value={analysis.quality.evenness} />
              <Meter label="Limb fills the frame" value={Math.min(1, analysis.quality.coverage / 0.55)} />
              {analysis.quality.notes.map((n) => (
                <p key={n} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">{n}</p>
              ))}
            </div>
          </>
        )}

        <div className="panel border-rose-400/30 p-4 text-xs leading-relaxed text-slate-300">
          <h3 className="mb-1.5 text-sm font-semibold text-rose-200">What a photo cannot tell you</h3>
          <ul className="list-disc space-y-1 pl-4">
            <li>Whether a dark line is a vein, a tendon, a shadow or a tattoo — <b>palpate: a vein is soft and bouncy</b></li>
            <li>Where arteries and nerves are — <b>feel for a pulse before you puncture</b></li>
            <li>Depth, valves, scarring or sclerosis</li>
            <li>Sizes are estimates scaled from a typical limb width</li>
          </ul>
          <p className="mt-2 text-slate-400">A training aid, not a medical device. It has not been clinically validated and must not be the basis for a puncture on a patient.</p>
        </div>
      </aside>
    </div>
  );
}
