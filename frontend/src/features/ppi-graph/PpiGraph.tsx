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

type FilterMode = "all" | "target" | "pos" | "neg" | "neutral";

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
}

/**
 * On-Target PPI network — test_viz visual ruleset.
 * Step 13 (2026-05-21).
 *
 * Node colors (corr-based, not role-based):
 *   - Primary target (n.id === targetName)  → amber #F59E0B + thick border, ✚ prefix
 *   - is_target = true                       → purple #7C3AED (target gene)
 *   - corr >  0.2                            → red  #DC2626  (up-regulated / activated)
 *   - corr < -0.2                            → blue #2563EB  (down-regulated / suppressed)
 *   - else                                   → grey #9CA3AF  (neutral)
 *
 * Up = warm red, down = cool blue — the standard expression-heatmap
 * convention, so direction of regulation reads at a glance. (Target genes
 * moved to purple to free red for up-regulation.)
 *
 * Node size scales with degree (test_viz: 18-60px).
 * Plot panel uses a LIGHT background (#FAFAF7) for legibility against the
 * dark dashboard cards — same treatment as Landscape.
 *
 * Filter chips above the graph let the user isolate {target / pos / neg / neutral}.
 */

function nodeColor(n: PpiNode, isMain: boolean): string {
  if (isMain) return "#F59E0B";
  if (n.is_target) return "#7C3AED";
  if (n.corr > 0.2) return "#DC2626"; // up-regulated (warm red)
  if (n.corr < -0.2) return "#2563EB"; // down-regulated (cool blue)
  return "#9CA3AF";
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
  nodes,
  edges,
  targetName,
  selectedNode,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick,
  onClearSelection,
  height,
}: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");

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
      let show = true;
      switch (filter) {
        case "target":
          show = isMain || isTarget;
          break;
        case "pos":
          show = isMain || corr > 0.2;
          break;
        case "neg":
          show = isMain || corr < -0.2;
          break;
        case "neutral":
          show = isMain || (corr >= -0.2 && corr <= 0.2 && !isTarget);
          break;
        default:
          show = true;
      }
      n.style("display", show ? "element" : "none");
    });
    // Hide edges connecting hidden nodes
    cy.edges().forEach((e) => {
      const src = e.source().style("display");
      const tgt = e.target().style("display");
      e.style("display", src === "none" || tgt === "none" ? "none" : "element");
    });
  }, [filter]);

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
        <FilterChip mode="pos" label={t("상향 ↑", "Up ↑")} accent="#DC2626" />
        <FilterChip mode="neg" label={t("하향 ↓", "Down ↓")} accent="#2563EB" />
        <FilterChip mode="neutral" label={t("중립", "Neutral")} />
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
        <span className="flex items-center gap-1.5" title={t("타깃과 양의 상관 → 상향 조절(activated)", "Positively correlated with target → up-regulated (activated)")}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#DC2626" }} />
          {t("상향 ↑ (up)", "Up ↑")} corr &gt; 0.2
        </span>
        <span className="flex items-center gap-1.5" title={t("타깃과 음의 상관 → 하향 조절(suppressed)", "Negatively correlated with target → down-regulated (suppressed)")}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#2563EB" }} />
          {t("하향 ↓ (down)", "Down ↓")} corr &lt; −0.2
        </span>
        <span className="flex items-center gap-1.5" title={t("뚜렷한 변화 없음", "No clear change")}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#9CA3AF" }} />
          {t("중립", "Neutral")}
        </span>
        <span className="ml-auto opacity-70">
          {t("노드 크기 = degree · 엣지 두께 = STRING 신뢰도", "Node size = degree · Edge width = STRING confidence")}
        </span>
      </div>
    </div>
  );
}
