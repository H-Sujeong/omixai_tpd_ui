import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useCommunityPanel, useDashboard, useSwitchCommunity } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { PanelCard } from "@/components/PanelCard";
import { StatusBadge } from "@/components/StatusBadge";
import { TopbarMetaRow } from "@/components/TopbarMetaRow";
import { PpiGraph } from "@/features/ppi-graph/PpiGraph";
import { PpiLegend } from "@/features/ppi-graph/PpiLegend";
import { findRelatedCommunityFromEdge } from "@/features/ppi-graph/relatedCommunity";
import { Landscape } from "@/features/landscape/Landscape";
import { PhenotypicProfilingPanel } from "@/features/phenotypic/PhenotypicProfilingPanel";
import { TimeLapseViewerPanel } from "@/features/time-lapse/TimeLapseViewerPanel";
import { EnrichmentBar } from "@/features/enrichment/EnrichmentBar";
import { InteractomeSlide } from "@/features/interactome-slide/InteractomeSlide";
import { KpiStrip } from "@/features/kpi/KpiStrip";
import { InsightSidebar } from "@/features/insight-sidebar/InsightSidebar";
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
  const [slideNodeId, setSlideNodeId] = useState<string | null>(null);

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
    setSlideNodeId(nodeId);
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
    setSelectedEdgeId(null);
    setBridgeNotice({
      text: `Landscape peak → community ${cid} 선택 → PPI 재구성`,
      direction: "landscape-to-ppi",
    });
    setSelectedCommunity(cid);
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

      <div className="px-4 lg:px-8 py-6 mx-auto w-full max-w-[1600px] flex-1">
        <KpiStrip kpis={d.kpis} />

        {bridgeNotice && (
          <BridgeNotice
            notice={bridgeNotice}
            onReset={resetToTargetCommunity}
            onDismiss={() => setBridgeNotice(null)}
          />
        )}

        {/* Single-page 3-column grid (design_02 mirror).
         * Step 12 (2026-05-21).
         *   Left  (col-span-4):  PPI Network + 3D Landscape, 50/50 vertical split
         *   Center (col-span-5): Time-lapse, Phenotypic Profiling, Pathway Enrichment
         *   Right (col-span-3):  Compound, Target, CellLine, References,
         *                        Localization, About — sticky
         */}
        <div className="mt-5 grid grid-cols-12 gap-5">
          {/* === LEFT — Network + Landscape, equal heights =================== */}
          <div className="col-span-12 xl:col-span-4 flex flex-col gap-5 min-w-0">
            <PanelCard
              title={`PPI Network · community ${activePpi?.current_community_id ?? "—"}`}
              tooltip="노드 클릭 = E12 슬라이드 + community 점프. 엣지 클릭 = 관련된 community를 landscape에서 자동 선택."
              accent
              status={d.status_flags.ppi}
              meta={`target community = ${activePpi?.target_community_id ?? "—"} · nodes=${
                activePpi?.nodes.length ?? 0
              } · edges=${activePpi?.edges.length ?? 0}`}
              actions={<span className="chip">{activePpi?.target}</span>}
            >
              {!activePpi ? (
                <div className="h-[360px] flex items-center justify-center">
                  <EmptyBlock label="PPI 데이터 없음" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <PpiGraph
                    nodes={activePpi.nodes}
                    edges={activePpi.edges}
                    selectedNode={selectedNode}
                    selectedEdgeId={selectedEdgeId}
                    onNodeClick={handleNodeClick}
                    onEdgeClick={handleEdgeClick}
                    height={420}
                  />
                  <PpiLegend />
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="3D Phenotypic Landscape"
              tooltip="x=Distance, y=−log10(p), z=avg(PCC). 점 클릭 → PPI 재구성."
              status={d.status_flags.landscape}
            >
              {d.landscape ? (
                <Landscape
                  landscape={d.landscape}
                  highlightCommunity={selectedCommunity}
                  onCommunityClick={handleLandscapeClick}
                  height={420}
                />
              ) : (
                <div className="h-[420px] flex items-center justify-center">
                  <EmptyBlock />
                </div>
              )}
            </PanelCard>
          </div>

          {/* === CENTER — Time-lapse + Profiling + Enrichment ================ */}
          <div className="col-span-12 xl:col-span-5 flex flex-col gap-5 min-w-0">
            <PanelCard
              title="Time-lapse Imaging"
              tooltip="0–48 h timelapse (4 h cadence)"
              status={d.status_flags.time_lapse}
              meta={d.time_lapse?.well_id ? `well ${d.time_lapse.well_id}` : undefined}
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

            <PanelCard
              title="Pathway Enrichment"
              tooltip="현재 community의 GO BP/MF/CC enrichment score 상위 항목"
            >
              <EnrichmentBar terms={d.enrichment} />
            </PanelCard>
          </div>

          {/* === RIGHT — sticky info column (mirrors design_02 panel) ======== */}
          <div className="col-span-12 xl:col-span-3 min-w-0">
            <div className="flex flex-col gap-4 xl:sticky xl:top-[200px]">
              <CompoundDetailsCard d={d} />
              <TargetProfileCard d={d} />
              <CellLineCard d={d} />
              <ReferenceDatabasesCard d={d} target={target ?? d.target_id} />
              <LocalizationCard d={d} />
              <MechanismOfActionCard d={d} />
              <InsightSidebar
                data={d.insight}
                target={target ?? d.target_id}
                communityId={activePpi?.current_community_id ?? null}
              />
            </div>
          </div>
        </div>
      </div>

      <InteractomeSlide
        plateId={plateId!}
        drugId={drugId!}
        target={target ?? d.target_id}
        nodeId={slideNodeId}
        onClose={() => setSlideNodeId(null)}
      />
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
 * Each row = annotation; `level` (0–5) drives how many cells light up at
 * brand primary; remaining cells use a muted brand-tint. Inspired by
 * design_02's `repeating-linear-gradient` band but driven by data.
 * Step 10 (2026-05-21).
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
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="block w-4 h-3.5 rounded-sm"
                    style={{
                      background:
                        i < clamped
                          ? `rgb(var(--color-brand-primary-rgb) / ${0.4 + (i / 5) * 0.55})`
                          : "rgb(var(--color-brand-primary-rgb) / 0.08)",
                    }}
                  />
                ))}
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
              "linear-gradient(90deg, rgb(var(--color-brand-primary-rgb) / 0.15), rgb(var(--color-brand-primary-rgb) / 0.95))",
          }}
        />
        <span>High</span>
      </div>
    </PanelCard>
  );
}

/**
 * "About this protein — Mechanism of Action" card.
 * Mirrors the design_02 paragraph block under the right column.
 */
function MechanismOfActionCard({ d }: { d: DashboardResponse }) {
  return (
    <PanelCard title="Mechanism of Action">
      <p className="text-body text-ink-secondary leading-relaxed whitespace-pre-line">
        {d.moa_summary}
      </p>
    </PanelCard>
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
        <dt className="text-ink-muted">HY-code</dt>
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

function CellLineCard({ d }: { d: DashboardResponse }) {
  const c = d.cell_line;
  return (
    <PanelCard title="Cell line">
      <dl className="grid grid-cols-3 gap-y-2 text-body">
        <dt className="text-ink-muted">Name</dt>
        <dd className="col-span-2 font-medium">{c.name}</dd>
        <dt className="text-ink-muted">Species</dt>
        <dd className="col-span-2">{c.species ?? "—"}</dd>
        <dt className="text-ink-muted">Tissue</dt>
        <dd className="col-span-2">{c.tissue ?? "—"}</dd>
        <dt className="text-ink-muted">Morphology</dt>
        <dd className="col-span-2">{c.morphology ?? "—"}</dd>
        <dt className="text-ink-muted">Note</dt>
        <dd className="col-span-2 text-ink-secondary">{c.description ?? "—"}</dd>
      </dl>
    </PanelCard>
  );
}

function ReferenceDatabasesCard({ d, target }: { d: DashboardResponse; target: string }) {
  const refs = d.references.by_target[target] ?? d.references.by_target[d.target_id] ?? {};
  const order = ["Ensembl", "Entrez", "UniProt", "HPA", "MedChemExpress"];
  return (
    <PanelCard title="Reference databases">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
        {order.map((k) =>
          refs[k] ? (
            <a key={k} href={refs[k]} target="_blank" rel="noreferrer" className="a-link">
              {k}
            </a>
          ) : null,
        )}
        {Object.keys(refs).length === 0 && <span className="text-ink-muted">없음</span>}
      </div>
    </PanelCard>
  );
}
