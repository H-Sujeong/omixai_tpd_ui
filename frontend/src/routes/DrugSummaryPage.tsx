import { Link, useNavigate, useParams } from "react-router-dom";
import { Fragment, useMemo } from "react";
import { useDrugSummary, usePlates } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { StatusBadge } from "@/components/StatusBadge";
import { useDrugListFilters, type DrugSortKey as SortKey } from "@/store/drugListFilters";
import type { DrugSummaryRow } from "@/types/api";

/**
 * Drug summary table — design_02 / style_guide compact "Bloomberg terminal" feel.
 * Sticky header · zebra rows · purple hover · target chip → direct deep link.
 */
export function DrugSummaryPage() {
  const { plateId } = useParams<{ plateId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useDrugSummary(plateId);
  const platesQ = usePlates();
  const plateMeta = useMemo(
    () => platesQ.data?.find((p) => p.plate_id === plateId),
    [platesQ.data, plateId],
  );

  // Filter/sort state lives in a store so it survives navigating into a drug
  // and back (the page unmounts on route change).
  const { search, filterGroup, filterEffect, assetsOnly, sortKey, sortDir, set, clearFilters } =
    useDrugListFilters();

  const groups = useMemo(() => {
    const s = new Set<string>();
    data?.forEach((d) => d.drug_group && s.add(d.drug_group));
    return Array.from(s).sort();
  }, [data]);

  const effects = useMemo(() => {
    const s = new Set<string>();
    data?.forEach((d) => d.growth_class && s.add(d.growth_class));
    return Array.from(s).sort();
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.filter((d) => {
      if (filterGroup && d.drug_group !== filterGroup) return false;
      if (filterEffect && d.growth_class !== filterEffect) return false;
      if (assetsOnly && !d.has_dashboard_assets) return false;
      if (search) {
        const q = search.toLowerCase();
        const txt = (
          d.drug_name +
          " " +
          (d.hy_code ?? "") +
          " " +
          d.targets.map((t) => t.target).join(" ")
        ).toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
    r = [...r].sort((a, b) => {
      const va = (a[sortKey] ?? "") as string | number;
      const vb = (b[sortKey] ?? "") as string | number;
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [data, search, filterGroup, filterEffect, assetsOnly, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) set({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    else set({ sortKey: k, sortDir: "asc" });
  };

  const openDashboard = (drug: DrugSummaryRow, target?: string) => {
    const url =
      `/plates/${plateId}/drugs/${drug.drug_id}` + (target ? `?target=${target}` : "");
    navigate(url);
  };

  // Plate Summary buckets — mutually exclusive, sum = total compounds.
  // Hierarchy:
  //   1. !has_assets         → "No Asset"     (cannot analyze deeply)
  //   2. cytotoxic           → "Cytotoxic"    (phenotype-active, strong signal)
  //   3. cytostatic          → "Static"       (phenotype-active, growth halt)
  //   4. remaining w/ assets → "Asset Only"   (analyzable, growth-permissive)
  const summary = useMemo(() => {
    if (!data) return null;
    const noAsset = data.filter((d) => !d.has_dashboard_assets).length;
    const withAssets = data.filter((d) => d.has_dashboard_assets);
    const cytotoxic = withAssets.filter((d) =>
      (d.growth_class ?? "").toLowerCase().includes("cytotoxic"),
    ).length;
    const cytostatic = withAssets.filter((d) =>
      (d.growth_class ?? "").toLowerCase().includes("cytostatic"),
    ).length;
    const assetOnly = withAssets.length - cytotoxic - cytostatic;
    const total = data.length;
    return { noAsset, assetOnly, cytotoxic, cytostatic, total, filtered: rows.length };
  }, [data, rows]);

  return (
    <div className="flex-1 px-8 py-7 mx-auto w-full max-w-[1500px]">
      {/* Back affordance mirroring the Dashboard's "← Back to Plate {id}".
       *  The sidebar's "Plates" item is the structural workspace target,
       *  but it reads as a section switcher in the icon rail rather than
       *  as a back action. This small meta-style link makes upward
       *  navigation explicit at every hierarchy level. */}
      <Link
        to="/plates"
        className="inline-flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink-primary transition-colors duration-fast"
      >
        <span aria-hidden>←</span>
        <span>Workspace</span>
      </Link>

      {/* Page title (T1 display). 2026-06-02: 3-level breadcrumb removed
       * earlier; the back link above now carries the upward affordance
       * and the h1 below shows the plate id at the display scale. */}
      <header className="mt-2 mb-5">
        <h1
          className="text-ink-primary"
          style={{
            fontSize:      "var(--font-display-size)",
            lineHeight:    "var(--font-display-lh)",
            fontWeight:    "var(--font-display-weight)" as any,
            letterSpacing: "var(--font-display-tracking)",
          }}
        >
          {plateId}
        </h1>
        <PlateMetaRow meta={plateMeta} />
      </header>

      {/* Plate Summary — stacked horizontal bar, replaces the prior 4-tile
       *  KPI grid (2026-06-02). Each compound falls into exactly one bucket
       *  so the bar reads as the plate's analytical composition at a glance. */}
      {summary && summary.total > 0 && <PlateSummaryBar s={summary} />}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="약물 이름 · code · target 검색"
          className="flex-1 min-w-[260px] border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary placeholder:text-ink-muted focus:border-brand-primary outline-none transition-colors duration-fast"
        />
        <select
          value={filterGroup}
          onChange={(e) => set({ filterGroup: e.target.value })}
          className="border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary outline-none focus:border-brand-primary"
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={filterEffect}
          onChange={(e) => set({ filterEffect: e.target.value })}
          className="border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary outline-none focus:border-brand-primary"
        >
          <option value="">All effects</option>
          {effects.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          type="button"
          role="switch"
          aria-checked={assetsOnly}
          onClick={() => set({ assetsOnly: !assetsOnly })}
          title="실측 PPI / landscape 자산이 있는 약물만 표시"
          className={`border rounded-md px-3 py-2 text-body transition-colors duration-fast inline-flex items-center gap-1.5 ${
            assetsOnly
              ? "border-brand-primary text-brand-primary font-medium"
              : "border-line bg-surface-card text-ink-secondary hover:text-ink-primary"
          }`}
          style={
            assetsOnly
              ? { background: "rgb(var(--color-brand-primary-rgb) / 0.10)" }
              : undefined
          }
        >
          <span aria-hidden>{assetsOnly ? "✓" : "○"}</span>
          Assets only
        </button>
        {(search || filterGroup || filterEffect || assetsOnly) && (
          <button
            className="btn btn--ghost text-meta"
            onClick={() => clearFilters()}
          >
            Reset
          </button>
        )}
      </div>

      {isLoading && <LoadingBlock />}
      {error && <ErrorBlock error={error} />}
      {!isLoading && rows.length === 0 && (
        <EmptyBlock label="조건에 해당하는 약물이 없습니다 — 필터를 변경하거나 Reset을 누르세요." />
      )}

      {rows.length > 0 && (
        <div className="panel-card overflow-x-auto">
          <table className="sci-table">
            <thead>
              <tr>
                <Th
                  onClick={() => toggleSort("drug_name")}
                  active={sortKey === "drug_name"}
                  dir={sortDir}
                  sticky
                >
                  Drug
                </Th>
                <th>Code</th>
                <th>Targets</th>
                <Th
                  onClick={() => toggleSort("drug_group")}
                  active={sortKey === "drug_group"}
                  dir={sortDir}
                >
                  Group
                </Th>
                <Th
                  onClick={() => toggleSort("gr_score")}
                  active={sortKey === "gr_score"}
                  dir={sortDir}
                >
                  GR
                </Th>
                <Th
                  onClick={() => toggleSort("growth_class")}
                  active={sortKey === "growth_class"}
                  dir={sortDir}
                >
                  Growth
                </Th>
                <th>Wells</th>
                <th className="text-center">Assets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.drug_id}
                  className="cursor-pointer"
                  onClick={() => openDashboard(d)}
                >
                  <td className="sticky-col col-hero">{d.drug_name}</td>
                  <td className="font-mono text-meta text-ink-muted">{d.hy_code ?? "—"}</td>
                  <td>
                    <TargetsCell
                      targets={d.targets}
                      onPick={(t) => openDashboard(d, t)}
                      drugName={d.drug_name}
                    />
                  </td>
                  <td className="text-ink-secondary">{d.drug_group ?? "—"}</td>
                  <td>
                    {d.gr_score !== null ? (
                      <span
                        className={
                          d.gr_score < 0
                            ? "text-status-error tabular font-semibold"
                            : d.gr_score < 0.5
                            ? "text-status-warning tabular font-semibold"
                            : "text-status-success tabular font-semibold"
                        }
                      >
                        {d.gr_score.toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge label={d.growth_class} />
                  </td>
                  <td className="font-mono text-meta text-ink-muted">{d.wells.join(", ")}</td>
                  <td className="text-center">
                    {d.has_dashboard_assets ? (
                      <span
                        className="text-status-success font-semibold"
                        title="on-target / landscape JSON 자산 있음"
                        aria-label="asset available"
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        className="text-ink-muted"
                        title="PPI / landscape 자산 없음"
                        aria-label="no asset"
                      >
                        ○
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  sticky,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  sticky?: boolean;
}) {
  // Always show a sort indicator so users discover the affordance.
  // Inactive = muted both-arrows · active = single arrow in brand color.
  return (
    <th
      className={`cursor-pointer select-none hover:text-ink-primary transition-colors duration-fast ${
        active ? "text-brand-primary" : "text-ink-secondary"
      } ${sticky ? "sticky-col" : ""}`}
      onClick={onClick}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className="text-meta opacity-90" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </span>
    </th>
  );
}

/**
 * Compact target rendering: shows the first {MAX_VISIBLE} chips inline; any
 * overflow collapses into a `+N` chip whose `title` carries the full list,
 * so a row with 8 targets doesn't blow up its height.
 */
function TargetsCell({
  targets,
  onPick,
  drugName,
}: {
  targets: Array<{ target: string; e3_ligase?: string | null }>;
  onPick: (target: string) => void;
  drugName: string;
}) {
  const MAX_VISIBLE = 3;
  if (targets.length === 0) {
    return <span className="text-ink-muted">—</span>;
  }
  const visible = targets.slice(0, MAX_VISIBLE);
  const hidden = targets.slice(MAX_VISIBLE);
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((t) => (
        <button
          key={t.target}
          className="chip hover:chip--active"
          onClick={(e) => {
            e.stopPropagation();
            onPick(t.target);
          }}
          title={`Open ${drugName} dashboard at ${t.target}`}
        >
          {t.target}
          {t.e3_ligase && (
            <span className="ml-1 text-ink-muted">· {t.e3_ligase}</span>
          )}
        </button>
      ))}
      {hidden.length > 0 && (
        <span
          className="chip"
          title={hidden.map((h) => h.target).join(", ")}
          aria-label={`and ${hidden.length} more targets: ${hidden.map((h) => h.target).join(", ")}`}
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}

/**
 * Plate header meta row — labeled inline (2026-06-02 rev4, explicit form).
 *
 *   Set D3  ·  Cell U2OS  ·  Dose 10 µM  ·  Observation 48 h
 *   muted  bold              muted   bold     …
 *
 * Rev3 collapsed conditions into a bare "U2OS · 10 µM · 48 h" line which
 * read cleaner but lost role information — and crucially is ambiguous for
 * multi-dose experiments (a "Dose series, 6 levels" entry would look like
 * a single condition). The labeled form is verbose but unambiguous, which
 * matters more for a research tool than visual minimalism.
 *
 * Dose extensibility: render via formatDose() so the same component handles
 *   - single dose:        "10 µM"
 *   - explicit range:     "0.1–10 µM, 6 levels"   (future)
 *   - unknown series:     "series, 6 levels"      (future)
 * Add the variant fields to the meta payload to opt into the richer forms.
 */
function formatDose(meta: {
  dose_um?: number | null;
  dose_range?: [number, number] | null;
  dose_levels?: number | null;
}): string | null {
  if (meta.dose_range && meta.dose_range.length === 2) {
    const [lo, hi] = meta.dose_range;
    const levels = meta.dose_levels ? `, ${meta.dose_levels} levels` : "";
    return `${lo}–${hi} µM${levels}`;
  }
  if (meta.dose_levels && meta.dose_levels > 1) {
    return `series, ${meta.dose_levels} levels`;
  }
  if (meta.dose_um != null) return `${meta.dose_um} µM`;
  return null;
}

function PlateMetaRow({
  meta,
}: {
  meta:
    | {
        plate_code?: string | null;
        cell_line?: string | null;
        dose_um?: number | null;
        dose_range?: [number, number] | null;
        dose_levels?: number | null;
        treatment_hours?: number | null;
      }
    | undefined;
}) {
  if (!meta) return null;
  const items: Array<{ label: string; value: string }> = [];
  if (meta.plate_code) items.push({ label: "Set", value: meta.plate_code });
  if (meta.cell_line) items.push({ label: "Cell", value: meta.cell_line });
  const doseStr = formatDose(meta);
  if (doseStr) items.push({ label: "Dose", value: doseStr });
  if (meta.treatment_hours != null) {
    items.push({ label: "Observation", value: `${meta.treatment_hours} h` });
  }
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body">
      {items.map((it, i) => (
        <Fragment key={it.label}>
          {i > 0 && (
            <span className="text-ink-muted opacity-50 select-none" aria-hidden>
              ·
            </span>
          )}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-muted">{it.label}</span>
            <span className="text-ink-primary font-medium">{it.value}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function KpiBlock({
  label,
  value,
  hint,
  featured,
}: {
  label: string;
  value: string | number;
  hint?: string;
  featured?: boolean;
}) {
  return (
    <div className={`kpi-tile${featured ? " kpi-tile--featured" : ""}`}>
      <span className="kpi-tile__label">{label}</span>
      <span className="kpi-tile__value">{value}</span>
      {hint && <span className="kpi-tile__hint">{hint}</span>}
    </div>
  );
}

/**
 * Plate Summary — single horizontal stacked bar (2026-06-02).
 *
 * Replaces the prior 4-KPI tile strip. Each compound in the plate goes
 * into exactly one of four buckets; the bar shows their proportions and
 * a horizontal legend below carries the counts + labels.
 *
 * Color mapping (intentional):
 *   No Asset    → neutral grey   (cannot deep-analyze)
 *   Asset Only  → brand purple   (analyzable, no strong phenotype)
 *   Cytotoxic   → orange         (alarming — kills cells)
 *   Static      → amber          (worth a look — halts growth)
 *
 * Legend is forced HORIZONTAL via flex-wrap-row per user spec — no vertical
 * stacking even when wrapping (`flex flex-row flex-wrap`).
 */
function PlateSummaryBar({
  s,
}: {
  s: {
    noAsset: number;
    assetOnly: number;
    cytotoxic: number;
    cytostatic: number;
    total: number;
    filtered: number;
  };
}) {
  const segments = [
    {
      key: "noAsset",
      count: s.noAsset,
      label: "No Asset",
      color: "var(--color-status-neutral)",
    },
    {
      key: "assetOnly",
      count: s.assetOnly,
      // "Asset Only" = has analysis assets AND growth-permissive (no
      // cytotoxic / cytostatic signal). Semantically this matches the
      // Growth-permissive StatusBadge → use the same green hue rather
      // than the brand purple (purple read as decorative, not semantic).
      label: "Asset Only",
      color: "var(--color-status-success)",
    },
    {
      key: "cytotoxic",
      count: s.cytotoxic,
      label: "Cytotoxic",
      color: "var(--color-cytotoxic-moderate)",
    },
    {
      key: "static",
      count: s.cytostatic,
      label: "Static",
      color: "var(--color-status-warning)",
    },
  ];
  const present = segments.filter((seg) => seg.count > 0);
  const filtersActive = s.filtered !== s.total;

  return (
    <section className="panel-card p-5 mb-8">
      {/* Header: section title + filter info (right). 2026-06-02 rev3 —
       * the "70 compounds" stat used to live here cramped in the corner;
       * promoted below as the visual hero. */}
      <header className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-title text-ink-primary">Plate Summary</h2>
        {filtersActive && (
          <span className="text-caption text-ink-muted">
            <span className="text-ink-secondary tabular">{s.filtered}</span>{" "}
            after filters
          </span>
        )}
      </header>

      {/* Hero stat — big number + "compounds" caption.  This is the page's
       * primary scan target ("how many compounds did this plate produce").
       * 2026-06-02 rev3: fixed at 32px (deliberate off-scale choice — the
       * full T2 kpi 48px competed with the page hero; 32px reads as a
       * prominent stat without overpowering the 48px plate-id h1). */}
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className="text-ink-primary tabular"
          style={{
            fontSize:      "32px",
            lineHeight:    "1",
            fontWeight:    700 as any,
            letterSpacing: "-0.025em",
          }}
        >
          {s.total}
        </span>
        <span className="text-body text-ink-muted">compounds</span>
      </div>

      {/* Stacked bar — full width, proportional segments */}
      <div
        className="flex w-full h-7 rounded-md overflow-hidden border border-line"
        role="img"
        aria-label={`Plate composition: ${present
          .map((seg) => `${seg.count} ${seg.label}`)
          .join(", ")}`}
      >
        {present.map((seg) => (
          <div
            key={seg.key}
            style={{
              flexBasis: `${(seg.count / s.total) * 100}%`,
              background: seg.color,
            }}
            title={`${seg.count} ${seg.label} (${(
              (seg.count / s.total) *
              100
            ).toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Legend — HORIZONTAL row (flex-row + wrap). Each item: count + label.
       * Wider gap-x so swatches don't visually merge with counts. */}
      <div className="mt-3 flex flex-row flex-wrap items-center gap-x-6 gap-y-1.5 text-body">
        {segments.map((seg) => (
          <span
            key={seg.key}
            className="inline-flex items-center gap-2 whitespace-nowrap"
          >
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: seg.color }}
              aria-hidden
            />
            <span className="font-semibold text-ink-primary tabular">
              {seg.count}
            </span>
            <span className="text-ink-secondary">{seg.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
