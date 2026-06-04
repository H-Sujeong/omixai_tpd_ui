import { useMemo, useState } from "react";
import JSZip from "jszip";
import { apiGet } from "@/api/client";
import type { DashboardResponse, DrugSummaryRow } from "@/types/api";
import { ctxFromDashboard, downloadBlob, exportGroups } from "./bulkExport";
import { useT } from "@/store/uiLang";

interface Props {
  plateId: string;
  /** asset-bearing drugs (has_dashboard_assets) for this plate. */
  drugs: DrugSummaryRow[];
}

const FORMATS: Array<{ id: string; label: string }> = [
  { id: "ppi.graphml", label: "PPI · GraphML" },
  { id: "ppi.edges", label: "PPI · Edge CSV" },
  { id: "ppi.nodes", label: "PPI · Node CSV" },
  { id: "ppi.genes", label: "PPI · Gene list" },
  { id: "ppi.json", label: "PPI · JSON" },
  { id: "landscape.csv", label: "Landscape CSV" },
  { id: "enrichment.csv", label: "Enrichment CSV" },
  { id: "profiling.csv", label: "Profiling CSV" },
  { id: "timelapse.gif", label: "Time-lapse GIF" },
];
const DEFAULT_FORMATS = ["ppi.graphml", "landscape.csv", "enrichment.csv", "profiling.csv"];

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
const tkey = (drugId: string, target: string) => `${drugId}::${target}`;

/**
 * Plate-level bulk export. Pick asset drugs / targets / formats; fetches each
 * drug×target dashboard and packs the chosen boxes into {plateId}.zip with a
 * {plate}/{drug}/{target}/{file} folder hierarchy.
 */
export function PlateExportMenu({ plateId, drugs }: Props) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<Set<string>>(new Set(DEFAULT_FORMATS));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // All drug×target pairs (asset drugs), default all selected.
  const allKeys = useMemo(
    () => drugs.flatMap((d) => d.targets.map((t) => tkey(d.drug_id, t.target))),
    [drugs],
  );
  const [sel, setSel] = useState<Set<string>>(new Set(allKeys));

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  };
  const toggleDrug = (d: DrugSummaryRow) => {
    const keys = d.targets.map((t) => tkey(d.drug_id, t.target));
    const allOn = keys.every((k) => sel.has(k));
    setSel((s) => {
      const n = new Set(s);
      keys.forEach((k) => (allOn ? n.delete(k) : n.add(k)));
      return n;
    });
  };

  const selCount = allKeys.filter((k) => sel.has(k)).length;
  const canRun = selCount > 0 && formats.size > 0 && !busy;

  async function run() {
    if (!canRun) return;
    setBusy(true);
    const tasks = drugs.flatMap((d) =>
      d.targets
        .filter((t) => sel.has(tkey(d.drug_id, t.target)))
        .map((t) => ({ drugId: d.drug_id, drugName: d.drug_name, target: t.target })),
    );
    setProgress({ done: 0, total: tasks.length });
    const zip = new JSZip();
    for (const task of tasks) {
      try {
        const r = await apiGet<DashboardResponse>(
          `/api/v1/plates/${plateId}/drugs/${task.drugId}/dashboard`,
          { target: task.target },
        );
        const items = exportGroups(ctxFromDashboard(r)).flatMap((g) => g.items);
        const folder = `${safe(plateId)}/${safe(task.drugName)}/${safe(task.target)}`;
        for (const it of items) {
          if (!formats.has(it.id) || !it.available) continue;
          zip.file(`${folder}/${it.file}`, await it.build());
        }
      } catch (e) {
        console.error("plate export failed for", task, e);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${safe(plateId)}.zip`, blob);
    setBusy(false);
    setProgress(null);
    setOpen(false);
  }

  if (drugs.length === 0) return null;

  return (
    <>
      <button type="button" className="btn btn--ghost text-body font-medium px-3 py-1.5" onClick={() => setOpen(true)}>
        Export plate ⬇
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={() => !busy && setOpen(false)}>
          <div
            className="bg-surface-card border border-line rounded-lg shadow-lg w-[560px] max-w-[94vw] max-h-[88vh] flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <span className="font-semibold text-ink-primary">Plate export — {plateId}</span>
              <button className="text-ink-muted hover:text-ink-primary" onClick={() => !busy && setOpen(false)}>✕</button>
            </div>

            <div className="px-4 py-3 overflow-y-auto text-meta space-y-3">
              {/* Formats */}
              <div>
                <div className="text-ink-secondary font-medium mb-1">{tr("포맷", "Formats")}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {FORMATS.map((f) => (
                    <label key={f.id} className="flex items-center gap-1.5 text-ink-secondary">
                      <input
                        type="checkbox"
                        className="accent-brand-primary"
                        checked={formats.has(f.id)}
                        onChange={() => setFormats((s) => toggle(s, f.id))}
                      />
                      <span>
                        {f.id === "timelapse.gif"
                          ? tr("Time-lapse GIF (느림)", "Time-lapse GIF (slow)")
                          : f.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="text-ink-muted mt-1">
                  {tr(
                    "* 선택 항목에 따라 시간이 오래 소요될 수 있습니다.",
                    "* Depending on the selected items, this may take a while.",
                  )}
                </div>
                {formats.has("timelapse.gif") && (
                  <div className="text-status-warning mt-0.5">
                    {tr(
                      "⚠ GIF는 약물마다 인코딩이라 느리고 용량이 큽니다.",
                      "⚠ GIFs are encoded per drug — slow and large in size.",
                    )}
                  </div>
                )}
              </div>

              {/* Drugs / targets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-ink-secondary font-medium">
                    {tr(
                      `약물 / 타겟 (asset ${drugs.length}개, 선택 ${selCount})`,
                      `Drugs / targets (${drugs.length} assets, ${selCount} selected)`,
                    )}
                  </span>
                  <button
                    className="text-ink-muted hover:text-ink-primary"
                    onClick={() => setSel(selCount === allKeys.length ? new Set() : new Set(allKeys))}
                  >
                    {selCount === allKeys.length ? tr("전체 해제", "Deselect all") : tr("전체 선택", "Select all")}
                  </button>
                </div>
                <div className="max-h-[260px] overflow-y-auto border border-line rounded">
                  {drugs.map((d) => {
                    const keys = d.targets.map((t) => tkey(d.drug_id, t.target));
                    const allOn = keys.every((k) => sel.has(k));
                    return (
                      <div key={d.drug_id} className="px-2 py-1 border-b border-line/50 last:border-0">
                        <label className="flex items-center gap-1.5 text-ink-primary">
                          <input type="checkbox" className="accent-brand-primary" checked={allOn} onChange={() => toggleDrug(d)} />
                          <span className="truncate">{d.drug_name}</span>
                        </label>
                        <div className="pl-5 flex flex-wrap gap-x-3">
                          {d.targets.map((t) => (
                            <label key={t.target} className="flex items-center gap-1 text-ink-secondary">
                              <input
                                type="checkbox"
                                className="accent-brand-primary"
                                checked={sel.has(tkey(d.drug_id, t.target))}
                                onChange={() => setSel((s) => toggle(s, tkey(d.drug_id, t.target)))}
                              />
                              <span>{t.target}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-line flex items-center justify-between gap-3">
              <span className="text-meta text-ink-muted">
                {busy && progress
                  ? tr(`생성 중 ${progress.done}/${progress.total}…`, `Generating ${progress.done}/${progress.total}…`)
                  : tr(`${selCount} target × ${formats.size} 포맷`, `${selCount} target × ${formats.size} formats`)}
              </span>
              <button type="button" className="btn btn--primary text-caption px-3 py-1 disabled:opacity-50" disabled={!canRun} onClick={run}>
                {busy ? tr("ZIP 생성 중…", "Generating ZIP…") : "Download ZIP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
