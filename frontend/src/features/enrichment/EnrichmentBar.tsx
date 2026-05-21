import type { GoTerm } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";

interface Props {
  terms: GoTerm[];
  height?: number;
}

/**
 * Pathway Enrichment bars — flat solid fills, no internal gradient.
 *
 * Step 13 (2026-05-21) — replaces the previous purple→cyan gradient
 * pattern. Each category (BP / MF / CC) gets one base color. Within a
 * category, bars are sorted by enrichment score; the top-ranked bar
 * shows the base color at 100% opacity, then each subsequent bar steps
 * down by 5% opacity (so #2 = 95%, #3 = 90%, ...). This makes the
 * category instantly identifiable while preserving rank visibility.
 *
 * Bar width is proportional to enrichment score within the *global*
 * scale (so categories are comparable). Rightmost label shows score.
 */

const CATEGORY_COLOR: Record<string, string> = {
  BP: "168 85 247",   // brand purple
  MF: "34 211 238",   // cyan
  CC: "74 222 128",   // green
};
const FALLBACK_COLOR = "148 163 184"; // slate

const ALPHA_STEP = 0.05;   // 5% drop per rank
const ALPHA_FLOOR = 0.35;  // never below 35% — guarantees readability

export function EnrichmentBar({ terms, height }: Props) {
  if (!terms.length) return <EmptyBlock label="Enrichment 결과가 없습니다." />;

  // Global sort by score (highest first); also pre-compute rank within
  // each category so alpha can step down per-category from #1 = 100%.
  const sorted = [...terms].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score ?? 1;

  const rankInCategory = new Map<GoTerm, number>();
  const categoryRunCount: Record<string, number> = {};
  for (const t of sorted) {
    const cat = t.category;
    categoryRunCount[cat] = (categoryRunCount[cat] ?? 0) + 1;
    rankInCategory.set(t, categoryRunCount[cat]);  // 1-indexed
  }

  return (
    <div
      className="flex flex-col gap-2 w-full"
      style={height !== undefined ? { height, overflowY: "auto" } : undefined}
    >
      {sorted.map((g) => {
        const widthPct = Math.max(8, (g.score / maxScore) * 100);
        const rgb = CATEGORY_COLOR[g.category] ?? FALLBACK_COLOR;
        const rank = rankInCategory.get(g) ?? 1;
        const alpha = Math.max(ALPHA_FLOOR, 1 - (rank - 1) * ALPHA_STEP);
        const truncated = g.term.length > 64 ? g.term.slice(0, 61) + "…" : g.term;
        return (
          <div key={g.term} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-body text-ink-secondary truncate" title={g.term}>
                  {truncated}
                </span>
                <span className="text-meta text-ink-muted font-mono tabular shrink-0">
                  {g.category} · p={g.pvalue.toExponential(1)}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-surface-soft overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-base"
                  style={{
                    width: `${widthPct}%`,
                    background: `rgb(${rgb} / ${alpha})`,
                  }}
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
          <span className="w-3 h-2 rounded-sm" style={{ background: `rgb(${CATEGORY_COLOR.BP})` }} />
          BP — Biological Process
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: `rgb(${CATEGORY_COLOR.MF})` }} />
          MF — Molecular Function
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm" style={{ background: `rgb(${CATEGORY_COLOR.CC})` }} />
          CC — Cellular Component
        </span>
      </div>
    </div>
  );
}
