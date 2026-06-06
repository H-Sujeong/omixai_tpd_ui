import { useEffect, useMemo, useState } from "react";
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
 *   - dashed reference line at the p = 0.05 significance cutoff (−log10 p ≈ 1.30)
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
const COLOR_OTHER_EDGE  = "#FFFFFF";
const REF_LINE_COLOR    = "#1F2937";
// Significance cutoff drawn as the dashed reference line: p = 0.05 →
// −log10(0.05) ≈ 1.301 (was p = 0.1 at y = 1).
const SIG_P = 0.05;
const SIG_Y = -Math.log10(SIG_P);

// Surface interpolation. We do NOT use the pipeline's gaussian-RBF
// `landscape.grid`: RBF overshoots between data points (grid max ~1.09 vs real
// community PCC max ~0.55), inventing tall spikes that are no community, and it
// 0-fills outside the data hull. Instead we re-interpolate from the community
// points with pure Nadaraya–Watson kernel smoothing (z = Σwz / Σw) — a weighted
// AVERAGE, so it is mathematically bounded by the data range (no overshoot) and,
// with no baseline term, does NOT damp peaks. Cells with no nearby data return
// null → the surface is blank there (honest: no data, no fabricated plain).
function kernelSurface(
  pts: { x: number; y: number; z: number }[],
  xlo: number,
  xhi: number,
  ylo: number,
  yhi: number,
  n = 60,
): { xi: number[]; yi: number[]; z: (number | null)[][] } {
  const xi = Array.from({ length: n }, (_, i) => xlo + (i * (xhi - xlo)) / (n - 1));
  const yi = Array.from({ length: n }, (_, j) => ylo + (j * (yhi - ylo)) / (n - 1));
  const sx = (xhi - xlo) * 0.05 || 1;
  const sy = (yhi - ylo) * 0.05 || 1;
  const ax = 1 / (2 * sx * sx);
  const ay = 1 / (2 * sy * sy);
  const CUT = 0.05; // nearest-point weight below this ⇒ no data here ⇒ blank
  const z: (number | null)[][] = [];
  for (let j = 0; j < n; j++) {
    const gy = yi[j];
    const row: (number | null)[] = [];
    for (let i = 0; i < n; i++) {
      const gx = xi[i];
      let wsum = 0;
      let zsum = 0;
      let wmax = 0;
      for (let k = 0; k < pts.length; k++) {
        const dx = gx - pts[k].x;
        const dy = gy - pts[k].y;
        const w = Math.exp(-(dx * dx * ax + dy * dy * ay));
        wsum += w;
        zsum += w * pts[k].z;
        if (w > wmax) wmax = w;
      }
      row.push(wmax < CUT ? null : zsum / wsum);
    }
    z.push(row);
  }
  return { xi, yi, z };
}

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

export function Landscape({
  landscape,
  targetName,
  highlightCommunity,
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

  // Drag-mode toggle (both 2D and 3D): default = pan (translate); holding
  // Shift switches to the secondary action — orbit (rotate) in 3D, box zoom
  // in 2D. Plotly locks the drag handler in at mousedown, so the change takes
  // effect on the NEXT drag, not the current one.
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Shift") setIsShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === "Shift") setIsShiftHeld(false); };
    const onBlur = () => setIsShiftHeld(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
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

  // Community picker — selecting a peak by clicking is painful in 3D when points
  // overlap/cluster, so offer a dropdown (and ring the selection on the plot).
  // Listed from `visibleScatter` so the options track the PCC / distance filters.
  const communityOptions = useMemo(() => {
    const seen = new Set<number>();
    const out: { id: number; size: number; z: number; isTarget: boolean }[] = [];
    for (const p of visibleScatter) {
      if (seen.has(p.community_id)) continue;
      seen.add(p.community_id);
      out.push({ id: p.community_id, size: p.size, z: p.z, isTarget: p.is_target });
    }
    return out.sort((a, b) => a.id - b.id);
  }, [visibleScatter]);
  const selectedCommunityPoint = useMemo(
    () =>
      highlightCommunity == null
        ? null
        : landscape.scatter.find((p) => p.community_id === highlightCommunity) ?? null,
    [landscape.scatter, highlightCommunity],
  );

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
  // anchored in a PPI module), still plot the TARGET ITSELF: distance 0 from
  // itself (x=0), self-correlation 1 (z=1). For y (−log10 p) we use the
  // pipeline's `target_point` when it is the real self-anchor
  // (source="target_node_self", y=−log10(self_p), a HIGH-significance value) —
  // NOT y=0, which would wrongly drop the most-significant point below the line.
  // Falls back to y=0 only for the placeholder/absent case.
  const selfAnchor = scTarget.length === 0;
  const anchorPoint = useMemo(() => {
    if (!selfAnchor) return null;
    const tp = landscape.target_point;
    const y =
      tp && tp.source === "target_node_self" && Number.isFinite(tp.y) ? Number(tp.y) : 0;
    return { x: 0, y, z: 1 };
  }, [selfAnchor, landscape.target_point]);

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

  // Re-interpolated surface (Nadaraya–Watson) from the real community points,
  // replacing the overshooting pipeline RBF grid. Domain = data hull, extended
  // to the origin for the self-anchor case so the axis reaches the lone peak
  // (cells with no nearby data render blank, not a fabricated plain).
  const surfaceGrid = useMemo(() => {
    const pts = landscape.scatter.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z),
    );
    if (pts.length === 0) return landscape.grid; // fallback to whatever exists
    let xlo = Math.min(...pts.map((p) => p.x));
    let xhi = Math.max(...pts.map((p) => p.x));
    let ylo = yClip ? yClip[0] : Math.min(...pts.map((p) => p.y));
    let yhi = yClip ? yClip[1] : Math.max(...pts.map((p) => p.y));
    if (selfAnchor) {
      xlo = Math.min(0, xlo);
      ylo = Math.min(0, ylo);
    }
    if (xhi <= xlo) xhi = xlo + 1;
    if (yhi <= ylo) yhi = ylo + 1;
    return kernelSurface(pts, xlo, xhi, ylo, yhi);
  }, [landscape.scatter, landscape.grid, yClip, selfAnchor]);

  const traces: any[] = mode === "2d" ? build2D() : build3D();

  function build2D(): any[] {
    const t: any[] = [];
    // Self-anchor: pad the grid to the origin with a FLAT z = 0 plain so the
    // lone peak sits on a continuous "no-value" field (tone-matched to the
    // contour) instead of floating over a bare white gap.
    const g = surfaceGrid;

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
          // Discrete bands (not a continuous heatmap) so each PCC level reads as
          // a distinct layer and communities separate visually. ~12 bands.
          coloring: "fill",
          showlabels: false,
          start: -zlim,
          end: zlim,
          size: (2 * zlim) / 12 || 0.05,
        },
        // Thin contour lines between bands sharpen the layering (was width:0).
        line: { width: 0.6, color: "rgba(40,40,40,0.3)", smoothing: 1.3 },
        colorbar: {
          title: { text: "avg(PCC)", side: "right" },
          len: 0.85,
          thickness: 14,
          tickfont: { size: 10 },
        },
        hovertemplate: "x=%{x:.2f}  y=%{y:.2f}<br>PCC=%{z:.3f}<extra></extra>",
      });

      // 2. p = 0.05 reference line (−log10 p ≈ 1.30) — empirical, uncorrected
      t.push({
        type: "scatter",
        mode: "lines",
        x: [g.xi[0], g.xi[g.xi.length - 1]],
        y: [SIG_Y, SIG_Y],
        line: { color: REF_LINE_COLOR, width: 1.5, dash: "dash" },
        hovertemplate: `p = ${SIG_P} reference (−log10 p = ${SIG_Y.toFixed(2)})<extra></extra>`,
        showlegend: false,
      });
    }

    // 3. Other community scatter — small dots colored by PCC (red/blue), same
    //    scale as the surface, with a white ring so they stay legible on top of
    //    the filled bands. This restores the "find the community by color" cue.
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
          color: scOther.map((p) => p.z),
          colorscale: COLORSCALE_2D,
          cmin: -zlim,
          cmax: zlim,
          showscale: false,
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

    // Selected-community ring (from the dropdown / click) — amber.
    if (selectedCommunityPoint) {
      t.push({
        type: "scatter",
        mode: "markers",
        x: [selectedCommunityPoint.x],
        y: [selectedCommunityPoint.y],
        marker: {
          size: 26,
          symbol: "circle-open",
          color: "#F59E0B",
          line: { width: 3, color: "#F59E0B" },
        },
        hovertemplate: `<b>community ${selectedCommunityPoint.community_id}</b> · selected<extra></extra>`,
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
    const g = surfaceGrid;

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

      // p = 0.05 reference line (−log10 p ≈ 1.30), z=0 — empirical, uncorrected
      const xMin = g.xi[0];
      const xMax = g.xi[g.xi.length - 1];
      const xL: number[] = [];
      for (let i = 0; i < 50; i++) xL.push(xMin + (i * (xMax - xMin)) / 49);
      t.push({
        type: "scatter3d",
        mode: "lines",
        x: xL,
        y: xL.map(() => SIG_Y),
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

    // Selected-community marker (from the dropdown / click) — amber. A vertical
    // stem from the floor pins the exact peak so it's unmistakable among
    // clustered/overshooting spikes, and the marker is colour-coded by its PCC.
    if (selectedCommunityPoint) {
      t.push({
        type: "scatter3d",
        mode: "lines",
        x: [selectedCommunityPoint.x, selectedCommunityPoint.x],
        y: [selectedCommunityPoint.y, selectedCommunityPoint.y],
        z: [0, selectedCommunityPoint.z],
        line: { color: "#F59E0B", width: 6 },
        hoverinfo: "none",
        showlegend: false,
      });
      t.push({
        type: "scatter3d",
        mode: "markers",
        x: [selectedCommunityPoint.x],
        y: [selectedCommunityPoint.y],
        z: [selectedCommunityPoint.z],
        marker: {
          size: 9,
          symbol: "diamond",
          color: "#F59E0B",
          line: { width: 2, color: "#92400E" },
        },
        hovertemplate: `community ${selectedCommunityPoint.community_id} · PCC ${selectedCommunityPoint.z.toFixed(2)}<extra></extra>`,
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

  // 3D scene arrow annotations — clustered peaks are hard to tell apart by a
  // ring alone, so point at the selected community / found protein with an arrow
  // (3D only; the 2D ring is already legible flat-on).
  const scene3dAnnotations: any[] = [];
  if (mode === "3d") {
    if (selectedCommunityPoint) {
      scene3dAnnotations.push({
        x: selectedCommunityPoint.x,
        y: selectedCommunityPoint.y,
        z: selectedCommunityPoint.z,
        text: `community ${selectedCommunityPoint.community_id} · PCC ${selectedCommunityPoint.z.toFixed(2)}`,
        showarrow: true, arrowhead: 2, arrowsize: 1.3, arrowwidth: 2.5,
        arrowcolor: "#F59E0B", ax: 42, ay: -55, borderpad: 2,
        font: { color: "#B45309", size: 11 },
        bgcolor: "rgba(255,255,255,0.9)", bordercolor: "#F59E0B",
      });
    }
    if (foundNode) {
      scene3dAnnotations.push({
        x: foundNode.x,
        y: foundNode.y,
        z: foundNode.z,
        text: foundNode.protein,
        showarrow: true, arrowhead: 2, arrowsize: 1.3, arrowwidth: 2.5,
        arrowcolor: "#D946EF", ax: -42, ay: -55, borderpad: 2,
        font: { color: "#A21CAF", size: 11 },
        bgcolor: "rgba(255,255,255,0.9)", bordercolor: "#D946EF",
      });
    }
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
          // v2: switched default dragmode to pan (Shift+drag = box zoom) — the
          // bump resets any sticky modebar dragmode from earlier sessions so the
          // new default actually applies.
          uirevision: "landscape-2d-v2",
          dragmode: isShiftHeld ? "zoom" : "pan",
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
          uirevision: "landscape-3d-v6",
          scene: {
            xaxis: {
              title: { text: landscape.axes.x ?? "x", font: { size: 10, color: axisTextColor } },
              // Normal — SAME direction as the 2D x-axis (low distance at the
              // front-left), so toggling 2D↔3D no longer mirrors the plot. The
              // reversed framing is now achieved via the camera eye.x flip below.
              autorange: true as const,
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
            // Initial view: distance (x) increases LEFT→RIGHT, −log10 p (y) runs
            // into the screen (depth), height (z) up. We look mostly along +y from
            // the front (−y) so screen-right ≈ +x, tilted 23° above horizontal
            // looking down (elevation = atan(0.78/1.84) ≈ 23°). camera.center is
            // nudged toward the far-x / high-significance corner so that extreme
            // peak sits near screen centre — increase center.x/center.y to push it
            // further toward dead-centre; raise eye.z (keep z = 0.424·|eye_xy| for
            // 23°) to look down more steeply.
            camera: {
              eye: { x: -0.48, y: -1.78, z: 0.78 },
              center: { x: 0.2, y: 0.3, z: 0 },
            },
            aspectmode: "manual" as const,
            aspectratio: { x: 1.2, y: 1, z: 0.8 },
            annotations: scene3dAnnotations,
            // Default pointer drag = pan (translate); holding Shift switches
            // to orbit (rotate) — see the isShiftHeld effect above. Plotly 3D
            // only honors one dragmode per render and locks the drag handler at
            // mousedown, so the mode applies to the NEXT drag, not the current
            // one. Modebar (zoom/pan/orbit/turntable) is still available as a
            // sticky toggle.
            dragmode: isShiftHeld ? "orbit" : "pan",
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
      <div className="mb-2 flex flex-wrap items-stretch gap-3 text-meta text-ink-secondary">
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

        {/* Community picker — pick a peak without fighting overlapping 3D markers */}
        {communityOptions.length > 0 && (
          <label className="flex items-center gap-1.5 rounded-md border border-line bg-surface-elevated px-2 py-1">
            <span className="whitespace-nowrap">{t("커뮤니티", "Community")}</span>
            <select
              value={highlightCommunity ?? ""}
              onChange={(e) => {
                if (e.target.value !== "") onCommunityClick?.(Number(e.target.value));
              }}
              className="max-w-[170px] rounded focus:outline-none"
              // Hardcode white-on-black-text regardless of system/dark mode (same
              // as the time-lapse interval dropdown) so the native popup stays
              // legible — dark colorScheme made the options invisible.
              style={{ color: "#111827", backgroundColor: "#FFFFFF", colorScheme: "light" }}
              aria-label={t("커뮤니티 선택", "Select community")}
            >
              <option value="" style={{ color: "#111827", backgroundColor: "#FFFFFF" }}>
                {t("선택…", "Select…")}
              </option>
              {communityOptions.map((c) => (
                <option key={c.id} value={c.id} style={{ color: "#111827", backgroundColor: "#FFFFFF" }}>
                  {`c${String(c.id).padStart(3, "0")} · n=${c.size} · PCC ${c.z.toFixed(2)}${
                    c.isTarget ? " ★" : ""
                  }`}
                </option>
              ))}
            </select>
          </label>
        )}

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
          <span className="self-center text-ink-muted whitespace-nowrap">
            ({visibleCount}/{totalPoints})
          </span>
        )}
        {yClippedCount > 0 && (
          <span
            className="self-center text-ink-muted whitespace-nowrap"
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

      {/* 조작 가이드 — 그래프 바로 위. 2D/3D 동일 패턴(기본 이동, Shift+드래그가
          모드별 보조 동작). Shift 누른 상태면 그 부분을 강조. */}
      <div className="mb-1.5 text-meta text-ink-muted font-mono">
        {t("드래그=이동", "drag = pan")}
        {" · "}
        <span className={isShiftHeld ? "text-ink-primary font-semibold" : ""}>
          {mode === "3d"
            ? t("Shift+드래그=회전", "Shift+drag = rotate")
            : t("Shift+드래그=영역 확대", "Shift+drag = box zoom")}
        </span>
        {" · "}
        {t("휠=확대/축소", "wheel = zoom")}
      </div>

      <div className="relative overflow-hidden">
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
            {foundNode.community_id == null ? (
              <p className="mt-1.5 text-ink-secondary">
                {t("소속 커뮤니티가 검출되지 않았습니다.", "Not in any detected community.")}
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1 text-ink-secondary">
                <li
                  title={t(
                    "hop = community 내부 PPI 엣지를 따라 hub(=최다연결 단백질)까지의 최단 경로 길이(엣지 수)",
                    "hop = shortest-path length (edges) to the community hub (its highest-degree protein), along PPI edges inside the community",
                  )}
                >
                  <span className="font-semibold text-ink-primary">
                    comm.{foundNode.community_id}
                  </span>
                  {foundNode.hops != null ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-ink-primary">{foundNode.hops}</span> hop
                    </>
                  ) : (
                    <span className="text-status-warning">
                      {" · "}
                      {t("hub 미연결", "hub-disconnected")}
                    </span>
                  )}
                </li>
                {foundNode.center && (
                  <li className="text-ink-muted">
                    {t("중심", "hub")}: <span className="font-mono">{foundNode.center}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        {/* Protein list slide-in — search inside, click to highlight community.
            bg-surface-card (opaque) + the wrapper's overflow-hidden match the
            PPI ProteinInfoPanel so it's fully opaque and fully tucked when closed. */}
        <div
          className={`absolute inset-y-0 right-0 z-20 flex w-64 max-w-[80%] flex-col border-l border-line bg-surface-card shadow-lg transition-transform duration-200 ${
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
                    {n.community_id == null
                      ? "—"
                      : `c${String(n.community_id).padStart(3, "0")}${
                          n.hops != null ? `·${n.hops} hop` : ""
                        }`}
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
            // Always-on modebar so users can spot the pan / rotate / zoom toggle
            // (3D defaults to pan; click the orbit/turntable icon to rotate).
            // Default 'hover' surfaced these buttons only when the cursor was on
            // the plot, which made the controls feel hidden.
            displayModeBar: true,
            // Wheel-to-zoom in both 2D and 3D (Plotly 2D ships this OFF by
            // default; the guide text promises wheel zoom in both modes).
            scrollZoom: true,
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

      {/* Footnote: what the dashed reference line means. */}
      <p className="mt-1.5 text-[10px] leading-tight text-ink-muted">
        {t(
          `점선 = p = ${SIG_P} 참고선 (−log10 p ≈ ${SIG_Y.toFixed(2)}; 경험분포·다중검정 미보정)`,
          `Dashed line = p = ${SIG_P} reference line (−log10 p ≈ ${SIG_Y.toFixed(2)}; empirical, not multiple-testing corrected)`,
        )}
      </p>
    </div>
  );
}
