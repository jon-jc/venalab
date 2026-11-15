# VenaLab

An interactive trainer for venous access in the arm and hand. It combines a layered, animated 3D anatomical model, a needle-placement simulator with an anatomical debrief, and an on-device vein mapper for photographs.

> **Educational use only.** VenaLab is not a medical device, has not been clinically validated, and must not be used to guide the care of real patients. It does not replace supervised practice, institutional policy, palpation or clinical judgement.

## What is in it

### Practice — `/atlas`
A venipuncture simulator on a living arm.

- **Palpate** with the pointer. The skin dimples under your fingertip; veins feel bouncy, arteries throb in time with the pulse, tendons feel like cords.
- **Apply the tourniquet** and watch the veins fill and rise under the skin.
- **Mark a site**, set the angle, direction, depth and needle gauge, then advance. The skin tents until the needle punctures.
- **See what happened.** Blood return is animated — a steady venous fill, a fast pulsing arterial one, or a brief flash and a spreading haematoma when the vein is transfixed — followed by a scored debrief that names every structure the needle met or narrowly missed.
- **Guided demonstration** of a textbook venipuncture, narrated step by step.
- **New patient** randomises the vein pattern and skin tone. A running success rate tracks your attempts.

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
Order-of-draw trainer, the procedure step by step, site-selection rules, and how to recognise and respond to complications.

## How the model is built

Nothing is loaded from model or texture files; the limb is generated from anatomical parameters when the page opens.

- **Skin** is a signed distance field in centimetres: a lofted super-elliptical tube for the arm and palm, blended with round cones for the digits and with surface landmarks (olecranon, epicondyles, ulnar head, radial styloid, knuckles, muscle bellies). Surface nets turn it into a mesh on a 1.2 mm grid. Subcutaneous tissue and deep fascia are deeper iso-surfaces of the same field.
- **Vessels and nerves** are defined by station along the limb, angle around it and depth beneath the skin, then re-projected onto their tissue plane so they stay at a realistic depth as the surface curves.
- **Bones** are smooth unions of implicit primitives, so shafts flare into their ends and processes blend into the bone.
- **Surface detail** is procedural shading: pores, creases and knuckle wrinkles on skin; fibre grain on muscle; lobules on fat; collagen fibres on fascia.
- **Simulation** tests the needle path against the centre-lines and radii of every vein, artery and nerve.

Meshing runs in a Web Worker. The coordinate system is `x` proximal→distal (elbow crease at 0), `y` ulnar→radial, `z` posterior→anterior; the model is a left arm in the anatomical position.

Dimensions and relationships follow standard anatomical descriptions and common teaching on venipuncture (CLSI GP41, WHO guidelines on drawing blood). It is a generic adult limb: real anatomy varies, and some calibres are slightly enlarged for legibility.

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
  app/                    routes: landing, atlas, vein-finder, reference
  components/
    atlas/                3D scene, materials, panels, guided demo and tour
    veinfinder/           upload, analysis views, 3D relief
    reference/            order-of-draw trainer
  lib/
    anatomy/              skin field, structures, geometry, needle simulation, build worker
    veinfinder/           image-analysis pipeline, practice images
    reference/            tube data
```

## License

MIT
