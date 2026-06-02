import cytoscape, { Core, ElementDefinition } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PpiEdge, PpiNode } from "@/types/api";

let registered = false;
function ensureRegistered() {
  if (!registered) {
    cytoscape.use(coseBilkent);
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
  height?: number;
}

/**
 * On-Target PPI network — test_viz visual ruleset.
 * Step 13 (2026-05-21).
 *
 * Node colors (corr-based, not role-based):
 *   - Primary target (n.id === targetName)  → amber #F59E0B + thick border, ✚ prefix
 *   - is_target = true                       → red #EF4444
 *   - corr >  0.2                            → blue #185FA5  (positively correlated)
 *   - corr < -0.2                            → purple #7C3AED (negatively correlated)
 *   - else                                   → grey #9CA3AF  (neutral)
 *
 * Node size scales with degree (test_viz: 18-60px).
 * Plot panel uses a LIGHT background (#FAFAF7) for legibility against the
 * dark dashboard cards — same treatment as Landscape.
 *
 * Filter chips above the graph let the user isolate {target / pos / neg / neutral}.
 */

function nodeColor(n: PpiNode, isMain: boolean): string {
  if (isMain) return "#F59E0B";
  if (n.is_target) return "#EF4444";
  if (n.corr > 0.2) return "#185FA5";
  if (n.corr < -0.2) return "#7C3AED";
  return "#9CA3AF";
}
function nodeBorder(n: PpiNode, isMain: boolean): string {
  if (isMain) return "#92400E";
  if (n.is_target) return "#DC2626";
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
  height,
}: Props) {
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
      els.push({
        data: {
          id: `${e.source}__${e.target}`,
          source: e.source,
          target: e.target,
          weight: Math.max(0.4, Math.abs(e.corr)),
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
          selector: "edge",
          style: {
            "width": "mapData(weight, 0, 1, 0.8, 3)",
            "line-color": "#B4B2A9",
            "opacity": 0.5,
            "curve-style": "bezier",
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
        name: nodes.length > 50 ? "concentric" : "cose-bilkent",
        animate: false,
        idealEdgeLength: 80,
        nodeRepulsion: 9000,
      } as any,
      wheelSensitivity: 1,
    });
    cyRef.current = cy;

    cy.on("tap", "node", (evt) => {
      cy.edges().removeClass("hl");
      evt.target.connectedEdges().addClass("hl");
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

  // External selectedNode highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$("node:selected").unselect();
    if (selectedNode) {
      const n = cy.getElementById(selectedNode);
      if (n) n.select();
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
    cyRef.current?.reset();
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Filter chips + view controls */}
      <div className="flex flex-wrap items-center gap-1.5 text-meta text-ink-muted">
        <span className="mr-1">필터:</span>
        <FilterChip mode="all" label="전체" />
        <FilterChip mode="target" label="타깃" accent="#F59E0B" />
        <FilterChip mode="pos" label="양성" accent="#185FA5" />
        <FilterChip mode="neg" label="음성" accent="#7C3AED" />
        <FilterChip mode="neutral" label="중립" />
        <span className="mx-1 text-line">|</span>
        <button
          type="button"
          onClick={handleFit}
          className="px-2 py-0.5 text-meta border border-line rounded text-ink-secondary hover:text-ink-primary transition-colors duration-fast"
          title="화면에 맞추기"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-0.5 text-meta border border-line rounded text-ink-secondary hover:text-ink-primary transition-colors duration-fast"
          title="줌/팬 초기화"
        >
          Reset
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
          주 타깃 (✚)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#EF4444", border: "1.5px solid #DC2626" }} />
          is_target
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#185FA5" }} />
          양성 corr &gt; 0.2
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#7C3AED" }} />
          음성 corr &lt; −0.2
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#9CA3AF" }} />
          중립
        </span>
        <span className="ml-auto opacity-70">노드 크기 = degree</span>
      </div>
    </div>
  );
}
