import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "@/hooks/useTheme";
import { useT } from "@/store/uiLang";
import type { LandscapeNode, LandscapePanel } from "@/types/api";

interface Props {
  landscape: LandscapePanel;
  /** Primary target protein name (for the "no target community" note). */
  targetName?: string | null;
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

// Lone-peak red for the self-anchor marker (matches the colorscale's high end:
// the target's self-correlation is 1, so it reads as a red peak).
const COLOR_SELF_ANCHOR = "#DC2626";

// Self-anchor: the RBF grid only covers the community x-range (starts at x.min >
// 0), so the origin (where the lone target peak sits) is a bare white gap that
// reads as "cut off" and tone-mismatched against the contour. Pad the grid down
// to the origin with a FLAT z = 0 plain (neutral colour = "no value") so the
// peak sits on a continuous plain rather than floating. Two extra columns/rows
// keep the plain flat, then a thin transition into the real data edge.
function extendGridFlat(
  g: { xi: number[]; yi: number[]; z: number[][] },
): { xi: number[]; yi: number[]; z: number[][] } {
  const addX = g.xi.length > 0 && g.xi[0] > 0;
  const addY = g.yi.length > 0 && g.yi[0] > 0;
  if (!addX && !addY) return g;
  let xi = g.xi.slice();
  let yi = g.yi.slice();
  let z = g.z.map((row) => row.slice());
  if (addX) {
    const xEdge = xi[0] * 0.98;
    z = z.map((row) => [0, 0, ...row]);
    xi = [0, xEdge, ...xi];
  }
  if (addY) {
    const yEdge = yi[0] * 0.98;
    const zeroRow = () => xi.map(() => 0);
    z = [zeroRow(), zeroRow(), ...z];
    yi = [0, yEdge, ...yi];
  }
  return { xi, yi, z };
}

export function Landscape({
  landscape,
  targetName,
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

  // Protein locator: users often don't know the exact symbol, so instead of a
  // blind text search we open a slide-in panel that LISTS every searchable
  // protein (search filters the list). Picking one highlights its community on
  // the landscape + shows a small card with the community id + hops-from-hub.
  const [listOpen, setListOpen] = useState<boolean>(false);
  const [listQuery, setListQuery] = useState<string>("");
  const [foundNode, setFoundNode] = useState<LandscapeNode | null>(null);
  const proteinList = useMemo(
    () => [...(landscape.node_index ?? [])].sort((a, b) =>
      a.protein.localeCompare(b.protein)),
    [landscape.node_index],
  );
  const filteredProteins = useMemo(() => {
    const q = listQuery.trim().toUpperCase();
    return q ? proteinList.filter((n) => n.protein.toUpperCase().includes(q)) : proteinList;
  }, [proteinList, listQuery]);

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
  // Symmetric color limit so 0 = neutral (white/green centre) and the scale is
  // tightened to the real data range (the old ±0.5 washed everything out).
  const zlim = Math.max(Math.abs(rangeMin), Math.abs(rangeMax)) || 0.5;

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
  // Precomputed here because inside build2D/build3D the local `t` is the traces
  // array (shadows the useT() translator).
  const selfAnchorLabel = t(
    "target (self-anchor · 거리 0 · self-corr 1)",
    "target (self-anchor · distance 0 · self-corr 1)",
  );
  // When there is NO target community in the scatter (the target protein isn't
  // anchored in a PPI module — isolated_in_ppi OR absent_from_ppi), we can still
  // plot the TARGET ITSELF: distance 0 from itself, self-correlation 1 → the
  // origin (0,0,1), NOT (0,0,0). The grid is extended down to it (build2D/3D) so
  // the surface stays connected, and the marker is drawn unconditionally — the
  // PCC / distance sliders never remove it.
  const selfAnchor = scTarget.length === 0;
  const anchorPoint = selfAnchor ? { x: 0, y: 0, z: 1 } : null;

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

  const traces: any[] = mode === "2d" ? build2D() : build3D();

  function build2D(): any[] {
    const t: any[] = [];
    // Self-anchor: pad the grid to the origin with a FLAT z = 0 plain so the
    // lone peak sits on a continuous "no-value" field (tone-matched to the
    // contour) instead of floating over a bare white gap.
    const g = landscape.grid && selfAnchor ? extendGridFlat(landscape.grid) : landscape.grid;

    // 1. Filled smooth contour — color on the plane (v1), normalized to the
    //    real data range (symmetric, 0 = neutral) so differences show.
    if (g) {
      t.push({
        type: "contour",
        x: g.xi,
        y: g.yi,
        z: g.z,
        colorscale: COLORSCALE_2D,
        zmin: -zlim,
        zmax: zlim,
        contours: {
          coloring: "heatmap",
          showlabels: false,
          start: -zlim,
          end: zlim,
          size: (2 * zlim) / 100 || 0.001,
        },
        line: { width: 0, smoothing: 1.5 },
        ncontours: 100,
        colorbar: {
          title: { text: "avg(PCC)", side: "right" },
          len: 0.85,
          thickness: 14,
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

    // 4. Target community marker — real = filled yellow cross; absent = hollow
    //    pseudo cross at the would-be target position.
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
    } else if (anchorPoint) {
      // No target community → the target is a LONE peak at the origin (z = 1,
      // self-correlation). A single red point; the surrounding area stays empty
      // because there genuinely is no data there.
      t.push({
        type: "scatter",
        mode: "markers",
        x: [anchorPoint.x],
        y: [anchorPoint.y],
        marker: {
          size: 16,
          symbol: "diamond",
          color: COLOR_SELF_ANCHOR,
          line: { width: 2, color: "#FFFFFF" },
        },
        hovertemplate: `<b>${selfAnchorLabel}</b><br>PCC=1 (self)  x=%{x:.2f}  y=%{y:.2f}<extra></extra>`,
        showlegend: false,
      });
    }

    // Protein-search highlight — ring on the found protein's community point.
    if (foundNode) {
      t.push({
        type: "scatter",
        mode: "markers",
        x: [foundNode.x],
        y: [foundNode.y],
        marker: {
          size: 22,
          symbol: "circle-open",
          color: "#D946EF",
          line: { width: 3, color: "#D946EF" },
        },
        hovertemplate: `<b>${foundNode.protein}</b> · community ${foundNode.community_id}<extra></extra>`,
        showlegend: false,
      });
    }

    return t;
  }

  function build3D(): any[] {
    const t: any[] = [];
    // Self-anchor: pad the grid to the origin with a FLAT z = 0 plain so the
    // lone peak sits on a continuous "no-value" field (tone-matched to the
    // contour) instead of floating over a bare white gap.
    const g = landscape.grid && selfAnchor ? extendGridFlat(landscape.grid) : landscape.grid;

    // Surface — color on the plane (v1), normalized to the real data range.
    if (g) {
      t.push({
        type: "surface",
        x: g.xi,
        y: g.yi,
        z: g.z,
        colorscale: COLORSCALE_3D_JET,
        cmin: -zlim,
        cmax: zlim,
        cauto: false,
        opacity: 1,
        contours: { x: { show: false }, y: { show: false }, z: { show: false } },
        colorbar: { title: { text: "avg(PCC)", side: "right" }, len: 0.6, thickness: 14 },
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
    } else if (anchorPoint) {
      // No target community → a LONE sharp peak at the origin: a thin red spike
      // rising from the floor to z = 1, with nothing around it.
      t.push({
        type: "scatter3d",
        mode: "lines",
        x: [anchorPoint.x, anchorPoint.x],
        y: [anchorPoint.y, anchorPoint.y],
        z: [0, anchorPoint.z],
        line: { color: COLOR_SELF_ANCHOR, width: 6 },
        hoverinfo: "none",
        showlegend: false,
      });
      t.push({
        type: "scatter3d",
        mode: "markers",
        x: [anchorPoint.x],
        y: [anchorPoint.y],
        z: [anchorPoint.z],
        marker: { size: 6, color: COLOR_SELF_ANCHOR, symbol: "diamond" },
        hovertemplate: `${selfAnchorLabel}<br>PCC=1 (self)<extra></extra>`,
        showlegend: false,
      });
    }

    // Protein-search highlight — ring on the found protein's community point.
    if (foundNode) {
      t.push({
        type: "scatter3d",
        mode: "markers",
        x: [foundNode.x],
        y: [foundNode.y],
        z: [foundNode.z],
        marker: {
          size: 9,
          symbol: "circle-open",
          color: "#D946EF",
          line: { width: 3, color: "#D946EF" },
        },
        hovertemplate: `${foundNode.protein} · community ${foundNode.community_id}<extra></extra>`,
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
          // Keep the user's zoom/pan across community-click / slider updates.
          uirevision: "landscape-2d",
          dragmode: "zoom" as const,
          xaxis: {
            title: { text: landscape.axes.x ?? "Distance from anchor", font: { size: 11, color: axisTextColor } },
            // Normal (not reversed): low Distance-from-anchor — where the target
            // community sits — goes to the bottom-left/origin.
            autorange: true as const,
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
          // (bumped to -v2 so the new lower-left orientation actually applies.)
          uirevision: "landscape-3d-v2",
          scene: {
            xaxis: {
              title: { text: landscape.axes.x ?? "x", font: { size: 10, color: axisTextColor } },
              // Reversed so low Distance-from-anchor — where the target sits —
              // lands at the front-LEFT with the original camera (normal put it
              // on the right).
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
            // Low grazing start view (original framing — a mirrored eye.x
            // cropped the scene). Target lands front-left via the reversed
            // Distance axis below, not via the camera.
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

        {/* Protein locator — opens the slide-in list (search is inside it) */}
        {proteinList.length > 0 && (
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors duration-fast ${
              listOpen
                ? "bg-brand-primary text-white border-brand-primary"
                : "border-line bg-surface-elevated hover:text-ink-primary"
            }`}
            aria-expanded={listOpen}
          >
            🔍 {t("단백질 찾기", "Find protein")}
            <span className={listOpen ? "opacity-80" : "text-ink-muted"}>
              ({proteinList.length})
            </span>
          </button>
        )}

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
          className="mb-2 text-body font-semibold text-ink-secondary"
          title={t(
            "타깃 단백질이 size>20 PPI 커뮤니티 중 어디에도 멤버로 들어가지 못해 target community(✚)가 없음 (self-anchor로 원점에 표시)",
            "The target protein is not a member of any size>20 PPI community, so there is no target community (✚) — it is shown at the origin as a self-anchor",
          )}
        >
          {t(
            `ⓘ target community 미표시 — 현재 타겟 단백질 ${targetName ?? "?"}는 검출된 커뮤니티에 속한 곳이 없습니다.`,
            `ⓘ Target community not shown — the target protein ${targetName ?? "?"} does not belong to any detected community.`,
          )}
        </div>
      )}

      <div className="relative">
        {/* Protein-search result card — small opaque popup. */}
        {foundNode && (
          <div className="absolute left-2 top-2 z-10 w-56 rounded-md border border-line bg-surface-elevated/95 backdrop-blur px-3 py-2.5 shadow-lg text-meta">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-ink-primary text-body">
                {foundNode.protein}
              </span>
              <button
                type="button"
                onClick={() => setFoundNode(null)}
                className="text-ink-muted hover:text-ink-primary"
                aria-label={t("닫기", "Close")}
              >
                ✕
              </button>
            </div>
            <ul className="mt-1.5 space-y-1 text-ink-secondary">
              <li>
                {t("소속 community", "community")} ·{" "}
                <span className="font-semibold text-ink-primary">{foundNode.community_id}</span>
              </li>
              <li
                title={t(
                  "hop = community 내부 PPI 엣지를 따라 hub(=최다연결 단백질)까지의 최단 경로 길이(엣지 수)",
                  "hop = shortest-path length (edges) to the community hub (its highest-degree protein), along PPI edges inside the community",
                )}
              >
                {foundNode.hops != null ? (
                  <>
                    {t("중심", "hub")}(<span className="font-mono">{foundNode.center}</span>){t("에서", " ·")}{" "}
                    <span className="font-semibold text-ink-primary">{foundNode.hops}</span> hop
                  </>
                ) : (
                  <span className="text-status-warning">
                    {t(
                      `중심(${foundNode.center})과 PPI 연결 없음`,
                      `no PPI link to the hub (${foundNode.center})`,
                    )}
                  </span>
                )}
              </li>
            </ul>
          </div>
        )}
        {/* Protein list slide-in — search inside, click to highlight community */}
        <div
          className={`absolute inset-y-0 right-0 z-20 flex w-64 max-w-[80%] flex-col border-l border-line bg-surface-panel shadow-xl transition-transform duration-base ${
            listOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-body font-semibold text-ink-primary">
              {t("단백질 목록", "Proteins")}
            </span>
            <button
              type="button"
              onClick={() => setListOpen(false)}
              className="text-ink-muted hover:text-ink-primary"
              aria-label={t("닫기", "Close")}
            >
              ✕
            </button>
          </div>
          <div className="border-b border-line p-2">
            <input
              type="text"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={t("검색…", "Search…")}
              className="w-full rounded border border-line bg-transparent px-2 py-1 text-meta text-ink-primary focus:border-brand-primary focus:outline-none"
              aria-label={t("단백질 검색", "Search proteins")}
            />
          </div>
          <ul className="flex-1 overflow-y-auto text-meta">
            {filteredProteins.slice(0, 300).map((n) => (
              <li key={`${n.protein}-${n.community_id}`}>
                <button
                  type="button"
                  onClick={() => setFoundNode(n)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-fast hover:bg-surface-soft ${
                    foundNode?.protein === n.protein ? "bg-surface-soft" : ""
                  }`}
                >
                  <span className="truncate font-mono text-ink-primary">{n.protein}</span>
                  <span className="shrink-0 text-ink-muted">
                    c{n.community_id}
                    {n.hops != null ? ` · ${n.hops}h` : ""}
                  </span>
                </button>
              </li>
            ))}
            {filteredProteins.length === 0 && (
              <li className="px-3 py-2 text-ink-muted">{t("결과 없음", "No matches")}</li>
            )}
            {filteredProteins.length > 300 && (
              <li className="px-3 py-2 text-ink-muted">
                {t(
                  `+${filteredProteins.length - 300}개 더 — 검색으로 좁히세요`,
                  `+${filteredProteins.length - 300} more — narrow via search`,
                )}
              </li>
            )}
          </ul>
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
    </div>
  );
}
