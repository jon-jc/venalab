/**
 * Vein mapping from an ordinary photograph, entirely on-device.
 *
 *   1. Segment the limb (skin chroma, largest component, holes filled).
 *   2. Build a channel in which veins are dark: they are a little darker and
 *      noticeably less red than the skin around them.
 *   3. Flatten the lighting and normalise local contrast.
 *   4. Run a multi-scale Hessian ridge filter (Frangi vesselness) tuned to
 *      tubular dark structures of plausible vein calibre.
 *   5. Threshold with hysteresis, thin to centre-lines and trace segments.
 *   6. Score each segment on calibre, straightness, contrast, length,
 *      alignment with the limb and distance from its edge.
 *
 * It can only see what the camera sees: it does not detect arteries, nerves,
 * valves or how a vein feels. It is a study aid, not a clinical instrument.
 */

export type Region = "antecubital" | "forearm" | "hand";

/** Typical limb width (mm) across the photographed region, used to estimate scale. */
const LIMB_WIDTH_MM: Record<Region, number> = { antecubital: 90, forearm: 75, hand: 85 };

export interface Candidate {
  rank: number;
  /** Centre-line in image pixels. */
  points: [number, number][];
  /** Suggested puncture point and unit direction of needle travel (toward the heart). */
  target: [number, number];
  direction: [number, number];
  lengthMm: number;
  widthMm: number;
  straightness: number;
  contrast: number;
  alignment: number;
  score: number;
  reasons: string[];
  cautions: string[];
  equipment: string;
}

export interface Analysis {
  width: number;
  height: number;
  mask: Uint8Array;
  /** Distance (px) of each limb pixel from the limb outline. */
  inset: Float32Array;
  /** Lighting-flattened vein channel, roughly −3..3 (veins negative). */
  enhanced: Float32Array;
  /** Vesselness, 0..1. */
  vessel: Float32Array;
  candidates: Candidate[];
  axis: { cx: number; cy: number; dx: number; dy: number };
  limbWidthPx: number;
  mmPerPx: number;
  quality: { coverage: number; sharpness: number; evenness: number; signal: number; grey: boolean; notes: string[] };
  confidence: "high" | "moderate" | "low" | "none";
  ms: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        acc += src[row + (xx < 0 ? 0 : xx >= w ? w - 1 : xx)] * k[i + r];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        acc += tmp[(yy < 0 ? 0 : yy >= h ? h - 1 : yy) * w + x] * k[i + r];
      }
      out[y * w + x] = acc;
    }
  return out;
}

/** Wide blur done at quarter resolution, which is all a background estimate needs. */
function wideBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const f = 4;
  const w2 = Math.ceil(w / f);
  const h2 = Math.ceil(h / f);
  const small = new Float32Array(w2 * h2);
  const count = new Float32Array(w2 * h2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const j = Math.floor(y / f) * w2 + Math.floor(x / f);
      small[j] += src[y * w + x];
      count[j]++;
    }
  for (let j = 0; j < small.length; j++) small[j] /= count[j] || 1;
  const blurred = gaussian(small, w2, h2, sigma / f);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max((y + 0.5) / f - 0.5, 0), h2 - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, h2 - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max((x + 0.5) / f - 0.5, 0), w2 - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, w2 - 1);
      const tx = fx - x0;
      out[y * w + x] =
        (blurred[y0 * w2 + x0] * (1 - tx) + blurred[y0 * w2 + x1] * tx) * (1 - ty) +
        (blurred[y1 * w2 + x0] * (1 - tx) + blurred[y1 * w2 + x1] * tx) * ty;
    }
  }
  return out;
}

/** Keep the largest 4-connected region of a binary image and fill the holes inside it. */
function largestRegion(bin: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let s = 0; s < bin.length; s++) {
    if (!bin[s] || label[s]) continue;
    next++;
    let top = 0;
    let size = 0;
    stack[top++] = s;
    label[s] = next;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      if (x > 0 && bin[p - 1] && !label[p - 1]) { label[p - 1] = next; stack[top++] = p - 1; }
      if (x < w - 1 && bin[p + 1] && !label[p + 1]) { label[p + 1] = next; stack[top++] = p + 1; }
      if (p >= w && bin[p - w] && !label[p - w]) { label[p - w] = next; stack[top++] = p - w; }
      if (p < bin.length - w && bin[p + w] && !label[p + w]) { label[p + w] = next; stack[top++] = p + w; }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  const out = new Uint8Array(w * h);
  if (!best) return out;
  // Flood the background in from the border; whatever it cannot reach is inside the limb.
  const outside = new Uint8Array(w * h);
  let top = 0;
  const push = (p: number) => {
    if (!outside[p] && label[p] !== best) { outside[p] = 1; stack[top++] = p; }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < bin.length - w) push(p + w);
  }
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Chamfer distance (px) from each foreground pixel to the nearest background pixel. */
function distanceInside(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h);
  const BIG = 1e6;
  const D = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? BIG : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + D);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + D);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + D);
        if (x > 0) v = Math.min(v, d[i + w - 1] + D);
      }
      d[i] = v;
    }
  return d;
}

/** Zhang–Suen thinning: reduce a binary shape to one-pixel-wide centre-lines, in place. */
function thin(bin: Uint8Array, w: number, h: number) {
  const kill: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      kill.length = 0;
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!bin[i]) continue;
          const p2 = bin[i - w], p3 = bin[i - w + 1], p4 = bin[i + 1], p5 = bin[i + w + 1];
          const p6 = bin[i + w], p7 = bin[i + w - 1], p8 = bin[i - 1], p9 = bin[i - w - 1];
          const n = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (n < 2 || n > 6) continue;
          const t =
            (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (t !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) kill.push(i);
        }
      for (const i of kill) bin[i] = 0;
      if (kill.length) changed = true;
    }
  }
}

const N8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];

/** Walk the skeleton from every end-point and junction, returning each branch as an ordered pixel path. */
function trace(skel: Uint8Array, w: number, h: number): number[][] {
  const degree = new Uint8Array(w * h);
  const neighbours = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    const out: number[] = [];
    for (let k = 0; k < 16; k += 2) {
      const xx = x + N8[k];
      const yy = y + N8[k + 1];
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && skel[yy * w + xx]) out.push(yy * w + xx);
    }
    return out;
  };
  for (let i = 0; i < skel.length; i++) if (skel[i]) degree[i] = neighbours(i).length;
  const used = new Uint8Array(w * h);
  const paths: number[][] = [];
  for (let s = 0; s < skel.length; s++) {
    if (!skel[s] || degree[s] === 2) continue;
    for (const first of neighbours(s)) {
      if (used[first] && degree[first] === 2) continue;
      const path = [s];
      let prev = s;
      let cur = first;
      while (true) {
        path.push(cur);
        if (degree[cur] !== 2) break;
        used[cur] = 1;
        const nb = neighbours(cur);
        const nxt = nb[0] === prev ? nb[1] : nb[0];
        if (nxt === undefined) break;
        prev = cur;
        cur = nxt;
      }
      if (path.length > 2) paths.push(path);
    }
  }
  // A branch between two nodes is found from both ends; keep one copy.
  const seen = new Set<string>();
  return paths.filter((p) => {
    const a = p[0];
    const b = p[p.length - 1];
    const key = `${Math.min(a, b)}-${Math.max(a, b)}-${p.length}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Width (px) of a dark vein at (x, y), measured across it along the unit normal (nx, ny):
 * the full width at half depth of the valley in the enhanced channel.
 */
function valleyWidth(enh: Float32Array, w: number, h: number, x: number, y: number, nx: number, ny: number, reach: number): number | null {
  const step = 0.5;
  const vals: number[] = [];
  for (let t = -reach; t <= reach; t += step) {
    const px = Math.round(x + nx * t), py = Math.round(y + ny * t);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;
    vals.push(enh[py * w + px]);
  }
  const mid = (vals.length - 1) / 2;
  let c = Math.round(mid);
  for (let i = Math.round(mid * 0.7); i <= Math.round(mid * 1.3); i++) if (vals[i] < vals[c]) c = i;
  const edge = Math.max(2, Math.round(vals.length * 0.12));
  let base = 0;
  for (let i = 0; i < edge; i++) base += vals[i] + vals[vals.length - 1 - i];
  base /= 2 * edge;
  const depth = base - vals[c];
  if (depth < 0.35) return null;
  const half = base - depth / 2;
  let l = c, r = c;
  while (l > 0 && vals[l] < half) l--;
  while (r < vals.length - 1 && vals[r] < half) r++;
  if (l === 0 || r === vals.length - 1) return null;
  return (r - l) * step;
}

function percentile(values: Float32Array | number[], q: number): number {
  const a = Array.from(values).sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
}

export function analyse(img: ImageData, region: Region, towardHeart: 1 | -1 | 0 = 0): Analysis {
  const t0 = performance.now();
  const { width: w, height: h, data } = img;
  const n = w * h;
  const notes: string[] = [];

  // 1 ─ colour channels and a first skin estimate
  const lum = new Float32Array(n);
  const vein = new Float32Array(n);
  const skin = new Float32Array(n);
  let chroma = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const red = (r - (g + b) / 2) / 255;
    lum[i] = y / 255;
    vein[i] = 0.5 * lum[i] + red;
    chroma += Math.abs(red);
    skin[i] = cr > 133 && cr < 182 && cb > 72 && cb < 136 && y > 35 ? 1 : 0;
  }
  const grey = chroma / n < 0.02;

  let mask: Uint8Array;
  if (grey) {
    // Near-infrared and other monochrome images: split limb from background by brightness (Otsu).
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[Math.min(255, Math.floor(lum[i] * 255))]++;
    let total = 0;
    for (let i = 0; i < 256; i++) total += i * hist[i];
    let wB = 0, sB = 0, bestVar = 0, thr = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      sB += i * hist[i];
      const wF = n - wB;
      if (!wB || !wF) continue;
      const between = wB * wF * (sB / wB - (total - sB) / wF) ** 2;
      if (between > bestVar) { bestVar = between; thr = i; }
    }
    const bright = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) if (lum[i] * 255 > thr) { bright[i] = 1; count++; }
    mask = count / n > 0.12 && count / n < 0.92 ? largestRegion(bright, w, h) : new Uint8Array(n).fill(1);
    notes.push("Monochrome image detected — treated as near-infrared, where veins appear dark.");
  } else {
    const soft = gaussian(skin, w, h, 3);
    const bin = new Uint8Array(n);
    for (let i = 0; i < n; i++) bin[i] = soft[i] > 0.5 ? 1 : 0;
    mask = largestRegion(bin, w, h);
  }
  let area = 0;
  for (let i = 0; i < n; i++) area += mask[i];
  if (area / n < 0.08) {
    mask = new Uint8Array(n).fill(1);
    area = n;
    notes.push("Could not isolate skin from the background, so the whole frame was analysed. A plain, contrasting background works best.");
  }
  const coverage = area / n;
  if (coverage < 0.25 && coverage < 1) notes.push("The limb fills little of the frame. Move closer so the arm or hand fills most of the picture.");

  // 2 ─ limb axis and width from the second moments of the mask
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) if (mask[i]) { mx += i % w; my += Math.floor(i / w); }
  mx /= area;
  my /= area;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) if (mask[i]) {
    const dx = (i % w) - mx, dy = Math.floor(i / w) - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= area; syy /= area; sxy /= area;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ax = Math.cos(theta), ay = Math.sin(theta);
  const inset = distanceInside(mask, w, h);
  let maxInset = 0;
  for (let i = 0; i < n; i++) if (inset[i] > maxInset) maxInset = inset[i];
  const limbWidthPx = Math.max(2 * maxInset, 24);
  const mmPerPx = LIMB_WIDTH_MM[region] / limbWidthPx;

  // Which way is the heart? The limb is wider toward the elbow than toward the wrist; a hand is wider than its wrist.
  let lo = 0, hi = 0, loN = 0, hiN = 0;
  for (let i = 0; i < n; i += 3) if (mask[i]) {
    const t = ((i % w) - mx) * ax + (Math.floor(i / w) - my) * ay;
    const across = Math.abs(-((i % w) - mx) * ay + (Math.floor(i / w) - my) * ax);
    if (t < 0) { lo += across; loN++; } else { hi += across; hiN++; }
  }
  const widerPositive = hi / (hiN || 1) > lo / (loN || 1);
  let sign: 1 | -1 = (region === "hand" ? !widerPositive : widerPositive) ? 1 : -1;
  if (towardHeart) sign = towardHeart;
  ax *= sign;
  ay *= sign;

  // 3 ─ flatten lighting, normalise contrast
  const maskF = new Float32Array(n);
  const masked = new Float32Array(n);
  for (let i = 0; i < n; i++) { maskF[i] = mask[i]; masked[i] = mask[i] ? vein[i] : 0; }
  const bgSigma = Math.max(8, limbWidthPx * 0.16);
  const weight = wideBlur(maskF, w, h, bgSigma);
  const bg = wideBlur(masked, w, h, bgSigma);
  const flat = new Float32Array(n);
  const sq = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) {
    flat[i] = vein[i] - bg[i] / Math.max(weight[i], 1e-3);
    sq[i] = flat[i] * flat[i];
  }
  const varr = wideBlur(sq, w, h, bgSigma);
  const enhanced = new Float32Array(n);
  let bgSum = 0, bgSq = 0;
  for (let i = 0; i < n; i++) if (mask[i]) {
    const sd = Math.sqrt(varr[i] / Math.max(weight[i], 1e-3));
    enhanced[i] = Math.max(-3, Math.min(3, flat[i] / (sd + 0.012)));
    const level = bg[i] / Math.max(weight[i], 1e-3);
    bgSum += level;
    bgSq += level * level;
  }
  // How uniform the lighting is: spread of the background level across the limb.
  const evenness = clamp01(1 - Math.sqrt(Math.max(bgSq / area - (bgSum / area) ** 2, 0)) / 0.12);

  // 4 ─ multi-scale vesselness for dark ridges
  const vessel = new Float32Array(n);
  const scaleOf = new Float32Array(n);
  const sigmas = [0.007, 0.011, 0.017, 0.026].map((k) => Math.max(1.2, limbWidthPx * k));
  const C2 = 2 * 0.35 * 0.35;
  for (const sigma of sigmas) {
    const g = gaussian(enhanced, w, h, sigma);
    const s2 = sigma * sigma;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const dxx = (g[i + 1] - 2 * g[i] + g[i - 1]) * s2;
        const dyy = (g[i + w] - 2 * g[i] + g[i - w]) * s2;
        const dxy = ((g[i + w + 1] - g[i + w - 1] - g[i - w + 1] + g[i - w - 1]) / 4) * s2;
        const mean = (dxx + dyy) / 2;
        const dev = Math.sqrt(((dxx - dyy) / 2) ** 2 + dxy * dxy);
        const big = mean + dev; // most positive curvature: across a dark valley
        const small = mean - dev;
        if (big <= 0 || Math.abs(small) > big) continue;
        const rb = small / big;
        const v = Math.exp(-(rb * rb) / 0.5) * (1 - Math.exp(-(big * big + small * small) / C2));
        if (v > vessel[i]) { vessel[i] = v; scaleOf[i] = sigma; }
      }
  }
  // The limb outline is itself a strong edge; fade responses out near it.
  const edgeBand = limbWidthPx * 0.07;
  for (let i = 0; i < n; i++) vessel[i] *= clamp01((inset[i] - edgeBand * 0.4) / edgeBand);

  // 5 ─ hysteresis threshold, thinning, tracing
  const inside: number[] = [];
  for (let i = 0; i < n; i += 2) if (mask[i] && inset[i] > edgeBand) inside.push(vessel[i]);
  const p97 = percentile(inside, 0.97);
  const high = Math.max(0.2, p97 * 0.9);
  const low = high * 0.45;
  const bin = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) if (vessel[i] >= high) { bin[i] = 1; stack.push(i); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p - x) / w;
    for (let k = 0; k < 16; k += 2) {
      const xx = x + N8[k], yy = y + N8[k + 1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (!bin[q] && vessel[q] >= low) { bin[q] = 1; stack.push(q); }
    }
  }
  thin(bin, w, h);
  const branches = trace(bin, w, h);

  // 6 ─ measure and score each branch
  const minLen = Math.max(22, limbWidthPx * 0.2);
  const windowLen = Math.max(minLen, limbWidthPx * 0.28);
  const scored: Candidate[] = [];
  for (const branch of branches) {
    const raw = branch.map((i): [number, number] => [i % w, Math.floor(i / w)]);
    const pts = raw.map((_, i): [number, number] => {
      let sx = 0, sy = 0, c = 0;
      for (let k = Math.max(0, i - 3); k <= Math.min(raw.length - 1, i + 3); k++) { sx += raw[k][0]; sy += raw[k][1]; c++; }
      return [sx / c, sy / c];
    });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const length = cum[cum.length - 1];
    if (length < minLen) continue;

    let widthAcc = 0, contrastAcc = 0;
    for (const i of branch) { widthAcc += scaleOf[i] * 3.0; contrastAcc += vessel[i]; }
    const contrast = contrastAcc / branch.length;

    // The straightest stretch long enough to take a needle.
    let best = { s: 0, a: 0, b: pts.length - 1 };
    let j = 0;
    for (let i = 0; i < pts.length; i++) {
      while (j < pts.length - 1 && cum[j] - cum[i] < windowLen) j++;
      if (cum[j] - cum[i] < windowLen * 0.98) break;
      const s = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]) / (cum[j] - cum[i]);
      if (s > best.s) best = { s, a: i, b: j };
    }
    if (!best.s) best.s = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) / length;
    const mid = pts[Math.floor((best.a + best.b) / 2)];
    let dx = pts[best.b][0] - pts[best.a][0], dy = pts[best.b][1] - pts[best.a][1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    if (dx * ax + dy * ay < 0) { dx = -dx; dy = -dy; }
    const alignment = Math.abs(dx * ax + dy * ay);
    const margin = clamp01((inset[Math.round(mid[1]) * w + Math.round(mid[0])] / limbWidthPx - 0.1) / 0.14);

    // Calibre: measure the vein's actual profile at several points across the puncture zone.
    const widths: number[] = [];
    const span = Math.max(best.b - best.a, 1);
    for (let k = 0; k <= 8; k++) {
      const i = Math.min(pts.length - 2, Math.max(1, Math.round(best.a + (span * k) / 8)));
      const tx = pts[i + 1][0] - pts[i - 1][0], ty = pts[i + 1][1] - pts[i - 1][1];
      const tl = Math.hypot(tx, ty) || 1;
      const m = valleyWidth(enhanced, w, h, pts[i][0], pts[i][1], -ty / tl, tx / tl, limbWidthPx * 0.09);
      if (m) widths.push(m);
    }
    widths.sort((p, q) => p - q);
    const widthPx = widths.length >= 3 ? widths[Math.floor(widths.length / 2)] : (widthAcc / branch.length) * 0.8;
    const widthMm = widthPx * mmPerPx;
    const lengthMm = length * mmPerPx;
    const wN = clamp01((widthMm - 1) / 3);
    const sN = clamp01((best.s - 0.9) / 0.09);
    const cN = clamp01(contrast / 0.55);
    const lN = clamp01(length / (limbWidthPx * 0.8));
    const aN = alignment * alignment;
    const score = Math.round(100 * (0.28 * wN + 0.24 * sN + 0.2 * cN + 0.14 * lN + 0.14 * aN) * (0.6 + 0.4 * margin));

    const reasons: string[] = [];
    const cautions: string[] = [];
    if (wN > 0.6) reasons.push(`Wide: about ${widthMm.toFixed(1)} mm across`);
    else if (wN < 0.3) cautions.push(`Narrow: about ${widthMm.toFixed(1)} mm across`);
    if (sN > 0.7) reasons.push("Straight over the puncture zone");
    else if (sN < 0.35) cautions.push("Curves through the puncture zone");
    if (cN > 0.65) reasons.push("Clearly defined against the skin");
    else if (cN < 0.35) cautions.push("Faint — confirm it is a vein by palpation");
    if (lN > 0.6) reasons.push(`Long visible run (≈ ${Math.round(lengthMm)} mm)`);
    if (aN < 0.5) cautions.push("Runs across the limb rather than along it");
    if (margin < 0.5) cautions.push("Close to the edge of the limb, where veins roll");

    const equipment =
      region === "hand"
        ? "23G winged set, 10–15° to the skin"
        : widthMm >= 2.6
          ? "21G needle, 15–30° to the skin"
          : widthMm >= 1.8
            ? "22G needle or 23G winged set, 15–30°"
            : "23G winged set — or look for a larger vein";
    scored.push({ rank: 0, points: pts, target: mid, direction: [dx, dy], lengthMm, widthMm, straightness: best.s, contrast, alignment, score, reasons, cautions, equipment });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates: Candidate[] = [];
  for (const c of scored) {
    if (candidates.some((k) => Math.hypot(k.target[0] - c.target[0], k.target[1] - c.target[1]) < limbWidthPx * 0.14)) continue;
    candidates.push({ ...c, rank: candidates.length + 1 });
    if (candidates.length === 5) break;
  }

  // Image quality
  let lapAcc = 0, lapN = 0;
  for (let y = 1; y < h - 1; y += 2)
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const l = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      lapAcc += l * l;
      lapN++;
    }
  const sharpness = clamp01(Math.sqrt(lapAcc / (lapN || 1)) / 0.02);
  if (sharpness < 0.3) notes.push("The image looks soft. Hold the camera steady and tap to focus on the skin.");
  if (evenness < 0.55) notes.push("Lighting is uneven. Diffuse, even light without flash glare shows veins best.");
  const signal = candidates.length ? candidates[0].contrast : 0;
  const top = candidates[0]?.score ?? 0;
  const confidence = !candidates.length ? "none" : top >= 62 && signal > 0.4 ? "high" : top >= 42 ? "moderate" : "low";
  if (confidence === "none") notes.push("No vein could be traced with confidence. Try a tourniquet, warm the limb, lower the arm, and use even light — veins that cannot be seen can still be felt.");
  else if (confidence === "low") notes.push("Veins are faint in this image, so treat the ranking as a rough guide.");

  return {
    width: w, height: h, mask, inset, enhanced, vessel, candidates,
    axis: { cx: mx, cy: my, dx: ax, dy: ay },
    limbWidthPx, mmPerPx,
    quality: { coverage, sharpness, evenness, signal, grey, notes },
    confidence,
    ms: performance.now() - t0,
  };
}
