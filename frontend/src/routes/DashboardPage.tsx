import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useCommunityPanel, useDashboard, useSwitchCommunity } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { PanelCard } from "@/components/PanelCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PpiGraph } from "@/features/ppi-graph/PpiGraph";
import { findRelatedCommunityFromEdge } from "@/features/ppi-graph/relatedCommunity";
import { Landscape } from "@/features/landscape/Landscape";
import { PhenotypicProfilingPanel } from "@/features/phenotypic/PhenotypicProfilingPanel";
import { TimeLapseViewerPanel } from "@/features/time-lapse/TimeLapseViewerPanel";
import { EnrichmentBar } from "@/features/enrichment/EnrichmentBar";
import { KpiStrip } from "@/features/kpi/KpiStrip";
import type { DashboardResponse, PpiPanel } from "@/types/api";

/**
 * Compound Dashboard — 2026-06-02 IA refactor (proposal #2).
 *
 * The dashboard-specific left rail is gone. Compound identity now lives
 * in the sticky page header; a horizontal tab nav under the header
 * provides section jumps. The freed horizontal space is given to the
 * primary visualizations (PPI + Landscape) and a Pathway / Imaging row.
 *
 *   [Sticky Header]
 *     breadcrumb
 *     drug name + targets + chips + conditions ··· target switcher / refs
 *     [tab nav: Overview · PPI · Landscape · Pathway · Imaging]
 *
 *   #overview        KPI strip → Key Findings → Mechanistic Signatures
 *   #ppi / #landscape  PPI 50% │ Landscape 50%
 *   #pathway / #imaging Pathway 50% │ (Time-lapse on top, Phenotypic below)
 *
 * Optional References, Compound Details, Target Profile cards removed —
 * compound info is already in the header; reference links are absorbed
 * into the header's right cluster as chip-style external links.
 */
export function DashboardPage() {
  const { plateId, drugId } = useParams<{ plateId: string; drugId: string }>();
  const [search, setSearch] = useSearchParams();

  const initialTarget = search.get("target") ?? undefined;

  const [target, setTarget] = useState<string | undefined>(initialTarget);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [bridgeNotice, setBridgeNotice] = useState<{
    text: string;
    direction: "ppi-to-landscape" | "landscape-to-ppi" | "node-jump";
  } | null>(null);

  const dash = useDashboard(plateId, drugId, target);

  useEffect(() => {
    if (dash.data && !target) setTarget(dash.data.target_id);
  }, [dash.data, target]);

  useEffect(() => {
    if (!target) return;
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("target", target);
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (search.get("tab")) {
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dash.data?.ppi && selectedCommunity === null) {
      setSelectedCommunity(dash.data.ppi.current_community_id);
    }
  }, [dash.data, selectedCommunity]);

  const communityQuery = useCommunityPanel(
    plateId,
    drugId,
    selectedCommunity !== null && dash.data?.ppi?.current_community_id !== selectedCommunity
      ? selectedCommunity
      : null,
    target,
  );

  const activePpi: PpiPanel | null = useMemo(() => {
    if (communityQuery.data) return communityQuery.data;
    return dash.data?.ppi ?? null;
  }, [communityQuery.data, dash.data]);

  const switchCommunity = useSwitchCommunity();

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
    setSelectedEdgeId(null);
    if (!activePpi) return;
    const home = activePpi.current_community_id;
    const candidates = (activePpi.node_community_index[nodeId] ?? []).filter((c) => c !== home);
    if (candidates.length === 0) {
      setBridgeNotice({
        text: `노드 ${nodeId} 클릭 — 다른 community와 직접 연결 없음 (E12 슬라이드만 열림)`,
        direction: "node-jump",
      });
      return;
    }
    const next_cid = candidates[0];
    setBridgeNotice({
      text: `노드 ${nodeId} → community ${home} 에서 community ${next_cid} 로 이동`,
      direction: "node-jump",
    });
    setSelectedCommunity(next_cid);
    if (plateId && drugId && target) {
      switchCommunity.mutate({
        plateId,
        drugId,
        fromCommunityId: home,
        toCommunityId: next_cid,
        bridgingNode: nodeId,
        target,
      });
    }
  };

  const handleEdgeClick = (edge: {
    id: string;
    source: string;
    target: string;
    corr: number;
  }) => {
    if (!activePpi) return;
    setSelectedEdgeId(edge.id);
    setSelectedNode(null);
    const here = activePpi.current_community_id;
    const related = findRelatedCommunityFromEdge(activePpi, edge, here);
    if (!related) {
      setBridgeNotice({
        text: `Edge ${edge.source} ↔ ${edge.target} — 외부 community 매칭 없음 (현재 community 내부 연결)`,
        direction: "ppi-to-landscape",
      });
      return;
    }
    const reasonText =
      related.reason === "shared"
        ? `양쪽 노드 모두 community ${related.communityId} 에도 속함`
        : `landscape 거리 기준 community ${related.communityId} 가 가장 인접 (Δ=${
            related.distance?.toFixed(2) ?? "?"
          })`;
    setBridgeNotice({
      text: `Edge ${edge.source} ↔ ${edge.target} → ${reasonText}`,
      direction: "ppi-to-landscape",
    });
    setSelectedCommunity(related.communityId);
    if (plateId && drugId && target) {
      switchCommunity.mutate({
        plateId,
        drugId,
        fromCommunityId: here,
        toCommunityId: related.communityId,
        bridgingNode: `${edge.source}↔${edge.target}`,
        target,
      });
    }
  };

  const handleLandscapeClick = (cid: number) => {
    if (!activePpi) return;
    const here = activePpi.current_community_id;
    setSelectedEdgeId(null);
    setSelectedNode(null);
    setBridgeNotice({
      text: `Landscape peak → community ${cid} 선택 → PPI 재구성`,
      direction: "landscape-to-ppi",
    });
    setSelectedCommunity(cid);
    if (cid !== here && plateId && drugId && target) {
      switchCommunity.mutate({
        plateId,
        drugId,
        fromCommunityId: here,
        toCommunityId: cid,
        bridgingNode: `landscape:peak#${cid}`,
        target,
      });
    }
  };

  const resetToTargetCommunity = () => {
    if (!dash.data?.ppi) return;
    setSelectedCommunity(dash.data.ppi.target_community_id);
    setSelectedEdgeId(null);
    setSelectedNode(null);
    setBridgeNotice(null);
  };

  if (dash.isLoading) return <LoadingBlock />;
  if (dash.error) return <ErrorBlock error={dash.error} />;
  if (!dash.data) return <EmptyBlock />;
  const d = dash.data;
  const activeTarget = target ?? d.target_id;

  return (
    <div className="flex-1 flex flex-col">
      <DashboardHeader
        d={d}
        plateId={plateId}
        target={activeTarget}
        onTargetChange={(t) => {
          setTarget(t);
          setSelectedCommunity(null);
          setSelectedNode(null);
          setSelectedEdgeId(null);
          setBridgeNotice(null);
        }}
      />

      <div className="px-4 lg:px-8 py-6 mx-auto w-full max-w-[1920px] flex-1 flex flex-col gap-6">
        {/* === #overview — KPI · Key Findings · Mechanistic Signatures ==== */}
        <section
          id="overview"
          className="scroll-mt-[180px] flex flex-col gap-4"
        >
          <KpiStrip kpis={d.kpis} />
          <KeyFindingsStrip data={d.insight} />
          <MechanisticSignatures d={d} />
        </section>

        {bridgeNotice && (
          <BridgeNotice
            notice={bridgeNotice}
            onReset={resetToTargetCommunity}
            onDismiss={() => setBridgeNotice(null)}
          />
        )}

        {/* === Row 1: PPI 50% + Landscape 50% ============================ */}
        <div className="grid grid-cols-12 gap-5">
          <section
            id="ppi"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[180px]"
          >
            <PanelCard
              title={`PPI Network · community ${activePpi?.current_community_id ?? "—"}`}
              tooltip="노드 클릭 = 해당 community로 in-place 전환. 엣지 클릭 = landscape에서 관련 community 자동 선택."
              accent
              status={d.status_flags.ppi}
              meta={`target community = ${activePpi?.target_community_id ?? "—"} · nodes=${
                activePpi?.nodes.length ?? 0
              } · edges=${activePpi?.edges.length ?? 0}`}
              actions={<span className="chip">{activePpi?.target}</span>}
            >
              {!activePpi ? (
                <div className="h-[520px] flex items-center justify-center">
                  <EmptyBlock label="PPI 데이터 없음" />
                </div>
              ) : (
                <PpiGraph
                  nodes={activePpi.nodes}
                  edges={activePpi.edges}
                  targetName={activePpi.target}
                  selectedNode={selectedNode}
                  selectedEdgeId={selectedEdgeId}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                  height={520}
                />
              )}
            </PanelCard>
          </section>

          <section
            id="landscape"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[180px]"
          >
            <PanelCard
              title="Target Landscape"
              tooltip="x=Distance, y=−log10(p), z=avg(PCC). 2D contour 기본, 3D 토글 가능. 점 클릭 → PPI 재구성. ✚ = target community. PCC 슬라이더로 임계값 이상 community만 필터."
              status={d.status_flags.landscape}
            >
              {d.landscape ? (
                <Landscape
                  landscape={d.landscape}
                  highlightCommunity={selectedCommunity}
                  onCommunityClick={handleLandscapeClick}
                  height={520}
                />
              ) : (
                <div className="h-[520px] flex items-center justify-center">
                  <EmptyBlock />
                </div>
              )}
            </PanelCard>
          </section>
        </div>

        {/* === Row 2: Pathway 50% + Imaging-column 50% (Time-lapse + Phenotypic stacked) === */}
        <div className="grid grid-cols-12 gap-5">
          <section
            id="pathway"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[180px]"
          >
            <PanelCard
              title="Pathway Enrichment"
              tooltip="현재 community의 GO BP/MF/CC enrichment score 상위 항목"
            >
              <EnrichmentBar terms={d.enrichment} />
            </PanelCard>
          </section>

          <section
            id="imaging"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[180px] flex flex-col gap-5"
          >
            <PanelCard
              title="Time-lapse Imaging"
              tooltip="0–48 h timelapse (4 h cadence)"
              status={d.status_flags.time_lapse}
              meta={d.time_lapse?.well_id ? `well ${d.time_lapse.well_id}` : undefined}
              actions={<CellLineInline cell={d.cell_line} />}
            >
              <TimeLapseViewerPanel data={d.time_lapse} />
            </PanelCard>

            <PanelCard
              title="Phenotypic Profiling"
              tooltip="Growth Rate + Phenome Tracking"
              status={d.status_flags.phenotypic}
              meta={
                d.phenotypic?.gr_score !== null && d.phenotypic?.gr_score !== undefined
                  ? `GR score ${d.phenotypic.gr_score.toFixed(4)}`
                  : undefined
              }
            >
              <PhenotypicProfilingPanel data={d.phenotypic} />
            </PanelCard>
          </section>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Header (sticky) — identity + target switcher + external refs + section tabs
// ===========================================================================

const SECTION_NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ppi", label: "PPI" },
  { id: "landscape", label: "Landscape" },
  { id: "pathway", label: "Pathway" },
  { id: "imaging", label: "Imaging" },
];

function DashboardHeader({
  d,
  plateId,
  target,
  onTargetChange,
}: {
  d: DashboardResponse;
  plateId: string | undefined;
  target: string;
  onTargetChange: (t: string) => void;
}) {
  const c = d.compound;

  const conditions = [
    c.dose_um != null ? `${c.dose_um} µM` : null,
    d.cell_line.name,
    c.treatment_hours != null ? `${c.treatment_hours} h` : null,
  ].filter(Boolean) as string[];

  return (
    <header className="sticky top-0 z-30 bg-surface-elevated border-b border-line">
      {/* Breadcrumb row — minimal, 1 line */}
      <div className="pl-16 pr-4 lg:px-8 pt-3">
        <div className="text-meta uppercase tracking-[0.16em] text-ink-muted">
          <Link to="/plates" className="hover:text-ink-primary">
            Workspace
          </Link>
          <span className="mx-2">›</span>
          <Link to={`/plates/${plateId}`} className="hover:text-ink-primary">
            {plateId}
          </Link>
          <span className="mx-2">›</span>
          <span className="text-ink-secondary normal-case tracking-normal">
            {d.drug_name}
          </span>
        </div>
      </div>

      {/* Identity row — left: compound identity · right: switcher + refs */}
      <div className="pl-16 pr-4 lg:px-8 pt-2 pb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {/* LEFT: identity block */}
        <div className="min-w-0">
          <h1
            className="text-ink-primary tracking-tight"
            style={{
              fontSize: "30px",
              lineHeight: "1.15",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {d.drug_name}
          </h1>

          {d.target_profile.targets.length > 0 && (
            <p className="mt-1 text-body-strong text-ink-secondary">
              {d.target_profile.targets.join(" / ")}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {d.target_profile.drug_group && (
              <span className="chip">{d.target_profile.drug_group}</span>
            )}
            <StatusBadge growth_class={d.phenotypic?.growth_class} />
          </div>

          {conditions.length > 0 && (
            <p className="mt-2 text-body text-ink-muted tabular">
              {conditions.join(" · ")}
            </p>
          )}
        </div>

        {/* RIGHT: target switcher + version + external links */}
        <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-meta text-ink-muted mr-2">Target</span>
            {d.available_targets.map((t) => (
              <button
                key={t}
                className={t === target ? "chip chip--active" : "chip"}
                onClick={() => onTargetChange(t)}
              >
                {t}
              </button>
            ))}
            <span className="ml-3 text-meta text-ink-muted tabular">
              v{d.provenance.pipeline_version}
            </span>
          </div>
          <ExternalRefChips d={d} target={target} />
        </div>
      </div>

      {/* Sticky horizontal section tab nav */}
      <nav
        className="pl-16 pr-4 lg:px-8 border-t border-line"
        aria-label="Dashboard sections"
      >
        <ul className="flex items-center gap-1 -mb-px overflow-x-auto">
          {SECTION_NAV.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                className="
                  inline-flex items-center px-3 py-2.5
                  text-body font-medium text-ink-secondary
                  border-b-2 border-transparent
                  hover:text-ink-primary hover:border-brand-primary/40
                  transition-colors duration-fast
                "
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/**
 * ExternalRefChips — flattened reference list shown as chip-style links
 * in the header right cluster. Replaces the dedicated Reference Databases
 * card. Order: target-gene refs first (UniProt / Ensembl / Entrez / HPA),
 * then compound refs (MedChemExpress), then derived MoA / literature
 * search links (PubChem / ChEMBL / DrugBank).
 */
function ExternalRefChips({
  d,
  target,
}: {
  d: DashboardResponse;
  target: string;
}) {
  const refs =
    d.references.by_target[target] ?? d.references.by_target[d.target_id] ?? {};

  const items: { label: string; href: string }[] = [];

  for (const k of ["UniProt", "Ensembl", "Entrez", "HPA"]) {
    if (refs[k]) items.push({ label: k, href: refs[k] });
  }
  if (refs["MedChemExpress"]) {
    items.push({ label: "MedChem", href: refs["MedChemExpress"] });
  }

  const drugName = encodeURIComponent(d.drug_name);
  items.push({
    label: "PubChem",
    href: `https://pubchem.ncbi.nlm.nih.gov/#query=${drugName}`,
  });
  items.push({
    label: "ChEMBL",
    href: `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${drugName}`,
  });
  items.push({
    label: "DrugBank",
    href: `https://go.drugbank.com/unearth/q?query=${drugName}&searcher=drugs`,
  });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta justify-start lg:justify-end max-w-[520px]">
      <span className="text-ink-muted uppercase tracking-wider mr-1">
        External
      </span>
      {items.map((it, i) => (
        <span key={it.label} className="inline-flex items-baseline gap-2">
          {i > 0 && (
            <span className="text-ink-muted opacity-50 select-none" aria-hidden>
              ·
            </span>
          )}
          <a
            href={it.href}
            target="_blank"
            rel="noreferrer"
            className="a-link"
          >
            {it.label}
          </a>
        </span>
      ))}
    </div>
  );
}

// ===========================================================================
// Mechanistic Signatures (formerly Localization Annotations) — heatmap rows
// ===========================================================================

/**
 * Renames the existing localization_annotations payload to "Mechanistic
 * Signatures" and lifts it from the bottom #references strip into the
 * Overview band, between KPI/Key Findings and the main analysis grid.
 *
 * Visual format unchanged — 5-cell teal→cyan heatmap per row — so this is
 * purely a placement + label change at the UI layer. Backend payload
 * (`d.localization_annotations`) is reused as-is.
 */
function MechanisticSignatures({ d }: { d: DashboardResponse }) {
  if (d.localization_annotations.length === 0) return null;
  return (
    <PanelCard title="Mechanistic Signatures">
      <ul className="space-y-2.5">
        {d.localization_annotations.map((l: { label: string; level: number }) => {
          const clamped = Math.max(0, Math.min(5, l.level));
          return (
            <li key={l.label} className="flex items-center gap-3">
              <div
                role="img"
                aria-label={`${l.label} level ${l.level} of 5`}
                className="flex gap-1 shrink-0"
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  if (i >= clamped) {
                    return (
                      <span
                        key={i}
                        className="block w-4 h-3.5 rounded-sm"
                        style={{ background: "rgb(var(--color-loc-low-rgb) / 0.08)" }}
                      />
                    );
                  }
                  const ratio = i / 4;
                  return (
                    <span
                      key={i}
                      className="block w-4 h-3.5 rounded-sm"
                      style={{
                        background:
                          ratio < 0.5
                            ? `rgb(var(--color-loc-low-rgb) / ${0.55 + ratio * 0.6})`
                            : `rgb(var(--color-loc-high-rgb) / ${0.55 + (ratio - 0.5) * 0.9})`,
                      }}
                    />
                  );
                })}
              </div>
              <span className="text-body text-ink-secondary">{l.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 pt-2.5 border-t border-line flex items-center gap-2 text-meta text-ink-muted">
        <span>Low</span>
        <div
          className="flex-1 h-1.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--color-loc-low-rgb) / 0.85), rgb(var(--color-loc-high-rgb) / 0.95))",
          }}
        />
        <span>High</span>
      </div>
    </PanelCard>
  );
}

// ===========================================================================
// Existing helpers (KeyFindings, Bridge notice, CellLineInline)
// ===========================================================================

function BridgeNotice({
  notice,
  onReset,
  onDismiss,
}: {
  notice: { text: string; direction: "ppi-to-landscape" | "landscape-to-ppi" | "node-jump" };
  onReset: () => void;
  onDismiss: () => void;
}) {
  const arrow =
    notice.direction === "ppi-to-landscape"
      ? "PPI → Landscape"
      : notice.direction === "landscape-to-ppi"
      ? "Landscape → PPI"
      : "Node jump";
  return (
    <div className="px-3 py-2 rounded-md border border-brand-primary/40 bg-surface-card text-body text-ink-primary flex items-center gap-3 shadow-md">
      <span className="text-meta uppercase tracking-wider text-brand-primary font-semibold whitespace-nowrap">
        {arrow}
      </span>
      <span className="flex-1 min-w-0 truncate text-ink-secondary">{notice.text}</span>
      <button className="btn btn--ghost text-meta" onClick={onReset}>
        target community 복귀
      </button>
      <button
        className="btn btn--ghost text-meta"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function KeyFindingsStrip({ data }: { data: DashboardResponse["insight"] }) {
  if (!data || data.key_findings.length === 0) return null;
  const findings = data.key_findings.slice(0, 4);

  const ICON: Record<string, string> = {
    pulse: "◉",
    warning: "⚠",
    info: "ⓘ",
    target: "◎",
    "trend-up": "↗",
    "trend-down": "↘",
  };

  const SENT_TEXT: Record<string, string> = {
    positive: "text-status-success",
    warning: "text-status-warning",
    negative: "text-status-error",
    neutral: "text-ink-secondary",
  };

  const SENT_RING: Record<string, string> = {
    positive: "ring-status-success/30",
    warning: "ring-status-warning/30",
    negative: "ring-status-error/30",
    neutral: "ring-line",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {findings.map((f, i) => (
        <div
          key={i}
          className={`kpi-tile ring-1 ring-inset ${SENT_RING[f.sentiment] ?? SENT_RING.neutral}`}
        >
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-card ${SENT_TEXT[f.sentiment] ?? SENT_TEXT.neutral}`}
              aria-hidden
            >
              {ICON[f.icon] ?? "•"}
            </span>
            <h4
              className={`text-body font-semibold ${
                SENT_TEXT[f.sentiment] ?? SENT_TEXT.neutral
              }`}
            >
              {f.title}
            </h4>
          </div>
          {f.detail && (
            <p className="text-meta text-ink-secondary leading-relaxed mt-1 line-clamp-3">
              {f.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function CellLineInline({ cell }: { cell: DashboardResponse["cell_line"] }) {
  return (
    <div className="relative group inline-flex items-center gap-1.5">
      <span className="chip">{cell.name}</span>
      <button
        type="button"
        className="w-5 h-5 rounded-full border border-line text-meta text-ink-muted hover:text-ink-primary hover:border-brand-primary/45 transition-colors duration-fast"
        aria-label="Cell line details"
      >
        ?
      </button>
      <div
        role="tooltip"
        className="
          absolute top-full right-0 mt-2 z-50 w-64
          opacity-0 invisible
          group-hover:opacity-100 group-hover:visible
          group-focus-within:opacity-100 group-focus-within:visible
          transition-opacity duration-fast
          rounded-lg border border-line bg-surface-panel shadow-lg
          p-3
        "
      >
        <dl className="grid grid-cols-[80px_1fr] gap-y-1.5 text-meta">
          <dt className="text-ink-muted">Name</dt>
          <dd className="font-medium text-ink-primary">{cell.name}</dd>
          <dt className="text-ink-muted">Species</dt>
          <dd className="text-ink-secondary">{cell.species ?? "—"}</dd>
          <dt className="text-ink-muted">Tissue</dt>
          <dd className="text-ink-secondary">{cell.tissue ?? "—"}</dd>
          <dt className="text-ink-muted">Morphology</dt>
          <dd className="text-ink-secondary">{cell.morphology ?? "—"}</dd>
          {cell.description && (
            <>
              <dt className="text-ink-muted">Note</dt>
              <dd className="text-ink-secondary leading-relaxed">
                {cell.description}
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
