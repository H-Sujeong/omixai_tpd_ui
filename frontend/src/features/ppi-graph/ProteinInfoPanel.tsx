import type { ReactNode } from "react";
import { useProtein } from "@/api/queries";
import { useT, useUiLang } from "@/store/uiLang";
import type { ProteinInfo } from "@/types/api";

interface Props {
  /** Gene symbol of the selected node (drives the data). */
  gene: string | null;
  /** Panel visibility. Closing (✕) hides the panel but keeps the node selected. */
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-out protein info panel that expands from the right edge inside the PPI
 * Network box when a node is selected. Shows the 5 researcher-intuitive facts
 * (function, family/domain, size, localization, structures) + UniProt / STRING
 * / PDB links. Data is fetched on demand from UniProt (cached server-side).
 */
export function ProteinInfoPanel({ gene, open, onClose }: Props) {
  const lang = useUiLang((s) => s.lang);
  const t = useT();
  const { data, isLoading } = useProtein(gene, lang);

  return (
    <aside
      className={`absolute inset-y-0 right-0 w-[62%] max-w-[420px] bg-surface-card border-l border-line shadow-lg z-20 flex flex-col transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="font-mono text-body text-ink-primary truncate">{gene ?? ""}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close protein info"
          className="text-ink-muted hover:text-ink-primary px-1 leading-none"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 text-body">
        {isLoading || !data ? (
          <ProteinSkeleton />
        ) : (
          <div className="space-y-3">
            {data.found ? (
              <>
                {data.protein_name && (
                  <div className="text-ink-primary font-medium leading-snug">
                    {data.protein_name}
                  </div>
                )}
                <Field label={t("기능", "Function")}>
                  {data.summary.length ? (
                    <ul className="list-disc pl-4 space-y-0.5">
                      {data.summary.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    data.function ?? "—"
                  )}
                </Field>
                <Field label={t("패밀리 / 도메인", "Family / domain")}>
                  {data.families.length ? data.families.join(" · ") : "—"}
                </Field>
                <Field label={t("크기", "Size")}>
                  {data.length ?? "—"} aa · {data.mass_kda ?? "—"} kDa
                </Field>
                <Field label={t("세포내 위치", "Localization")}>
                  {data.subcellular.length ? data.subcellular.join(", ") : "—"}
                </Field>
                <Field label={t("구조 (PDB)", "Structures (PDB)")}>
                  {data.pdb_count > 0
                    ? `${data.pdb_count}${t("개", "")}` +
                      (data.pdb_ids.length
                        ? ` · ${data.pdb_ids.slice(0, 3).join(", ")}${
                            data.pdb_count > 3 ? " …" : ""
                          }`
                        : "")
                    : t("구조 없음", "no structures")}
                </Field>
              </>
            ) : (
              <p className="text-meta text-ink-muted">
                {t(
                  "UniProt에서 이 단백질 정보를 찾지 못했습니다. 아래 검색 링크로 확인하세요.",
                  "No UniProt entry found for this protein. Use the search links below.",
                )}
              </p>
            )}

            <DbLinks links={data.links} />
          </div>
        )}
      </div>
    </aside>
  );
}

/** Pulsing skeleton shown while the protein info (incl. LLM summary) loads. */
function ProteinSkeleton() {
  const t = useT();
  const bar = "rounded bg-surface-overlay";
  const labels = [
    t("기능", "Function"),
    t("패밀리 / 도메인", "Family / domain"),
    t("크기", "Size"),
    t("세포내 위치", "Localization"),
    t("구조 (PDB)", "Structures (PDB)"),
  ];
  return (
    <div className="animate-pulse space-y-3">
      <div className={`${bar} h-4 w-2/3`} />
      <div className="space-y-1.5">
        <div className="text-meta text-ink-muted">{labels[0]}</div>
        <div className={`${bar} h-3 w-full`} />
        <div className={`${bar} h-3 w-11/12`} />
        <div className={`${bar} h-3 w-4/5`} />
      </div>
      {labels.slice(1).map((l) => (
        <div key={l} className="space-y-1">
          <div className="text-meta text-ink-muted">{l}</div>
          <div className={`${bar} h-3 w-1/2`} />
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <div className={`${bar} h-5 w-16`} />
        <div className={`${bar} h-5 w-16`} />
        <div className={`${bar} h-5 w-16`} />
      </div>
      <div className="text-meta text-ink-muted pt-1">{t("불러오는 중…", "Loading…")}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-meta text-ink-muted">{label}</div>
      <div className="text-ink-secondary leading-snug">{children}</div>
    </div>
  );
}

function DbLinks({ links }: { links: ProteinInfo["links"] }) {
  const items: Array<[string, string | undefined]> = [
    ["UniProt", links.uniprot],
    ["STRING", links.string],
    ["PDB", links.pdb],
  ];
  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
      {items.map(([label, href]) =>
        href ? (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="chip text-meta hover:text-brand-primary transition-colors duration-fast"
          >
            {label} ↗
          </a>
        ) : null,
      )}
    </div>
  );
}
