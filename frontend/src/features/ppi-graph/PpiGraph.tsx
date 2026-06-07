import cytoscape, { Core, ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PpiEdge, PpiNode } from "@/types/api";
import { useT } from "@/store/uiLang";

let registered = false;
function ensureRegistered() {
  if (!registered) {
    cytoscape.use(fcose);
    registered = true;
  }
}

type FilterMode = "all" | "target" | "up" | "down";

interface Props {
  nodes: PpiNode[];
  edges: PpiEdge[];
  /** Primary target name (e.g. "BRD2") — gets a special amber cross style */
  targetName?: string | null;
  selectedNode?: string | null;
  selectedEdgeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edge: { id: string; source: string; target: string; corr: number }) => void;
  /** Clear the active protein selection (called by the Reset button). */
  onClearSelection?: () => void;
  height?: number;
  /**
   * Per-gene corr override (gene id -> signed PCC at the active timepoint).
   * When provided, every node's `corr` is replaced before the color is
   * computed, so the 24h layout stays put while colors swap by time. Genes
   * absent from the override at this timepoint stay at their primary-time
   * color (no fabrication — the PPI structure is 24h-fixed by design).
   */
  corrOverride?: Record<string, number> | null;
}

/**
 * On-Target PPI network — test_viz visual ruleset.
 * Step 13 (2026-05-21).
 *
 * Node colors (continuous, by signed correlation with the target):
 *   - Primary target (n.id === targetName)  → amber #F59E0B + thick border, ✚ prefix
 *   - is_target = true                       → purple #7C3AED (target gene)
 *   - else → diverging blue↔white↔red by corr SIGN, depth ∝ |corr|.
 *
 * This follows the pipeline's only directional rule — the SIGN of corr (W is
 * split into positive/negative). There is no hard ±threshold (the old ±0.2 was
 * an arbitrary UI cutoff): magnitude shows as colour depth, and weak partners
 * read as faint tints instead of a fabricated "neutral" grey. A |corr| slider
 * lets the user hide weak correlations.
 *
 * Node size scales with degree (18-60px). Plot panel uses a LIGHT background
 * (#FAFAF7) for legibility against the dark dashboard cards (same as Landscape).
 */

// Diverging colour by signed correlation: near-white at corr≈0 → red (up) /
// blue (down), depth ∝ |corr|. Weak tints stay visible (floor 0.18).
function corrColor(corr: number): string {
  const e = 0.18 + 0.82 * Math.min(1, Math.abs(corr));
  const base = [244, 246, 248];
  const hi = corr >= 0 ? [220, 38, 38] : [37, 99, 235];
  const m = (a: number, b: number) => Math.round(a + (b - a) * e);
  return `rgb(${m(base[0], hi[0])},${m(base[1], hi[1])},${m(base[2], hi[2])})`;
}

function nodeColor(n: PpiNode, isMain: boolean): string {
  if (isMain) return "#F59E0B";
  if (n.is_target) return "#7C3AED";
  return corrColor(n.corr);
}
function nodeBorder(n: PpiNode, isMain: boolean): string {
  if (isMain) return "#92400E";
  if (n.is_target) return "#5B21B6";
  return "#D3D1C7";
}
function nodeBorderW(n: PpiNode, isMain: boolean): number {
  if (isMain) return 4;
  if (n.is_target) return 2.5;
  return 1;
}
function nodeSize(n: PpiNode): number {
  return Math.max(18, Math.min(60, 18 + n.degree * 1.5));
}

export function PpiGraph({
  nodes: nodesProp,
  edges,
  targetName,
  selectedNode,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick,
  onClearSelection,
  height,
  corrOverride,
}: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  // Hide weak correlations: show only |corr| >= minCorr (target always kept).
  const [minCorr, setMinCorr] = useState<number>(0);

  // Time-toggle (B안 §3): swap each node's corr by gene id while layout/degree
  // stay fixed. Missing entries keep their primary-time corr (no fabrication).
  const nodes = useMemo(() => {
    if (!corrOverride) return nodesProp;
    return nodesProp.map((n) => {
      const c = corrOverride[n.id];
      return c === undefined ? n : { ...n, corr: c };
    });
  }, [nodesProp, corrOverride]);

  const elements = useMemo<ElementDefinition[]>(() => {
    const els: ElementDefinition[] = [];
    nodes.forEach((n) => {
      const isMain = !!targetName && n.id === targetName;
      els.push({
        data: {
          id: n.id,
          label: isMain ? "✚ " + n.id : n.id,
          degree: n.degree,
          corr: n.corr,
          is_target: n.is_target ? "yes" : "no",
          is_main: isMain ? "yes" : "no",
          size: nodeSize(n),
          color: nodeColor(n, isMain),
          borderColor: nodeBorder(n, isMain),
          borderWidth: nodeBorderW(n, isMain),
        },
      });
    });
    edges.forEach((e) => {
      const score = e.string_score ?? 0; // STRING combined confidence 0..1000
      els.push({
        data: {
          id: `${e.source}__${e.target}`,
          source: e.source,
          target: e.target,
          score,
          corr: e.corr,
        },
      });
    });
    return els;
  }, [nodes, edges, targetName]);

  // Initial build
  useEffect(() => {
    ensureRegistered();
    if (!ref.current) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }
    const cy = cytoscape({
      container: ref.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "width": "data(size)",
            "height": "data(size)",
            "label": "data(label)",
            "font-size": 10,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "color": "#2C2C2A",
            "border-width": "data(borderWidth)",
            "border-color": "data(borderColor)",
            "overlay-opacity": 0,
          },
        },
        {
          selector: 'node[is_main = "yes"]',
          style: {
            "font-size": 11,
            "font-weight": "bold",
            "color": "#451A03",
          } as any,
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 4,
            "border-color": "#F97316",
          } as any,
        },
        {
          // STRING style: edge thickness encodes the combined confidence
          // (string_score 0..1000), so strong interactions read as heavier lines.
          selector: "edge",
          style: {
            "width": "mapData(score, 0, 1000, 0.5, 4.5)",
            "line-color": "#B4B2A9",
            "opacity": 0.55,
            "curve-style": "straight",
          },
        },
        {
          selector: "edge.hl",
          style: {
            "line-color": "#F97316",
            "opacity": 1,
            "width": 2.5,
          } as any,
        },
        {
          selector: "edge.bridge-active",
          style: {
            "line-color": "#F97316",
            "opacity": 1,
            "width": 3.5,
          } as any,
        },
      ],
      layout: {
        // STRING-style confidence-weighted spring layout (fcose): high
        // string_score edges get a shorter ideal length + stronger elasticity,
        // so well-supported partners pull together while weak links float out.
        name: "fcose",
        quality: "default",
        animate: false,
        randomize: true,
        nodeRepulsion: 8000,
        nodeSeparation: 80,
        idealEdgeLength: (edge: any) => {
          const s01 = Math.max(0, Math.min(1, ((edge.data("score") as number) ?? 0) / 1000));
          return 45 + (1 - s01) * 125; // 1000 → ~45 (close), 0 → ~170 (far)
        },
        edgeElasticity: (edge: any) => {
          const s01 = Math.max(0, Math.min(1, ((edge.data("score") as number) ?? 0) / 1000));
          return 0.1 + s01 * 0.45;
        },
      } as any,
      wheelSensitivity: 1.5,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (evt) => {
      // Edge highlight is driven by the selectedNode effect (single source of
      // truth), so it clears properly on deselect.
      onNodeClick?.(evt.target.id() as string);
    });
    cy.on("tap", "edge", (evt) => {
      const e = evt.target;
      const id = e.id() as string;
      const src = e.source().id() as string;
      const tgt = e.target().id() as string;
      const corr = (e.data("corr") as number) ?? 0;
      cy.edges().removeClass("bridge-active");
      e.addClass("bridge-active");
      onEdgeClick?.({ id, source: src, target: tgt, corr });
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) cy.edges().removeClass("hl");
    });

    // Focus on main target if present
    const mainNode = cy.nodes().filter((n) => n.data("is_main") === "yes");
    if (mainNode.length > 0) {
      cy.fit(mainNode.union(mainNode.neighborhood()), 60);
      setTimeout(() => cy.fit(undefined, 20), 600);
    }

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // External selectedNode highlight — single source of truth for the node
  // selection AND its connected-edge highlight, so deselect clears both.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$("node:selected").unselect();
    cy.edges().removeClass("hl");
    if (selectedNode) {
      const n = cy.getElementById(selectedNode);
      if (n && n.length) {
        n.select();
        n.connectedEdges().addClass("hl");
      }
    }
  }, [selectedNode]);

  // External edge highlight (landscape→ppi)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass("bridge-active");
    if (selectedEdgeId) {
      const e = cy.getElementById(selectedEdgeId);
      if (e && e.length) e.addClass("bridge-active");
    }
  }, [selectedEdgeId]);

  // Filter: hide/show nodes by category
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((n) => {
      const isMain = n.data("is_main") === "yes";
      const isTarget = n.data("is_target") === "yes";
      const corr = (n.data("corr") as number) ?? 0;
      // direction by SIGN; magnitude gate via the |corr| slider
      let show: boolean;
      if (isMain || isTarget) {
        show = true; // target always kept
      } else if (Math.abs(corr) < minCorr) {
        show = false; // weak correlation hidden
      } else if (filter === "up") {
        show = corr > 0;
      } else if (filter === "down") {
        show = corr < 0;
      } else if (filter === "target") {
        show = false; // only target/main (handled above)
      } else {
        show = true; // "all"
      }
      n.style("display", show ? "element" : "none");
    });
    // Hide edges connecting hidden nodes
    cy.edges().forEach((e) => {
      const src = e.source().style("display");
      const tgt = e.target().style("display");
      e.style("display", src === "none" || tgt === "none" ? "none" : "element");
    });
    // `elements` is a dep so the active filter is re-applied after the graph
    // rebuilds on a community switch — the filter carries over instead of
    // resetting to "all".
  }, [filter, minCorr, elements]);

  const FilterChip = ({ mode, label, accent }: { mode: FilterMode; label: string; accent?: string }) => {
    const active = filter === mode;
    return (
      <button
        type="button"
        onClick={() => setFilter(mode)}
        className={`px-2 py-0.5 text-meta border rounded transition-colors duration-fast ${
          active
            ? "bg-brand-primary text-white border-brand-primary"
            : "text-ink-secondary border-line hover:text-ink-primary"
        }`}
        style={accent && !active ? { color: accent, borderColor: accent } : undefined}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  const handleFit = () => {
    cyRef.current?.fit(undefined, 20);
  };
  const handleReset = () => {
    // Clear the active protein selection only — keep the current zoom/pan
    // (resetting the camera was jarring). Use "Fit" to re-frame the view.
    onClearSelection?.();
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Filter chips + view controls */}
      <div className="flex flex-wrap items-center gap-1.5 text-meta text-ink-muted">
        <span className="mr-1">{t("필터:", "Filter:")}</span>
        <FilterChip mode="all" label={t("전체", "All")} />
        <FilterChip mode="target" label={t("타깃", "Target")} accent="#F59E0B" />
        <FilterChip mode="up" label={t("상향 ↑", "Up ↑")} accent="#DC2626" />
        <FilterChip mode="down" label={t("하향 ↓", "Down ↓")} accent="#2563EB" />
        {/* |corr| strength gate — hide weak correlations */}
        <span className="ml-1 inline-flex items-center gap-1 whitespace-nowrap">
          |corr| ≥ <span className="tabular text-ink-secondary">{minCorr.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={minCorr}
            onChange={(e) => setMinCorr(parseFloat(e.target.value))}
            className="w-24 accent-brand-primary"
            aria-label={t("|corr| 세기 임계값", "|corr| strength threshold")}
          />
        </span>
        <span className="mx-1 text-line">|</span>
        <button
          type="button"
          onClick={handleFit}
          className="px-2 py-0.5 text-meta border border-line rounded text-ink-secondary hover:text-ink-primary transition-colors duration-fast"
          title={t("화면에 맞추기", "Fit to view")}
        >
          Fit
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-0.5 text-meta border border-line rounded text-ink-secondary hover:text-ink-primary transition-colors duration-fast"
          title={t("단백질 선택 해제 (보기 유지)", "Clear protein selection (keep view)")}
        >
          {t("선택 해제", "Clear")}
        </button>
      </div>

      {/* Plot panel (light bg, light borders) */}
      <div
        ref={ref}
        className={`w-full rounded-md border border-line${
          height === undefined ? " h-[360px] md:h-[440px] xl:h-[520px]" : ""
        }`}
        style={{
          ...(height !== undefined ? { height } : undefined),
          background: "#FAFAF7",
        }}
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: "#F59E0B", border: "2px solid #92400E" }} />
          {t("주 타깃 (✚)", "Main target (✚)")}
        </span>
        <span className="flex items-center gap-1.5" title={t("타깃 유전자", "Target gene")}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#7C3AED", border: "1.5px solid #5B21B6" }} />
          is_target
        </span>
        {/* Continuous corr legend: blue (down) ↔ white (0) ↔ red (up), depth = |corr| */}
        <span
          className="flex items-center gap-1.5"
          title={t(
            "타깃과의 상관(corr): 색=부호(빨강 상향/파랑 하향), 진하기=|corr|",
            "Correlation with target: hue = sign (red up / blue down), depth = |corr|",
          )}
        >
          {t("하향 ↓", "Down ↓")}
          <span
            className="h-2.5 w-24 rounded-sm border border-line"
            style={{ background: `linear-gradient(to right, ${corrColor(-0.85)}, ${corrColor(0)}, ${corrColor(0.85)})` }}
          />
          {t("↑ 상향", "Up ↑")}
        </span>
        <span className="opacity-70">{t("진하기 = |corr|", "depth = |corr|")}</span>
        <span className="ml-auto opacity-70">
          {t("노드 크기 = degree · 엣지 두께 = STRING 신뢰도", "Node size = degree · Edge width = STRING confidence")}
        </span>
      </div>
    </div>
  );
}
