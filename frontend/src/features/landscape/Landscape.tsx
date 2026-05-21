import Plot from "react-plotly.js";
import type { LandscapePanel } from "@/types/api";

interface Props {
  landscape: LandscapePanel;
  highlightCommunity: number | null;
  onCommunityClick?: (communityId: number) => void;
  height?: number;
}

/**
 * 3D Target Landscape. Surface from `grid` (RBF interpolated) + community scatter.
 * Selected community is highlighted with a magenta marker; community switches
 * animate via highlightCommunity prop.
 */
export function Landscape({ landscape, highlightCommunity, onCommunityClick, height = 380 }: Props) {
  const traces: any[] = [];

  if (landscape.grid) {
    traces.push({
      type: "surface",
      x: landscape.grid.xi,
      y: landscape.grid.yi,
      z: landscape.grid.z,
      colorscale: [
        [0, "#1E3A8A"],
        [0.5, "#1F2937"],
        [1, "#A871FF"],
      ],
      opacity: 0.85,
      showscale: true,
      contours: {
        z: { show: true, usecolormap: true, project: { z: true } },
      },
      colorbar: { title: { text: "avg(PCC)" }, len: 0.6 },
    });
  }

  // All community dots (smaller)
  traces.push({
    type: "scatter3d",
    mode: "markers",
    x: landscape.scatter.map((s) => s.x),
    y: landscape.scatter.map((s) => s.y),
    z: landscape.scatter.map((s) => s.z),
    text: landscape.scatter.map((s) => `community ${s.community_id} · n=${s.size}`),
    hovertemplate: "%{text}<br>x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra></extra>",
    marker: {
      size: landscape.scatter.map((s) => Math.max(4, Math.min(14, Math.sqrt(s.size) * 1.5))),
      color: landscape.scatter.map((s) => (s.is_target ? "#A871FF" : "#E6EDF3")),
      opacity: landscape.scatter.map((s) => (s.is_target ? 1 : 0.65)),
      line: { width: 0 },
    },
    customdata: landscape.scatter.map((s) => s.community_id),
    name: "communities",
  });

  // Highlight ring
  if (highlightCommunity !== null) {
    const hl = landscape.scatter.find((s) => s.community_id === highlightCommunity);
    if (hl) {
      traces.push({
        type: "scatter3d",
        mode: "markers+text",
        x: [hl.x],
        y: [hl.y],
        z: [hl.z],
        text: [`▾ #${hl.community_id}`],
        textposition: "top center",
        marker: {
          size: 18,
          color: "#F472B6",
          symbol: "diamond",
          line: { color: "#FFFFFF", width: 2 },
        },
        hoverinfo: "skip",
        name: "current community",
        showlegend: false,
      });
    }
  }

  // Target reference point (PRD landscape always shows the target_point as +)
  if (landscape.target_point) {
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: [landscape.target_point.x],
      y: [landscape.target_point.y],
      z: [landscape.target_point.z],
      marker: { size: 9, color: "#FCD34D", symbol: "cross" },
      hovertemplate: "target<br>x=%{x:.2f} y=%{y:.2f} z=%{z:.3f}<extra></extra>",
      name: "target",
      showlegend: false,
    });
  }

  return (
    <Plot
      data={traces}
      layout={{
        margin: { l: 0, r: 0, b: 0, t: 10 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        height,
        font: { family: "Inter, IBM Plex Sans, Pretendard, sans-serif", size: 11, color: "#B1BAC4" },
        scene: {
          xaxis: { title: { text: landscape.axes.x ?? "x" }, gridcolor: "rgba(255,255,255,0.08)", backgroundcolor: "rgba(0,0,0,0)", zerolinecolor: "rgba(255,255,255,0.18)" },
          yaxis: { title: { text: landscape.axes.y ?? "y" }, gridcolor: "rgba(255,255,255,0.08)", backgroundcolor: "rgba(0,0,0,0)", zerolinecolor: "rgba(255,255,255,0.18)" },
          zaxis: { title: { text: landscape.axes.z ?? "z" }, gridcolor: "rgba(255,255,255,0.08)", backgroundcolor: "rgba(0,0,0,0)", zerolinecolor: "rgba(255,255,255,0.18)" },
        },
      }}
      config={{
        displaylogo: false,
        responsive: true,
      }}
      style={{ width: "100%" }}
      onClick={(evt) => {
        if (!onCommunityClick) return;
        const p = evt.points?.[0] as any;
        const cid = p?.customdata;
        if (typeof cid === "number") onCommunityClick(cid);
      }}
    />
  );
}
