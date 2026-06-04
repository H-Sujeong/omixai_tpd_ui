import { useEffect, useMemo, useRef, useState } from "react";
import type { TimeLapseFrame, TimeLapseViewer } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";
import { buildTimeLapseGif, downloadBytes, pickBarUm, barLabel } from "./exportGif";
import { useT } from "@/store/uiLang";

interface Props {
  data: TimeLapseViewer | null;
  drugName?: string;
}

// Display-interval options (hours). The backend returns the full frame set
// (e.g. 0.5h spacing); we subsample client-side so switching is instant and
// only the current frame's <img> ever loads — no re-fetch, no preloading.
const INTERVAL_OPTIONS = [0.5, 1, 2, 4, 6, 12] as const;

/** Format an hour value without a trailing ".0" (4 -> "4", 0.5 -> "0.5"). */
function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/**
 * Pick frames spaced ~intervalH apart, starting from the first frame. Robust
 * to non-uniform spacing: walks frames in time order and takes the next one
 * once at least intervalH has elapsed since the last taken frame. The final
 * frame is always included so the slider reaches the end of the run.
 */
function subsample(frames: TimeLapseFrame[], intervalH: number): TimeLapseFrame[] {
  if (frames.length === 0) return frames;
  const eps = 1e-6;
  const out: TimeLapseFrame[] = [frames[0]];
  let last = frames[0].t_hours;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].t_hours - last >= intervalH - eps) {
      out.push(frames[i]);
      last = frames[i].t_hours;
    }
  }
  const tail = frames[frames.length - 1];
  if (out[out.length - 1] !== tail) out.push(tail);
  return out;
}

/**
 * E4 Time-lapse viewer. Slider over frames, play/pause toggle, scale bar
 * overlay, and a display-interval selector (subsamples the full frame set).
 */
export function TimeLapseViewerPanel({ data, drugName }: Props) {
  const t = useT();
  const allFrames = useMemo(() => data?.frames ?? [], [data]);

  // Default interval: finest available spacing rounded into the option set.
  const [intervalH, setIntervalH] = useState<number>(4);
  const frames = useMemo(() => subsample(allFrames, intervalH), [allFrames, intervalH]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gifBusy, setGifBusy] = useState(false);

  // Scale bar, computed from um/pixel + the object-contain rendered image size.
  const imgRef = useRef<HTMLImageElement>(null);
  const [bar, setBar] = useState<{ w: number; left: number; bottom: number; label: string } | null>(
    null,
  );
  const umPerPixel = data?.um_per_pixel ?? null;

  useEffect(() => {
    const el = imgRef.current;
    if (!el || !umPerPixel) {
      setBar(null);
      return;
    }
    const compute = () => {
      const natW = el.naturalWidth || 0;
      const natH = el.naturalHeight || natW;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!natW || !cw) return;
      const scale = Math.min(cw / natW, ch / natH); // object-contain
      const offX = (cw - natW * scale) / 2;
      const offY = (ch - natH * scale) / 2;
      const barUm = pickBarUm(natW * umPerPixel);
      setBar({
        w: (barUm / umPerPixel) * scale,
        left: offX + 8,
        bottom: offY + 8,
        label: barLabel(barUm),
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    el.addEventListener("load", compute);
    return () => {
      ro.disconnect();
      el.removeEventListener("load", compute);
    };
  }, [umPerPixel]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, 600);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  // Reset frame index when the (subsampled) frame set changes.
  useEffect(() => {
    setIdx(0);
  }, [frames.length]);

  if (!data || allFrames.length === 0)
    return <EmptyBlock label={t("Time-lapse 이미지가 없습니다.", "No time-lapse images.")} />;

  const frame = frames[Math.min(idx, frames.length - 1)];
  const cells = frame.n_cells ?? data.n_cells_t0 ?? null;

  async function exportGif() {
    if (gifBusy || frames.length === 0 || !data) return;
    setGifBusy(true);
    try {
      const bytes = await buildTimeLapseGif(frames, {
        drugName: drugName ?? "",
        wellId: data.well_id,
        fallbackCells: data.n_cells_t0,
        umPerPixel: data.um_per_pixel,
      });
      const base = `${drugName || "timelapse"}_${data.well_id ?? ""}`.replace(
        /[^A-Za-z0-9._-]+/g,
        "_",
      );
      downloadBytes(`${base}.gif`, bytes, "image/gif");
    } catch (e) {
      console.error("GIF export failed", e);
    } finally {
      setGifBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative bg-black rounded-md overflow-hidden h-[431px]">
        <img
          ref={imgRef}
          src={frame.image_url}
          alt={`t=${fmtHours(frame.t_hours)}h`}
          className="w-full h-full block object-contain"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 text-white text-caption font-mono bg-black/60 px-2 py-1 rounded leading-snug">
          {drugName && <div className="font-semibold">{drugName}</div>}
          <div>{fmtHours(frame.t_hours)} h</div>
          <div>{cells ?? "—"} cells</div>
        </div>
        {bar && (
          <div
            className="absolute text-white text-caption font-mono"
            style={{ left: bar.left, bottom: bar.bottom }}
          >
            <div className="border-t-2 border-white" style={{ width: `${bar.w}px` }} />
            <span>{bar.label}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn btn--primary text-caption px-2 py-1"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          className="flex-1 accent-brand-primary"
        />
        <span className="text-caption text-ink-secondary tabular w-20 text-right">
          {fmtHours(frame.t_hours)} / {fmtHours(frames[frames.length - 1].t_hours)} h
        </span>
        <label className="flex items-center gap-1 text-caption text-ink-secondary">
          <span>{t("간격", "Interval")}</span>
          <select
            value={intervalH}
            onChange={(e) => setIntervalH(Number(e.target.value))}
            className="bg-surface-2 border border-line rounded px-1 py-0.5 text-ink-primary"
          >
            {INTERVAL_OPTIONS.map((h) => (
              // The native dropdown popup has a light background even in dark
              // mode, so force dark option text or the numbers vanish.
              <option key={h} value={h} style={{ color: "#1a1a1a", backgroundColor: "#fff" }}>
                {fmtHours(h)}h
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn--ghost text-caption px-2 py-1 whitespace-nowrap"
          onClick={exportGif}
          disabled={gifBusy}
          title={t(
            "현재 간격의 프레임을 이름/시간/세포수 오버레이가 있는 GIF로 내보내기",
            "Export frames at the current interval as a GIF with name/time/cell-count overlay",
          )}
        >
          {gifBusy ? "GIF…" : "GIF ⬇"}
        </button>
      </div>
    </div>
  );
}
