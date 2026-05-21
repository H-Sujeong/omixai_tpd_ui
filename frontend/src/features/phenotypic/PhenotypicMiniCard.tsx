import type { PhenotypicProfiling, TimeLapseFrame } from "@/types/api";

interface Props {
  phenotypic: PhenotypicProfiling | null;
  firstFrame: TimeLapseFrame | null;
  onJump: () => void;
}

/**
 * Compact phenotype reminder card shown above the PPI/Landscape row in
 * the Network tab. Lets users see "what does this drug do?" while
 * exploring "why does it do it?" — without leaving the Network view.
 *
 * Step 6 (2026-05-21). Pure addition. The whole card is one clickable
 * region; clicking it jumps to the full Phenotype tab.
 *
 * GR-score color follows the same convention as DrugSummaryPage:
 *   < 0    → status-error  (cells dying)
 *   < 0.5  → status-warning (cytostatic / slow)
 *   ≥ 0.5  → status-success (cells thriving)
 *
 * Render rule: if both `phenotypic` and `firstFrame` are null/empty the
 * component returns null so the Network tab grid doesn't show an empty
 * box.
 */
function grScoreColor(gr: number | null): string {
  if (gr === null) return "text-ink-secondary";
  if (gr < 0) return "text-status-error";
  if (gr < 0.5) return "text-status-warning";
  return "text-status-success";
}

export function PhenotypicMiniCard({ phenotypic, firstFrame, onJump }: Props) {
  const gr = phenotypic?.gr_score ?? null;
  const cls = phenotypic?.growth_class ?? null;

  if (gr === null && !cls && !firstFrame) return null;

  return (
    <button
      type="button"
      onClick={onJump}
      className="
        group w-full flex items-center gap-3 px-3 py-2.5
        rounded-lg border border-line bg-surface-card
        hover:border-brand-primary/45 hover:bg-surface-overlay
        focus-visible:border-brand-primary
        transition-colors duration-fast text-left
      "
    >
      {firstFrame && (
        <img
          src={firstFrame.image_url}
          alt="Time-lapse first frame"
          className="w-12 h-12 rounded-md object-cover bg-black flex-shrink-0"
          loading="lazy"
        />
      )}

      {gr !== null && (
        <div className="flex flex-col leading-tight">
          <span className="text-meta text-ink-muted uppercase tracking-wider font-semibold">
            GR score
          </span>
          <span className={`text-card font-bold tabular ${grScoreColor(gr)}`}>
            {gr.toFixed(3)}
          </span>
        </div>
      )}

      {cls && <span className="chip">{cls}</span>}

      <span className="ml-auto flex items-center gap-1 text-meta text-ink-muted group-hover:text-brand-primary transition-colors duration-fast">
        <span className="hidden md:inline">Open Phenotype</span>
        <span aria-hidden>→</span>
      </span>
    </button>
  );
}
