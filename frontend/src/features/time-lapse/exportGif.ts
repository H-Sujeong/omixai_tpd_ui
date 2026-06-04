import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { TimeLapseFrame } from "@/types/api";

/** Format an hour value without a trailing ".0" (4 -> "4", 0.5 -> "0.5"). */
function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

const NICE_BARS_UM = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Pick a "nice" scale-bar length (µm) ≈ 20% of the image's physical width. */
export function pickBarUm(contentUmWidth: number): number {
  const target = contentUmWidth * 0.2;
  return NICE_BARS_UM.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

/** Label a bar length: ≥1000 µm shown in mm. */
export function barLabel(um: number): string {
  return um >= 1000 ? `${um / 1000} mm` : `${um} µm`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // same-origin via /api proxy → not tainted
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

interface GifOptions {
  drugName: string;
  wellId: string | null;
  fallbackCells: number | null;
  /** Physical scale (µm per pixel of the source image); enables a scale bar. */
  umPerPixel?: number | null;
  /** Target max width in px (frames are downscaled to keep the GIF light). */
  maxWidth?: number;
  /** Per-frame delay in ms. */
  delayMs?: number;
}

/**
 * Build an animated GIF (Uint8Array) from the given time-lapse frames, each
 * stamped with a 3-line overlay: drug name / time / cell count. Frames are
 * downscaled to `maxWidth`. Runs fully client-side (gifenc, no worker).
 */
export async function buildTimeLapseGif(
  frames: TimeLapseFrame[],
  opts: GifOptions,
): Promise<Uint8Array> {
  const maxWidth = opts.maxWidth ?? 520;
  const delayMs = opts.delayMs ?? 250;
  if (frames.length === 0) throw new Error("no frames");

  // Size from the first frame, scaled to maxWidth.
  const first = await loadImage(frames[0].image_url);
  const scale = Math.min(1, maxWidth / first.naturalWidth);
  const w = Math.round(first.naturalWidth * scale);
  const h = Math.round(first.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const enc = GIFEncoder();
  const fontPx = Math.max(12, Math.round(w * 0.032));
  const pad = Math.round(fontPx * 0.5);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const img = i === 0 ? first : await loadImage(f.image_url);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // 3-line overlay: drug name / time / cells, top-left on a dark plate.
    const cells = f.n_cells ?? opts.fallbackCells;
    const lines = [
      opts.drugName + (opts.wellId ? `  (${opts.wellId})` : ""),
      `${fmtHours(f.t_hours)} h`,
      `${cells ?? "—"} cells`,
    ];
    ctx.font = `600 ${fontPx}px ui-monospace, monospace`;
    ctx.textBaseline = "top";
    const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const lineH = Math.round(fontPx * 1.3);
    const boxH = lineH * lines.length + pad * 2 - (lineH - fontPx);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(pad, pad, boxW, boxH);
    ctx.fillStyle = "#ffffff";
    lines.forEach((l, idx) => ctx.fillText(l, pad * 2, pad * 2 + idx * lineH));

    // Scale bar (bottom-left), calibrated from um/pixel.
    if (opts.umPerPixel) {
      const barUm = pickBarUm(first.naturalWidth * opts.umPerPixel);
      const barPx = (barUm / opts.umPerPixel) * (w / first.naturalWidth);
      const by = h - pad * 2;
      const bx = pad * 2;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.18));
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + barPx, by);
      ctx.stroke();
      ctx.textBaseline = "bottom";
      ctx.fillText(barLabel(barUm), bx, by - 4);
      ctx.textBaseline = "top";
    }

    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, w, h, { palette, delay: delayMs });
  }

  enc.finish();
  return enc.bytes();
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
