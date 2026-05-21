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

  // KPIs for the page header
  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.length;
    const filtered = rows.length;
    const withAssets = data.filter((d) => d.has_dashboard_assets).length;
    const cytotoxic = data.filter((d) =>
      (d.growth_class ?? "").toLowerCase().includes("cyto"),
    ).length;
    return { total, filtered, withAssets, cytotoxic };
  }, [data, rows]);

  return (
    <div className="flex-1 px-8 py-7 mx-auto w-full max-w-[1500px]">
      {/* Breadcrumb + hero */}
      <div className="text-meta uppercase tracking-[0.18em] text-ink-muted">
        <Link to="/plates" className="hover:text-ink-primary">Workspace</Link>
        <span className="mx-2">/</span>
        <span>Plates</span>
        <span className="mx-2">/</span>
        <span className="text-ink-secondary tabular">{plateId}</span>
      </div>
      <header className="flex flex-wrap items-baseline gap-3 mt-1 mb-5">
        <h1 className="text-hero font-bold tracking-tight text-ink-primary tabular">
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

      {/* KPI strip */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiBlock label="Compounds" value={summary.total} hint="in this plate" />
          <KpiBlock label="In view" value={summary.filtered} hint="after filters" />
          <KpiBlock
            label="On-target assets"
            value={summary.withAssets}
            hint="real PPI / landscape"
          />
          <KpiBlock
            label="Cytotoxic / static"
            value={summary.cytotoxic}
            hint="growth disruption"
          />
        </div>
      )}

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="약물 이름 · HY-code · target 검색"
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
                >
                  Drug
                </Th>
                <th>HY-code</th>
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
                  <td className="font-medium">
                    <span className="text-brand-primary hover:underline">{d.drug_name}</span>
                  </td>
                  <td className="font-mono text-meta text-ink-muted">{d.hy_code ?? "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {d.targets.length === 0 && <span className="text-ink-muted">—</span>}
                      {d.targets.map((t) => (
                        <button
                          key={t.target}
                          className="chip hover:chip--active"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDashboard(d, t.target);
                          }}
                          title={`Open ${d.drug_name} dashboard at ${t.target}`}
                        >
                          {t.target}
                          {t.e3_ligase && (
                            <span className="ml-1 text-ink-muted">· {t.e3_ligase}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="text-ink-secondary">{d.drug_group ?? "—"}</td>
                  <td>
                    {d.gr_score !== null ? (
                      <span
                        className={
                          d.gr_score < 0
                            ? "text-status-error tabular"
                            : d.gr_score < 0.5
                            ? "text-status-warning tabular"
                            : "text-status-success tabular"
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
                      <span className="text-status-success" title="real on-target assets">●</span>
                    ) : (
                      <span className="text-ink-muted" title="synth fallback">○</span>
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th
      className={`cursor-pointer select-none hover:text-ink-primary transition-colors duration-fast ${
        active ? "text-ink-primary" : ""
      }`}
      onClick={onClick}
    >
      {children}
      {active && <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
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
