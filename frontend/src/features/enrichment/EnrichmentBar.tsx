import type { GoTerm } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";

interface Props {
  terms: GoTerm[];
  height?: number;
}

/**
 * Pathway Enrichment bars — design_02 inspired.
 *
 * Replaces the previous Plotly bar chart with native HTML/SVG so we can
 * use horizontal gradients (purple→cyan, like design_02) and put the FDR
 * p-value as a right-aligned label inside the bar. Each row is one GO
 * term; bar width is proportional to enrichment score; bar tint varies
 * by category (BP=purple-pink, MF=cyan-teal, CC=blue-indigo) so the
 * legend doesn't carry the burden of color identification.
 *
 * Step 11 (2026-05-21).
 */

const CATEGORY_GRADIENT: Record<string, string> = {
  BP: "linear-gradient(90deg, #A855F7 0%, #F472B6 100%)",
  MF: "linear-gradient(90deg, #A855F7 0%, #22D3EE 100%)",
  CC: "linear-gradient(90deg, #4AA8FF 0%, #4ADE80 100%)",
};
const FALLBACK_GRADIENT = "linear-gradient(90deg, #6B7280 0%, #94A3B8 100%)";

export function EnrichmentBar({ terms, height }: Props) {
  if (!terms.length) return <EmptyBlock label="Enrichment 결과가 없습니다." />;

  // sort by score desc; horizontal bars top-to-bottom highest-first.
  const sorted = [...terms].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score ?? 1;

  return (
    <div
      className="flex flex-col gap-2 w-full"
      style={height !== undefined ? { height, overflowY: "auto" } : undefined}
    >
      {sorted.map((g) => {
        const widthPct = Math.max(8, (g.score / maxScore) * 100);
        const gradient = CATEGORY_GRADIENT[g.category] ?? FALLBACK_GRADIENT;
        const truncated = g.term.length > 64 ? g.term.slice(0, 61) + "…" : g.term;
        return (
          <div key={g.term} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span
                  className="text-body text-ink-secondary truncate"
                  title={g.term}
                >
                  {truncated}
                </span>
                <span className="text-meta text-ink-muted font-mono tabular shrink-0">
                  {g.category} · p={g.pvalue.toExponential(1)}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-surface-soft overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-base"
                  style={{ width: `${widthPct}%`, background: gradient }}
                />
              </div>
            </div>
            <span className="text-meta text-ink-muted font-mono tabular w-10 text-right">
              {g.score.toFixed(1)}
            </span>
          </div>
        );
      })}
      <div className="mt-2 pt-2 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: CATEGORY_GRADIENT.BP }} />
          BP — Biological Process
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: CATEGORY_GRADIENT.MF }} />
          MF — Molecular Function
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: CATEGORY_GRADIENT.CC }} />
          CC — Cellular Component
        </span>
      </div>
    </div>
  );
}
