import type { ReactNode } from "react";
import { useProtein, useProteinSummary } from "@/api/queries";
import { LoadingBlock } from "@/components/LoadingBlock";
import type { ProteinInfo } from "@/types/api";

interface Props {
  /** Gene symbol of the selected node; null = panel closed. */
  gene: string | null;
  onClose: () => void;
}

/**
 * Slide-out protein info panel that expands from the right edge inside the PPI
 * Network box when a node is selected. Shows the 5 researcher-intuitive facts
 * (function, family/domain, size, localization, structures) + UniProt / STRING
 * / PDB links. Data is fetched on demand from UniProt (cached server-side).
 */
export function ProteinInfoPanel({ gene, onClose }: Props) {
  const { data, isLoading } = useProtein(gene);
  const summaryQ = useProteinSummary(gene);
  const open = !!gene;

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
          <LoadingBlock />
        ) : (
          <div className="space-y-3">
            {data.found ? (
              <>
                {data.protein_name && (
                  <div className="text-ink-primary font-medium leading-snug">
                    {data.protein_name}
                  </div>
                )}
                <Field label="기능">
                  {summaryQ.data?.summary.length ? (
                    <ul className="list-disc pl-4 space-y-0.5">
                      {summaryQ.data.summary.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : summaryQ.isLoading ? (
                    <span className="text-ink-muted">한글 요약 생성 중…</span>
                  ) : (
                    data.function ?? "—"
                  )}
                </Field>
                <Field label="패밀리 / 도메인">
                  {data.families.length ? data.families.join(" · ") : "—"}
                </Field>
                <Field label="크기">
                  {data.length ?? "—"} aa · {data.mass_kda ?? "—"} kDa
                </Field>
                <Field label="세포내 위치">
                  {data.subcellular.length ? data.subcellular.join(", ") : "—"}
                </Field>
                <Field label="구조 (PDB)">
                  {data.pdb_count > 0
                    ? `${data.pdb_count}개` +
                      (data.pdb_ids.length
                        ? ` · ${data.pdb_ids.slice(0, 3).join(", ")}${
                            data.pdb_count > 3 ? " …" : ""
                          }`
                        : "")
                    : "구조 없음"}
                </Field>
              </>
            ) : (
              <p className="text-meta text-ink-muted">
                UniProt에서 이 단백질 정보를 찾지 못했습니다. 아래 검색 링크로 확인하세요.
              </p>
            )}

            <DbLinks links={data.links} />
          </div>
        )}
      </div>
    </aside>
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
