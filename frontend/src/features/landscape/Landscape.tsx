import { useState } from "react";
import Plot from "react-plotly.js";
import type { LandscapePanel } from "@/types/api";

interface Props {
  landscape: LandscapePanel;
  highlightCommunity: number | null;
  onCommunityClick?: (communityId: number) => void;
  height?: number;
}

/**
 * Target Landscape — 2D contour by default, 3D surface on toggle.
 *
 * Step 13 (2026-05-21) — rewritten to match test_viz pattern:
 *   - 2D contour is the default mode (easier to read, points more visible)
 *   - 3D surface available via toggle button
 *   - Target community marked with amber cross ✚ (#F59E0B / #92400E)
 *   - Other communities = grey dots
 *   - Highlighted community = orange diamond
 *
 * The plot panel uses a LIGHT background (#FAFAF7) inside the dark card
 * — improves scientific data legibility (per user request 2026-05-21).
 */

const COLOR = {
  // 2D
  surfaceLow:  "#185FA5",   // blue (negative PCC)
  surfaceMid:  "#FFFFFF",   // white (zero)
  surfaceHigh: "#A32D2D",   // red (positive PCC)
  // points
  otherDot:    "rgba(60,60,60,0.7)",
  otherEdge:   "#FFFFFF",
  targetFill:  "#F59E0B",
  targetEdge:  "#92400E",
  // highlight
  hlFill:      "#F97316",
  hlEdge:      "#7C2D12",
} as const;

export function Landscape({ landscape, highlightCommunity, onCommunityClick, height = 380 }: Props) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");

  const scatter = landscape.scatter;
  const scTarget = scatter.filter((p) => p.is_target);
  const scOther = scatter.filter((p) => !p.is_target);

  const traces: any[] = mode === "2d" ? build2D() : build3D();

  function build2D(): any[] {
    const t: any[] = [];

    // Filled contour
    if (landscape.grid) {
      t.push({
        type: "contour",
        x: landscape.grid.xi,
        y: landscape.grid.yi,
        z: landscape.grid.z,
        colorscale: [
          [0, COLOR.surfaceLow],
          [0.5, COLOR.surfaceMid],
          [1, COLOR.surfaceHigh],
        ],
        zmin: -0.5,
        zmax: 0.5,
        contours: { coloring: "fill", showlines: false },
        colorbar: { title: { text: "avg(PCC)", side: "right" }, len: 0.6, thickness: 12 },
        hoverinfo: "none",
      });
    }

    // Other communities
    if (scOther.length > 0) {
      t.push({
        type: "scatter",
        mode: "markers",
        x: scOther.map((p) => p.x),
        y: scOther.map((p) => p.y),
        customdata: scOther.map((p) => p.community_id),
        text: scOther.map((p) => `community ${p.community_id} · n=${p.size}`),
        marker: {
          size: scOther.map((p) => Math.max(7, Math.min(14, Math.sqrt(p.size) * 1.5))),
          symbol: "circle",
          color: COLOR.otherDot,
          line: { width: 1.5, color: COLOR.otherEdge },
        },
        hovertemplate: "<b>%{text}</b><br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }

    // Target community: amber cross
    if (scTarget.length > 0) {
      t.push({
        type: "scatter",
        mode: "markers+text",
        x: scTarget.map((p) => p.x),
        y: scTarget.map((p) => p.y),
        customdata: scTarget.map((p) => p.community_id),
        text: scTarget.map(() => "✚"),
        textposition: "top center",
        textfont: { size: 16, color: COLOR.targetFill },
        marker: {
          size: 16,
          symbol: "cross",
          color: COLOR.targetFill,
          line: { width: 2.5, color: COLOR.targetEdge },
        },
        hovertemplate: "<b>★ target community %{customdata}</b><br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }

    // Highlight ring (current selection)
    if (highlightCommunity !== null) {
      const hl = scatter.find((p) => p.community_id === highlightCommunity);
      if (hl) {
        t.push({
          type: "scatter",
          mode: "markers",
          x: [hl.x],
          y: [hl.y],
          // Tag the ring with its own community_id so clicks landing on the
          // ring (not the underlying dot) still dispatch a sensible cid.
          customdata: [hl.community_id],
          marker: {
            size: 22,
            symbol: "circle-open",
            color: COLOR.hlFill,
            line: { width: 3, color: COLOR.hlEdge },
          },
          hoverinfo: "skip",
          showlegend: false,
        });
      }
    }

    return t;
  }

  function build3D(): any[] {
    const t: any[] = [];
    if (landscape.grid) {
      t.push({
        type: "surface",
        x: landscape.grid.xi,
        y: landscape.grid.yi,
        z: landscape.grid.z,
        colorscale: [
          [0, COLOR.surfaceLow],
          [0.5, COLOR.surfaceMid],
          [1, COLOR.surfaceHigh],
        ],
        cmin: -0.5,
        cmax: 0.5,
        opacity: 0.88,
        contours: { x: { show: false }, y: { show: false }, z: { show: false } },
        colorbar: { title: { text: "avg(PCC)", side: "right" }, len: 0.6, thickness: 12 },
        hoverinfo: "none",
      });
    }
    if (scOther.length > 0) {
      t.push({
        type: "scatter3d",
        mode: "markers",
        x: scOther.map((p) => p.x),
        y: scOther.map((p) => p.y),
        z: scOther.map((p) => p.z),
        customdata: scOther.map((p) => p.community_id),
        text: scOther.map((p) => `community ${p.community_id} · n=${p.size}`),
        marker: {
          size: 5,
          color: COLOR.otherDot,
          line: { width: 1.5, color: COLOR.otherEdge },
        },
        hovertemplate: "<b>%{text}</b><br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }
    if (scTarget.length > 0) {
      t.push({
        type: "scatter3d",
        mode: "markers+text",
        x: scTarget.map((p) => p.x),
        y: scTarget.map((p) => p.y),
        z: scTarget.map((p) => p.z),
        customdata: scTarget.map((p) => p.community_id),
        text: scTarget.map(() => "+"),
        textfont: { color: COLOR.targetFill, size: 20, family: "Arial Black" },
        marker: {
          size: 10,
          color: COLOR.targetFill,
          symbol: "cross",
          line: { width: 2, color: COLOR.targetEdge },
        },
        hovertemplate: "<b>★ target community %{customdata}</b><br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }
    return t;
  }

  const layout: any =
    mode === "2d"
      ? {
          margin: { l: 50, r: 80, t: 16, b: 50 },
          paper_bgcolor: "#FAFAF7",
          plot_bgcolor: "#FAFAF7",
          height,
          font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#2C2C2A" },
          xaxis: {
            title: { text: landscape.axes.x ?? "Distance from anchor", font: { size: 11 } },
            gridcolor: "rgba(0,0,0,0.06)",
            zeroline: false,
            autorange: "reversed" as const,
          },
          yaxis: {
            title: { text: landscape.axes.y ?? "−log10(p)", font: { size: 11 } },
            gridcolor: "rgba(0,0,0,0.06)",
            zeroline: false,
          },
        }
      : {
          margin: { l: 0, r: 0, b: 0, t: 16 },
          paper_bgcolor: "#FAFAF7",
          height,
          font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#2C2C2A" },
          scene: {
            xaxis: {
              title: { text: landscape.axes.x ?? "x", font: { size: 10 } },
              autorange: "reversed" as const,
              gridcolor: "#D3D1C7",
              backgroundcolor: "rgba(240,240,240,0.25)",
              showbackground: true,
            },
            yaxis: {
              title: { text: landscape.axes.y ?? "y", font: { size: 10 } },
              gridcolor: "#D3D1C7",
              backgroundcolor: "rgba(240,240,240,0.25)",
              showbackground: true,
            },
            zaxis: {
              title: { text: landscape.axes.z ?? "z", font: { size: 10 } },
              range: [-0.5, 0.5],
              gridcolor: "#D3D1C7",
              backgroundcolor: "rgba(240,240,240,0.25)",
              showbackground: true,
            },
            camera: { eye: { x: 1.5, y: -1.5, z: 0.9 } },
            aspectmode: "manual" as const,
            aspectratio: { x: 1.2, y: 1, z: 0.8 },
          },
        };

  return (
    <div className="relative w-full">
      {/* Toggle button — sits at top-right of plot, above any controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 rounded-md overflow-hidden border border-line bg-surface-elevated">
        <button
          type="button"
          onClick={() => setMode("2d")}
          className={`px-2.5 py-1 text-meta transition-colors duration-fast ${
            mode === "2d"
              ? "bg-brand-primary text-white"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
          aria-pressed={mode === "2d"}
        >
          2D
        </button>
        <button
          type="button"
          onClick={() => setMode("3d")}
          className={`px-2.5 py-1 text-meta transition-colors duration-fast ${
            mode === "3d"
              ? "bg-brand-primary text-white"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
          aria-pressed={mode === "3d"}
        >
          3D
        </button>
      </div>

      <Plot
        data={traces}
        layout={layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "lasso2d", "select2d"],
        }}
        style={{ width: "100%", borderRadius: 6, overflow: "hidden" }}
        onClick={(evt) => {
          if (!onCommunityClick) return;
          // The highlight ring trace (drawn last, on top) has no customdata.
          // After the first click it sits over the community dot, so naively
          // taking points[0] would always pick the ring and drop the click.
          // Scan all hit points for the first one carrying a numeric
          // community_id so subsequent clicks keep re-targeting the PPI.
          const hit = (evt.points ?? []).find(
            (pp: any) => typeof pp?.customdata === "number",
          ) as any;
          if (hit) onCommunityClick(hit.customdata as number);
        }}
      />
    </div>
  );
}
