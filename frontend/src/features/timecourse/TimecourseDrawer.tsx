import { useState } from "react";
import { useTimecourse } from "@/api/queries";
import { useT } from "@/store/uiLang";
import type { ModuleTimecourse, TimeLabel } from "@/types/api";

/**
 * Tier 1 (opt-in v2) — "⊕ 시간축 분석" drawer.
 *
 * Module × time heatmap per design §3.5: rows = 24h-frame modules (top GO
 * term as label), cols = available timepoints (0h / 4h / 24h), cell color =
 * participation rate ("이 모듈에 동시에 켜진 단백질 비율") or signed avg PCC.
 *
 * Design discipline (§9.2, §0 caveat):
 *   - Layered on top of the v1 raw-toggle view, not replacing it.
 *   - Membership is fixed at the 24h frame — the question this view answers is
 *     "when does each 24h module light up?", not "which module did this
 *     protein move into".
 *   - Cells with no measured member at that time render as a faint dashed slot
 *     (no fabrication).
 */

interface Props {
  plateId: string | undefined;
  drugId: string | undefined;
  target: string | undefined;
  dose: string | undefined;
  /** When false the section skips the network and shows only the header. */
  enabled: boolean;
  onEnable?: () => void;
  /** Collapsed state is lifted to the parent so the ⊕ button in the Dynamics
   *  header can force-expand this section even after the user has collapsed it. */
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
  /** True when there aren't enough timepoints to build the heatmap — e.g.
   *  AZ-3137 / AR where the target wasn't measured in proteomics at all.
   *  Replaces the clickable expand row with a static "no data" notice. */
  unavailable: boolean;
}

type Metric = "participation" | "avg_pcc";

const ORDERED_TIMES: TimeLabel[] = ["0h", "4h", "24h"];

type Pattern = "new" | "amplify" | "flip-pos" | "flip-neg" | "dissolve" | "stable" | "noise";

interface PatternBadge {
  key: Pattern;
  ko: { label: string; description: string };
  en: { label: string; description: string };
  bg: string;       // background color
  fg: string;       // text color
}

const PATTERN_BADGES: Record<Pattern, PatternBadge> = {
  "new":       { key: "new",
                 ko: { label: "관계 형성",        description: "baseline은 약함 → 24h에 새 동변동 관계 형성" },
                 en: { label: "Formed",           description: "baseline weak → new co-variation by 24h" },
                 bg: "rgb(220 38 38 / 0.14)", fg: "#B91C1C" },
  "amplify":   { key: "amplify",
                 ko: { label: "관계 강화",        description: "baseline에 있던 동변동을 약물이 강화" },
                 en: { label: "Amplified",        description: "drug strengthened an existing co-variation" },
                 bg: "rgb(220 38 38 / 0.10)", fg: "#9F1239" },
  "flip-pos":  { key: "flip-pos",
                 ko: { label: "관계 반전 −→+",    description: "baseline 음상관 → 24h 양상관 (강한 약물 신호)" },
                 en: { label: "Flipped −→+",      description: "negative at baseline → positive at 24h (strong signal)" },
                 bg: "rgb(168 85 247 / 0.16)", fg: "#7E22CE" },
  "flip-neg":  { key: "flip-neg",
                 ko: { label: "관계 반전 +→−",    description: "baseline 양상관 → 24h 음상관 (강한 약물 신호)" },
                 en: { label: "Flipped +→−",      description: "positive at baseline → negative at 24h (strong signal)" },
                 bg: "rgb(37 99 235 / 0.14)", fg: "#1D4ED8" },
  "dissolve":  { key: "dissolve",
                 ko: { label: "관계 해체",        description: "baseline 강한 모듈이 24h에 약화/해체" },
                 en: { label: "Dissolved",        description: "strong baseline module weakened by 24h" },
                 bg: "rgb(37 99 235 / 0.10)", fg: "#1E40AF" },
  "stable":    { key: "stable",
                 ko: { label: "관계 유지",        description: "baseline부터 24h까지 비슷 — 약물 효과 미약" },
                 en: { label: "Stable",           description: "similar from baseline through 24h — drug effect weak" },
                 bg: "rgb(100 116 139 / 0.14)", fg: "#475569" },
  "noise":     { key: "noise",
                 ko: { label: "관계 약함",        description: "전 시점에서 약한 신호 — 무시할 만함" },
                 en: { label: "Weak",             description: "weak signal at every timepoint — negligible" },
                 bg: "rgb(100 116 139 / 0.08)", fg: "#64748B" },
};

/**
 * Classify a module's 0h→24h trajectory into one of the rule-based patterns
 * we tell users to look for (design §3.5 + 시간축 분석 핵심 4유형). 4h is
 * informative for kinetics but doesn't change the verdict. Falls back to
 * "noise" / "stable" when there isn't enough signal to commit.
 */
function classifyPattern(m: ModuleTimecourse): Pattern {
  const a0 = m.by_time["0h"]?.avg_pcc;
  const a24 = m.by_time["24h"]?.avg_pcc;
  const p0 = m.by_time["0h"]?.participation_rate;
  const p24 = m.by_time["24h"]?.participation_rate;
  if (a0 == null || a24 == null) return "noise";
  const STRONG = 0.20;
  const WEAK = 0.10;
  // Sign flip = strongest signal, check first.
  if (a0 <= -STRONG && a24 >= STRONG) return "flip-pos";
  if (a0 >= STRONG && a24 <= -STRONG) return "flip-neg";
  const m0 = Math.abs(a0);
  const m24 = Math.abs(a24);
  // Dissolve: was strong, became weak (and participation collapsed).
  if (m0 >= STRONG && m24 < WEAK && (p24 ?? 0) < (p0 ?? 0) - 0.2) return "dissolve";
  // New: was weak, became strong.
  if (m0 < WEAK && m24 >= STRONG) return "new";
  // Amplify: same sign, grew by ≥0.15 in |avg|.
  if (Math.sign(a0) === Math.sign(a24) && m24 - m0 >= 0.15) return "amplify";
  // Stable: change too small to commit either way.
  if (Math.abs(a24 - a0) < 0.10 && m24 >= WEAK) return "stable";
  return "noise";
}

export function TimecourseDrawer({
  plateId, drugId, target, dose,
  enabled, onEnable,
  collapsed, onCollapsedChange,
  unavailable,
}: Props) {
  const t = useT();
  const [metric, setMetric] = useState<Metric>("participation");
  const tc = useTimecourse(plateId, drugId, target, dose, enabled);

  const handleToggle = () => {
    // Opening for the first time also kicks off the fetch — the toggle IS the
    // "run analysis" action; no separate ⊕ button needed below.
    const next = !collapsed;
    if (!next && !enabled) onEnable?.();
    onCollapsedChange(next);
  };

  const data = tc.data;
  const cols = (data?.available_times ?? []).filter((tl) => ORDERED_TIMES.includes(tl));

  // Target community row — what stays visible while the section is collapsed.
  const targetModule = data?.modules.find((m) => m.is_target) ?? null;

  return (
    <section
      id="timecourse"
      className="panel-card scroll-mt-[200px]"
      // panel-card sets overflow:hidden so child contents can't escape the
      // rounded corners — but that also clips the ⓘ tooltip when the section
      // is collapsed (the tooltip wants to pop down past the card's bottom
      // edge). Override here so the tooltip can extend outside while the rest
      // of the layout stays inside.
      style={{ overflow: "visible" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-body-strong text-ink-secondary">
            {t("Timecourse", "Timecourse")}
          </span>
          {/* Info tooltip — same affordance as PanelCard's ⓘ. Explains the
              fixed-frame meaning + 0h baseline = pre-treatment, the key idea
              for reading the heatmap. */}
          <span className="relative inline-flex items-center group shrink-0" tabIndex={0}>
            <span
              className="text-ink-muted text-meta cursor-help select-none"
              aria-label={t(
                "이 표 = 약물이 만든 변화. 0h = 약물 처리 전 baseline. 24h 모듈을 고정 그릇으로 두고 그 안 멤버의 0h/4h/24h corr을 비교.",
                "This table shows changes the drug caused. 0h = pre-treatment baseline. 24h modules are fixed bins; their members' corr is compared across 0h/4h/24h.",
              )}
            >
              ⓘ
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-80 max-w-[20rem] whitespace-pre-wrap rounded-md border border-line bg-surface-elevated px-3 py-2.5 text-meta text-ink-secondary leading-relaxed shadow-lg opacity-0 invisible transition-opacity duration-fast group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
            >
              {t(
                "• 이 표 = 약물이 만든 변화\n• 0h = 약물 처리 전 baseline\n• 행 = 24h primary frame의 모듈 (라벨 = top GO term)\n• 열 = 가용 시점 (0h / 4h / 24h)\n• 칸 색 = 그 시점의 모듈 신호 (참여율 또는 평균 PCC)\n• ★ = 타깃 community · 패턴 chip = 자동 분류",
                "• Each row = a 24h-frame module (label = top GO term)\n• Columns = available timepoints (0h / 4h / 24h)\n• 0h = pre-treatment baseline, so cells show how the drug shifted each module\n• Cell color = module's signal at that time (participation rate or mean PCC)\n• ★ = target community · Pattern chip = automatic 4-class verdict",
              )}
            </span>
          </span>
          <span className="text-meta text-ink-muted">
            {t("Tier 1 (opt-in v2) · 24h 모듈 고정", "Tier 1 (opt-in v2) · 24h frame fixed")}
          </span>
        </div>
        {enabled && !collapsed && (
          <div className="flex items-center gap-1.5 shrink-0" role="tablist" aria-label="metric">
            <button
              type="button"
              role="tab"
              aria-selected={metric === "participation"}
              onClick={() => setMetric("participation")}
              className={
                "rounded-md border px-2.5 py-1 text-body font-medium transition-colors duration-fast " +
                (metric === "participation"
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-line bg-surface-soft hover:bg-surface-elevated text-ink-secondary")
              }
              title={t("|corr|≥임계 비율", "share of members with |corr|≥threshold")}
            >
              {t("참여율", "participation")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={metric === "avg_pcc"}
              onClick={() => setMetric("avg_pcc")}
              className={
                "rounded-md border px-2.5 py-1 text-body font-medium transition-colors duration-fast " +
                (metric === "avg_pcc"
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-line bg-surface-soft hover:bg-surface-elevated text-ink-secondary")
              }
              title={t("멤버 평균 corr (부호 ±)", "mean signed corr across members")}
            >
              {t("평균 PCC", "avg PCC")}
            </button>
          </div>
        )}
      </div>

      {/* Collapsed body — three states:
          1) unavailable: static "no data" notice (NOT clickable; nothing to run).
          2) enabled + has target row: summary of the target community.
          3) default: clickable "⊕ Expand to run the analysis" prompt.
          Aligned to px-4 so text starts at the same x as the "Timecourse"
          header. */}
      {collapsed && (
        unavailable ? (
          <div className="px-4 py-3 text-body text-ink-muted">
            <span className="font-semibold text-ink-secondary">
              {t("데이터 없음", "No data")}
            </span>
            {" · "}
            <span>
              {t(
                "표적이 proteomics에서 검출되지 않음",
                "target was not detected in the proteomics measurements",
              )}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={false}
            aria-controls="timecourse-body"
            className="w-full text-left px-4 py-3 hover:bg-surface-soft transition-colors"
            title={t("펼치기", "Expand")}
          >
            {enabled && targetModule ? (
              <CollapsedTargetRow module={targetModule} cols={cols} metric={metric} t={t} />
            ) : enabled ? (
              <span className="text-body text-ink-muted">
                {t("타깃 community 데이터 없음 · 클릭하여 펼치기", "No target community · click to expand")}
              </span>
            ) : (
              <span className="text-body text-brand-primary font-semibold">
                ⊕ {t("펼쳐서 분석 시작", "Expand to run the analysis")}
              </span>
            )}
          </button>
        )
      )}

      <div id="timecourse-body" className={collapsed ? "hidden" : ""}>
        <div className="p-5">
          {tc.isLoading ? (
            <div className="text-ink-muted">{t("불러오는 중…", "Loading…")}</div>
          ) : tc.error ? (
            <div className="text-status-error">{String(tc.error)}</div>
          ) : !data || data.modules.length === 0 ? (
            <div className="text-ink-muted">
              {t("표시할 모듈이 없습니다.", "No modules to show.")}
            </div>
          ) : (
            <>
              <HeatmapLegend
                metric={metric}
                threshold={data.participation_threshold}
                t={t}
              />
              <ModuleTimeHeatmap modules={data.modules} cols={cols} metric={metric} t={t} />
            </>
          )}
        </div>
        {/* Collapse trigger anchored at the bottom of the expanded box — same
            text-x as the header so the chrome reads symmetric. */}
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded
          className="w-full text-left px-4 py-3 border-t border-line hover:bg-surface-soft transition-colors text-body text-ink-muted font-semibold"
          title={t("접기", "Collapse")}
        >
          ▾ {t("접기", "Collapse")}
        </button>
      </div>
    </section>
  );
}

function CollapsedTargetRow({
  module: m,
  cols,
  metric,
  t,
}: {
  module: ModuleTimecourse;
  cols: TimeLabel[];
  metric: Metric;
  t: (ko: string, en: string) => string;
}) {
  const pattern = classifyPattern(m);
  const badge = PATTERN_BADGES[pattern];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-meta text-ink-muted font-mono shrink-0">
        ★ c{m.community_id}
      </span>
      <span className="text-body font-medium truncate min-w-0 flex-1">
        {m.label}
        {m.top_go[0] && (
          <span className="text-meta text-ink-muted ml-2 font-normal">
            · p<sub>adj</sub>={m.top_go[0].pvalue.toExponential(1)}
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {cols.map((tl) => {
          const cell = m.by_time[tl];
          return (
            <div key={tl} className="flex flex-col items-center">
              <span className="text-meta text-ink-muted font-mono">{tl}</span>
              <div className="w-[88px]">
                <HeatCell metric={metric} cell={cell} />
              </div>
            </div>
          );
        })}
      </div>
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap shrink-0"
        style={{ background: badge.bg, color: badge.fg }}
        title={t(badge.ko.description, badge.en.description)}
      >
        {t(badge.ko.label, badge.en.label)}
      </span>
    </div>
  );
}

function HeatmapLegend({
  metric,
  threshold,
  t,
}: {
  metric: Metric;
  threshold: number;
  t: (ko: string, en: string) => string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-muted">
      <span>
        {metric === "participation"
          ? t(
              `참여율 = 멤버 중 |corr|≥${threshold.toFixed(2)} 비율 · 칸 작은 글씨 = 측정/전체 멤버`,
              `participation = share of members with |corr|≥${threshold.toFixed(2)} · small text = measured/total`,
            )
          : t(
              "평균 PCC = 멤버 평균 (빨강=상향, 파랑=하향) · 작은 글씨 = 측정/전체 멤버",
              "avg PCC = signed mean across members (red up, blue down) · small text = measured/total",
            )}
      </span>
      <span>· {t("★ = 타깃 community", "★ = target community")}</span>
      <span>· {t("회색 빗금 = 측정 없음", "hatched gray = no measurement")}</span>
    </div>
  );
}

function ModuleTimeHeatmap({
  modules,
  cols,
  metric,
  t,
}: {
  modules: ModuleTimecourse[];
  cols: TimeLabel[];
  metric: Metric;
  t: (ko: string, en: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 w-full">
        <thead className="sticky top-0 bg-surface-elevated z-10">
          <tr>
            <th className="text-center text-meta text-ink-muted font-semibold px-2 pb-2 w-[320px]">
              Module (24h frame)
            </th>
            <th className="text-center text-meta text-ink-muted font-semibold px-2 pb-2 w-[64px]">
              N
            </th>
            {cols.map((tl) => (
              <th
                key={tl}
                className="text-meta text-ink-muted font-semibold tabular px-2 pb-2 w-[120px] text-center"
              >
                {tl}
              </th>
            ))}
            <th className="text-center text-meta text-ink-muted font-semibold px-2 pb-2 w-[110px]">
              Pattern
            </th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const pattern = classifyPattern(m);
            const badge = PATTERN_BADGES[pattern];
            return (
              <tr key={m.community_id} className="border-t border-line">
                <td className="align-middle px-2 py-1.5 text-body text-ink-secondary text-center">
                  {/* Top-1 GO + its adjusted p — the headline. */}
                  <div
                    className="truncate font-medium"
                    title={
                      m.top_go.length
                        ? m.top_go
                            .map((g) => `${g.term} · p_adj=${g.pvalue.toExponential(1)} · ${g.category}`)
                            .join("\n")
                        : m.label
                    }
                  >
                    {m.is_target ? "★ " : ""}
                    {m.label}
                    {m.top_go[0] && (
                      <span className="text-meta text-ink-muted ml-1 font-normal">
                        · p<sub>adj</sub>={m.top_go[0].pvalue.toExponential(1)}
                      </span>
                    )}
                  </div>
                  {/* community id + top-2/3 GO terms as supporting context for
                      multi-functional modules. */}
                  <div className="text-meta text-ink-muted truncate">
                    <span className="font-mono">c{m.community_id}</span>
                    {m.top_go.slice(1, 3).map((g) => (
                      <span key={g.term} className="ml-2">
                        · {g.term}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="align-middle px-2 py-1.5 text-meta text-ink-secondary tabular text-center">
                  {m.size}
                </td>
                {cols.map((tl) => {
                  const cell = m.by_time[tl];
                  return (
                    <td key={tl} className="align-middle px-2 py-1.5">
                      <HeatCell metric={metric} cell={cell} />
                    </td>
                  );
                })}
                <td className="align-middle px-2 py-1.5 text-center">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap"
                    style={{ background: badge.bg, color: badge.fg }}
                    title={t(badge.ko.description, badge.en.description)}
                  >
                    {t(badge.ko.label, badge.en.label)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeatCell({
  metric,
  cell,
}: {
  metric: Metric;
  cell: { avg_pcc: number | null; participation_rate: number | null; n_measured: number; n_total: number } | undefined;
}) {
  if (!cell || (cell.avg_pcc === null && cell.participation_rate === null)) {
    return (
      <div
        className="h-9 rounded-md border border-line bg-surface-soft"
        title="no measurement"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.06) 4px, rgba(0,0,0,0.06) 6px)",
        }}
      />
    );
  }

  if (metric === "participation") {
    const v = Math.max(0, Math.min(1, cell.participation_rate ?? 0));
    // White → brand-primary lerp (same lerp pattern as avg_pcc below) so the
    // intensity reads visually at the same "weight" as the PCC heatmap.
    const e = 0.06 + 0.94 * v;
    const lo = [244, 246, 248];                          // near-white
    const hi = [168, 85, 247];                           // brand-primary
    const r = Math.round(lo[0] + (hi[0] - lo[0]) * e);
    const g = Math.round(lo[1] + (hi[1] - lo[1]) * e);
    const b = Math.round(lo[2] + (hi[2] - lo[2]) * e);
    return (
      <div
        className="h-12 rounded-md border border-line flex flex-col items-center justify-center text-meta tabular"
        style={{
          background: `rgb(${r},${g},${b})`,
          color: e > 0.55 ? "#fff" : "var(--color-text-secondary)",
        }}
        title={`participation ${(v * 100).toFixed(0)}% · ${cell.n_measured}/${cell.n_total} measured`}
      >
        <span className="leading-tight">{(v * 100).toFixed(0)}%</span>
        <span className="text-[10px] opacity-75 leading-tight">
          {cell.n_measured}/{cell.n_total}
        </span>
      </div>
    );
  }

  // avg_pcc — signed: blue down ↔ white 0 ↔ red up.
  const z = cell.avg_pcc ?? 0;
  const mag = Math.min(1, Math.abs(z) / 0.5);          // saturate at |0.5|
  const e = 0.10 + 0.85 * mag;
  const lo = [244, 246, 248];                          // near-white
  const hi = z >= 0 ? [220, 38, 38] : [37, 99, 235];
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * e);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * e);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * e);
  return (
    <div
      className="h-12 rounded-md border border-line flex flex-col items-center justify-center text-meta tabular"
      style={{ background: `rgb(${r},${g},${b})`, color: mag > 0.5 ? "#fff" : "var(--color-text-secondary)" }}
      title={`avg PCC ${z >= 0 ? "+" : ""}${z.toFixed(3)} · ${cell.n_measured}/${cell.n_total} measured`}
    >
      <span className="leading-tight">{z >= 0 ? "+" : ""}{z.toFixed(2)}</span>
      <span className="text-[10px] opacity-75 leading-tight">
        {cell.n_measured}/{cell.n_total}
      </span>
    </div>
  );
}
