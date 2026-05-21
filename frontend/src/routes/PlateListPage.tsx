import { Link } from "react-router-dom";
import { useMemo } from "react";
import { usePlates } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";

/**
 * Plate list — design_02 / style_guide. Big hero header, KPI summary tiles,
 * gradient card grid (Bloomberg-meets-biotech).
 */
export function PlateListPage() {
  const { data, isLoading, error } = usePlates();

  const summary = useMemo(() => {
    if (!data) return null;
    const drugs = data.reduce((s, p) => s + p.n_drugs, 0);
    const wells = data.reduce((s, p) => s + p.n_wells, 0);
    const withAssets = data.filter((p) => p.has_dashboard_assets).length;
    return {
      plates: data.length,
      drugs,
      wells,
      coverage: data.length ? Math.round((withAssets / data.length) * 100) : 0,
    };
  }, [data]);

  return (
    <div className="flex-1 px-8 py-8 mx-auto w-full max-w-[1400px]">
      {/* Hero */}
      <header className="mb-6">
        <div className="text-meta uppercase tracking-[0.18em] text-ink-muted">
          Workspace · Plates
        </div>
        <h1 className="text-hero font-bold text-ink-primary tracking-tight mt-1">
          Target Protein Degradation Experiments
        </h1>
        <p className="text-body text-ink-secondary mt-1.5 max-w-2xl">
          분석 번호별 plate에서 약물 → target → phenotype → PPI / Landscape 통합 분석을
          실행합니다. plate를 선택해 drug summary로 진입하세요.
        </p>
      </header>

      {/* Summary KPI strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
          <KpiBlock label="Plates" value={summary.plates} hint="loaded from sample_data" />
          <KpiBlock label="Drugs" value={summary.drugs} hint="total compounds" />
          <KpiBlock label="Wells" value={summary.wells} hint="across all plates" />
          <KpiBlock
            label="Dashboard coverage"
            value={`${summary.coverage}%`}
            hint="plates with real PPI/landscape assets"
          />
        </div>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-section font-semibold text-ink-primary">
          Available Plates
        </h2>
        <span className="text-meta text-ink-muted tabular">
          {data?.length ?? 0} plate{(data?.length ?? 0) > 1 ? "s" : ""}
        </span>
      </div>

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} />}
      {data && data.length === 0 && <EmptyBlock label="등록된 plate가 없습니다." />}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((plate) => (
            <Link
              key={plate.plate_id}
              to={`/plates/${plate.plate_id}`}
              className="panel-card hover:panel-card--accent transition-shadow duration-base group"
            >
              <div className="px-5 pt-5 pb-4 flex-1">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-section font-semibold tabular text-ink-primary group-hover:text-brand-primary transition-colors">
                    {plate.plate_id}
                  </h3>
                  <span className="text-meta text-ink-muted tabular">
                    {plate.pipeline_version}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="chip chip--info">{plate.plate_code}</span>
                  {plate.dose_um && (
                    <span className="chip">{plate.dose_um} µM</span>
                  )}
                  {plate.cell_line && <span className="chip">{plate.cell_line}</span>}
                  {plate.has_dashboard_assets && (
                    <span className="chip chip--success">on-target ready</span>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-body">
                  <dt className="text-ink-muted">Treatment</dt>
                  <dd className="text-ink-primary tabular">
                    {plate.treatment_hours ? `${plate.treatment_hours} h` : "—"}
                  </dd>
                  <dt className="text-ink-muted">Wells</dt>
                  <dd className="text-ink-primary tabular">{plate.n_wells}</dd>
                  <dt className="text-ink-muted">Drugs</dt>
                  <dd className="text-ink-primary tabular">{plate.n_drugs}</dd>
                </dl>
              </div>
              <div className="px-5 py-3 border-t border-line bg-surface-soft text-meta text-ink-muted flex items-center justify-between">
                <span>{plate.has_dashboard_assets ? "✓ assets ready" : "synth fallback"}</span>
                <span className="text-brand-primary opacity-70 group-hover:opacity-100">
                  Open →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="kpi-tile">
      <span className="kpi-tile__label">{label}</span>
      <span className="kpi-tile__value">{value}</span>
      {hint && <span className="kpi-tile__hint">{hint}</span>}
    </div>
  );
}
