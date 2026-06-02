import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
 * Single-page Compound Dashboard (2026-06-02 IA refactor).
 *
 * Layout shift — pre-refactor the page was a 4/5/3 column grid where the
 * right column carried Compound Details, Target Profile, References,
 * Localization (static metadata). Per user feedback that "scientist should
 * always know which compound they're looking at while analyzing", static
 * compound context now lives in a left sticky rail; the main analysis
 * column gets the freed width as a 2-col 50/50 grid for PPI + Landscape
 * and Time-lapse + Phenotypic Profiling.
 *
 *   [Context rail 280px, sticky]  [Main analysis flow]
 *     Current Compound              KPI Summary       (#overview)
 *     name + chips                  Key Findings 2x2
 *     dose/cell/observation         ─────
 *     ─────                         PPI + Landscape   (#ppi / #landscape)
 *     Sections nav                  Time-lapse + Phenotypic (#imaging)
 *     · Overview                    Pathway Enrichment (#pathway)
 *     · PPI                         ─────
 *     · Landscape                   Optional References (#references)
 *     · Imaging                       └ Localization + Refs + Compound
 *     · Pathway                          + Target detail
 *     · References
 *
 * Anchor IDs + scroll-mt utility keep the sticky topbar from covering each
 * section heading when nav links are clicked.
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

  return (
    <div className="flex-1 flex flex-col">
      {/* Slim topbar — breadcrumb + target switcher + batch info. The big
       *  hero (drug name + chips + meta) is gone; that identity now lives
       *  in the sticky context rail so it stays in view during scroll. */}
      <div className="sticky top-0 z-20 bg-surface-elevated border-b border-line">
        <div className="pl-16 pr-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-meta uppercase tracking-[0.16em] text-ink-muted min-w-0">
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-meta text-ink-muted mr-2">Target</span>
              {d.available_targets.map((t) => (
                <button
                  key={t}
                  className={t === target ? "chip chip--active" : "chip"}
                  onClick={() => {
                    setTarget(t);
                    setSelectedCommunity(null);
                    setSelectedNode(null);
                    setSelectedEdgeId(null);
                    setBridgeNotice(null);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="text-meta text-ink-muted tabular ml-2">
              v{d.provenance.pipeline_version}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 py-6 mx-auto w-full max-w-[1920px] flex-1">
        <div className="grid grid-cols-12 gap-6">
          {/* === COL 1: Context rail (sticky) ============================= */}
          <aside className="col-span-12 xl:col-span-3 min-w-0">
            <div className="xl:sticky xl:top-[74px] flex flex-col gap-4">
              <CurrentCompoundCard d={d} target={target ?? d.target_id} />
              <SectionNav />
            </div>
          </aside>

          {/* === COL 2: Main analysis flow ================================ */}
          <div className="col-span-12 xl:col-span-9 flex flex-col gap-6 min-w-0">
            {/* Overview — KPI + Key Findings */}
            <section id="overview" className="scroll-mt-[88px] flex flex-col gap-3">
              <KpiStrip kpis={d.kpis} />
              <KeyFindingsStrip data={d.insight} />
            </section>

            {bridgeNotice && (
              <BridgeNotice
                notice={bridgeNotice}
                onReset={resetToTargetCommunity}
                onDismiss={() => setBridgeNotice(null)}
              />
            )}

            {/* PPI + Landscape — equal 50/50, the two primary analyses. */}
            <div className="grid grid-cols-12 gap-5">
              <section
                id="ppi"
                className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[88px]"
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
                className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[88px]"
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

            {/* Imaging — Time-lapse + Phenotypic Profiling 50/50 */}
            <section
              id="imaging"
              className="grid grid-cols-12 gap-5 scroll-mt-[88px]"
            >
              <div className="col-span-12 lg:col-span-6 min-w-0">
                <PanelCard
                  title="Time-lapse Imaging"
                  tooltip="0–48 h timelapse (4 h cadence)"
                  status={d.status_flags.time_lapse}
                  meta={d.time_lapse?.well_id ? `well ${d.time_lapse.well_id}` : undefined}
                  actions={<CellLineInline cell={d.cell_line} />}
                >
                  <TimeLapseViewerPanel data={d.time_lapse} />
                </PanelCard>
              </div>
              <div className="col-span-12 lg:col-span-6 min-w-0">
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
              </div>
            </section>

            {/* Pathway — full width */}
            <section id="pathway" className="scroll-mt-[88px]">
              <PanelCard
                title="Pathway Enrichment"
                tooltip="현재 community의 GO BP/MF/CC enrichment score 상위 항목"
              >
                <EnrichmentBar terms={d.enrichment} />
              </PanelCard>
            </section>

            {/* Optional References — bottom strip with detail / refs */}
            <section
              id="references"
              className="scroll-mt-[88px] flex flex-col gap-3"
            >
              <div className="flex items-center gap-4">
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
                  Optional References
                </span>
                <span className="flex-1 border-t border-line" aria-hidden />
              </div>

              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-12 lg:col-span-6 min-w-0">
                  <ReferenceDatabasesCard d={d} target={target ?? d.target_id} />
                </div>
                <div className="col-span-12 lg:col-span-6 min-w-0">
                  <LocalizationCard d={d} />
                </div>
                <div className="col-span-12 lg:col-span-6 min-w-0">
                  <CompoundDetailsCard d={d} />
                </div>
                <div className="col-span-12 lg:col-span-6 min-w-0">
                  <TargetProfileCard d={d} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context rail — left column, sticky during scroll
// ---------------------------------------------------------------------------

/**
 * Current Compound — sticky identity card. Renders the drug name + the
 * three primary classification chips (target gene, drug group, growth
 * class) + the experimental conditions (dose / cell / observation hours).
 *
 * Designed to be the always-visible answer to "what am I currently
 * analyzing?" while the user scrolls through PPI / Landscape / Imaging.
 */
function CurrentCompoundCard({
  d,
  target,
}: {
  d: DashboardResponse;
  target: string;
}) {
  const c = d.compound;
  return (
    <section
      className="rounded-xl border border-line bg-surface-card p-5"
      aria-label="Current compound"
    >
      <span
        className="block text-ink-muted mb-2"
        style={{
          fontSize:      "var(--font-label-size)",
          lineHeight:    "var(--font-label-lh)",
          fontWeight:    "var(--font-label-weight)" as any,
          letterSpacing: "var(--font-label-tracking)",
          textTransform: "uppercase",
        }}
      >
        Current Compound
      </span>

      <h2
        className="text-ink-primary"
        style={{
          fontSize:      "22px",
          lineHeight:    "1.2",
          fontWeight:    700,
          letterSpacing: "-0.02em",
        }}
      >
        {d.drug_name}
      </h2>
      {c.hy_code && (
        <div className="mt-1 font-mono text-caption text-ink-muted">
          {c.hy_code}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="chip" title={`Active target: ${target}`}>
          {target}
        </span>
        {d.target_profile.drug_group && (
          <span className="chip">{d.target_profile.drug_group}</span>
        )}
        <StatusBadge growth_class={d.phenotypic?.growth_class} />
      </div>

      {d.target_profile.target_class && (
        <p className="mt-3 text-caption text-ink-muted leading-relaxed">
          {d.target_profile.target_class}
        </p>
      )}

      <dl className="mt-4 pt-4 border-t border-line grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-body">
        {c.dose_um != null && (
          <>
            <dt className="text-ink-muted">Dose</dt>
            <dd className="text-ink-primary tabular font-medium">
              {c.dose_um} µM
            </dd>
          </>
        )}
        <dt className="text-ink-muted">Cell</dt>
        <dd className="text-ink-primary font-medium">{d.cell_line.name}</dd>
        {c.treatment_hours != null && (
          <>
            <dt className="text-ink-muted">Observation</dt>
            <dd className="text-ink-primary tabular font-medium">
              {c.treatment_hours} h
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/**
 * SectionNav — anchor-link list to jump between major analysis sections.
 * scroll-margin handles the sticky topbar overlap; no JS scroll handler
 * needed.
 */
function SectionNav() {
  const items: { id: string; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "ppi", label: "PPI" },
    { id: "landscape", label: "Landscape" },
    { id: "imaging", label: "Imaging" },
    { id: "pathway", label: "Pathway" },
    { id: "references", label: "References" },
  ];
  return (
    <nav
      className="rounded-xl border border-line bg-surface-card p-4"
      aria-label="Section navigation"
    >
      <span
        className="block text-ink-muted mb-2"
        style={{
          fontSize:      "var(--font-label-size)",
          lineHeight:    "var(--font-label-lh)",
          fontWeight:    "var(--font-label-weight)" as any,
          letterSpacing: "var(--font-label-tracking)",
          textTransform: "uppercase",
        }}
      >
        Sections
      </span>
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className="block py-1.5 px-2 -mx-2 rounded-md text-body text-ink-secondary hover:text-ink-primary hover:bg-surface-soft transition-colors duration-fast"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Bridge notice (community switch feedback, with direction icon)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bottom-strip info cards (Optional References section)
// ---------------------------------------------------------------------------

function LocalizationCard({ d }: { d: DashboardResponse }) {
  return (
    <PanelCard title="Localization Annotations">
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

function CompoundDetailsCard({ d }: { d: DashboardResponse }) {
  const c = d.compound;
  return (
    <PanelCard title="Compound Details">
      <dl className="grid grid-cols-3 gap-y-2 text-body">
        <dt className="text-ink-muted">Dose</dt>
        <dd className="col-span-2 tabular">
          {c.dose_um ? `${c.dose_um} µM` : "—"}
          {c.treatment_hours && (
            <span className="ml-3 text-ink-muted">~ {c.treatment_hours} h</span>
          )}
        </dd>
        <dt className="text-ink-muted">Code</dt>
        <dd className="col-span-2 font-mono text-meta">{c.hy_code ?? "—"}</dd>
        <dt className="text-ink-muted">SMILES</dt>
        <dd className="col-span-2 font-mono text-meta break-all text-ink-secondary">
          {c.smiles ?? "—"}
        </dd>
      </dl>
    </PanelCard>
  );
}

function TargetProfileCard({ d }: { d: DashboardResponse }) {
  const t = d.target_profile;
  return (
    <PanelCard title="Target Profile">
      <dl className="grid grid-cols-3 gap-y-2 text-body">
        <dt className="text-ink-muted">Target</dt>
        <dd className="col-span-2 font-medium">{t.targets.join(", ")}</dd>
        <dt className="text-ink-muted">Class</dt>
        <dd className="col-span-2">{t.target_class ?? "—"}</dd>
        <dt className="text-ink-muted">Pathway</dt>
        <dd className="col-span-2">{t.pathway ?? "—"}</dd>
        <dt className="text-ink-muted">MoA</dt>
        <dd className="col-span-2 text-ink-secondary">
          {t.moa ? (t.moa.length > 160 ? `${t.moa.slice(0, 160)}…` : t.moa) : "—"}
        </dd>
      </dl>
    </PanelCard>
  );
}

function ReferenceDatabasesCard({ d, target }: { d: DashboardResponse; target: string }) {
  const refs = d.references.by_target[target] ?? d.references.by_target[d.target_id] ?? {};
  const dataOrder = ["Ensembl", "Entrez", "UniProt", "HPA"] as const;
  const chemOrder = ["MedChemExpress"] as const;

  const moaLinks: { label: string; href: string }[] = [];
  const drugName = encodeURIComponent(d.drug_name);
  moaLinks.push({
    label: "PubChem",
    href: `https://pubchem.ncbi.nlm.nih.gov/#query=${drugName}`,
  });
  moaLinks.push({
    label: "ChEMBL",
    href: `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${drugName}`,
  });
  moaLinks.push({
    label: "DrugBank",
    href: `https://go.drugbank.com/unearth/q?query=${drugName}&searcher=drugs`,
  });
  if (d.compound.hy_code) {
    moaLinks.push({
      label: "Code (MedChem)",
      href: `https://www.medchemexpress.com/search.html?q=${encodeURIComponent(
        d.compound.hy_code,
      )}`,
    });
  }

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items: { label: string; href: string }[];
  }): ReactNode =>
    items.length === 0 ? null : (
      <div>
        <div className="text-meta text-ink-muted uppercase tracking-wider mb-1.5">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href}
              target="_blank"
              rel="noreferrer"
              className="a-link"
            >
              {it.label}
            </a>
          ))}
        </div>
      </div>
    );

  return (
    <PanelCard title="Reference databases">
      <div className="flex flex-col gap-3">
        <Section
          title="Target gene"
          items={dataOrder.filter((k) => refs[k]).map((k) => ({ label: k, href: refs[k] }))}
        />
        <Section
          title="Compound"
          items={chemOrder.filter((k) => refs[k]).map((k) => ({ label: k, href: refs[k] }))}
        />
        <Section title="Mechanism & literature" items={moaLinks} />
        {Object.keys(refs).length === 0 && moaLinks.length === 0 && (
          <span className="text-ink-muted">없음</span>
        )}
      </div>
    </PanelCard>
  );
}
