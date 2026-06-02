import type { KpiMetric, KpiSentiment } from "@/types/api";

interface Props {
  kpis: KpiMetric[];
}

const SENTIMENT_RING: Record<KpiSentiment, string> = {
  positive: "ring-status-success/30",
  warning: "ring-status-warning/30",
  negative: "ring-status-error/30",
  neutral: "ring-line",
};

const SENTIMENT_TEXT: Record<KpiSentiment, string> = {
  positive: "text-status-success",
  warning: "text-status-warning",
  negative: "text-status-error",
  neutral: "text-ink-secondary",
};

const ARROW: Record<NonNullable<KpiMetric["direction"]>, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export function KpiStrip({ kpis }: Props) {
  if (!kpis?.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((k) => {
        const sent: KpiSentiment = k.sentiment ?? "neutral";
        return (
          <div
            key={k.label}
            className={`kpi-tile ring-1 ring-inset ${SENTIMENT_RING[sent]}`}
            aria-label={`${k.label}: ${k.value}`}
          >
            {/* Value first — the scan target. Was label-then-value; user
             *  asked to flip so the page's headline numbers register
             *  immediately and the supporting text drops below. */}
            <div
              className={`kpi-tile__value ${sent !== "neutral" ? SENTIMENT_TEXT[sent] : ""}`}
            >
              {k.value}
            </div>
            <div className="flex items-center justify-between">
              <span className="kpi-tile__label">{k.label}</span>
              {k.direction && (
                <span className={`text-meta ${SENTIMENT_TEXT[sent]}`} aria-hidden>
                  {ARROW[k.direction]}
                </span>
              )}
            </div>
            {k.hint && <div className="kpi-tile__hint">{k.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}
