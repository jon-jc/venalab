import type { BufferGeometry, Mesh } from "three";
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";

/**
 * The instruments — needle, hub, holder, tube, wipe, gauze, lancet,
 * microcollection tube and the collector's gloved hand — are modelled in Blender and
 * shipped as one file. Only their shapes are used; materials are set in code so
 * that colour, transparency and blood can change as the procedure goes on.
 *
 * Every long instrument lies along +Y with its working end at the origin. The hand
 * rests its index fingertip at the origin of a surface whose normal is +Y, and
 * reaches back along +Z toward the collector.
 */
const URL = "/models/kit.glb";

export type KitPart =
  | "Cannula" | "Hub" | "Sleeve" | "Holder" | "TubeGlass" | "Stopper" | "StopperRubber" | "Label"
  | "Wipe" | "Gauze" | "LancetBody" | "LancetGrip" | "LancetNozzle" | "LancetButton"
  | "MicroTube" | "MicroCap" | "Hand" | "HandCuff";

export function useKit(): Record<KitPart, BufferGeometry> {
  const { nodes } = useGLTF(URL);
  return useMemo(() => {
    const out: Record<string, BufferGeometry> = {};
    for (const [name, node] of Object.entries(nodes)) if ((node as Mesh).isMesh) out[name] = (node as Mesh).geometry;
    return out as Record<KitPart, BufferGeometry>;
  }, [nodes]);
}

useGLTF.preload(URL);
