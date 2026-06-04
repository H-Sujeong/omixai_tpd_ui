import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "@/hooks/useTheme";
import { useT } from "@/store/uiLang";
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

// Jet-style ramp for the 3D terrain: deep-blue valleys → green mid → red
// peaks. Color tracks height (z = avg PCC) so the relief reads like the
// reference landscape instead of a flat sheet.
const COLORSCALE_3D_JET: Array<[number, string]> = [
  [0.0,  "rgb(0,0,160)"],
  [0.12, "rgb(0,80,255)"],
  [0.35, "rgb(0,220,255)"],
  [0.5,  "rgb(0,225,120)"],
  [0.65, "rgb(170,255,0)"],
  [0.85, "rgb(255,150,0)"],
  [1.0,  "rgb(210,0,0)"],
];

const COLOR_TARGET_FILL = "#F59E0B";
const COLOR_TARGET_EDGE = "#92400E";
const COLOR_OTHER_FILL  = "rgba(80,80,80,0.7)";
const COLOR_OTHER_EDGE  = "#FFFFFF";
const REF_LINE_COLOR    = "#1F2937";

/**
 * Visual flag for the extra "target itself" glyph that sits on top of the
 * target-community marker (a larger ✚ text overlay).  Per user request the
 * landscape only highlights the target *community* by default — flip this
 * to `true` to bring the per-target glyph back without resurfacing all the
 * rendering branches.  Kept in code rather than wiring a UI toggle so the
 * decision lives in one place.
 */
const SHOW_TARGET_GLYPH = false;

export function Landscape({
  landscape,
  onCommunityClick,
  height = 380,
}: Props) {
  const t = useT();
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
  // Slider bounds are derived from the actual data — min and max of
  // landscape.scatter[].z — so users never see values that don't exist
  // in the plot. Base value is 0 (user preference); if 0 lies outside
  // the data range we clamp to the nearest bound via effectiveThreshold.
  const [pccThreshold, setPccThreshold] = useState<number>(0);
  // Distance (x = Distance from anchor) lower-bound filter: show only points
  // with x >= threshold. Default 0 clamps to data min (= no filter).
  const [distThreshold, setDistThreshold] = useState<number>(0);

  const [rangeMin, rangeMax] = useMemo(() => {
    if (landscape.scatter.length === 0) return [0, 0];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of landscape.scatter) {
      if (p.z < lo) lo = p.z;
      if (p.z > hi) hi = p.z;
    }
    return [lo, hi];
  }, [landscape.scatter]);

  const effectiveThreshold = Math.max(rangeMin, Math.min(rangeMax, pccThreshold));

  const [distMin, distMax] = useMemo(() => {
    if (landscape.scatter.length === 0) return [0, 0];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of landscape.scatter) {
      if (p.x < lo) lo = p.x;
      if (p.x > hi) hi = p.x;
    }
    return [lo, hi];
  }, [landscape.scatter]);

  const effectiveDist = Math.max(distMin, Math.min(distMax, distThreshold));

  const visibleScatter = useMemo(() => {
    // The target community (✚) is the anchor reference — always keep it
    // visible even when the PCC / distance filters would otherwise hide it.
    return landscape.scatter.filter(
      (p) => p.is_target || (p.z >= effectiveThreshold && p.x >= effectiveDist),
    );
  }, [landscape.scatter, effectiveThreshold, effectiveDist]);

  const scTarget = visibleScatter.filter((p) => p.is_target);
  const scOther  = visibleScatter.filter((p) => !p.is_target);

  // Some assets carry no target community at all (the target protein is absent
  // from the PPI data). Flag it honestly instead of silently omitting the ✚.
  const dataHasTarget = landscape.scatter.some((p) => p.is_target);

  // -log10(p) outlier clip. Degenerate p≈0 communities (p underflowed to 0 →
  // -log10(p) capped at ~300) blow the y-axis out and squash every real point
  // against the back plane. Clip the y-axis to a Tukey upper fence of the
  // scatter's y so the real terrain is visible; outliers fall off-screen.
  const yClip = useMemo<[number, number] | null>(() => {
    const ys = landscape.scatter
      .map((p) => p.y)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (ys.length < 4) return null;
    const q = (f: number) => ys[Math.max(0, Math.min(ys.length - 1, Math.round(f * (ys.length - 1))))];
    const q1 = q(0.25);
    const q3 = q(0.75);
    // Far-outlier fence (3×IQR): drops only the degenerate p≈0 cap points, keeps
    // genuinely significant communities. Clip just above the highest in-fence
    // point so it isn't glued to the top edge.
    const fence = Math.max(q3 + 3 * (q3 - q1), q3 * 1.2, 2);
    const dataMax = ys[ys.length - 1];
    const inMax = Math.max(...ys.filter((v) => v <= fence));
    if (inMax >= dataMax) return null; // no real outliers → don't clip
    const lo = Math.min(ys[0], 0);
    const pad = (inMax - lo) * 0.05 || 0.5;
    return [lo, inMax + pad];
  }, [landscape.scatter]);

  // Grid cells outside the data hull were filled with exactly 0 (a flat fake
  // plane). Render them as gaps (null) so only the real interpolated terrain
  // shows — not a sheet plastered across the whole axis box.
  const maskedZ = useMemo<(number | null)[][] | null>(() => {
    const g = landscape.grid;
    if (!g) return null;
    return g.z.map((row) => row.map((v) => (v === 0 ? null : v)));
  }, [landscape.grid]);

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
        z: maskedZ ?? g.z,
        connectgaps: false,
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

    // 4. Target community marker.  When SHOW_TARGET_GLYPH is on a larger
    //    ✚ text overlay rides on top to also highlight the target node
    //    itself; default is off, so by default only the community is
    //    marked.  All overlay-related props are still passed when the
    //    flag is on, just to keep the code path warm.
    if (scTarget.length > 0) {
      const trace: any = {
        type: "scatter",
        mode: SHOW_TARGET_GLYPH ? "markers+text" : "markers",
        x: scTarget.map((p) => p.x),
        y: scTarget.map((p) => p.y),
        customdata: scTarget.map((p) => p.community_id),
        marker: {
          size: SHOW_TARGET_GLYPH ? 14 : 16,
          symbol: "cross",
          color: COLOR_TARGET_FILL,
          line: { width: 2.5, color: COLOR_TARGET_EDGE },
        },
        hovertemplate:
          "<b>★ target community %{customdata}</b><br>x=%{x:.2f}  y=%{y:.2f}<extra></extra>",
        showlegend: false,
      };
      if (SHOW_TARGET_GLYPH) {
        trace.text = scTarget.map(() => "✚");
        trace.textposition = "top center";
        trace.textfont = { size: 16, color: COLOR_TARGET_FILL };
      }
      t.push(trace);
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
        z: maskedZ ?? g.z,
        connectgaps: false,
        colorscale: COLORSCALE_3D_JET,
        // Tie the jet ramp to the real community avg(PCC) range (scatter z) so a
        // single off-screen outlier valley can't wash the visible terrain into
        // one flat color.
        cmin: rangeMin,
        cmax: rangeMax,
        cauto: false,
        opacity: 1,
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
          size: 4,
          color: "rgba(30,30,30,0.85)",
          line: { width: 1, color: "rgba(255,255,255,0.9)" },
        },
        hovertemplate:
          "community %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      });
    }
    if (scTarget.length > 0) {
      const trace: any = {
        type: "scatter3d",
        mode: SHOW_TARGET_GLYPH ? "markers+text" : "markers",
        x: scTarget.map((p) => p.x),
        y: scTarget.map((p) => p.y),
        z: scTarget.map((p) => p.z),
        customdata: scTarget.map((p) => p.community_id),
        marker: {
          size: SHOW_TARGET_GLYPH ? 10 : 11,
          color: COLOR_TARGET_FILL,
          symbol: "cross",
          line: { width: 2, color: COLOR_TARGET_EDGE },
        },
        hovertemplate:
          "★ target community %{customdata}<br>x=%{x:.2f} y=%{y:.2f}<extra></extra>",
        showlegend: false,
      };
      if (SHOW_TARGET_GLYPH) {
        trace.text = scTarget.map(() => "+");
        trace.textfont = { color: COLOR_TARGET_FILL, size: 20, family: "Arial Black" };
      }
      t.push(trace);
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
          // Keep the user's zoom/pan across community-click / slider updates.
          uirevision: "landscape-2d",
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
            ...(yClip ? { range: yClip, autorange: false as const } : {}),
          },
        }
      : {
          margin: { l: 0, r: 0, b: 0, t: 20 },
          paper_bgcolor: "rgba(0,0,0,0)",
          height,
          font: { family: "Inter, system-ui, sans-serif", size: 11, color: axisTextColor },
          clickmode: "event" as const,
          // Preserve the user's camera across slider/community updates; the
          // explicit camera below is only the initial fixed-start view.
          uirevision: "landscape-3d",
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
              ...(yClip ? { range: yClip, autorange: false as const } : {}),
            },
            zaxis: {
              title: { text: landscape.axes.z ?? "z", font: { size: 10, color: axisTextColor } },
              // Autorange (no fixed [-0.5,0.5]) so the small avg-PCC relief
              // (~±0.13) fills the vertical and reads as real terrain.
              autorange: true,
              gridcolor: sceneGridColor,
              tickfont: { color: axisTextColor },
              backgroundcolor: sceneBgColor,
              showbackground: true,
            },
            // Low grazing start view (user-fixed): looks across the surface so
            // the target-community spike, the above/below-zero peaks, and the
            // PCC height profile are all readable at a glance.
            camera: { eye: { x: 1.35, y: -1.35, z: 0.32 } },
            aspectmode: "manual" as const,
            aspectratio: { x: 1.2, y: 1, z: 0.8 },
          },
        };

  const totalPoints = landscape.scatter.length;
  const visibleCount = visibleScatter.length;
  // Communities pushed off the top of the clipped −log10(p) axis (degenerate
  // p≈0). Reported honestly rather than silently dropped.
  const yClippedCount = yClip ? visibleScatter.filter((p) => p.y > yClip[1]).length : 0;

  const clampThreshold = (v: number) => {
    if (Number.isNaN(v)) return effectiveThreshold;
    return Math.max(rangeMin, Math.min(rangeMax, v));
  };
  const clampDist = (v: number) => {
    if (Number.isNaN(v)) return effectiveDist;
    return Math.max(distMin, Math.min(distMax, v));
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

        {/* PCC threshold — signed, 0.001 step. Slider bounds derived from
         *  actual data min/max so users never see values that don't exist
         *  in the current landscape. */}
        <div
          className="flex items-center gap-2 rounded-md border border-line bg-surface-elevated px-2 py-1"
          title={t(
            `avg(PCC) ≥ threshold 인 community 만 표시 (data range: ${rangeMin.toFixed(3)} … ${rangeMax.toFixed(3)})`,
            `Show only communities with avg(PCC) ≥ threshold (data range: ${rangeMin.toFixed(3)} … ${rangeMax.toFixed(3)})`,
          )}
        >
          <span className="whitespace-nowrap">PCC ≥</span>
          <input
            type="number"
            min={rangeMin}
            max={rangeMax}
            step={0.001}
            value={effectiveThreshold.toFixed(3)}
            onChange={(e) => setPccThreshold(clampThreshold(parseFloat(e.target.value)))}
            className="w-20 tabular rounded border border-line bg-transparent px-1.5 py-0.5 text-ink-primary text-right focus:outline-none focus:border-brand-primary"
            aria-label="PCC threshold value"
          />
          <input
            type="range"
            min={rangeMin}
            max={rangeMax}
            step={0.001}
            value={effectiveThreshold}
            onChange={(e) => setPccThreshold(parseFloat(e.target.value))}
            className="w-40 accent-brand-primary"
            aria-label="PCC threshold slider"
          />
        </div>

        {/* Distance (x) lower-bound filter — show only far-enough communities */}
        <div
          className="flex items-center gap-2 rounded-md border border-line bg-surface-elevated px-2 py-1"
          title={t(
            `Distance from anchor ≥ threshold 인 community 만 표시 (data range: ${distMin.toFixed(2)} … ${distMax.toFixed(2)})`,
            `Show only communities with distance from anchor ≥ threshold (data range: ${distMin.toFixed(2)} … ${distMax.toFixed(2)})`,
          )}
        >
          <span className="whitespace-nowrap">Dist ≥</span>
          <input
            type="number"
            min={distMin}
            max={distMax}
            step={0.01}
            value={effectiveDist.toFixed(2)}
            onChange={(e) => setDistThreshold(clampDist(parseFloat(e.target.value)))}
            className="w-16 tabular rounded border border-line bg-transparent px-1.5 py-0.5 text-ink-primary text-right focus:outline-none focus:border-brand-primary"
            aria-label="Distance threshold value"
          />
          <input
            type="range"
            min={distMin}
            max={distMax}
            step={0.01}
            value={effectiveDist}
            onChange={(e) => setDistThreshold(parseFloat(e.target.value))}
            className="w-40 accent-brand-primary"
            aria-label="Distance threshold slider"
          />
        </div>

        {visibleCount < totalPoints && (
          <span className="text-ink-muted whitespace-nowrap">
            ({visibleCount}/{totalPoints})
          </span>
        )}
        {yClippedCount > 0 && (
          <span
            className="text-ink-muted whitespace-nowrap"
            title={t(
              "−log10(p)가 비정상적으로 큰(p≈0) community는 축 범위 밖으로 잘림",
              "Communities with degenerate −log10(p) (p≈0) are clipped beyond the axis range",
            )}
          >
            {t(`−log10(p) 축 밖 ${yClippedCount}개`, `${yClippedCount} beyond −log10(p) axis`)}
          </span>
        )}
      </div>

      {!dataHasTarget && landscape.scatter.length > 0 && (
        <div
          className="mb-2 text-meta text-ink-muted"
          title={t(
            "on_target.json 의 PPI 데이터에 target 단백질 노드가 없어 target community(✚)를 표시할 수 없음",
            "The PPI data in on_target.json has no target protein node, so the target community (✚) cannot be shown",
          )}
        >
          {t(
            "ⓘ target community 미표시 — 이 약물의 PPI 데이터에 target 단백질이 없습니다.",
            "ⓘ Target community not shown — this drug's PPI data has no target protein.",
          )}
        </div>
      )}

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
