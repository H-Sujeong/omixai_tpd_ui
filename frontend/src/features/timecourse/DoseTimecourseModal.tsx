import { useEffect, useMemo, useState } from "react";
import { useT } from "@/store/uiLang";
import { useDrugSummary, useTimecourse } from "@/api/queries";
import { StatusBadge } from "@/components/StatusBadge";
import type { DoseOption, ModuleTimecourse, TimeLabel } from "@/types/api";
import { ORDERED_TIMES, classifyPattern, PATTERN_BADGES } from "./TimecourseDrawer";

interface Props {
  open: boolean;
  onClose: () => void;
  plateId: string;
  drugId: string;
  target: string;
  drugName?: string;
  doseOptions: DoseOption[];
}

const COL_WIDTH = 720;        // accommodates table-fixed widths (220+3×110+110)
                              // + p-2 + vertical scrollbar with a few px headroom.
const COL_GAP = 12;
const BODY_X_PAD = 32;        // px-4 × 2 sides
const FIT_LIMIT = 3;          // up to 3 doses fit at once; ≥4 → horizontal scroll
const MIN_W = 560;
const MIN_H = 360;

/**
 * 농도별 비교 — modal with one Timecourse column per dose. Width auto-fits to
 * the dose count (capped at 3 columns); when there are 4+ doses the extras
 * scroll horizontally. Avg-PCC heatmap (signed) per design 2026-06-08.
 *
 * Resize: dedicated footer strip carries the SE grip so it never sits under
 * the body's scrollbars (CSS `resize: both` was being eaten by them).
 */
export function DoseTimecourseModal({
  open,
  onClose,
  plateId,
  drugId,
  target,
  drugName,
  doseOptions,
}: Props) {
  const t = useT();

  // Per-dose growth class — looked up from the plate's drug summary.
  const summary = useDrugSummary(plateId);
  const doseClassByUm = useMemo(() => {
    const map = new Map<number, string | null>();
    const row = summary.data?.find((r) => r.drug_id === drugId);
    row?.by_dose.forEach((bd) => map.set(bd.dose_um, bd.growth_class));
    return map;
  }, [summary.data, drugId]);

  // Initial size — tight-fit up to FIT_LIMIT doses, then cap. State captured
  // once on open so subsequent renders don't reset the user's resized box.
  const initial = useMemo(() => {
    const n = Math.max(1, Math.min(doseOptions.length, FIT_LIMIT));
    const desired = n * COL_WIDTH + (n - 1) * COL_GAP + BODY_X_PAD + 24;
    const w = Math.min(Math.max(MIN_W, desired), window.innerWidth - 32);
    const h = Math.round(window.innerHeight * 0.82);
    return {
      w,
      h,
      left: Math.max(16, Math.round((window.innerWidth - w) / 2)),
      top:  Math.max(16, Math.round((window.innerHeight - h) / 2)),
    };
  }, [doseOptions.length]);

  const [pos, setPos] = useState(initial);
  const [size, setSize] = useState({ w: initial.w, h: initial.h });
  // When the dose count changes (different drug → reopen), reset.
  useEffect(() => {
    setPos({ left: initial.left, top: initial.top, w: initial.w, h: initial.h });
    setSize({ w: initial.w, h: initial.h });
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sortedDoses = [...doseOptions].sort((a, b) => a.dose_um - b.dose_um);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const onMove = (ev: PointerEvent) => {
      const maxW = window.innerWidth - pos.left - 8;
      const maxH = window.innerHeight - pos.top - 8;
      setSize({
        w: Math.max(MIN_W, Math.min(maxW, startW + (ev.clientX - startX))),
        h: Math.max(MIN_H, Math.min(maxH, startH + (ev.clientY - startY))),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("농도별 비교", "Dose comparison")}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bg-surface-elevated border border-line rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{
          top: pos.top,
          left: pos.left,
          width: size.w,
          height: size.h,
        }}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-card font-semibold text-ink-primary">
              {t("농도별 비교", "Dose comparison")}
            </h2>
            {/* Hover-discoverable tip — same affordance pattern as PanelCard /
                TimecourseDrawer. Surfaces the top3 hover behavior + ★ meaning
                + color legend in one place, since the column UI is intentionally
                slim. */}
            <span className="relative inline-flex items-center group shrink-0" tabIndex={0}>
              <span
                className="text-ink-muted text-meta cursor-help select-none"
                aria-label={t(
                  "사용 안내",
                  "Usage tips",
                )}
              >
                ⓘ
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-80 max-w-[20rem] whitespace-pre-wrap rounded-md border border-line bg-surface-elevated px-3 py-2.5 text-meta text-ink-secondary leading-relaxed shadow-lg opacity-0 invisible transition-opacity duration-fast group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
              >
                {t(
                  "• 모듈 라벨에 커서를 대면 top3 GO term이 보입니다\n• ★ = 타깃이 속한 community\n• 칸 색 = 평균 PCC (파랑 −, 흰 0, 빨강 +)\n• 패턴 칩 = 0h→24h 자동 분류 (Formed/Amplified/Flipped/Dissolved/Stable/Weak)",
                  "• Hover a module label to reveal its top3 GO terms\n• ★ = target's community\n• Cell color = avg PCC (blue −, white 0, red +)\n• Pattern chip = automatic 0h→24h verdict (Formed/Amplified/Flipped/Dissolved/Stable/Weak)",
                )}
              </span>
            </span>
            <span className="text-body text-ink-muted truncate">
              {drugName ? `${drugName} · ` : ""}{target}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("닫기", "Close")}
            className="text-ink-muted hover:text-ink-primary text-body-strong px-2 py-1"
          >
            ✕
          </button>
        </header>

        {/* Column track — fixed-width columns, horizontal scroll on overflow. */}
        <div className="flex-1 overflow-auto px-4 py-4">
          <div className="flex flex-row gap-3 items-stretch h-full" style={{ minWidth: "fit-content" }}>
            {sortedDoses.map((opt) => (
              <DoseColumn
                key={opt.plate_id}
                plateId={plateId}
                drugId={drugId}
                target={target}
                dose={`${opt.dose_um}uM`}
                doseLabel={`${opt.dose_um} µM`}
                growthClass={doseClassByUm.get(opt.dose_um) ?? null}
              />
            ))}
          </div>
        </div>

        {/* Footer strip — dedicated row for the resize grip so the body's
            scrollbars never sit on top of it. h-6 keeps it visually minimal. */}
        <footer className="relative h-6 border-t border-line bg-surface-soft shrink-0">
          <div
            onPointerDown={startResize}
            className="absolute bottom-0 right-0 cursor-nwse-resize"
            style={{
              width: 22,
              height: 22,
              background:
                "linear-gradient(135deg, transparent 0 9px, var(--color-text-muted) 9px 11px, transparent 11px 13px, var(--color-text-muted) 13px 15px, transparent 15px 17px, var(--color-text-muted) 17px 19px, transparent 19px)",
            }}
            aria-label={t("크기 조절", "Resize")}
            title={t("드래그해서 크기 조절", "Drag to resize")}
          />
        </footer>
      </div>
    </div>
  );
}

function DoseColumn({
  plateId,
  drugId,
  target,
  dose,
  doseLabel,
  growthClass,
}: {
  plateId: string;
  drugId: string;
  target: string;
  dose: string;
  doseLabel: string;
  growthClass: string | null;
}) {
  const t = useT();
  const tc = useTimecourse(plateId, drugId, target, dose, true);
  const data = tc.data;
  const cols = (data?.available_times ?? []).filter((tl) => ORDERED_TIMES.includes(tl));
  const targetModule = data?.modules.find((m) => m.is_target) ?? null;

  return (
    <section
      className="shrink-0 rounded-lg border border-line bg-surface-card flex flex-col"
      style={{ width: COL_WIDTH }}
    >
      <header className="px-3 py-2 border-b border-line flex items-center gap-2 flex-wrap">
        <span className="text-body-strong text-ink-primary tabular">{doseLabel}</span>
        {growthClass && <StatusBadge growth_class={growthClass} />}
        {data && (
          <span className="text-meta text-ink-muted ml-auto">
            {t("primary", "primary")} {data.primary_time}
          </span>
        )}
      </header>

      {data && !targetModule && !tc.isLoading && !tc.error && (
        <div className="px-3 py-2 border-b border-line bg-status-warning/5">
          <p className="text-meta text-ink-primary font-bold" style={{ lineHeight: 1.4 }}>
            {t(
              `${target} 미속 — ${data.primary_time}`,
              `${target} not in community — ${data.primary_time}`,
            )}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto p-2">
        {tc.isLoading ? (
          <div className="text-ink-muted text-meta">{t("불러오는 중…", "Loading…")}</div>
        ) : tc.error ? (
          <div className="text-status-error text-meta">{String(tc.error)}</div>
        ) : !data || data.modules.length === 0 ? (
          <div className="text-ink-muted text-meta">
            {t("표시할 모듈이 없습니다.", "No modules.")}
          </div>
        ) : (
          <SlimModuleHeatmap modules={data.modules} cols={cols} t={t} />
        )}
      </div>
    </section>
  );
}

function SlimModuleHeatmap({
  modules,
  cols,
  t,
}: {
  modules: ModuleTimecourse[];
  cols: TimeLabel[];
  t: (ko: string, en: string) => string;
}) {
  // table-fixed + explicit colgroup widths so cells stay identical across
  // dose columns regardless of module-label length. Without this, browser
  // auto-layout redistributes width per-table based on content (the bug the
  // user spotted: 3 µM vs 10 µM had different heat-cell widths).
  // Sum: 286 + 88×3 + 110 = 660 — time cells trimmed 10% each side (110→88),
  // the freed 66px folded into Module so the top1 GO label has more room.
  return (
    <table
      className="border-separate border-spacing-0 w-full"
      style={{ tableLayout: "fixed" }}
    >
      <colgroup>
        <col style={{ width: 286 }} />
        {cols.map((tl) => <col key={tl} style={{ width: 88 }} />)}
        <col style={{ width: 110 }} />
      </colgroup>
      <thead>
        <tr>
          <th className="text-left text-meta text-ink-muted font-semibold pl-1 pb-1">
            {t("모듈 (top1 GO)", "Module (top1 GO)")}
          </th>
          {cols.map((tl) => (
            <th
              key={tl}
              className="text-meta text-ink-muted font-semibold tabular px-1 pb-1 text-center"
            >
              {tl}
            </th>
          ))}
          <th className="text-meta text-ink-muted font-semibold px-1 pb-1 text-center">
            {t("패턴", "Pattern")}
          </th>
        </tr>
      </thead>
      <tbody>
        {modules.map((m) => {
          const label = m.top_go[0]?.term ?? m.label;
          const pattern = classifyPattern(m);
          const badge = PATTERN_BADGES[pattern];
          return (
            <tr key={m.community_id} className="border-t border-line">
              <td className="align-middle pl-1 py-1 text-meta text-ink-secondary">
                <div
                  className="truncate font-medium"
                  title={m.top_go.length ? m.top_go.map((g) => g.term).join(" · ") : m.label}
                >
                  {m.is_target ? "★ " : ""}{label}
                </div>
              </td>
              {cols.map((tl) => {
                const cell = m.by_time[tl];
                return (
                  <td key={tl} className="align-middle px-1 py-1">
                    <SlimHeatCell cell={cell} />
                  </td>
                );
              })}
              <td className="align-middle px-1 py-1 text-center">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-meta font-semibold whitespace-nowrap"
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
  );
}

/**
 * Signed avg-PCC cell — blue (negative) ↔ white (0) ↔ red (positive), matching
 * TimecourseDrawer's avg_pcc mode. Two-decimal value, no n/N subtext.
 */
function SlimHeatCell({
  cell,
}: {
  cell:
    | { avg_pcc: number | null; participation_rate: number | null; n_measured: number; n_total: number }
    | undefined;
}) {
  if (!cell || cell.avg_pcc === null) {
    return (
      <div
        className="h-7 rounded border border-line bg-surface-soft"
        title="no measurement"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 5px)",
        }}
      />
    );
  }
  const z = cell.avg_pcc;
  const mag = Math.min(1, Math.abs(z) / 0.5);          // saturate at |0.5|
  const e = 0.10 + 0.85 * mag;
  const lo = [244, 246, 248];                          // near-white
  const hi = z >= 0 ? [220, 38, 38] : [37, 99, 235];   // red ↑ / blue ↓
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * e);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * e);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * e);
  return (
    <div
      className="h-7 rounded border border-line flex items-center justify-center text-meta tabular"
      style={{
        background: `rgb(${r},${g},${b})`,
        // Theme-independent: cell bg is the white↔blue/red lerp, so the text
        // is dark on the pale end (matches dark mode too) and white on the
        // saturated end. var(--color-text-secondary) was light in dark mode
        // and blended into the pale cell — fixed dark instead.
        color: mag > 0.5 ? "#fff" : "#0f172a",
      }}
      title={`avg PCC ${z >= 0 ? "+" : ""}${z.toFixed(3)} · ${cell.n_measured}/${cell.n_total} measured`}
    >
      {z >= 0 ? "+" : ""}{z.toFixed(2)}
    </div>
  );
}
