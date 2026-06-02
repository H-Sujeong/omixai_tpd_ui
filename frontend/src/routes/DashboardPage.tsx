import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useCommunityPanel, useDashboard, useSwitchCommunity } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { PanelCard } from "@/components/PanelCard";
import { StatusBadge } from "@/components/StatusBadge";
import { TopbarMetaRow } from "@/components/TopbarMetaRow";
import { PpiGraph } from "@/features/ppi-graph/PpiGraph";
import { findRelatedCommunityFromEdge } from "@/features/ppi-graph/relatedCommunity";
import { Landscape } from "@/features/landscape/Landscape";
import { PhenotypicProfilingPanel } from "@/features/phenotypic/PhenotypicProfilingPanel";
import { TimeLapseViewerPanel } from "@/features/time-lapse/TimeLapseViewerPanel";
import { EnrichmentBar } from "@/features/enrichment/EnrichmentBar";
import { KpiStrip } from "@/features/kpi/KpiStrip";
import type { DashboardResponse, PpiPanel } from "@/types/api";

/**
 * Single-page dashboard layout (Step 12, 2026-05-21).
 *
 * The previous 3-tab structure (Phenotype/Network/Mechanism) has been
 * collapsed into one continuous page that mirrors design_02 — everything
 * the user needs is visible at once, organized in three columns:
 *
 *   - Left (col-span-4): PPI Network + 3D Landscape, evenly split 50/50
 *   - Center (col-span-5): Time-lapse, Phenotypic Profiling, Pathway Enrichment
 *   - Right (col-span-3): Compound, Target, Cell Line, References,
 *                          Localization, Mechanism of Action (sticky)
 *
 * Legacy ?tab=... URLs are stripped on entry (replace) so bookmarks survive.
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
  // Step 13 (2026-05-21): InteractomeSlide removed; node clicks now jump
  // the user in-place to the relevant community on the current PPI panel.

  const dash = useDashboard(plateId, drugId, target);

  useEffect(() => {
    if (dash.data && !target) setTarget(dash.data.target_id);
  }, [dash.data, target]);

  // One-way: target state → URL.
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

  // Step 12 (2026-05-21): if a legacy ?tab=... param is still in the URL
  // from a bookmark, strip it silently — the dashboard is now single-page
  // and the tab param has no effect. Done once on mount.
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

  // PPI node click → jump to other community + open Interactome slide
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

  // PPI edge click → find most-related community → highlight on landscape
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
    // Record the transition on the backend, mirroring the node/edge handlers.
    // Skip when clicking the already-active community (no-op switch).
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
      {/* Topbar — design_02 breadcrumb + hero + actions */}
      <div className="sticky top-0 z-20 bg-surface-elevated">
        <div className="pl-16 pr-4 lg:px-8 py-4 flex flex-col lg:flex-row items-start lg:justify-between gap-3 lg:gap-4">
          <div className="min-w-0">
            <div className="text-meta uppercase tracking-[0.16em] text-ink-muted">
              <Link to="/plates" className="hover:text-ink-primary">Workspace</Link>
              <span className="mx-2">›</span>
              <Link to={`/plates/${plateId}`} className="hover:text-ink-primary">{plateId}</Link>
              <span className="mx-2">›</span>
              <span className="text-ink-secondary">{d.drug_name}</span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <h1 className="text-hero font-bold tracking-tight text-ink-primary">{d.drug_name}</h1>
              <span className="chip">PROTAC Degrader</span>
              {d.target_profile.drug_group && (
                <span className="chip">{d.target_profile.drug_group}</span>
              )}
              <StatusBadge growth_class={d.phenotypic?.growth_class} />
            </div>
            <p className="text-body text-ink-muted mt-1">
              {d.target_profile.target_class ?? "Targeted protein degradation"} · Targets:{" "}
              {d.target_profile.targets.join(" / ")}
            </p>
            <TopbarMetaRow d={d} target={target ?? d.target_id} />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <div className="flex flex-wrap items-center gap-1 mr-2">
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
            <div className="text-meta text-ink-muted tabular text-left lg:text-right">
              <div>batch · {d.provenance.plate_id}</div>
              <div>v{d.provenance.pipeline_version}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 py-6 mx-auto w-full max-w-[1920px] flex-1">
        <KpiStrip kpis={d.kpis} />

        <KeyFindingsStrip data={d.insight} />

        {bridgeNotice && (
          <BridgeNotice
            notice={bridgeNotice}
            onReset={resetToTargetCommunity}
            onDismiss={() => setBridgeNotice(null)}
          />
        )}

        {/* Layout (2026-06-01, UI변환안layout.png).
         *
         *   Col 1 (col-span-4) | Col 2 (col-span-5) | Col 3 (col-span-3, sticky)
         *   ─────────────────────────────────────────────────────────────────
         *   PPI Network  (big) │ Target Landscape  │  Compound Details
         *                       │  (+ PCC threshold)│  Target Profile
         *   ───────────────────│───────────────────│  Reference databases
         *   Time-lapse Imaging │ Pathway Enrichment│  Localization
         *   Phenotypic Profile │ (GO, tall)        │
         *
         *   Landscape + PPI are pulled up into the top "row" to give them
         *   space (test_viz parity). Col 3 remains the sticky info column.
         */}
        <div className="mt-5 grid grid-cols-12 gap-5">
          {/* === COL 1 (col-span-4): PPI (top) + TimeLapse + Phenotypic ====== */}
          <div className="col-span-12 xl:col-span-4 flex flex-col gap-5 min-w-0">
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
          </div>

          {/* === COL 2 (col-span-5): Landscape (top) + Pathway (GO) ========== */}
          <div className="col-span-12 xl:col-span-5 flex flex-col gap-5 min-w-0">
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

            <PanelCard
              title="Pathway Enrichment"
              tooltip="현재 community의 GO BP/MF/CC enrichment score 상위 항목"
            >
              <EnrichmentBar terms={d.enrichment} />
            </PanelCard>
          </div>

          {/* === COL 3 (col-span-3): sticky info column (unchanged) ========== */}
          <div className="col-span-12 xl:col-span-3 min-w-0">
            <div className="flex flex-col gap-4 xl:sticky xl:top-[200px]">
              <CompoundDetailsCard d={d} />
              <TargetProfileCard d={d} />
              <ReferenceDatabasesCard d={d} target={target ?? d.target_id} />
              <LocalizationCard d={d} />
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className="mt-3 px-3 py-2 rounded-md border border-brand-primary/40 bg-surface-card text-body text-ink-primary flex items-center gap-3 shadow-md">
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
// Right-column info cards specific to the single-page dashboard
// ---------------------------------------------------------------------------

/**
 * Localization Annotations card — heatmap-style row grid.
 * Step 13 (2026-05-21): colormap switched from brand-primary to
 * Teal→Cyan (--color-loc-low-rgb → --color-loc-high-rgb) so the
 * localization channel is visually distinct from the PPI brand channel.
 * Each row's 5 cells light up cumulatively by `level` (0-5); within the
 * lit range the colors interpolate from teal (low cells) to cyan
 * (high cells), then the cumulative max controls overall brightness.
 */
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
                  // Interpolate the lit cells from teal (low) → cyan (high)
                  // across the bar; unlit cells use a muted teal at 8%.
                  if (i >= clamped) {
                    return (
                      <span
                        key={i}
                        className="block w-4 h-3.5 rounded-sm"
                        style={{ background: "rgb(var(--color-loc-low-rgb) / 0.08)" }}
                      />
                    );
                  }
                  const ratio = i / 4; // 0…1 across the 5 cells
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

/**
 * "About this protein — Mechanism of Action" card — REMOVED in Step 13.
 *
 * Per user feedback (2026-05-21): Mechanism of Action and Mechanism Summary
 * panels removed. External references (UniProt / Ensembl / HPA) plus
 * additional MoA-source links now live inside ReferenceDatabasesCard.
 */

// ---------------------------------------------------------------------------
// Step 13 (2026-05-21) — new helpers below
// ---------------------------------------------------------------------------

/**
 * KeyFindingsStrip — 2×2 grid of "Key findings" pulled from InsightSummary.
 * Placed directly under the KPI strip so the four most-important
 * conclusions live at the top of the page in the same horizontal band as
 * the four KPIs (matching the user's requested visual rhythm).
 * Renders nothing if there are no findings.
 */
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
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

/**
 * CellLineInline — replaces the old CellLineCard.
 * Renders a compact pill "U2OS [?]" inside the Time-lapse panel header.
 * Hovering the [?] reveals a small dark-themed popover with Species /
 * Tissue / Morphology / Note (CSS-only via group-hover; no JS).
 */
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
      {/* Popover — appears below the [?] button on hover/focus */}
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

// ---------------------------------------------------------------------------
// Reusable info cards
// ---------------------------------------------------------------------------

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

  // External MoA / mechanism sources — built from compound metadata.
  // Step 13 (2026-05-21): consolidates the deleted MoA card's content.
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
  }) =>
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
