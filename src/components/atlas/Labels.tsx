"use client";

import { LAYER_COLOR } from "@/lib/anatomy/structures";
import { effectiveLayers, labelEls, useAtlas } from "./store";

/** DOM overlay of structure names; positions are written each frame by the scene. */
export function Labels() {
  const built = useAtlas((s) => s.built);
  const selected = useAtlas((s) => s.selected);
  const on = useAtlas((s) => s.labels && s.mode === "explore" && !s.nir);
  const layers = useAtlas((s) => s.layers);
  const mode = useAtlas((s) => s.mode);
  const nir = useAtlas((s) => s.nir);
  const reveal = useAtlas((s) => s.sim.reveal);
  const eff = effectiveLayers({ mode, layers, nir, reveal });

  const shown = built.filter((b) => b.def.id === selected || (on && b.def.label && eff[b.def.layer] > 0.3));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {shown.map((b) => (
        <div
          key={b.def.id}
          ref={(el) => {
            if (el) labelEls.set(b.def.id, el);
            else labelEls.delete(b.def.id);
          }}
          className="label-pill absolute left-0 top-0"
          style={{ borderColor: b.def.color ?? LAYER_COLOR[b.def.layer], visibility: "hidden" }}
        >
          {b.def.name}
        </div>
      ))}
    </div>
  );
}
