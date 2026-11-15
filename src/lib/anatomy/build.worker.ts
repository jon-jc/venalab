/// <reference lib="webworker" />
import type { BufferGeometry } from "three";
import { buildNails, buildShell, buildStructures, pack, surfaceGradient, veinShade, type Packed, type Path } from "./geometry";
import type { Vec3 } from "./skin";
import type { Pattern } from "./structures";

/**
 * Meshing the limb at high resolution takes a couple of seconds, so it runs
 * here, off the main thread. The skin is meshed once; structures are rebuilt
 * whenever the venous pattern changes.
 */

export interface AnatomyReply {
  kind: "anatomy";
  pattern: Pattern;
  /** Sent with the first reply only. */
  skin: Packed | null;
  nails: Packed | null;
  /** Per-skin-vertex visibility of the vein beneath, and its surface gradient. */
  vein: Float32Array;
  veinGrad: Float32Array;
  structures: { id: string; geometry: Packed; paths: Path[]; anchor: Vec3 }[];
}
export interface ShellsReply {
  kind: "shells";
  fat: Packed;
  fascia: Packed;
}
export type Reply = AnatomyReply | ShellsReply;

let skin: BufferGeometry | null = null;
let sentBase = false;
const post = (m: Reply) => (self as unknown as Worker).postMessage(m);

self.addEventListener("message", (e: MessageEvent<{ pattern: Pattern }>) => {
  const { pattern } = e.data;
  skin ??= buildShell(0);
  const built = buildStructures(pattern);
  const vein = veinShade(skin, built);
  const first = !sentBase;
  sentBase = true;
  post({
    kind: "anatomy",
    pattern,
    skin: first ? pack(skin) : null,
    nails: first ? pack(buildNails()) : null,
    vein,
    veinGrad: surfaceGradient(skin, vein),
    structures: built.map((b) => ({ id: b.def.id, geometry: pack(b.geometry), paths: b.paths, anchor: b.anchor })),
  });
  if (first) post({ kind: "shells", fat: pack(buildShell(0.035)), fascia: pack(buildShell(0.6)) });
});
