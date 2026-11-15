/** Evacuated tubes in the CLSI order of draw (PRE02, formerly GP41). Inversions are typical manufacturers' figures. */
export interface Tube {
  id: string;
  cap: string;
  name: string;
  additive: string;
  use: string;
  inversions: string;
  /** Why it sits where it does in the sequence. */
  why: string;
}

export const TUBES: Tube[] = [
  { id: "culture", cap: "#e9c531", name: "Blood cultures", additive: "Broth / SPS (yellow)", use: "Microbiology", inversions: "8–10", why: "Drawn first, straight after skin antisepsis, so nothing from another tube or stopper can contaminate a sterile sample." },
  { id: "citrate", cap: "#7cc4ee", name: "Light blue", additive: "Sodium citrate", use: "Coagulation: PT/INR, aPTT, D-dimer", inversions: "3–4", why: "Clotting tests are ruined by traces of clot activator, heparin or EDTA, so citrate comes before every other additive tube. It must be filled to the line (9:1 blood to citrate)." },
  { id: "serum", cap: "#d2423f", name: "Red / gold", additive: "Clot activator ± gel (SST)", use: "Serum chemistry, serology, hormones", inversions: "5", why: "Clot activator would shorten clotting times if carried into citrate, so serum tubes follow it — but come before anticoagulant tubes." },
  { id: "heparin", cap: "#45a868", name: "Green", additive: "Lithium or sodium heparin", use: "Plasma chemistry, stat electrolytes", inversions: "8–10", why: "Heparin carried into a serum tube would stop it clotting; EDTA carried into heparin would distort electrolytes — so heparin sits between them." },
  { id: "edta", cap: "#a57fd6", name: "Lavender", additive: "K₂EDTA", use: "Full blood count, HbA1c, blood bank (pink)", inversions: "8–10", why: "Potassium EDTA carried into earlier tubes falsely raises potassium and lowers calcium, magnesium and ALP, and prolongs clotting times." },
  { id: "fluoride", cap: "#9aa3ad", name: "Grey", additive: "Sodium fluoride / potassium oxalate", use: "Glucose, lactate", inversions: "8–10", why: "Fluoride inhibits enzymes and oxalate damages cells and adds potassium, so this tube is always last." },
];
