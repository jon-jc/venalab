"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CameraStrip, ControlPanel, DemoCaption, ExploreControls, InfoPanel, ModeTabs } from "@/components/atlas/Panels";
import { PracticePanel } from "@/components/atlas/PracticePanel";
import { playDemo } from "@/components/atlas/demo";
import { Labels } from "@/components/atlas/Labels";
import { useAtlas, type Mode } from "@/components/atlas/store";

const Scene = dynamic(() => import("@/components/atlas/Scene"), { ssr: false });

/**
 * On a wide screen the model fills the page and the panels float over it. On a
 * phone the model and the panel each have their own part of the screen, so
 * neither hides the other: the model above the panel when the phone is held
 * upright, beside it when it is turned on its side. The camera views run along
 * the foot of the model, and in Explore the panel has a second tab for the
 * layers and display controls.
 */
export default function AtlasPage() {
  const mode = useAtlas((s) => s.mode);
  const nir = useAtlas((s) => s.nir);
  const ready = useAtlas((s) => s.built.length > 0);
  const demo = useAtlas((s) => !!s.demo);
  const selected = useAtlas((s) => s.selected);
  const [tab, setTab] = useState<"structures" | "display">("structures");
  // Tapping a structure on the model brings its description forward.
  useEffect(() => {
    if (selected) setTab("structures");
  }, [selected]);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "sim" || m === "explore") useAtlas.getState().set({ mode: m as Mode });
  }, []);

  // /atlas?demo plays the demonstration as soon as the arm is built, so a link can show it without a tap.
  useEffect(() => {
    if (!ready || !new URLSearchParams(window.location.search).has("demo")) return;
    const id = setTimeout(playDemo, 600);
    return () => clearTimeout(id);
  }, [ready]);

  return (
    <div className="relative flex h-[calc(100dvh-80px)] flex-col overflow-hidden max-lg:landscape:flex-row lg:block" style={{ background: nir ? "#020806" : undefined }}>
      <div className={`relative shrink-0 lg:absolute lg:inset-0 lg:h-auto lg:w-auto max-lg:landscape:h-full ${demo ? "h-[68%] max-lg:landscape:w-full" : "h-[46%] max-lg:landscape:w-[56%]"}`}>
        <div className="absolute inset-0">
          <Scene />
        </div>
        <Labels />

        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-ink-950">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
              <p className="mt-4 text-sm text-slate-400">Building anatomy…</p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-2 lg:top-3">
          <div className="pointer-events-auto">
            <ModeTabs />
          </div>
        </div>

        {!demo && (
          <div className="absolute inset-x-0 bottom-1.5 z-10 lg:hidden">
            <CameraStrip />
          </div>
        )}
        <div className="absolute bottom-3 left-3 top-3 z-10 hidden lg:block">
          <ControlPanel />
        </div>
      </div>

      <div
        className={`z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-lg:landscape:border-l max-lg:landscape:border-t-0 ${demo ? "hidden lg:flex" : ""} lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:flex lg:items-start lg:overflow-visible lg:border-0 lg:p-0`}
      >
        {mode === "explore" && (
          <>
            <div className="mb-2 flex gap-1 rounded-xl bg-white/5 p-1 lg:hidden" role="tablist">
              {(
                [
                  ["structures", "Structures"],
                  ["display", "Layers and display"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === id ? "bg-accent text-ink-950" : "text-slate-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={`lg:contents ${tab === "structures" ? "" : "max-lg:hidden"}`}>
              <InfoPanel />
            </div>
            <div className={`panel lg:hidden ${tab === "display" ? "" : "hidden"}`}>
              <ExploreControls />
            </div>
          </>
        )}
        {mode === "sim" && <PracticePanel />}
      </div>

      <DemoCaption />

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 text-[11px] text-slate-500 lg:block">
        Left arm, anatomical position · drag to rotate · scroll to zoom · right-drag to pan · educational model, not to scale for any individual
      </p>
    </div>
  );
}
