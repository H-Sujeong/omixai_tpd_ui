import type { GoTerm, LandscapePanel, PhenotypicProfiling } from "@/types/api";
import { downloadText } from "@/features/ppi-graph/exportNetwork";

export interface Provenance {
  plate: string;
  drug: string;
  drugId: string;
  target: string;
}

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `#`-prefixed provenance header so downstream tools (pandas comment='#', R)
 *  can skip it, and humans see where the data + its definitions come from. */
export function provenanceHeader(meta: Provenance, notes: string[] = []): string {
  return (
    [
      "# OmixAI-TPD export",
      `# plate: ${meta.plate}`,
      `# drug: ${meta.drug} (${meta.drugId})`,
      `# target: ${meta.target}`,
      ...notes.map((n) => `# ${n}`),
    ].join("\n") + "\n"
  );
}

export const COMMUNITY_NOTE =
  "community_id = pipeline-derived module (this study's own definition), not an external/canonical annotation";

export function buildEnrichmentCsv(terms: GoTerm[], meta: Provenance): string {
  const rows = ["category,term,score,pvalue"];
  for (const t of terms) rows.push([t.category, t.term, t.score, t.pvalue].map(cell).join(","));
  return (
    provenanceHeader(meta, ["GO/pathway enrichment for the current community"]) + rows.join("\n")
  );
}

export function buildLandscapeCsv(ls: LandscapePanel, meta: Provenance): string {
  const rows = ["community_id,is_target,distance_from_anchor,neg_log10_p,avg_pcc,size"];
  for (const p of ls.scatter) {
    rows.push([p.community_id, p.is_target, p.x, p.y, p.z, p.size].map(cell).join(","));
  }
  return (
    provenanceHeader(meta, [
      COMMUNITY_NOTE,
      "columns: distance_from_anchor=x, neg_log10_p=-log10(p), avg_pcc=avg(PCC) for module",
    ]) + rows.join("\n")
  );
}

export function buildProfilingCsv(ph: PhenotypicProfiling, meta: Provenance): string {
  const dmso = new Map<number, number>();
  for (const p of ph.gr_curve_dmso) dmso.set(p.t_hours, p.grv);
  const rows = ["t_hours,gr_drug,gr_dmso"];
  for (const p of ph.gr_curve) {
    rows.push([p.t_hours, p.grv, dmso.has(p.t_hours) ? dmso.get(p.t_hours) : ""].map(cell).join(","));
  }
  const notes = [
    `gr_score: ${ph.gr_score ?? "—"}`,
    ph.gr_window
      ? `gr_score is the slope over the drug-effect window ${ph.gr_window[0]}–${ph.gr_window[1]} h (NOT the full curve)`
      : "",
    ph.growth_class ? `growth_class: ${ph.growth_class}` : "",
  ].filter(Boolean) as string[];
  return provenanceHeader(meta, notes) + rows.join("\n");
}

export { downloadText };
