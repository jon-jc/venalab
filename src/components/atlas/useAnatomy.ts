import * as THREE from "three";
import { useEffect, useState } from "react";
import type { Reply } from "@/lib/anatomy/build.worker";
import { unpack, type Built } from "@/lib/anatomy/geometry";
import { structuresFor, type Pattern } from "@/lib/anatomy/structures";

export interface Anatomy {
  pattern: Pattern;
  skin: THREE.BufferGeometry;
  nails: THREE.BufferGeometry;
  fat: THREE.BufferGeometry | null;
  fascia: THREE.BufferGeometry | null;
  built: Built[];
}

// One worker and one copy of the pattern-independent meshes for the lifetime of the page.
let worker: Worker | null = null;
const base: { skin?: THREE.BufferGeometry; nails?: THREE.BufferGeometry; fat?: THREE.BufferGeometry; fascia?: THREE.BufferGeometry } = {};

/** Builds the limb in a background worker; returns null until the first mesh arrives. */
export function useAnatomy(pattern: Pattern): Anatomy | null {
  const [anatomy, setAnatomy] = useState<Anatomy | null>(null);

  useEffect(() => {
    worker ??= new Worker(new URL("../../lib/anatomy/build.worker.ts", import.meta.url), { type: "module" });
    const w = worker;
    const onMessage = (e: MessageEvent<Reply>) => {
      const m = e.data;
      if (m.kind === "shells") {
        base.fat = unpack(m.fat);
        base.fascia = unpack(m.fascia);
        setAnatomy((a) => a && { ...a, fat: base.fat!, fascia: base.fascia! });
        return;
      }
      if (process.env.NODE_ENV !== "production") console.debug(`anatomy built in ${m.ms} ms`);
      if (m.skin) base.skin = unpack(m.skin);
      if (m.nails) base.nails = unpack(m.nails);
      if (m.pattern !== pattern || !base.skin || !base.nails) return;
      base.skin.setAttribute("aVein", new THREE.BufferAttribute(m.vein, 1));
      base.skin.setAttribute("aVeinGrad", new THREE.BufferAttribute(m.veinGrad, 3));
      const defs = structuresFor(pattern);
      const built = m.structures.map((s): Built => ({ def: defs.find((d) => d.id === s.id)!, geometry: unpack(s.geometry), paths: s.paths, anchor: s.anchor }));
      setAnatomy({ pattern, skin: base.skin, nails: base.nails, fat: base.fat ?? null, fascia: base.fascia ?? null, built });
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ pattern });
    return () => w.removeEventListener("message", onMessage);
  }, [pattern]);

  return anatomy;
}
