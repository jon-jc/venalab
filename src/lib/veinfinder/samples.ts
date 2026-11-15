/**
 * Synthetic practice photographs, drawn on a canvas so the tool can be tried without a real image.
 * In every sample the heart is toward the left edge.
 */

export interface Sample {
  id: string;
  label: string;
  region: "forearm" | "hand";
  skin: [string, string];
  veinAlpha: number;
}

export const SAMPLES: Sample[] = [
  { id: "forearm-light", label: "Forearm · light skin", region: "forearm", skin: ["#f0c7ab", "#d9a888"], veinAlpha: 0.34 },
  { id: "forearm-deep", label: "Forearm · deep skin", region: "forearm", skin: ["#9a6a4c", "#7c5139"], veinAlpha: 0.2 },
  { id: "hand", label: "Back of hand", region: "hand", skin: ["#e6b999", "#cf9f80"], veinAlpha: 0.36 },
];

type P = [number, number];

function limb(ctx: CanvasRenderingContext2D, outline: P[]) {
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length - 2; i += 3)
    ctx.bezierCurveTo(outline[i][0], outline[i][1], outline[i + 1][0], outline[i + 1][1], outline[i + 2][0], outline[i + 2][1]);
  ctx.closePath();
}

function vein(ctx: CanvasRenderingContext2D, pts: P[], width: number) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 2; i += 3)
    ctx.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
  ctx.stroke();
}

export function drawSample(sample: Sample): HTMLCanvasElement {
  const W = 960, H = 640;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#c9d3da");
  bg.addColorStop(1, "#aab6bf");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const forearm: P[] = [
    [-20, 170], [200, 150], [520, 205], [980, 232],
    [980, 300], [980, 380], [980, 432],
    [560, 470], [220, 520], [-20, 500],
  ];
  const hand: P[] = [
    [-20, 220], [120, 215], [250, 150], [400, 150],
    [560, 150], [800, 190], [940, 250],
    [960, 300], [960, 360], [935, 410],
    [800, 470], [560, 505], [400, 500],
    [250, 495], [120, 440], [-20, 430],
  ];
  const outline = sample.region === "hand" ? hand : forearm;

  ctx.save();
  ctx.shadowColor = "rgba(30,40,50,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  const skin = ctx.createLinearGradient(0, 140, 0, 520);
  skin.addColorStop(0, sample.skin[1]);
  skin.addColorStop(0.35, sample.skin[0]);
  skin.addColorStop(0.7, sample.skin[0]);
  skin.addColorStop(1, sample.skin[1]);
  ctx.fillStyle = skin;
  limb(ctx, outline);
  ctx.fill();
  ctx.restore();

  // Veins: soft, slightly blue-grey shadows under the skin.
  ctx.save();
  limb(ctx, outline);
  ctx.clip();
  ctx.filter = "blur(4px)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(58, 92, 118, ${sample.veinAlpha})`;
  if (sample.region === "hand") {
    vein(ctx, [[60, 250], [200, 245], [300, 215], [400, 222]], 15);
    vein(ctx, [[60, 400], [200, 410], [300, 432], [395, 420]], 15);
    vein(ctx, [[400, 222], [470, 260], [480, 360], [395, 420]], 13);
    vein(ctx, [[400, 222], [540, 215], [680, 232], [820, 262]], 11);
    vein(ctx, [[468, 320], [600, 322], [720, 326], [850, 332]], 12);
    vein(ctx, [[395, 420], [540, 430], [670, 422], [800, 402]], 11);
  } else {
    vein(ctx, [[0, 232], [220, 226], [420, 262], [560, 268], [700, 274], [840, 268], [960, 276]], 17);
    vein(ctx, [[0, 448], [200, 446], [380, 408], [520, 398], [680, 390], [820, 398], [960, 396]], 18);
    vein(ctx, [[560, 268], [470, 310], [400, 372], [300, 418]], 19);
    vein(ctx, [[468, 312], [600, 330], [760, 336], [960, 334]], 11);
  }
  ctx.restore();

  // Cylindrical shading, then sensor noise.
  ctx.save();
  limb(ctx, outline);
  ctx.clip();
  const shade = ctx.createLinearGradient(0, 150, 0, 510);
  shade.addColorStop(0, "rgba(40,20,10,0.28)");
  shade.addColorStop(0.3, "rgba(255,255,255,0.07)");
  shade.addColorStop(0.75, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(40,20,10,0.34)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const img = ctx.getImageData(0, 0, W, H);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 14;
  for (let i = 0; i < img.data.length; i += 4) {
    const k = rnd();
    img.data[i] += k;
    img.data[i + 1] += k;
    img.data[i + 2] += k;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
