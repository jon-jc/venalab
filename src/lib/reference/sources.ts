/** The published standards and guidelines the teaching content follows. */
export type SourceId = "clsi-venous" | "clsi-order" | "clsi-capillary" | "who" | "who-capillary" | "cdc-injection" | "cdc-hands" | "osha";

export interface Source {
  id: SourceId;
  /** Short name used where a statement is cited. */
  short: string;
  org: string;
  title: string;
  edition: string;
  url: string;
  /** What VenaLab takes from it. */
  use: string;
}

export const SOURCES: Source[] = [
  {
    id: "clsi-venous",
    short: "CLSI PRE02",
    org: "Clinical and Laboratory Standards Institute",
    title: "PRE02 — Collection of Diagnostic Venous Blood Specimens",
    edition: "8th edition, 2025. Replaces GP41, 7th edition (2017).",
    url: "https://clsi.org/shop/standards/pre02/",
    use: "The order of draw; tourniquet placement and the one-minute limit; choice of vein; needle angle; the limit of two attempts; what to do when a draw goes wrong.",
  },
  {
    id: "clsi-order",
    short: "CLSI order of draw",
    org: "Clinical and Laboratory Standards Institute",
    title: "Order of Blood Draw Tubes and Additives",
    edition: "CLSI Insights. A free summary of the order of draw in the venous standard.",
    url: "https://clsi.org/about/blog/order-of-blood-draw-tubes-and-additives/",
    use: "The sequence of tubes used in the order-of-draw trainer and table.",
  },
  {
    id: "clsi-capillary",
    short: "CLSI GP42",
    org: "Clinical and Laboratory Standards Institute",
    title: "GP42 — Collection of Capillary Blood Specimens",
    edition: "7th edition, 2020.",
    url: "https://clsi.org/shop/standards/gp42/",
    use: "Fingerstick technique: site, warming, the first drop, pressure on the finger, and filling the EDTA tube first.",
  },
  {
    id: "who",
    short: "WHO 2010",
    org: "World Health Organization",
    title: "WHO guidelines on drawing blood: best practices in phlebotomy",
    edition: "2010.",
    url: "https://www.who.int/publications/i/item/9789241599221",
    use: "The steps of a venipuncture: hand hygiene and gloves, skin antisepsis with 70% alcohol, anchoring the vein, an angle of 30° or less, releasing the tourniquet before withdrawing, and safe disposal.",
  },
  {
    id: "who-capillary",
    short: "WHO capillary sampling",
    org: "World Health Organization",
    title: "Practical guidance on capillary sampling (finger and heel-prick)",
    edition: "Job aid to the 2010 guidelines.",
    url: "https://cdn.who.int/media/docs/default-source/integrated-health-services-(ihs)/injection-safety/job-aids/5card_capillary_web.pdf",
    use: "Which fingers to use and where on them; lancet depth by age (2.2 mm in an adult); wiping away the first drop; not squeezing; the order in which capillary samples are taken.",
  },
  {
    id: "cdc-injection",
    short: "CDC injection safety",
    org: "Centers for Disease Control and Prevention",
    title: "Preventing Unsafe Injection Practices",
    edition: "Injection Safety, 2024.",
    url: "https://www.cdc.gov/injection-safety/hcp/clinical-safety/index.html",
    use: "Needles and collection devices are sterile, single-use items: a new one for every patient, discarded after one use.",
  },
  {
    id: "cdc-hands",
    short: "CDC hand hygiene",
    org: "Centers for Disease Control and Prevention",
    title: "Clinical Safety: Hand Hygiene for Healthcare Workers",
    edition: "2024.",
    url: "https://www.cdc.gov/clean-hands/hcp/clinical-safety/index.html",
    use: "Cleaning the hands immediately before touching the patient and immediately after removing gloves.",
  },
  {
    id: "osha",
    short: "OSHA 1910.1030",
    org: "Occupational Safety and Health Administration (United States)",
    title: "Bloodborne Pathogens Standard, 29 CFR 1910.1030",
    edition: "Paragraphs (d)(2)(vii) and (d)(4)(iii)(A).",
    url: "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1030",
    use: "Used needles are not bent, recapped or removed, and go straight into a puncture-resistant sharps container.",
  },
];

export const source = (id: SourceId): Source => SOURCES.find((s) => s.id === id)!;
