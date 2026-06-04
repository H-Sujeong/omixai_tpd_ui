import type { InsightFinding, InsightIcon, InsightSummary, KpiSentiment } from "@/types/api";
import { PanelCard } from "@/components/PanelCard";
import { EmptyBlock } from "@/components/LoadingBlock";
import { useT } from "@/store/uiLang";

interface Props {
  data: InsightSummary | null;
  target: string;
  communityId: number | null;
}

const ICON_GLYPH: Record<InsightIcon, string> = {
  pulse: "◉",
  warning: "⚠",
  info: "ⓘ",
  target: "◎",
  "trend-up": "↗",
  "trend-down": "↘",
};

const SENTIMENT_STYLE: Record<KpiSentiment, { dot: string; text: string }> = {
  positive: { dot: "bg-status-success", text: "text-status-success" },
  warning: { dot: "bg-status-warning", text: "text-status-warning" },
  negative: { dot: "bg-status-error", text: "text-status-error" },
  neutral: { dot: "bg-status-neutral", text: "text-ink-secondary" },
};

export function InsightSidebar({ data, target, communityId }: Props) {
  const t = useT();
  if (!data) return <EmptyBlock label={t("Insight 데이터 없음", "No insight data")} />;
  return (
    <aside className="flex flex-col gap-4">
      <PanelCard
        title="Mechanism summary"
        tooltip={t(
          "Primary mechanism of action — 모든 모듈에서 공유되는 컨텍스트",
          "Primary mechanism of action — context shared across all modules",
        )}
      >
        <p className="text-body text-ink-primary leading-relaxed">{data.mechanism}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">target · {target}</span>
          {communityId !== null && <span className="chip">community · {communityId}</span>}
        </div>
      </PanelCard>

      <PanelCard title="Key findings">
        {data.key_findings.length === 0 ? (
          <EmptyBlock label={t("findings 없음", "No findings")} />
        ) : (
          <ul className="space-y-3">
            {data.key_findings.map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="Biomarkers"
        tooltip={t(
          "Target과 PPI 상관이 높은 community 파트너",
          "Community partners with high PPI correlation to the target",
        )}
      >
        {data.biomarkers.length === 0 ? (
          <EmptyBlock label={t("biomarkers 없음", "No biomarkers")} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.biomarkers.map((b) => (
              <span
                key={b}
                className={`chip font-mono ${b === target ? "chip--active" : ""}`}
                title={b === target ? "primary target" : "PPI partner"}
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard title="Experimental notes">
        <ul className="text-body text-ink-secondary space-y-1.5 list-disc pl-4">
          {data.experimental_notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </PanelCard>
    </aside>
  );
}

function FindingRow({ finding }: { finding: InsightFinding }) {
  const s = SENTIMENT_STYLE[finding.sentiment];
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-card ${s.text}`} aria-hidden>{ICON_GLYPH[finding.icon]}</span>
          <h4 className={`text-body font-semibold ${s.text}`}>{finding.title}</h4>
        </div>
        {finding.detail && (
          <p className="text-meta text-ink-secondary leading-relaxed mt-0.5">{finding.detail}</p>
        )}
      </div>
    </li>
  );
}
