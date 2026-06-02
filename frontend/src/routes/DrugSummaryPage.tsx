import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useDrugSummary, usePlates } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { StatusBadge } from "@/components/StatusBadge";
import type { DrugSummaryRow } from "@/types/api";

type SortKey = "drug_name" | "gr_score" | "growth_class" | "drug_group";

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

  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState<string>("");
  const [filterEffect, setFilterEffect] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("drug_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
  }, [data, search, filterGroup, filterEffect, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
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
      {/* Breadcrumb (T7 label) + Page title (T1 display) */}
      <div className="text-label uppercase text-ink-muted">
        <Link to="/plates" className="hover:text-ink-primary">Workspace</Link>
        <span className="mx-2">/</span>
        <span>Plates</span>
        <span className="mx-2">/</span>
        <span className="text-ink-secondary">{plateId}</span>
      </div>
      <header className="flex flex-wrap items-baseline gap-3 mt-1 mb-5">
        {/* Inline style binds all four T1 properties from CSS vars so this
         * survives a Tailwind config that hasn't recompiled yet
         * (theme.extend.fontSize changes often need a Vite restart). */}
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
        {plateMeta?.plate_code && <span className="chip">{plateMeta.plate_code}</span>}
        {plateMeta?.dose_um && (
          <span className="chip chip--info">{plateMeta.dose_um} µM</span>
        )}
        {plateMeta?.cell_line && <span className="chip">{plateMeta.cell_line}</span>}
        {plateMeta?.treatment_hours && (
          <span className="chip">{plateMeta.treatment_hours} h</span>
        )}
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="약물 이름 · code · target 검색"
          className="flex-1 min-w-[260px] border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary placeholder:text-ink-muted focus:border-brand-primary outline-none transition-colors duration-fast"
        />
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
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
          onChange={(e) => setFilterEffect(e.target.value)}
          className="border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary outline-none focus:border-brand-primary"
        >
          <option value="">All effects</option>
          {effects.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        {(search || filterGroup || filterEffect) && (
          <button
            className="btn btn--ghost text-meta"
            onClick={() => {
              setSearch("");
              setFilterGroup("");
              setFilterEffect("");
            }}
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
                <th>Assets</th>
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
                  <td>
                    {d.has_dashboard_assets ? (
                      <span
                        className="inline-flex items-center gap-1 text-status-success font-semibold"
                        title="실제 on-target / landscape JSON 자산이 있음 (synth fallback 아님)"
                        aria-label="asset available"
                      >
                        <span aria-hidden>✓</span>
                        <span className="text-meta">Asset</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-ink-muted"
                        title="실측 자산 없음 — synth (절차적 생성) panel로 대체됨"
                        aria-label="no asset, synth fallback"
                      >
                        <span aria-hidden>○</span>
                        <span className="text-meta">Synth</span>
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
      label: "Asset Only",
      color: "var(--color-brand-primary)",
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
    <section className="panel-card p-5 mb-5">
      {/* Header: T3 title + caption with totals */}
      <header className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-title text-ink-primary">Plate Summary</h2>
        <span className="text-caption text-ink-muted">
          <span className="text-ink-primary font-semibold">{s.total}</span>{" "}
          compounds in plate
          {filtersActive && (
            <>
              {" · "}
              <span className="text-ink-secondary tabular">{s.filtered}</span>{" "}
              after filters
            </>
          )}
        </span>
      </header>

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
