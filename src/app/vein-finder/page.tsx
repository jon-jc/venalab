import type { Metadata } from "next";
import VeinFinder from "@/components/veinfinder/VeinFinder";

export const metadata: Metadata = {
  title: "Photo vein finder — VenaLab",
  description: "Map visible veins in a photograph of an arm or hand and rank candidate venipuncture sites, entirely on your device.",
};

export default function VeinFinderPage() {
  return <VeinFinder />;
}
