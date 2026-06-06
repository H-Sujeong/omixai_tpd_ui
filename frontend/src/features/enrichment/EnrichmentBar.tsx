import type { GoTerm } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";
import { useT } from "@/store/uiLang";

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

// Bars are ranked & scaled by SIGNIFICANCE: −log10(adjusted p-value).
//
// We deliberately do NOT use the Enrichr Combined Score (the `score` field).
// Per the data team, recent Enrichr API responses omit the Z-score, so gseapy's
// `Combined Score = log(p)·z` collapses to `inf` for ~1/0.8 terms per CSV — a
// numerical artifact (small set / small overlap), not real signal, which the
// pipeline caps to 1e10. Sorting by it surfaces artifacts and its unbounded
// magnitude breaks bar comparison. Adjusted p (BH-corrected for the many GO
// terms tested per community) is always finite (~0–30) and is what we want.
function negLog10(pvalue: number): number {
  return -Math.log10(Math.max(pvalue, 1e-300)); // floor avoids −log10(0)=∞
}

export function EnrichmentBar({ terms, height }: Props) {
  const t = useT();
  if (!terms.length)
    return <EmptyBlock label={t("Enrichment 결과가 없습니다.", "No enrichment results.")} />;

  // Sort by significance (most significant first = smallest adjusted p); also
  // pre-compute rank within each category so alpha can step down per-category.
  const sorted = [...terms].sort((a, b) => a.pvalue - b.pvalue);
  const maxNL = Math.max(...sorted.map((t) => negLog10(t.pvalue)), 1);

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
        const nl = negLog10(g.pvalue);
        const widthPct = Math.max(8, (nl / maxNL) * 100);
        const rgb = CATEGORY_COLOR[g.category] ?? FALLBACK_COLOR;
        const rank = rankInCategory.get(g) ?? 1;
        const alpha = Math.max(ALPHA_FLOOR, 1 - (rank - 1) * ALPHA_STEP);
        const truncated = g.term.length > 64 ? g.term.slice(0, 61) + "…" : g.term;
        return (
          <div key={g.term} className="min-w-0">
            {/* Term on its own line. */}
            <div className="text-body-strong text-ink-secondary truncate mb-1" title={g.term}>
              {truncated}
            </div>
            {/* Badge + bar + p_adj + −log10 share one row, vertically centered on
                the bar so the numbers line up with the bar's mid-height. The
                category badge (solid color, black bold letters) sits at the bar's
                start; p_adj and −log10 are pushed right (ml-auto) to align across
                rows. */}
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 w-7 text-center rounded-sm px-1 py-0.5 text-caption font-bold leading-none text-black"
                style={{ background: `rgb(${rgb})` }}
                title={g.category}
              >
                {g.category}
              </span>
              <div className="relative h-2 w-[42%] rounded-full bg-surface-soft overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-base"
                  style={{
                    width: `${widthPct}%`,
                    background: `rgb(${rgb} / ${alpha})`,
                  }}
                />
              </div>
              <span className="ml-auto shrink-0 text-body text-ink-muted font-mono tabular">
                p<sub>adj</sub>={g.pvalue.toExponential(1)}
              </span>
              <span
                className="shrink-0 w-12 text-right text-body text-ink-secondary font-mono tabular"
                title={`−log10(adjusted p) = ${nl.toFixed(2)}`}
              >
                {nl.toFixed(1)}
              </span>
            </div>
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
        <span className="font-mono">{t("막대·숫자 = −log10(보정 p)", "bar · number = −log10(adj p)")}</span>
      </div>
    </div>
  );
}
