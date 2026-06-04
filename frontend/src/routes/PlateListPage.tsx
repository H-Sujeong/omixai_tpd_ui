import { Link, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePlates } from "@/api/queries";
import { apiGet } from "@/api/client";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import type { DrugSummaryRow, PlateSummary } from "@/types/api";
import { useT } from "@/store/uiLang";
import { usePlateListView, type PlateSortKey } from "@/store/plateListView";

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

  const { sortKey, sortDir, view, set } = usePlateListView();

  // Map per-plate drug query by plate_id (not array index) so sorting the list
  // doesn't desync the asset-coverage lookup.
  const drugsByPlate = useMemo(() => {
    const m = new Map<string, { data?: DrugSummaryRow[]; loading: boolean }>();
    (data ?? []).forEach((p, i) => {
      m.set(p.plate_id, {
        data: drugQueries[i]?.data,
        loading: drugQueries[i]?.isLoading ?? true,
      });
    });
    return m;
  }, [data, drugQueries]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      if (sortKey === "title") {
        return a.plate_id.localeCompare(b.plate_id, undefined, { numeric: true }) * dir;
      }
      if (sortKey === "n_drugs") return (a.n_drugs - b.n_drugs) * dir;
      // generated_at — parse to time; missing dates always sort last.
      const av = a.generated_at ? Date.parse(a.generated_at) : NaN;
      const bv = b.generated_at ? Date.parse(b.generated_at) : NaN;
      const aNan = Number.isNaN(av);
      const bNan = Number.isNaN(bv);
      if (aNan && bNan) return 0;
      if (aNan) return 1;
      if (bNan) return -1;
      return (av - bv) * dir;
    });
  }, [data, sortKey, sortDir]);

  return (
    <div className="flex-1 pl-16 pr-4 lg:px-8 py-8 mx-auto w-full max-w-[1400px]">
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
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
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
        <span className="flex-1 border-t border-line min-w-[1rem]" aria-hidden />

        {/* Sort controls + card/table view toggle */}
        <div className="flex items-center gap-1.5 text-meta text-ink-secondary">
          <span className="whitespace-nowrap">{t("정렬", "Sort")}</span>
          <Segmented
            value={sortKey}
            onChange={(k) => set({ sortKey: k as PlateSortKey })}
            options={[
              { k: "title", label: t("제목", "Title") },
              { k: "generated_at", label: t("업데이트", "Updated") },
              { k: "n_drugs", label: t("약물수", "Compounds") },
            ]}
          />
          <button
            type="button"
            className="px-1.5 py-1 rounded-md border border-line bg-surface-elevated text-ink-primary hover:border-brand-primary/45 transition-colors"
            title={sortDir === "asc" ? t("오름차순", "Ascending") : t("내림차순", "Descending")}
            onClick={() => set({ sortDir: sortDir === "asc" ? "desc" : "asc" })}
            aria-label="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        <Segmented
          value={view}
          onChange={(v) => set({ view: v as "card" | "table" })}
          options={[
            { k: "card", label: t("카드", "Card") },
            { k: "table", label: t("테이블", "Table") },
          ]}
        />
      </div>

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} />}
      {data && data.length === 0 && <EmptyBlock label={t("등록된 plate가 없습니다.", "No registered plates.")} />}

      {data && data.length > 0 && view === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sorted.map((plate) => {
            const dq = drugsByPlate.get(plate.plate_id);
            return (
              <PlateCard
                key={plate.plate_id}
                plate={plate}
                drugs={dq?.data}
                drugsLoading={dq?.loading ?? true}
              />
            );
          })}
        </div>
      )}

      {data && data.length > 0 && view === "table" && (
        <PlateTable plates={sorted} drugsByPlate={drugsByPlate} />
      )}
    </div>
  );
}

/** Small segmented button group (shared look with the Landscape 2D/3D toggle). */
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (k: string) => void;
  options: Array<{ k: string; label: string }>;
}) {
  return (
    <div className="flex gap-0.5 rounded-md overflow-hidden border border-line bg-surface-elevated">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={`px-2 py-1 transition-colors ${
            value === o.k
              ? "bg-brand-primary/15 text-brand-primary font-medium"
              : "text-ink-secondary hover:text-ink-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
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

/** Compact table view of plates — same data as the cards, denser. */
function PlateTable({
  plates,
  drugsByPlate,
}: {
  plates: PlateSummary[];
  drugsByPlate: Map<string, { data?: DrugSummaryRow[]; loading: boolean }>;
}) {
  const t = useT();
  const navigate = useNavigate();
  const cols = [
    t("플레이트", "Plate"),
    "Set",
    "Cell",
    t("용량", "Dose"),
    t("관찰", "Obs"),
    t("약물", "Compounds"),
    t("웰", "Wells"),
    t("자산", "Coverage"),
    t("업데이트", "Updated"),
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-body border-collapse">
        <thead>
          <tr className="text-meta text-ink-muted bg-surface-soft border-b border-line">
            {cols.map((c, i) => (
              <th key={c} className={`px-4 py-2.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plates.map((p) => {
            const b = drugsByPlate.get(p.plate_id)?.data
              ? bucketDrugs(drugsByPlate.get(p.plate_id)!.data!)
              : null;
            return (
              <tr
                key={p.plate_id}
                onClick={() => navigate(`/plates/${p.plate_id}`)}
                className="border-b border-line/60 last:border-0 hover:bg-surface-soft cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 font-semibold text-ink-primary tabular">{p.plate_id}</td>
                <td className="px-4 py-2.5 text-right text-ink-secondary">{p.plate_code || "—"}</td>
                <td className="px-4 py-2.5 text-right text-ink-secondary">{p.cell_line || "—"}</td>
                <td className="px-4 py-2.5 text-right text-ink-secondary tabular">
                  {p.dose_um != null ? `${p.dose_um} µM` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-ink-secondary tabular">
                  {p.treatment_hours != null ? `${p.treatment_hours} h` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-ink-primary tabular">{p.n_drugs}</td>
                <td className="px-4 py-2.5 text-right text-ink-secondary tabular">{p.n_wells}</td>
                <td className="px-4 py-2.5 text-right text-ink-secondary tabular">
                  {b ? `${b.assetCovered}/${b.total}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-ink-muted tabular">
                  {p.generated_at ? String(p.generated_at).slice(0, 10) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
