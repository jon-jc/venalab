/// <reference lib="webworker" />
import { BufferAttribute, type BufferGeometry } from "three";
import { buildNails, buildShell, buildStructures, pack, skinAO, surfaceGradient, veinShade, type Body, type Packed, type Path } from "./geometry";
import { setGirth, type Vec3 } from "./skin";
import type { Pattern } from "./structures";

/**
 * Meshing the limb at high resolution takes a few seconds, so it runs here,
 * off the main thread. The skin is re-meshed only when the build of the arm
 * changes; structures are rebuilt for every new patient or vein pattern.
 */

export interface Request {
  id: number;
  pattern: Pattern;
  body: Body;
}

export interface AnatomyReply {
  kind: "anatomy";
  id: number;
  girth: number;
  /** Time the build took, for diagnostics. */
  ms: number;
  /** Sent whenever the skin had to be re-meshed. */
  skin: Packed | null;
  nails: Packed | null;
  /** Per-skin-vertex visibility of the vein beneath, and its surface gradient. */
  vein: Float32Array;
  veinGrad: Float32Array;
  structures: { id: string; geometry: Packed; paths: Path[]; anchor: Vec3 }[];
}
export interface ShellsReply {
  kind: "shells";
  girth: number;
  fat: Packed;
  fascia: Packed;
}
export type Reply = AnatomyReply | ShellsReply;

let skin: BufferGeometry | null = null;
let skinGirth = NaN;
let sentGirth = NaN;
const post = (m: Reply) => (self as unknown as Worker).postMessage(m);

self.addEventListener("message", (e: MessageEvent<Request>) => {
  const { id, pattern, body } = e.data;
  const started = performance.now();
  setGirth(body.girth);
  if (!skin || skinGirth !== body.girth) {
    skin = buildShell(0);
    skin.setAttribute("aAO", new BufferAttribute(skinAO(skin), 1));
    skinGirth = body.girth;
  }
  const built = buildStructures(pattern, body);
  const vein = veinShade(skin, built);
  const fresh = sentGirth !== body.girth;
  sentGirth = body.girth;
  post({
    kind: "anatomy",
    id,
    girth: body.girth,
    ms: Math.round(performance.now() - started),
    skin: fresh ? pack(skin) : null,
    nails: fresh ? pack(buildNails()) : null,
    vein,
    veinGrad: surfaceGradient(skin, vein),
    structures: built.map((b) => ({ id: b.def.id, geometry: pack(b.geometry), paths: b.paths, anchor: b.anchor })),
  });
  if (fresh) post({ kind: "shells", girth: body.girth, fat: pack(buildShell(0.035)), fascia: pack(buildShell(0.6)) });
});
