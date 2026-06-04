import { useEffect, useMemo, useRef, useState } from "react";
import { type ExportCtx, buildBulkZip, downloadBlob, exportGroups } from "./bulkExport";
import { useT } from "@/store/uiLang";

interface Props {
  ctx: ExportCtx;
  /** ZIP filename base, e.g. "D3_10_dBET6_BRD4". */
  zipBase: string;
}

/**
 * Header bulk export: pick which boxes/formats to export (checkboxes) for the
 * currently-selected target, then download them together as a single ZIP.
 */
export function DashboardExportMenu({ ctx, zipBase }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => exportGroups(ctx), [ctx]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectableIds = useMemo(
    () => groups.flatMap((g) => g.items.filter((i) => i.available).map((i) => i.id)),
    [groups],
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));
  const toggleAll = () =>
    setSel(allSelected ? new Set() : new Set(selectableIds));

  const count = selectableIds.filter((id) => sel.has(id)).length;

  async function run() {
    if (count === 0 || busy) return;
    setBusy(true);
    try {
      const blob = await buildBulkZip(sel, ctx);
      const safe = zipBase.replace(/[^A-Za-z0-9._-]+/g, "_");
      downloadBlob(`${safe}.zip`, blob);
      setOpen(false);
    } catch (e) {
      console.error("bulk export failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn--ghost text-body font-medium px-3 py-1.5"
        onClick={() => setOpen((o) => !o)}
        title={t(
          "현재 target의 선택 항목을 ZIP으로 일괄 내보내기",
          "Export the selected items for the current target as a single ZIP",
        )}
      >
        Export ⬇
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-40 w-[260px] rounded-md border border-line bg-surface-card shadow-lg p-3 text-meta">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-ink-primary">Export (ZIP)</span>
            <button type="button" className="text-ink-muted hover:text-ink-primary" onClick={toggleAll}>
              {allSelected ? t("전체 해제", "Deselect all") : t("전체 선택", "Select all")}
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto space-y-2">
            {groups.map((g) => (
              <div key={g.box}>
                <div className="text-ink-secondary font-medium">{g.box}</div>
                <div className="pl-1">
                  {g.items.map((it) => (
                    <label
                      key={it.id}
                      className={`flex items-center gap-1.5 py-0.5 ${
                        it.available ? "text-ink-secondary" : "text-ink-muted opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!it.available}
                        checked={sel.has(it.id)}
                        onChange={() => toggle(it.id)}
                        className="accent-brand-primary"
                      />
                      <span>{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--primary text-caption w-full mt-3 py-1 disabled:opacity-50"
            disabled={count === 0 || busy}
            onClick={run}
          >
            {busy ? t("생성 중…", "Generating…") : `Download ZIP (${count})`}
          </button>
        </div>
      )}
    </div>
  );
}
