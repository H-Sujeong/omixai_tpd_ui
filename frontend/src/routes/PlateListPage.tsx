import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePlates } from "@/api/queries";
import { apiGet } from "@/api/client";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import type { DrugSummaryRow, PlateSummary } from "@/types/api";
import { useT } from "@/store/uiLang";

/**
 * Workspace home — list of plates. Rewrite 2026-06-02:
 *   - eyebrow ("WORKSPACE · PLATES") and Korean how-to copy removed (already
 *     conveyed by the sidebar + page hierarchy).
 *   - 4-tile KPI strip collapsed into a single inline stat line below the
 *     hero — saved vertical space and reads as one fact about the workspace
 *     instead of four detached tiles.
 *   - Plate cards now show outcome composition (No Asset / Asset Only /
 *     Cytotoxic / Static) + phenotype-active percentage, fetched per plate
 *     via useQueries so a card answers "is there anything interesting on
 *     this plate?" before you click into it.
 */
export function PlateListPage() {
  const t = useT();
  const { data, isLoading, error } = usePlates();

  // Same queryKey shape as useDrugSummary so navigating into a plate hits
  // the cache instead of re-fetching.
  const drugQueries = useQueries({
    queries: (data ?? []).map((p) => ({
      queryKey: ["drugs", p.plate_id],
      queryFn: () =>
        apiGet<DrugSummaryRow[]>(`/api/v1/plates/${p.plate_id}/drugs`),
      staleTime: 60_000,
    })),
  });

  const summary = useMemo(() => {
    if (!data) return null;
    return {
      plates: data.length,
      drugs: data.reduce((s, p) => s + p.n_drugs, 0),
      wells: data.reduce((s, p) => s + p.n_wells, 0),
    };
  }, [data]);

  return (
    <div className="flex-1 px-8 py-8 mx-auto w-full max-w-[1400px]">
      {/* Hero — bounded Summary Surface. Wrapping the workspace summary in
       *  a softly tinted, bordered panel makes "Workspace" register as a
       *  distinct layer above the plate grid; the page now reads as
       *  Workspace → Selection rather than two adjacent same-weight blocks. */}
      <section
        className="mb-12 rounded-xl border border-line bg-surface-soft px-8 py-5"
        aria-label="Workspace summary"
      >
        <h1
          className="text-ink-primary"
          style={{
            fontSize:      "var(--font-display-size)",
            lineHeight:    "var(--font-display-lh)",
            fontWeight:    "var(--font-display-weight)" as any,
            letterSpacing: "var(--font-display-tracking)",
          }}
        >
          Target Protein Degradation Experiments
        </h1>
        <p
          className="mt-3 max-w-4xl text-ink-secondary"
          style={{ fontSize: "15px", lineHeight: 1.6, fontWeight: 400 }}
        >
          Explore phenotype-driven target degradation experiments and compound outcomes.
        </p>

        {summary && (
          <div className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-body text-ink-secondary tabular">
            <StatItem
              value={summary.plates}
              label={summary.plates === 1 ? "Plate" : "Plates"}
            />
            <Dot />
            <StatItem value={summary.drugs} label="Compounds" />
            <Dot />
            <StatItem value={summary.wells} label="Wells" />
          </div>
        )}
      </section>

      {/* Section break — uppercase T7 label paired with a thin divider line
       *  reads as a clear "now entering Plate Selection" handoff. */}
      <div className="mb-5 flex items-center gap-4">
        <span
          className="text-ink-muted whitespace-nowrap"
          style={{
            fontSize:      "var(--font-label-size)",
            lineHeight:    "var(--font-label-lh)",
            fontWeight:    "var(--font-label-weight)" as any,
            letterSpacing: "var(--font-label-tracking)",
            textTransform: "uppercase",
          }}
        >
          Experiment Plates
        </span>
        <span className="flex-1 border-t border-line" aria-hidden />
      </div>

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} />}
      {data && data.length === 0 && <EmptyBlock label={t("등록된 plate가 없습니다.", "No registered plates.")} />}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.map((plate, i) => (
            <PlateCard
              key={plate.plate_id}
              plate={plate}
              drugs={drugQueries[i]?.data}
              drugsLoading={drugQueries[i]?.isLoading ?? true}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatItem({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-ink-primary font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function Dot() {
  return (
    <span className="text-ink-muted opacity-50 select-none" aria-hidden>
      ·
    </span>
  );
}

/**
 * Outcome bucketing identical to DrugSummaryPage's PlateSummaryBar so a
 * compound is classified the same way whether you see it on the workspace
 * card or inside the plate. Each compound lands in exactly one bucket:
 *   1. !has_assets → No Asset
 *   2. cytotoxic   → Cytotoxic
 *   3. cytostatic  → Static
 *   4. otherwise   → Asset Only
 */
function bucketDrugs(drugs: DrugSummaryRow[]) {
  const noAsset = drugs.filter((d) => !d.has_dashboard_assets).length;
  const withAssets = drugs.filter((d) => d.has_dashboard_assets);
  const cytotoxic = withAssets.filter((d) =>
    (d.growth_class ?? "").toLowerCase().includes("cytotoxic"),
  ).length;
  const cytostatic = withAssets.filter((d) =>
    (d.growth_class ?? "").toLowerCase().includes("cytostatic"),
  ).length;
  const assetOnly = withAssets.length - cytotoxic - cytostatic;
  const total = drugs.length;
  const assetCovered = withAssets.length;
  return { noAsset, assetOnly, cytotoxic, cytostatic, total, assetCovered };
}

function PlateCard({
  plate,
  drugs,
  drugsLoading,
}: {
  plate: PlateSummary;
  drugs: DrugSummaryRow[] | undefined;
  drugsLoading: boolean;
}) {
  const buckets = useMemo(() => (drugs ? bucketDrugs(drugs) : null), [drugs]);

  const segments = useMemo(() => {
    if (!buckets) return [];
    return [
      {
        key: "noAsset",
        count: buckets.noAsset,
        label: "No Asset",
        color: "var(--color-status-neutral)",
      },
      {
        key: "assetOnly",
        count: buckets.assetOnly,
        label: "Asset Only",
        color: "var(--color-status-success)",
      },
      {
        key: "cytotoxic",
        count: buckets.cytotoxic,
        label: "Cytotoxic",
        color: "var(--color-cytotoxic-moderate)",
      },
      {
        key: "static",
        count: buckets.cytostatic,
        label: "Static",
        color: "var(--color-status-warning)",
      },
    ];
  }, [buckets]);

  return (
    <Link
      to={`/plates/${plate.plate_id}`}
      className="panel-card hover:panel-card--accent transition-all duration-base hover:-translate-y-0.5 group"
    >
      <div className="px-5 pt-5 pb-4 flex-1">
        {/* Title — pipeline_version removed (was demo-0.1, not a decision
         *  input for "which plate do I open"; lives in plate detail header). */}
        <h3
          className="text-ink-primary group-hover:text-brand-primary transition-colors tabular"
          style={{
            fontSize: "24px",
            lineHeight: "1.1",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {plate.plate_id}
        </h3>

        {/* Metadata — Set/Cell on one row, Dose/Observation on the next.
         * Same labeled inline pattern as the plate detail header so the
         * two views read consistently. */}
        <div className="mt-2.5 space-y-1">
          <MetaLine
            items={[
              plate.plate_code ? { label: "Set", value: plate.plate_code } : null,
              plate.cell_line ? { label: "Cell", value: plate.cell_line } : null,
            ]}
          />
          <MetaLine
            items={[
              plate.dose_um != null
                ? { label: "Dose", value: `${plate.dose_um} µM` }
                : null,
              plate.treatment_hours != null
                ? { label: "Observation", value: `${plate.treatment_hours} h` }
                : null,
            ]}
          />
        </div>

        {/* Outcome — stacked bar + counts + phenotype-active percentage.
         * Renders only once per-plate drugs query resolves; while loading
         * we show a thin skeleton so the card height stays stable. */}
        <div className="mt-4">
          {buckets && buckets.total > 0 ? (
            <>
              <div
                className="flex w-full h-2 rounded-sm overflow-hidden border border-line"
                role="img"
                aria-label={`Plate composition: ${segments
                  .filter((s) => s.count > 0)
                  .map((s) => `${s.count} ${s.label}`)
                  .join(", ")}`}
              >
                {segments
                  .filter((s) => s.count > 0)
                  .map((seg) => (
                    <div
                      key={seg.key}
                      style={{
                        flexBasis: `${(seg.count / buckets.total) * 100}%`,
                        background: seg.color,
                      }}
                      title={`${seg.count} ${seg.label}`}
                    />
                  ))}
              </div>
              {/* Legend — single row, narrow gap. 2-col grid felt sparse
               * at card width; inline reads as one composition line. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                {segments.map((seg) => (
                  <span
                    key={seg.key}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span
                      className="w-2 h-2 rounded-[2px] shrink-0"
                      style={{ background: seg.color }}
                      aria-hidden
                    />
                    <span className="text-ink-primary tabular font-semibold">
                      {seg.count}
                    </span>
                    <span className="text-ink-secondary">{seg.label}</span>
                  </span>
                ))}
              </div>
            </>
          ) : drugsLoading ? (
            <div
              className="h-2 rounded-sm bg-surface-soft animate-pulse"
              aria-label="loading composition"
            />
          ) : (
            <p className="text-caption text-ink-muted">
              {plate.n_drugs} compounds · composition unavailable
            </p>
          )}
        </div>
      </div>

      {/* Footer — phenotype-active % is the headline outcome metric, moved
       *  here from inside the card body. The legacy "✓ assets ready" line
       *  was redundant once the outcome bar started rendering composition. */}
      <div className="px-5 py-3 border-t border-line bg-surface-soft flex items-center justify-between text-caption">
        <span className="text-ink-secondary inline-flex items-baseline gap-1.5">
          {buckets ? (
            <>
              <span className="text-ink-muted">Asset Coverage</span>
              <span className="text-ink-primary tabular font-semibold">
                {buckets.assetCovered} / {buckets.total}
              </span>
              <span>compounds</span>
            </>
          ) : (
            <span className="text-ink-muted">composition pending</span>
          )}
        </span>
        <span className="text-brand-primary opacity-80 group-hover:opacity-100 font-medium">
          View Plate →
        </span>
      </div>
    </Link>
  );
}

function MetaLine({
  items,
}: {
  items: Array<{ label: string; value: string } | null>;
}) {
  const present = items.filter((x): x is { label: string; value: string } => !!x);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body text-ink-muted">
      {present.map((it, i) => (
        <span key={it.label} className="inline-flex items-baseline gap-1.5">
          {i > 0 && (
            <span className="opacity-50 select-none mr-1" aria-hidden>
              ·
            </span>
          )}
          <span>{it.label}</span>
          <span className="text-ink-secondary font-medium tabular">
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}
