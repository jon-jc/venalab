"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ControlPanel, DemoCaption, InfoPanel, ModeTabs, SimPanel } from "@/components/atlas/Panels";
import { Labels } from "@/components/atlas/Labels";
import { useAtlas, type Mode } from "@/components/atlas/store";

const Scene = dynamic(() => import("@/components/atlas/Scene"), { ssr: false });

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
    <div className="relative h-[calc(100dvh-56px)] overflow-hidden" style={{ background: nir ? "#020806" : undefined }}>
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

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
        <div className="pointer-events-auto">
          <ModeTabs />
        </div>
      </div>

      <button className="chip absolute left-3 top-3 z-20 lg:hidden" data-on={controls} onClick={() => setControls(!controls)}>
        Controls
      </button>
      <div className={`absolute bottom-3 left-3 top-14 z-10 lg:top-3 ${controls ? "block" : "hidden"} lg:block`}>
        <ControlPanel />
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex max-h-[46%] items-end lg:top-3 lg:max-h-none lg:items-start">
        {mode === "explore" && <InfoPanel />}
        {mode === "sim" && <SimPanel />}
      </div>

      <DemoCaption />

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 text-[11px] text-slate-500 lg:block">
        Left arm, anatomical position · drag to rotate · scroll to zoom · right-drag to pan · educational model, not to scale for any individual
      </p>
    </div>
  );
}
