import { useEffect, useMemo, useState } from "react";
import type { TimeLapseFrame, TimeLapseViewer } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";

interface Props {
  data: TimeLapseViewer | null;
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
export function TimeLapseViewerPanel({ data }: Props) {
  const allFrames = useMemo(() => data?.frames ?? [], [data]);

  // Default interval: finest available spacing rounded into the option set.
  const [intervalH, setIntervalH] = useState<number>(4);
  const frames = useMemo(() => subsample(allFrames, intervalH), [allFrames, intervalH]);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

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

  if (!data || allFrames.length === 0) return <EmptyBlock label="Time-lapse 이미지가 없습니다." />;

  const frame = frames[Math.min(idx, frames.length - 1)];
  const cells = frame.n_cells ?? data.n_cells_t0 ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative bg-black rounded-md overflow-hidden h-[431px]">
        <img
          src={frame.image_url}
          alt={`t=${fmtHours(frame.t_hours)}h`}
          className="w-full h-full block object-contain"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 text-white text-caption font-mono bg-black/60 px-2 py-1 rounded leading-snug">
          <div>{fmtHours(frame.t_hours)} h</div>
          <div>{cells ?? "—"} cells</div>
        </div>
        <div className="absolute bottom-2 left-2 text-white text-caption font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-8 border-t-2 border-white" />
            <span>{data.scale_bar_um ?? 10} µm</span>
          </div>
        </div>
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
          <span>간격</span>
          <select
            value={intervalH}
            onChange={(e) => setIntervalH(Number(e.target.value))}
            className="bg-surface-2 border border-line rounded px-1 py-0.5 text-ink-primary"
          >
            {INTERVAL_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {fmtHours(h)}h
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
