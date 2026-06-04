import { useEffect, useRef, useState } from "react";
import type { PpiPanel } from "@/types/api";
import { EXPORT_FORMATS, downloadText } from "./exportNetwork";
import { useT } from "@/store/uiLang";

interface Props {
  panel: PpiPanel;
  /** Base filename (without extension), e.g. "dbet6_BRD4_c94". */
  baseName: string;
}

/**
 * "Export ▾" dropdown for the current PPI community network. The user picks a
 * format; the file is generated client-side and downloaded.
 */
export function NetworkExportMenu({ panel, baseName }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const safeBase = (baseName || "ppi_network").replace(/[^A-Za-z0-9._-]+/g, "_");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="chip text-meta hover:text-brand-primary transition-colors duration-fast"
        onClick={() => setOpen((o) => !o)}
        title={t("현재 community 네트워크를 파일로 내보내기", "Export the current community network as a file")}
      >
        Export ▾
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 min-w-[220px] rounded-md border border-line bg-surface-card shadow-lg py-1">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.ext}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-meta text-ink-secondary hover:bg-surface-overlay hover:text-ink-primary"
              onClick={() => {
                downloadText(`${safeBase}.${f.ext}`, f.build(panel), f.mime);
                setOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
