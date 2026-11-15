"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ControlPanel, DemoCaption, InfoPanel, ModeTabs } from "@/components/atlas/Panels";
import { PracticePanel } from "@/components/atlas/PracticePanel";
import { Labels } from "@/components/atlas/Labels";
import { useAtlas, type Mode } from "@/components/atlas/store";

const Scene = dynamic(() => import("@/components/atlas/Scene"), { ssr: false });

/**
 * On a wide screen the model fills the page and the panels float over it. On a
 * phone the model has the top of the screen to itself and the panel scrolls
 * beneath it, so neither hides the other.
 */
export default function AtlasPage() {
  const mode = useAtlas((s) => s.mode);
  const nir = useAtlas((s) => s.nir);
  const ready = useAtlas((s) => s.built.length > 0);
  const [controls, setControls] = useState(false);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "sim" || m === "explore") useAtlas.getState().set({ mode: m as Mode });
  }, []);

  return (
    <div className="relative flex h-[calc(100dvh-80px)] flex-col overflow-hidden lg:block" style={{ background: nir ? "#020806" : undefined }}>
      <div className="relative h-[46%] shrink-0 lg:absolute lg:inset-0 lg:h-auto">
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

        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-end px-2 lg:top-3 lg:justify-center">
          <div className="pointer-events-auto">
            <ModeTabs />
          </div>
        </div>

        <button className="chip absolute left-2 top-3 z-20 lg:hidden" data-on={controls} onClick={() => setControls(!controls)}>
          Views
        </button>
        <div className={`absolute bottom-2 left-2 top-12 z-10 lg:bottom-3 lg:left-3 lg:top-3 ${controls ? "block" : "hidden"} lg:block`}>
          <ControlPanel />
        </div>
      </div>

      <div className="z-10 min-h-0 flex-1 overflow-y-auto border-t border-white/10 p-2 lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:flex lg:items-start lg:overflow-visible lg:border-0 lg:p-0">
        {mode === "explore" && <InfoPanel />}
        {mode === "sim" && <PracticePanel />}
      </div>

      <DemoCaption />

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 text-[11px] text-slate-500 lg:block">
        Left arm, anatomical position · drag to rotate · scroll to zoom · right-drag to pan · educational model, not to scale for any individual
      </p>
    </div>
  );
}
