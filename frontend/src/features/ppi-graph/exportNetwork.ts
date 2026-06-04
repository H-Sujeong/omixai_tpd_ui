import type { PpiPanel } from "@/types/api";

/**
 * Client-side exporters for the currently-displayed PPI community network.
 * The data already lives in the frontend (activePpi), so each format is built
 * in-browser and downloaded — no backend round-trip.
 *
 * Formats target the common network / protein analysis tools:
 *  - GraphML   → Cytoscape, Gephi, igraph, networkx (attributes included)
 *  - Edge/Node CSV → Cytoscape "Import from Table", R/igraph, pandas, Excel
 *  - Gene list .txt → STRING, Enrichr, DAVID, g:Profiler, Metascape …
 *  - JSON (node-link) → networkx json_graph, programmatic reuse
 */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toEdgeCsv(p: PpiPanel): string {
  const rows = [["source", "target", "string_score", "corr"].join(",")];
  for (const e of p.edges) {
    rows.push([e.source, e.target, e.string_score, e.corr].map(csvCell).join(","));
  }
  return rows.join("\n");
}

export function toNodeCsv(p: PpiPanel): string {
  const cols = ["id", "degree", "corr", "role", "community_id", "is_target", "confidence", "influence"];
  const rows = [cols.join(",")];
  for (const n of p.nodes) {
    rows.push(
      [n.id, n.degree, n.corr, n.role, n.community_id, n.is_target, n.confidence, n.influence]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

export function toGeneList(p: PpiPanel): string {
  // Target first, then the rest — handy for pasting into STRING/Enrichr.
  const target = p.nodes.filter((n) => n.is_target).map((n) => n.id);
  const others = p.nodes.filter((n) => !n.is_target).map((n) => n.id);
  return [...target, ...others].join("\n");
}

export function toJson(p: PpiPanel): string {
  // networkx node-link compatible (directed=false, edges under "links").
  return JSON.stringify(
    {
      directed: false,
      multigraph: false,
      graph: { target: p.target, community_id: p.current_community_id },
      nodes: p.nodes.map((n) => ({
        id: n.id,
        degree: n.degree,
        corr: n.corr,
        role: n.role,
        community_id: n.community_id,
        is_target: n.is_target,
        confidence: n.confidence,
        influence: n.influence,
      })),
      links: p.edges.map((e) => ({
        source: e.source,
        target: e.target,
        string_score: e.string_score,
        corr: e.corr,
      })),
    },
    null,
    2,
  );
}

export function toGraphML(p: PpiPanel): string {
  const nodeKeys = [
    ["degree", "double"],
    ["corr", "double"],
    ["role", "string"],
    ["community_id", "long"],
    ["is_target", "boolean"],
    ["confidence", "double"],
    ["influence", "double"],
  ] as const;
  const edgeKeys = [
    ["string_score", "double"],
    ["corr", "double"],
  ] as const;

  const keyDefs = [
    ...nodeKeys.map(([n, t]) => `  <key id="n_${n}" for="node" attr.name="${n}" attr.type="${t}"/>`),
    ...edgeKeys.map(([n, t]) => `  <key id="e_${n}" for="edge" attr.name="${n}" attr.type="${t}"/>`),
  ].join("\n");

  const nodes = p.nodes
    .map((n) => {
      const data = nodeKeys
        .map(([k]) => {
          const v = (n as any)[k];
          return v === null || v === undefined ? "" : `<data key="n_${k}">${xml(String(v))}</data>`;
        })
        .join("");
      return `    <node id="${xml(n.id)}">${data}</node>`;
    })
    .join("\n");

  const edges = p.edges
    .map((e, i) => {
      const data = edgeKeys
        .map(([k]) => `<data key="e_${k}">${xml(String((e as any)[k]))}</data>`)
        .join("");
      return `    <edge id="e${i}" source="${xml(e.source)}" target="${xml(e.target)}">${data}</edge>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
${keyDefs}
  <graph edgedefault="undirected">
${nodes}
${edges}
  </graph>
</graphml>`;
}

export interface ExportFormat {
  label: string;
  ext: string;
  mime: string;
  build: (p: PpiPanel) => string;
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { label: "GraphML (Cytoscape/Gephi)", ext: "graphml", mime: "application/xml", build: toGraphML },
  { label: "Edge table (CSV)", ext: "edges.csv", mime: "text/csv", build: toEdgeCsv },
  { label: "Node table (CSV)", ext: "nodes.csv", mime: "text/csv", build: toNodeCsv },
  { label: "Gene list (STRING/Enrichr)", ext: "genes.txt", mime: "text/plain", build: toGeneList },
  { label: "JSON (node-link)", ext: "json", mime: "application/json", build: toJson },
];

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
