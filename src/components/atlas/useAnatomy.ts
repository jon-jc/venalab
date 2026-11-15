import * as THREE from "three";
import { useEffect, useState } from "react";
import type { Reply, Request } from "@/lib/anatomy/build.worker";
import { unpack, type Body, type Built } from "@/lib/anatomy/geometry";
import { loadLimb, setGirth } from "@/lib/anatomy/skin";
import { structuresFor, type Pattern } from "@/lib/anatomy/structures";
import { useAtlas } from "./store";

const fail = (why: unknown) => useAtlas.getState().set({ failed: why instanceof Error ? why.message : String(why) });

export interface Anatomy {
  pattern: Pattern;
  body: Body;
  skin: THREE.BufferGeometry;
  nails: THREE.BufferGeometry;
  fat: THREE.BufferGeometry | null;
  fascia: THREE.BufferGeometry | null;
  built: Built[];
}

// One worker, and one copy of the meshes that depend only on the build of the arm.
let worker: Worker | null = null;
let requests = 0;
const base: { girth?: number; skin?: THREE.BufferGeometry; nails?: THREE.BufferGeometry; fat?: THREE.BufferGeometry; fascia?: THREE.BufferGeometry } = {};

/** Builds the limb in a background worker; returns null until the first mesh arrives. */
export function useAnatomy(pattern: Pattern, body: Body): Anatomy | null {
  const [anatomy, setAnatomy] = useState<Anatomy | null>(null);
  const { girth, veinDepth, calibre } = body;

  useEffect(() => {
    worker ??= new Worker(new URL("../../lib/anatomy/build.worker.ts", import.meta.url), { type: "module" });
    const w = worker;
    const id = ++requests;
    const wanted: Body = { girth, veinDepth, calibre };
    // The page needs the shape of the limb too, for palpation and the needle.
    const limb = loadLimb();
    let live = true;
    limb.catch(fail);
    const onError = (e: ErrorEvent) => fail(e.message || "The model could not be built.");
    const onMessage = async (e: MessageEvent<Reply>) => {
      const m = e.data;
      if (m.kind === "failed") return fail(m.message);
      try {
        await limb;
      } catch {
        return;
      }
      if (!live) return;
      if (m.kind === "shells") {
        if (m.girth !== base.girth) return;
        base.fat = unpack(m.fat);
        base.fascia = unpack(m.fascia);
        setAnatomy((a) => a && { ...a, fat: base.fat!, fascia: base.fascia! });
        return;
      }
      if (process.env.NODE_ENV !== "production") console.debug(`anatomy built in ${m.ms} ms`);
      if (m.skin && m.nails) {
        base.girth = m.girth;
        base.skin = unpack(m.skin);
        base.nails = unpack(m.nails);
        base.fat = base.fascia = undefined;
      }
      if (m.id !== id || !base.skin || !base.nails) return;
      // The page needs the same limb as the worker for palpation and the needle.
      setGirth(m.girth);
      base.skin.setAttribute("aVein", new THREE.BufferAttribute(m.vein, 1));
      base.skin.setAttribute("aVeinGrad", new THREE.BufferAttribute(m.veinGrad, 3));
      const defs = structuresFor(pattern);
      const built = m.structures.map((s): Built => ({ def: defs.find((d) => d.id === s.id)!, geometry: unpack(s.geometry), paths: s.paths, anchor: s.anchor }));
      setAnatomy({ pattern, body: wanted, skin: base.skin, nails: base.nails, fat: base.fat ?? null, fascia: base.fascia ?? null, built });
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, pattern, body: wanted } satisfies Request);
    return () => {
      live = false;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
  }, [pattern, girth, veinDepth, calibre]);

  return anatomy;
}
