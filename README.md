# VenaLab

An interactive trainer for venous access in the arm and hand. It combines a layered, animated 3D anatomical model, a needle-placement simulator with an anatomical debrief, and an on-device vein mapper for photographs.

> **Educational use only.** VenaLab is not a medical device, has not been clinically validated, and must not be used to guide the care of real patients. It does not replace supervised practice, institutional policy, palpation or clinical judgement.

## What is in it

### Practice — `/atlas`
The site opens here. Two procedures can be practised on the same living arm.

**Venipuncture** runs as a sequence of stages, each with its own tool in the hand. The panel shows the current step; finished steps collapse to a tick and a one-line summary.

1. **Tourniquet.** Apply it and a clock starts. The veins fill and rise under the skin; past a minute you lose marks.
2. **Find the vein.** A gloved fingertip follows the pointer over the arm and presses into the skin. What it feels is written beside it: veins are soft and bouncy (deep ones only with firm pressure), arteries throb with the pulse, tendons are hard cords. Click to mark the puncture site.
3. **Cleanse.** You hold an alcohol wipe. Rub it back and forth over the ringed site until it is clean, then let the wet sheen dry.
4. **Needle.** Drag the holder to tilt and aim the needle about the site; drag the end of the tube, scroll, or use the arrow keys to push it in and draw it back. A readout beside the hub shows the angle and depth. Anchor the vein first if it is likely to roll. Blood flashes in the hub the moment the tip enters a vessel; the tube slides home and fills — steadily from a vein, in pulses from an artery. Go through the vein and the flash stops and a haematoma spreads.
5. **Debrief.** Every attempt is scored on what the needle met or narrowly missed and on the procedure around it: cleansing, tourniquet time, anchoring, needle choice, and releasing the tourniquet before withdrawing.

**Patients and difficulty.** Four levels, from Beginner to Expert, draw from nine kinds of arm: athletic, average, an M-shaped vein pattern, deep skin tone, higher body weight, dehydration, a slender older adult, obesity, and a frail elderly patient. The arm is re-modelled for each one — more tissue, deeper or smaller veins, veins that show less or roll more. Higher levels take away the X-ray, the measurements and the hints, and mark every step.

A **guided demonstration** plays a textbook venipuncture, narrated step by step.

**Fingerstick (capillary puncture)** follows the same pattern: warm the hand, choose the site, cleanse it with the wipe, set and fire the lancet, collect.
- The finger under the pointer is named as you move, and at the easier levels the recommended places on the pads of the middle and ring fingers are marked
- Choose the lancet depth and the direction of the blade, wipe away the first drop, and collect with the right pressure into the right tube first
- The debrief explains each choice: which fingers to use, why the side and the tip are avoided, why the puncture must not go beyond 2.4 mm, and why capillary tubes are filled in the reverse of the venous order

### Explore anatomy — `/atlas?mode=explore`
- Eight tissue layers from skin to bone, each with its own opacity, plus dissection presets that peel away smoothly
- Both common antecubital patterns: H-shaped (median cubital) and M-shaped (median, median cephalic, median basilic)
- Dorsal venous network of the hand with paired dorsal digital veins, deep brachial veins and the perforating vein, valves on the main trunks
- The structures that make a draw dangerous: brachial, radial and ulnar arteries; median, ulnar and radial nerves; the lateral and medial antebrachial cutaneous nerves; the superficial radial nerve
- Muscles with fibre grain and tendons, the bicipital aponeurosis, extensor and snuffbox tendons, and the skeleton
- Click any structure for its anatomy, bedside relevance and site-selection rating
- Blood-flow view, simulated vein illuminator, four skin tones, sliding cross-section, and a narrated anatomy tour

### Photo vein finder — `/vein-finder`
Upload a photograph of an inner elbow, forearm or back of a hand. The image is analysed in the browser and never uploaded.

1. Segment the limb by skin chroma (or by brightness for near-infrared images)
2. Build a channel in which veins are dark — slightly darker and distinctly less red than skin
3. Flatten the lighting and normalise local contrast
4. Multi-scale Hessian ridge filter (Frangi vesselness)
5. Hysteresis threshold, thinning and tracing into branches
6. Score each branch on calibre, straightness, contrast, length, alignment with the limb and distance from its edge

It returns up to five ranked sites with entry point, needle direction, estimated calibre, reasons, cautions and suggested equipment; image-quality checks; and a 3D relief of the photo with the needle posed on the chosen site.

A photograph cannot show arteries, nerves, depth or valves, and cannot tell a vein from a tendon or a shadow. Measurements are scaled from a typical limb width and are estimates.

### Bedside reference — `/reference`
Order-of-draw trainer, the procedure step by step, site-selection rules, and how to recognise and respond to complications. Each section names the standard it follows, and the page ends with the full list of sources.

## Sources

The teaching content is written from published standards and guidelines, and the app cites them where it uses them: beside each step in Practice, and on the reference page.

| Used for | Source |
| --- | --- |
| Order of draw, tourniquet time, choice of vein, needle angle | CLSI PRE02, *Collection of Diagnostic Venous Blood Specimens*, 8th ed., 2025 (replaces GP41) |
| Fingerstick technique | CLSI GP42, *Collection of Capillary Blood Specimens*, 7th ed., 2020 |
| Steps of a venipuncture, skin antisepsis, lancet depth, capillary collection | *WHO guidelines on drawing blood: best practices in phlebotomy*, 2010, and its job aid on capillary sampling |
| Single use of needles and collection devices | CDC, *Preventing Unsafe Injection Practices* |
| Hand hygiene | CDC, *Clinical Safety: Hand Hygiene for Healthcare Workers* |
| No recapping, immediate sharps disposal | OSHA Bloodborne Pathogens Standard, 29 CFR 1910.1030 |

The CLSI standards are sold rather than free to read; figures attributed to them are those taught from them, and should be checked against the current edition. Where sources differ, the stricter figure is used. VenaLab is not reviewed or endorsed by any of these organisations, and its content has not been reviewed by a clinician.

## Data and privacy

- **Every patient is synthetic.** The nine patients are invented descriptions of kinds of arm, written for teaching. None is, or is derived from, a real person or a real record, and the app says so beside each one.
- **No patient data is used anywhere.** The arm is a generic model built from a CC0 body mesh and anatomical parameters. The practice images in the vein finder are drawn by code.
- **Nothing is collected.** There are no accounts, no analytics and no uploads. A photo given to the vein finder is analysed in the browser tab and never leaves the device. Use your own arm or a consenting volunteer's, not a patient's.
- **It is an educational tool, not medical advice.** That is stated on every page.

## How the model is built

The surface of the arm and hand is taken from a MakeHuman body (CC0), posed in the anatomical position; everything beneath it is generated from anatomical parameters when the page opens. No textures are used. The instruments — needle, hub, holder, evacuated tube, alcohol wipe, gauze, safety lancet, microcollection tube and the gloved fingertip — are modelled in Blender and shipped as one small GLB file (`public/models/kit.glb`).

- **Skin** is a signed distance field in centimetres, sampled from the modelled arm on a 2 mm grid and shipped as one compressed file (`public/models/limb.bin.gz`). The surface anatomy a phlebotomist looks for is raised on it, each feature placed from the skin itself: the wrist flexor tendons, the biceps tendon and the hollows either side of it, the olecranon, medial epicondyle, ulnar head and radial styloid, and the knuckles with their extensor tendons. Surface nets turn it into a mesh on a 1.1 mm grid. Subcutaneous tissue and deep fascia are deeper iso-surfaces of the same field, and a heavier or leaner patient is the same arm with its cross-sections scaled; the surface anatomy fades under more soft tissue and sharpens on a lean arm.
- **Vessels and nerves** are defined by station along the limb, angle around it and depth beneath the skin, then re-projected onto their tissue plane so they stay at a realistic depth as the surface curves. The layout is drawn on a reference limb of measured cross-sections and carried onto the modelled arm section by section, so it does not depend on the exact shape of the surface; structures of the fingers follow the joints of the modelled hand.
- **Bones** are smooth unions of implicit primitives, so shafts flare into their ends and processes blend into the bone.
- **Surface detail** is procedural shading: pores, creases and knuckle wrinkles on skin; fibre grain on muscle; lobules on fat; collagen fibres on fascia.
- **Simulation** tests the needle path against the centre-lines and radii of every vein, artery and nerve.

Meshing runs in a Web Worker. The coordinate system is `x` proximal→distal (elbow crease at 0), `y` ulnar→radial, `z` posterior→anterior; the model is a left arm in the anatomical position.

Dimensions and relationships follow standard anatomical descriptions and common teaching on venipuncture (see Sources). It is a generic adult limb: real anatomy varies, and some calibres are slightly enlarged for legibility.

## Running it

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm run build   # production build
npm run start   # serve the production build
npm run typecheck
```

## Stack

Next.js (App Router) · React · TypeScript · three.js with React Three Fiber and drei · Zustand · Tailwind CSS

## Project layout

```
src/
  app/                    routes: atlas (the home page redirects here), vein-finder, reference
  components/
    atlas/                3D scene, materials, tools and instruments, panels, guided demo and tour
    veinfinder/           upload, analysis views, 3D relief
    reference/            order-of-draw trainer
  lib/
    anatomy/              skin field, structures, geometry, patients, needle and capillary simulation, build worker
    veinfinder/           image-analysis pipeline, practice images
    reference/            tube data
```

## License

MIT
