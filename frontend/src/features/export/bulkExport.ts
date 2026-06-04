import JSZip from "jszip";
import type {
  GoTerm,
  LandscapePanel,
  PhenotypicProfiling,
  PpiPanel,
  TimeLapseFrame,
  TimeLapseViewer,
} from "@/types/api";
import { toEdgeCsv, toGeneList, toGraphML, toJson, toNodeCsv } from "@/features/ppi-graph/exportNetwork";
import { buildTimeLapseGif } from "@/features/time-lapse/exportGif";
import {
  buildEnrichmentCsv,
  buildLandscapeCsv,
  buildProfilingCsv,
  type Provenance,
} from "./tableExports";

export interface ExportCtx {
  ppi: PpiPanel | null;
  landscape: LandscapePanel | null;
  enrichment: GoTerm[];
  phenotypic: PhenotypicProfiling | null;
  timeLapse: TimeLapseViewer | null;
  drugName: string;
  meta: Provenance;
  /** Per-file base name, e.g. "dbet6_BRD4". */
  base: string;
}

export interface ExportItem {
  id: string;
  label: string;
  ext: string;
  available: boolean;
  build: () => string | Promise<Uint8Array>;
}
export interface ExportGroup {
  box: string;
  items: ExportItem[];
}

/** Subsample frames ~intervalH apart (for a lighter bulk GIF). */
function subsample(frames: TimeLapseFrame[], intervalH: number): TimeLapseFrame[] {
  if (frames.length === 0) return frames;
  const eps = 1e-6;
  const out = [frames[0]];
  let last = frames[0].t_hours;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].t_hours - last >= intervalH - eps) {
      out.push(frames[i]);
      last = frames[i].t_hours;
    }
  }
  const tail = frames[frames.length - 1];
  if (out[out.length - 1] !== tail) out.push(tail);
  return out;
}

export function exportGroups(ctx: ExportCtx): ExportGroup[] {
  const { ppi, landscape, enrichment, phenotypic, timeLapse, meta } = ctx;
  return [
    {
      box: "PPI Network",
      items: [
        { id: "ppi.graphml", label: "GraphML", ext: "graphml", available: !!ppi, build: () => toGraphML(ppi!) },
        { id: "ppi.edges", label: "Edge CSV", ext: "edges.csv", available: !!ppi, build: () => toEdgeCsv(ppi!) },
        { id: "ppi.nodes", label: "Node CSV", ext: "nodes.csv", available: !!ppi, build: () => toNodeCsv(ppi!) },
        { id: "ppi.genes", label: "Gene list", ext: "genes.txt", available: !!ppi, build: () => toGeneList(ppi!) },
        { id: "ppi.json", label: "JSON", ext: "json", available: !!ppi, build: () => toJson(ppi!) },
      ],
    },
    {
      box: "Landscape",
      items: [
        { id: "landscape.csv", label: "CSV", ext: "landscape.csv", available: !!landscape, build: () => buildLandscapeCsv(landscape!, meta) },
      ],
    },
    {
      box: "Enrichment",
      items: [
        { id: "enrichment.csv", label: "CSV", ext: "enrichment.csv", available: enrichment.length > 0, build: () => buildEnrichmentCsv(enrichment, meta) },
      ],
    },
    {
      box: "Profiling",
      items: [
        { id: "profiling.csv", label: "CSV", ext: "profiling.csv", available: !!phenotypic, build: () => buildProfilingCsv(phenotypic!, meta) },
      ],
    },
    {
      box: "Time-lapse",
      items: [
        {
          id: "timelapse.gif",
          label: "GIF",
          ext: "gif",
          available: !!timeLapse && timeLapse.frames.length > 0,
          build: () =>
            buildTimeLapseGif(subsample(timeLapse!.frames, 2), {
              drugName: ctx.drugName,
              wellId: timeLapse!.well_id,
              fallbackCells: timeLapse!.n_cells_t0,
              umPerPixel: timeLapse!.um_per_pixel,
            }),
        },
      ],
    },
  ];
}

export async function buildBulkZip(selected: Set<string>, ctx: ExportCtx): Promise<Blob> {
  const zip = new JSZip();
  for (const g of exportGroups(ctx)) {
    for (const it of g.items) {
      if (!selected.has(it.id) || !it.available) continue;
      const content = await it.build();
      zip.file(`${ctx.base}.${it.ext}`, content as string | Uint8Array);
    }
  }
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
