import { Fragment, type ReactNode } from "react";
import type { DashboardResponse } from "@/types/api";

interface Props {
  d: DashboardResponse;
  target: string;
}

/**
 * Compact metadata row beneath the topbar h1. Surfaces dose/code/cell
 * line and primary external references inline so users don't need to open
 * the Overview tab to see core experimental conditions.
 *
 * Step 4 (2026-05-21). Pure addition — Overview cards still render the
 * same fields until Step 5 removes them.
 *
 * Reference priority: UniProt (protein), Ensembl (gene), MedChemExpress
 * (compound). Full set including Entrez / HPA remains in the Mechanism
 * tab's ReferenceDatabasesCard.
 */
const PRIORITY_REFS = ["UniProt", "Ensembl", "MedChemExpress"] as const;

export function TopbarMetaRow({ d, target }: Props) {
  const refs =
    d.references.by_target[target] ?? d.references.by_target[d.target_id] ?? {};
  const refLinks = PRIORITY_REFS.filter((k) => refs[k]);
  const c = d.compound;
  const cellName = d.cell_line.name;

  const segments: ReactNode[] = [];

  if (c.dose_um !== null) {
    segments.push(
      <span key="dose">
        <span className="mr-1.5">Dose</span>
        <span className="text-ink-secondary tabular">
          {c.dose_um} µM
          {c.treatment_hours !== null ? ` · ${c.treatment_hours} h` : ""}
        </span>
      </span>,
    );
  }

  if (c.hy_code) {
    segments.push(
      <span key="hy" className="font-mono text-ink-secondary">
        {c.hy_code}
      </span>,
    );
  }

  if (cellName) {
    segments.push(
      <span key="cell">
        <span className="mr-1.5">Cell</span>
        <span className="text-ink-secondary">{cellName}</span>
      </span>,
    );
  }

  if (refLinks.length > 0) {
    segments.push(
      <span key="refs" className="inline-flex items-center gap-1">
        {refLinks.map((k, i) => (
          <Fragment key={k}>
            {i > 0 && (
              <span className="text-ink-muted opacity-50" aria-hidden>
                ,
              </span>
            )}
            <a
              href={refs[k]}
              target="_blank"
              rel="noreferrer"
              className="a-link"
            >
              {k}
            </a>
          </Fragment>
        ))}
      </span>,
    );
  }

  if (segments.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-muted mt-2"
      aria-label="Experiment metadata"
    >
      {segments.map((seg, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="opacity-50 select-none" aria-hidden>
              ·
            </span>
          )}
          {seg}
        </Fragment>
      ))}
    </div>
  );
}
