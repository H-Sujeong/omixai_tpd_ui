import cytoscape, { Core, ElementDefinition } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { useEffect, useRef } from "react";
import type { PpiEdge, PpiNode, PpiRole } from "@/types/api";

let registered = false;
function ensureRegistered() {
  if (!registered) {
    cytoscape.use(coseBilkent);
    registered = true;
  }
}

interface Props {
  nodes: PpiNode[];
  edges: PpiEdge[];
  selectedNode?: string | null;
  selectedEdgeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  /**
   * Bi-directional landscape ↔ PPI: clicking an edge tells the parent to
   * pick the most-related community for that edge's endpoints.
   */
  onEdgeClick?: (edge: { id: string; source: string; target: string; corr: number }) => void;
  /**
   * Fixed pixel height. If omitted, the container uses a responsive height
   * (360 / 440 / 520 by viewport, Step 7) so the graph fits within laptop
   * and tablet viewports without overflowing the fold.
   */
  height?: number;
}

/**
 * Semantic palette (PRD §9). Resolves from CSS vars at render so designer swaps
 * in `tokens.css` propagate without touching this file.
 */
function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const ROLE_FALLBACK: Record<PpiRole, string> = {
  target: "#A855F7",
  activated: "#4ADE80",
  suppressed: "#F87171",
  info: "#60A5FA",
  unknown: "#94A3B8",
};

function roleColor(role: PpiRole | undefined | null): string {
  const key: PpiRole = role ?? "unknown";
  return readVar(`--color-role-${key}`, ROLE_FALLBACK[key]);
}

/**
 * Cytoscape.js wrapper. PPI nodes are colored by community_id, target node gets
 * a brand-primary halo, edges are weighted by string_score.
 */
export function PpiGraph({
  nodes,
  edges,
  selectedNode,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick,
  height,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    ensureRegistered();
    if (!ref.current) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }
    const elements: ElementDefinition[] = [
      ...nodes.map<ElementDefinition>((n) => ({
        data: {
          id: n.id,
          label: n.id,
          is_target: n.is_target ? "yes" : "no",
          role: n.role ?? "unknown",
          degree: n.degree,
          corr: n.corr,
          confidence: n.confidence ?? Math.abs(n.corr),
          color: roleColor(n.role),
        },
      })),
      ...edges.map<ElementDefinition>((e) => ({
        data: {
          id: `${e.source}__${e.target}`,
          source: e.source,
          target: e.target,
          weight: Math.max(0.4, Math.abs(e.corr)),
          score: e.string_score,
          corr: e.corr,
          edgeColor:
            e.corr >= 0.3
              ? "rgba(74, 222, 128, 0.45)"
              : e.corr <= -0.2
              ? "rgba(248, 113, 113, 0.45)"
              : "rgba(143, 155, 179, 0.30)",
        },
      })),
    ];
    const cy = cytoscape({
      container: ref.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            "label": "data(label)",
            "color": "#E6EDF3",
            "font-size": 10,
            "font-weight": 500,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#0F1115",
            "text-outline-width": 2,
            "width": "mapData(degree, 0, 200, 20, 64)",
            "height": "mapData(degree, 0, 200, 20, 64)",
            "border-width": 1,
            "border-color": "rgba(255,255,255,0.18)",
            "overlay-opacity": 0,
          },
        },
        {
          selector: 'node[is_target = "yes"]',
          style: {
            "border-color": "#A855F7",
            "border-width": 4,
            "border-opacity": 0.9,
          } as any,
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#FFFFFF",
            "border-width": 3.5,
          } as any,
        },
        {
          selector: "edge",
          style: {
            "width": "mapData(weight, 0, 1, 0.6, 4)",
            "line-color": "data(edgeColor)",
            "curve-style": "bezier",
            "opacity": 0.9,
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#A855F7",
            "opacity": 1.0,
            "width": 4,
          },
        },
        {
          selector: "edge.bridge-active",
          style: {
            "line-color": "#A855F7",
            "opacity": 1.0,
            "width": 4,
            "line-style": "solid",
          } as any,
        },
      ],
      layout: {
        name: "cose-bilkent",
        idealEdgeLength: 80,
        nodeOverlap: 12,
        nodeRepulsion: 5000,
        randomize: true,
        animate: false,
      } as any,
      wheelSensitivity: 0.25,
    });
    cyRef.current = cy;
    cy.on("tap", "node", (evt) => {
      const id = evt.target.id() as string;
      onNodeClick?.(id);
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
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Re-apply selection highlight without rebuilding the graph
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$("node:selected").unselect();
    if (selectedNode) {
      const n = cy.getElementById(selectedNode);
      if (n) n.select();
    }
  }, [selectedNode]);

  // External edge highlight (e.g. from landscape→ppi sync)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.edges().removeClass("bridge-active");
    if (selectedEdgeId) {
      const e = cy.getElementById(selectedEdgeId);
      if (e && e.length) e.addClass("bridge-active");
    }
  }, [selectedEdgeId]);

  return (
    <div
      ref={ref}
      className={`w-full rounded-md border border-line bg-surface-soft${
        height === undefined ? " h-[360px] md:h-[440px] xl:h-[520px]" : ""
      }`}
      style={height !== undefined ? { height } : undefined}
    />
  );
}
