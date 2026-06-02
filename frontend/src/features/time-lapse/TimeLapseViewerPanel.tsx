import { useEffect, useMemo, useState } from "react";
import type { TimeLapseViewer } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";

interface Props {
  data: TimeLapseViewer | null;
}

/**
 * E4 Time-lapse viewer. Slider over frames, play/pause toggle, scale bar overlay.
 */
export function TimeLapseViewerPanel({ data }: Props) {
  const frames = useMemo(() => data?.frames ?? [], [data]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, 600);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  // Reset frame index when frames change
  useEffect(() => {
    setIdx(0);
  }, [frames.length]);

  if (!data || frames.length === 0) return <EmptyBlock label="Time-lapse 이미지가 없습니다." />;

  const frame = frames[Math.min(idx, frames.length - 1)];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative bg-black rounded-md overflow-hidden h-[426px]">
        <img
          src={frame.image_url}
          alt={`t=${frame.t_hours}h`}
          className="w-full h-full block object-contain"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 text-white text-caption font-mono bg-black/60 px-2 py-0.5 rounded">
          Well {data.well_id ?? "—"} : {data.n_cells_t0 ?? "—"} cells — {frame.t_hours.toFixed(0)} h
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
          {frame.t_hours.toFixed(0)} / {frames[frames.length - 1].t_hours.toFixed(0)} h
        </span>
      </div>
    </div>
  );
}
