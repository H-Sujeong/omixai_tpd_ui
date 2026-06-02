import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "@/hooks/useTheme";
import type { LandscapePanel } from "@/types/api";

interface Props {
  landscape: LandscapePanel;
  /** Currently selected community (informational only — no ring is drawn). */
  highlightCommunity?: number | null;
  onCommunityClick?: (communityId: number) => void;
  height?: number;
}

/**
 * Target Landscape — visual ruleset ported from references/test_viz.html
 * (2026-06-01).
 *
 *   - 2D contour by default, 3D surface on toggle
 *   - Smooth heatmap colorscale (5 stops, ncontours=200, smoothing=1.5)
 *   - y = 1 dashed reference line (significance cutoff in -log10(p))
 *   - Target community = amber cross ✚, others = grey circles
 *   - No highlight ring (was a click-trap; selection is conveyed via the
 *     BridgeNotice and the PPI panel switching to the chosen community)
 *
 * New (2026-06-01):
 *   - PCC threshold slider — filter scatter points by signed avg(PCC)
 *     (z >= threshold). Range −0.5 … 0.5, step 0.001 for fine tuning.
 *     Default sits at min (−0.5) so all communities are visible.
 */

const COLORSCALE_2D: Array<[number, string]> = [
  [0,   "rgb(0,0,180)"],
  [0.3, "rgb(80,130,230)"],
  [0.5, "rgb(245,245,255)"],
  [0.7, "rgb(240,110,70)"],
  [1,   "rgb(190,0,0)"],
];

const COLORSCALE_3D: Array<[number, string]> = [
  [0,   "rgb(0,0,255)"],
  [0.5, "rgb(255,255,255)"],
  [1,   "rgb(255,0,0)"],
];

const COLOR_TARGET_FILL = "#F59E0B";
const COLOR_TARGET_EDGE = "#92400E";
const COLOR_OTHER_FILL  = "rgba(80,80,80,0.7)";
const COLOR_OTHER_EDGE  = "#FFFFFF";
const REF_LINE_COLOR    = "#1F2937";

export function Landscape({
  landscape,
  onCommunityClick,
  height = 380,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  // Plotly takes literal color strings, not CSS vars, so we branch here.
  // In light mode the original near-black axis text was fine; in dark
  // mode the same color disappeared into the dark page background, so
  // axis ticks and titles were invisible per user report.
  const axisTextColor = isDark ? "#E2E8F0" : "#2C2C2A";
  const axisGridColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";
  const sceneBgColor = isDark ? "rgba(20,24,40,0.55)" : "rgba(240,240,240,0.25)";
  const sceneGridColor = isDark ? "#3B4459" : "#D3D1C7";

  const [mode, setMode] = useState<"2d" | "3d">("2d");
  // Signed PCC threshold: a community remains visible iff its z >= threshold.
  // Range −0.5 … 0.5, default −0.5 = show everything. Earlier this used the
  // absolute value of z; switched to signed so users can isolate strong
  // positive correlations without losing negative ones at the extreme.
  const [pccThreshold, setPccThreshold] = useState<number>(-0.5);

  const visibleScatter = useMemo(() => {
    if (pccThreshold <= -0.5) return landscape.scatter;
    return landscape.scatter.filter((p) => p.z >= pccThreshold);
  }, [landscape.scatter, pccThreshold]);

  const scTarget = visibleScatter.filter((p) => p.is_target);
  const scOther  = visibleScatter.filter((p) => !p.is_target);

  const traces: any[] = mode === "2d" ? build2D() : build3D();

  function build2D(): any[] {
    const t: any[] = [];
    const g = landscape.grid;

    // 1. Filled smooth contour (heatmap-like)
    if (g) {
      t.push({
        type: "contour",
        x: g.xi,
        y: g.yi,
        z: g.z,
        colorscale: COLORSCALE_2D,
        zmin: -0.5,
        zmax: 0.5,
        contours: {
          coloring: "heatmap",
          showlabels: false,
          start: -0.5,
          end: 0.5,
          size: 0.001,
        },
        line: { width: 0, smoothing: 1.5 },
        ncontours: 200,
        colorbar: {
          title: { text: "avg(PCC)", side: "right" },
          len: 0.85,
          thickness: 14,
          tickvals: [-0.4, -0.2, 0, 0.2, 0.4],
          tickfont: { size: 10 },
        },
        hovertemplate: "x=%{x:.2f}  y=%{y:.2f}<br>PCC=%{z:.3f}<extra></extra>",
      });

      // 2. y = 1 reference line (significance cutoff for -log10(p))
      t.push({
        type: "scatter",
        mode: "lines",
        x: [g.xi[0], g.xi[g.xi.length - 1]],
        y: [1, 1],
        line: { color: REF_LINE_COLOR, width: 1.5, dash: "dash" },
        hoverinfo: "none",
        showlegend: false,
      });
    }

    // 3. Other community scatter — grey circles
    if (scOther.length > 0) {
      t.push({
        type: "scatter",
        mode: "markers",
        x: scOther.map((p) => p.x),
        y: scOther.map((p) => p.y),
        customdata: scOther.map((p) => p.community_id),
        marker: {
          size: 9,
          symbol: "circle",
          color: COLOR_OTHER_FILL,
          line: { width: 1.5, color: COLOR_OTHER_EDGE },
        },
        hovertemplate:
          "<b>community %{customdata}</b><br>x=%{x:.2f}  y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }

    // 4. Target community — amber cross marker only.
    //    Earlier this stacked a `text: "✚"` overlay on top of the marker,
    //    which read as two separate target indicators (the larger orange
    //    glyph and the smaller marker just below it). Per user feedback
    //    we only mark the target *community*; the target node itself
    //    does not get an extra glyph.
    if (scTarget.length > 0) {
      t.push({
        type: "scatter",
        mode: "markers",
        x: scTarget.map((p) => p.x),
        y: scTarget.map((p) => p.y),
        customdata: scTarget.map((p) => p.community_id),
        marker: {
          size: 16,
          symbol: "cross",
          color: COLOR_TARGET_FILL,
          line: { width: 2.5, color: COLOR_TARGET_EDGE },
        },
        hovertemplate:
          "<b>★ target community %{customdata}</b><br>x=%{x:.2f}  y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }

    return t;
  }

  function build3D(): any[] {
    const t: any[] = [];
    const g = landscape.grid;
    if (g) {
      t.push({
        type: "surface",
        x: g.xi,
        y: g.yi,
        z: g.z,
        colorscale: COLORSCALE_3D,
        cmin: -0.5,
        cmax: 0.5,
        opacity: 0.88,
        contours: { x: { show: false }, y: { show: false }, z: { show: false } },
        colorbar: {
          title: { text: "avg(PCC)", side: "right" },
          len: 0.6,
          thickness: 14,
        },
        hoverinfo: "none",
      });

      // y=1 reference line in 3D (along x at y=1, z=0)
      const xMin = g.xi[0];
      const xMax = g.xi[g.xi.length - 1];
      const xL: number[] = [];
      for (let i = 0; i < 50; i++) xL.push(xMin + (i * (xMax - xMin)) / 49);
      t.push({
        type: "scatter3d",
        mode: "lines",
        x: xL,
        y: xL.map(() => 1),
        z: xL.map(() => 0),
        line: { color: REF_LINE_COLOR, width: 3, dash: "dash" },
        showlegend: false,
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
        marker: {
          size: 5,
          color: "rgba(60,60,60,0.65)",
          line: { width: 1.5, color: "#FFFFFF" },
        },
        hovertemplate:
          "community %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
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
        textfont: { color: COLOR_TARGET_FILL, size: 20, family: "Arial Black" },
        marker: {
          size: 10,
          color: COLOR_TARGET_FILL,
          symbol: "cross",
          line: { width: 2, color: COLOR_TARGET_EDGE },
        },
        hovertemplate:
          "★ target community %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }
    return t;
  }

  const layout: any =
    mode === "2d"
      ? {
          margin: { l: 50, r: 80, t: 20, b: 50 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          height,
          font: { family: "Inter, system-ui, sans-serif", size: 11, color: axisTextColor },
          // 'event' only (no 'select') — Plotly's default 'event+select' makes
          // the first click toggle Plotly's internal selectedpoints, which can
          // race with our click dispatch on subsequent clicks (the symptom:
          // "first click works, later clicks ignored"). Force pure event mode.
          clickmode: "event" as const,
          dragmode: "zoom" as const,
          xaxis: {
            title: { text: landscape.axes.x ?? "Distance from anchor", font: { size: 11, color: axisTextColor } },
            autorange: "reversed" as const,
            gridcolor: axisGridColor,
            tickfont: { color: axisTextColor },
            zeroline: false,
          },
          yaxis: {
            title: { text: landscape.axes.y ?? "−log10(p)", font: { size: 11, color: axisTextColor } },
            gridcolor: axisGridColor,
            tickfont: { color: axisTextColor },
            zeroline: false,
          },
        }
      : {
          margin: { l: 0, r: 0, b: 0, t: 20 },
          paper_bgcolor: "rgba(0,0,0,0)",
          height,
          font: { family: "Inter, system-ui, sans-serif", size: 11, color: axisTextColor },
          clickmode: "event" as const,
          scene: {
            xaxis: {
              title: { text: landscape.axes.x ?? "x", font: { size: 10, color: axisTextColor } },
              autorange: "reversed" as const,
              gridcolor: sceneGridColor,
              tickfont: { color: axisTextColor },
              backgroundcolor: sceneBgColor,
              showbackground: true,
            },
            yaxis: {
              title: { text: landscape.axes.y ?? "y", font: { size: 10, color: axisTextColor } },
              gridcolor: sceneGridColor,
              tickfont: { color: axisTextColor },
              backgroundcolor: sceneBgColor,
              showbackground: true,
            },
            zaxis: {
              title: { text: landscape.axes.z ?? "z", font: { size: 10, color: axisTextColor } },
              range: [-0.5, 0.5],
              gridcolor: sceneGridColor,
              tickfont: { color: axisTextColor },
              backgroundcolor: sceneBgColor,
              showbackground: true,
            },
            camera: { eye: { x: 1.5, y: -1.5, z: 0.9 } },
            aspectmode: "manual" as const,
            aspectratio: { x: 1.2, y: 1, z: 0.8 },
          },
        };

  const totalPoints = landscape.scatter.length;
  const visibleCount = visibleScatter.length;

  const clampThreshold = (v: number) => {
    if (Number.isNaN(v)) return -0.5;
    return Math.max(-0.5, Math.min(0.5, v));
  };

  return (
    <div className="w-full">
      {/* Controls — rendered ABOVE the plot (not overlay) so they don't
          collide with Plotly's modebar (zoom/pan/etc) in the top-right. */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-meta text-ink-secondary">
        {/* 2D / 3D toggle */}
        <div className="flex gap-1 rounded-md overflow-hidden border border-line bg-surface-elevated">
          <button
            type="button"
            onClick={() => setMode("2d")}
            className={`px-2.5 py-1 transition-colors duration-fast ${
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
            className={`px-2.5 py-1 transition-colors duration-fast ${
              mode === "3d"
                ? "bg-brand-primary text-white"
                : "text-ink-secondary hover:text-ink-primary"
            }`}
            aria-pressed={mode === "3d"}
          >
            3D
          </button>
        </div>

        {/* PCC threshold — signed (−0.5 … 0.5), 0.001 step for fine tuning.
         *  Input widened so a 6-char value like "-0.345" is not clipped. */}
        <div
          className="flex items-center gap-2 rounded-md border border-line bg-surface-elevated px-2 py-1"
          title="avg(PCC) ≥ threshold 인 community 만 표시 (부호 그대로, 0.001 단위)"
        >
          <span className="whitespace-nowrap">PCC ≥</span>
          <input
            type="number"
            min={-0.5}
            max={0.5}
            step={0.001}
            value={pccThreshold.toFixed(3)}
            onChange={(e) => setPccThreshold(clampThreshold(parseFloat(e.target.value)))}
            className="w-20 tabular rounded border border-line bg-transparent px-1.5 py-0.5 text-ink-primary text-right focus:outline-none focus:border-brand-primary"
            aria-label="PCC threshold value"
          />
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.001}
            value={pccThreshold}
            onChange={(e) => setPccThreshold(parseFloat(e.target.value))}
            className="w-48 accent-brand-primary"
            aria-label="PCC threshold slider"
          />
          {pccThreshold > -0.5 && (
            <span className="text-ink-muted whitespace-nowrap">
              ({visibleCount}/{totalPoints})
            </span>
          )}
        </div>
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
          const hit = (evt.points ?? []).find(
            (pp: any) => typeof pp?.customdata === "number",
          ) as any;
          if (hit) onCommunityClick(hit.customdata as number);
        }}
      />
    </div>
  );
}
