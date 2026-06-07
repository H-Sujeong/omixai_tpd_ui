import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useCommunityPanel, useDashboard, useSwitchCommunity } from "@/api/queries";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "@/components/LoadingBlock";
import { PanelCard } from "@/components/PanelCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PpiGraph } from "@/features/ppi-graph/PpiGraph";
import { ProteinInfoPanel } from "@/features/ppi-graph/ProteinInfoPanel";
import { NetworkExportMenu } from "@/features/ppi-graph/NetworkExportMenu";
import { findRelatedCommunityFromEdge } from "@/features/ppi-graph/relatedCommunity";
import { Landscape } from "@/features/landscape/Landscape";
import { PhenotypicProfilingPanel } from "@/features/phenotypic/PhenotypicProfilingPanel";
import { TimeLapseViewerPanel } from "@/features/time-lapse/TimeLapseViewerPanel";
import { EnrichmentBar } from "@/features/enrichment/EnrichmentBar";
import { CsvExportButton } from "@/features/export/CsvExportButton";
import { buildEnrichmentCsv, buildLandscapeCsv, buildProfilingCsv } from "@/features/export/tableExports";
import { DashboardExportMenu } from "@/features/export/DashboardExportMenu";
import { KpiStrip } from "@/features/kpi/KpiStrip";
import { useT } from "@/store/uiLang";
import type { DashboardResponse, PpiPanel, TimeLabel } from "@/types/api";

/**
 * Compound Dashboard — 2026-06-02 IA polish (P1+P2+P3 from feedback #3).
 *
 *   P1.1 — KpiStrip value-first + KeyFindings 2x2 removed.
 *   P1.2 — Mechanistic Signatures shrunk to ~140px (smaller cells, no
 *          gradient legend).
 *   P2.1 — External reference links moved from header right cluster into
 *          the left identity column (under conditions).
 *   P2.2 — Section nav gets IntersectionObserver scroll-spy with a
 *          2px brand-primary border-bottom under the active tab.
 *   P3   — New "Summary" section between header and KPI carrying
 *          d.insight.mechanism + top key_findings titles as 2-3 lines.
 */
export function DashboardPage() {
  const t = useT();
  const { plateId, drugId } = useParams<{ plateId: string; drugId: string }>();
  const [search, setSearch] = useSearchParams();

  const initialTarget = search.get("target") ?? undefined;

  const [target, setTarget] = useState<string | undefined>(initialTarget);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Panel visibility is decoupled from selectedNode: closing (✕) hides the
  // panel but keeps the node highlighted in the graph.
  const [proteinPanelOpen, setProteinPanelOpen] = useState(false);
  const [bridgeNotice, setBridgeNotice] = useState<{
    text: string;
    direction: "ppi-to-landscape" | "landscape-to-ppi" | "node-jump";
  } | null>(null);

  const dose = search.get("dose") ?? undefined;
  const time = search.get("time") ?? undefined;
  const dash = useDashboard(plateId, drugId, target, dose, time);

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

  // Initial community pick: prefer the target community (the anchor — its PPI
  // is what current_community_id already points at). When the target isn't in
  // any detected community (self-anchor: a lone peak with no scatter point
  // flagged is_target), fall back to the highest-avg-PCC community so the user
  // lands on the most strongly co-varying module instead of an empty seed.
  useEffect(() => {
    if (selectedCommunity !== null) return;
    const ppi = dash.data?.ppi;
    if (!ppi) return;
    const scatter = dash.data?.landscape?.scatter ?? [];
    const hasTarget = scatter.some((p) => p.is_target);
    if (hasTarget || scatter.length === 0) {
      setSelectedCommunity(ppi.current_community_id);
      return;
    }
    const best = scatter.reduce((a, b) => (b.z > a.z ? b : a));
    setSelectedCommunity(best.community_id);
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
    // Inspect the protein only: open its info panel + highlight the node.
    // Do NOT jump communities — that was a bug (clicking a bridging node
    // re-scoped the PPI). Community navigation is done from the landscape.
    setSelectedNode(nodeId);
    setSelectedEdgeId(null);
    setProteinPanelOpen(true);
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
        text: `Edge ${edge.source} ↔ ${edge.target} — ${t(
          "외부 community 매칭 없음 (현재 community 내부 연결)",
          "no external community match (internal connection within current community)",
        )}`,
        direction: "ppi-to-landscape",
      });
      return;
    }
    const reasonText =
      related.reason === "shared"
        ? t(
            `양쪽 노드 모두 community ${related.communityId} 에도 속함`,
            `both nodes also belong to community ${related.communityId}`,
          )
        : t(
            `landscape 거리 기준 community ${related.communityId} 가 가장 인접 (Δ=${
              related.distance?.toFixed(2) ?? "?"
            })`,
            `community ${related.communityId} is nearest by landscape distance (Δ=${
              related.distance?.toFixed(2) ?? "?"
            })`,
          );
    // Edge click is informational only — highlight the edge and report the
    // related community. It must NOT switch the PPI community (that's node /
    // landscape click). Switching here was a bug.
    setBridgeNotice({
      text: `Edge ${edge.source} ↔ ${edge.target} → ${reasonText}`,
      direction: "ppi-to-landscape",
    });
  };

  const handleLandscapeClick = (cid: number) => {
    if (!activePpi) return;
    const here = activePpi.current_community_id;
    setSelectedEdgeId(null);
    setSelectedNode(null);
    setBridgeNotice({
      text: `Landscape peak → ${t(
        `community ${cid}@${primaryTime} 선택 → PPI 재구성`,
        `selected community ${cid}@${primaryTime} → PPI rebuilt`,
      )}`,
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

  // Clear the active protein selection: close the info panel and drop the
  // node/edge highlights. Does NOT change the community — node click no longer
  // navigates, so closing the panel keeps you in the current community.
  // Full deselect: used by the "선택 해제"/reset button and graph clear.
  const clearProteinSelection = () => {
    setSelectedNode(null);
    setSelectedEdgeId(null);
    setProteinPanelOpen(false);
    setBridgeNotice(null);
  };

  if (dash.isLoading) return <LoadingBlock />;
  if (dash.error) return <ErrorBlock error={dash.error} />;
  if (!dash.data) return <EmptyBlock />;
  const d = dash.data;
  const activeTarget = target ?? d.target_id;
  const exportMeta = { plate: d.plate_id, drug: d.drug_name, drugId: d.drug_id, target: activeTarget };
  const exportBase = `${d.drug_id}_${activeTarget}`.replace(/[^A-Za-z0-9._-]+/g, "_");

  // Target-meta transition KPI helpers — see `time-comparison-4h-24h-design.md`
  // §1.3: the strongest single signal is whether the target jumps from
  // "흩어짐"(isolated) at early times to "모듈 형성"(in_community) by 24h.
  const labelKo = (l?: string) =>
    l === "in_community" ? t("모듈 형성", "in module")
    : l === "isolated_in_ppi" ? t("흩어짐", "isolated")
    : l === "absent_from_ppi" ? t("PPI 없음", "no PPI")
    : "—";
  const labelDotClass = (l?: string) =>
    l === "in_community" ? "bg-emerald-500"
    : l === "isolated_in_ppi" ? "bg-amber-500"
    : l === "absent_from_ppi" ? "bg-zinc-400"
    : "bg-zinc-300";
  // One-line verdict on the transition pattern (target_meta.label across 0h→4h→24h)
  // — design doc §1.3 says this is the strongest single signal. Plain const
  // (not a hook) so it can live after the early-returns above.
  const transitionVerdict = (() => {
    const tp_ = d.timepoints;
    if (!tp_) return null;
    const lbl = (tl: TimeLabel) => tp_.by_time[tl]?.target_meta?.label as string | undefined;
    const t24 = lbl("24h"), t4 = lbl("4h"), t0 = lbl("0h");
    if (t24 === "in_community" && (t0 === "isolated_in_ppi" || t4 === "isolated_in_ppi")) {
      return t("✓ 약물이 24h에 모듈 형성", "✓ drug formed module by 24h");
    }
    if (t24 === "in_community") {
      return t("→ 24h까지 모듈 유지", "→ module sustained through 24h");
    }
    if (t24 === "isolated_in_ppi") {
      return t("✕ 24h에도 모듈 미형성 (효과 약함)", "✕ no module by 24h (weak effect)");
    }
    if (t24 === "absent_from_ppi") {
      return t("PPI 데이터 한계", "PPI data limit");
    }
    return null;
  })();

  // Active timepoint comes from ?time= now (or the payload's primary frame
  // when the URL omits it). The 2026-06-07 spec moved per-timepoint rendering
  // to the server: changing time refetches and the new payload's ppi /
  // landscape are the raw data for that timepoint — no client-side projection.
  const tp = d.timepoints;
  const primaryTime: TimeLabel = tp?.primary ?? "24h";
  const activeTime: TimeLabel =
    (time as TimeLabel | undefined) && tp?.available.includes(time as TimeLabel)
      ? (time as TimeLabel)
      : primaryTime;

  // Enrichment follows the active community. Navigating to another community in
  // the landscape swaps activePpi to that community's panel, whose go_terms is
  // its own GO set; mirror that here so the Pathway Enrichment panel re-renders
  // with it. Fall back to d.enrichment if ppi is null.
  //
  // Ranked by significance (smallest adjusted p first), NOT by the Enrichr
  // Combined Score (`score`): that field goes ∞ for ~1 term/CSV when the API
  // omits the Z-score (artifact) and is unbounded — see EnrichmentBar.
  const enrichmentTerms = [...(activePpi?.go_terms ?? d.enrichment)]
    .sort((a, b) => a.pvalue - b.pvalue)
    .slice(0, 12);

  return (
    <div className="flex-1 flex flex-col">
      <DashboardHeader
        d={d}
        plateId={plateId}
        target={activeTarget}
        activePpi={activePpi}
        onTargetChange={(t) => {
          setTarget(t);
          setSelectedCommunity(null);
          setSelectedNode(null);
          setSelectedEdgeId(null);
          setBridgeNotice(null);
        }}
        onDoseChange={(doseLabel) => {
          // Same-page dose swap — only the ?dose= search param changes; the
          // multi-dose plate route stays put and react-query refetches.
          const sp = new URLSearchParams(search);
          sp.set("dose", doseLabel);
          setSearch(sp);
          // Reset community/selection so the new dose's payload paints fresh.
          setSelectedCommunity(null);
          setSelectedNode(null);
          setSelectedEdgeId(null);
          setBridgeNotice(null);
        }}
      />

      <div className="px-4 lg:px-8 py-6 mx-auto w-full max-w-[1920px] flex-1 flex flex-col gap-6">
        {/* === #overview — Summary · KPI · Mechanistic Signatures ========= */}
        <section
          id="overview"
          className="scroll-mt-[200px] flex flex-col gap-4"
        >
          <ExecutiveSummary d={d} />
          <KpiStrip kpis={d.kpis} />
          <MechanisticSignatures d={d} />
        </section>

        {bridgeNotice && (
          <BridgeNotice
            notice={bridgeNotice}
            onReset={clearProteinSelection}
            onDismiss={() => setBridgeNotice(null)}
          />
        )}

        {/* === Target Module Dynamics — Landscape + PPI as one unit ====
         *  Two subplots share one container with a top time toggle
         *  (0h / 4h / 24h, missing times disabled). Per design
         *  `time-comparison-4h-24h-design.md` §3 (B안): the 24h map (point
         *  positions, layout) stays fixed; toggling time only swaps
         *  height (Landscape z) and node color (PPI corr). Dose toggle
         *  appears only when the active plate is multi_dose. */}
        <section id="dynamics" className="panel-card scroll-mt-[200px]">
        {tp && tp.available.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div className="text-body-strong text-ink-secondary">
              {t("Target Module Dynamics", "Target Module Dynamics")}
            </div>
            {/* Dose is selected in the main header (DashboardHeader): a dose
                change re-fetches everything (KPIs, GR, MoA, this container),
                so it belongs to the page scope, not this container's. Only the
                time toggle stays here — it's the within-frame swap. */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5" role="tablist" aria-label="time">
                <span className="text-meta text-ink-muted font-mono">
                  {t("시점", "time")}
                </span>
                {(["0h", "4h", "24h"] as TimeLabel[]).map((tl) => {
                  const isAvail = tp.available.includes(tl);
                  const isActive = activeTime === tl;
                  return (
                    <button
                      key={tl}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      disabled={!isAvail}
                      onClick={() => {
                        if (!isAvail) return;
                        const sp = new URLSearchParams(search);
                        if (tl === primaryTime) sp.delete("time");
                        else sp.set("time", tl);
                        setSearch(sp);
                        // Selection resets so the new time's PPI paints fresh.
                        setSelectedCommunity(null);
                        setSelectedNode(null);
                        setSelectedEdgeId(null);
                      }}
                      title={isAvail ? `${tl}` : t("데이터 미수신", "data not received")}
                      className={
                        "rounded-md border px-2.5 py-1 text-body font-mono tabular transition-colors duration-fast " +
                        (isActive
                          ? "border-brand-primary bg-brand-primary text-white"
                          : isAvail
                          ? "border-line bg-surface-soft hover:bg-surface-elevated text-ink-secondary"
                          : "border-line bg-surface-soft text-ink-muted opacity-50 cursor-not-allowed")
                      }
                    >
                      {tl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {tp && tp.available.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface-soft px-4 py-2 text-meta border-b border-line">
            <span className="font-mono text-ink-muted shrink-0">
              {t("타깃 모듈 형성", "target module formation")}
            </span>
            {(["0h", "4h", "24h"] as TimeLabel[]).map((tl, i) => {
              const snap = tp.by_time[tl];
              const isAvail = tp.available.includes(tl);
              const label = snap?.target_meta?.label as string | undefined;
              return (
                <span key={tl} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-ink-muted">→</span>}
                  <span
                    className={
                      "inline-block w-2 h-2 rounded-full " +
                      (isAvail ? labelDotClass(label) : "bg-zinc-300")
                    }
                  />
                  <span className="font-mono text-ink-muted">{tl}</span>
                  <span className="text-ink-secondary">
                    {isAvail ? labelKo(label) : t("미수신", "—")}
                  </span>
                </span>
              );
            })}
            {transitionVerdict && (
              <span className="ml-auto text-body-strong text-ink-primary">{transitionVerdict}</span>
            )}
          </div>
        )}
        <div className={
          "grid grid-cols-12 gap-5 " +
          (tp && tp.available.length > 0 ? "p-4" : "")
        }>
          <section
            id="landscape"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
          >
            <PanelCard
              flat
              title="Target Landscape"
              tooltip={t(
                "단백질 community 지형도 — 타깃과의 연관 구조:\n• x = 타깃 community로부터 거리 (가까울수록 직접 연관)\n• y = −log10(p) (높을수록 연관이 유의)\n• z/색 = 모듈 평균 상관(PCC)\n→ 좌측 하단·고지대 = 타깃과 강하게 직접 연결\n• 점 = community, ✚ = 타깃 community\n• 점 클릭 → 해당 PPI 재구성\n• 2D contour 기본 · 3D 토글 · PCC 슬라이더로 임계값 필터",
                "Protein-community landscape — structure of association with the target:\n• x = distance from the target community (closer = more direct)\n• y = −log10(p) (higher = more significant)\n• z/color = module-average correlation (PCC)\n→ lower-left & high ground = strongly, directly linked to the target\n• Dots = communities, ✚ = target community\n• Click a dot → rebuild its PPI\n• 2D contour by default · 3D toggle · PCC slider to filter by threshold",
              )}
              status={d.status_flags.landscape}
              meta={t(
                "높이·색(PCC) = 타깃 community와의 발현 연관성 — 높을수록 타깃과 함께 변동",
                "Height · color (PCC) = expression association with the target community — higher = co-varies with the target",
              )}
              actions={
                d.landscape ? (
                  <CsvExportButton
                    filename={`${exportBase}_landscape.csv`}
                    build={() => buildLandscapeCsv(d.landscape!, exportMeta)}
                  />
                ) : undefined
              }
            >
              {d.landscape ? (
                <Landscape
                  landscape={d.landscape}
                  targetName={d.target_id}
                  highlightCommunity={selectedCommunity}
                  onCommunityClick={handleLandscapeClick}
                  height={554}
                  frameTime={tp ? activeTime : null}
                />
              ) : (
                <div className="h-[554px] flex items-center justify-center">
                  <EmptyBlock />
                </div>
              )}
            </PanelCard>
          </section>

          <section
            id="ppi"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
          >
            <PanelCard
              flat
              title={`PPI Network · community ${activePpi?.current_community_id ?? "—"}${
                tp ? `@${activeTime}` : ""
              }`}
              tooltip={t(
                "• 노드 = 단백질 (크기 = 연결 수)\n• 색 = 타깃과의 발현 상관(corr) — 부호로 방향, 진하기로 크기:\n   · 빨강 = 상향(corr>0, 강할수록 진함)\n   · 파랑 = 하향(corr<0, 강할수록 진함)\n   · 흰색에 가까움 = 상관 약함 (임의 임계값 없음)\n   · 보라 = 타깃 유전자(is_target)\n• |corr| 슬라이더로 약한 상관 숨김\n• 엣지 = STRING 상호작용 (두께 = 신뢰도)\n• 노드 클릭 = 단백질 정보 · 엣지 클릭 = 관련 community\n• community 전환은 landscape에서",
                "• Nodes = proteins (size = degree)\n• Color = correlation (corr) with target — hue = sign, depth = magnitude:\n   · Red = up (corr>0, deeper = stronger)\n   · Blue = down (corr<0, deeper = stronger)\n   · Near-white = weak correlation (no arbitrary cutoff)\n   · Purple = target gene (is_target)\n• |corr| slider hides weak correlations\n• Edges = STRING interactions (width = confidence)\n• Node click = protein info · Edge click = related community\n• Switch communities from the landscape",
              )}
              accent
              status={d.status_flags.ppi}
              meta={`target community = ${activePpi?.target_community_id ?? "—"} · nodes=${
                activePpi?.nodes.length ?? 0
              } · edges=${activePpi?.edges.length ?? 0}`}
              actions={
                <div className="flex items-center gap-1.5">
                  <span className="chip">{activePpi?.target}</span>
                  {activePpi && (
                    <NetworkExportMenu
                      panel={activePpi}
                      baseName={`${d.drug_id}_${activePpi.target}_c${activePpi.current_community_id}`}
                    />
                  )}
                </div>
              }
            >
              <div className="relative overflow-hidden">
                {!activePpi ? (
                  <div className="h-[554px] flex items-center justify-center">
                    <EmptyBlock label={t("PPI 데이터 없음", "No PPI data")} />
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
                    onClearSelection={clearProteinSelection}
                    height={554}
                  />
                )}
                {/* Protein info slides in from the right when a node is selected.
                    ✕ only hides the panel; the node stays highlighted. */}
                <ProteinInfoPanel
                  gene={selectedNode}
                  open={proteinPanelOpen}
                  onClose={() => setProteinPanelOpen(false)}
                />
              </div>
            </PanelCard>
          </section>

          {/* Pathway Enrichment — inside the Target Module Dynamics container as
              the 2nd row (개정안 mockup). Capped height with internal scroll so
              long enrichment lists don't stretch the whole container. */}
          <section
            id="pathway"
            className="col-span-12 min-w-0 scroll-mt-[200px]"
          >
            <PanelCard
              flat
              title="Pathway Enrichment"
              tooltip={t(
                "• 현재 community 단백질의 GO 기능 농축\n• 막대 길이 = −log10(보정 p) (길수록 유의)\n• 색 = 카테고리 (BP/MF/CC)\n• p_adj = Benjamini–Hochberg(FDR) 보정 — gene-set 라이브러리별 다중검정 보정\n• 배경 universe = 측정된 단백질 전체(~9천), Fisher exact 검정\n→ 이 community가 어떤 기능에 모여 있는지",
                "• GO functional enrichment of this community\n• Bar length = −log10(adjusted p) (longer = more significant)\n• Color = category (BP/MF/CC)\n• p_adj = Benjamini–Hochberg (FDR) — corrected per gene-set library\n• Background universe = all measured proteins (~9k), Fisher exact test\n→ which functions this community is concentrated in",
              )}
              actions={
                enrichmentTerms.length ? (
                  <CsvExportButton
                    filename={`${exportBase}_enrichment.csv`}
                    build={() => buildEnrichmentCsv(enrichmentTerms, exportMeta)}
                  />
                ) : undefined
              }
            >
              <div className="max-h-72 overflow-y-auto pr-1">
                <EnrichmentBar terms={enrichmentTerms} />
              </div>
            </PanelCard>
          </section>
        </div>
        </section>

        {/* === Phenome container — Time-lapse + Phenotypic Profiling
             grouped under one card, matching Dynamics' visual weight. The
             section nav points at this id for the top-level "Phenome" tab. */}
        <section id="phenome" className="panel-card scroll-mt-[200px]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line">
            <div className="text-body-strong text-ink-secondary">
              {t("Phenome", "Phenome")}
            </div>
          </div>
          <div className="grid grid-cols-12 gap-5 p-4">
            <section
              id="imaging"
              className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
            >
              <PanelCard
                flat
                title="Time-lapse Imaging"
                tooltip={t(
                  "• 약물 처리 후 0–48h 세포 이미지\n• 0.5h 간격 촬영 (표시 간격 조절 가능)\n• 시간에 따른 세포 수·형태 변화 = 표현형 효과\n• 스케일바 = 실제 크기\n• GIF로 내보내기 가능",
                  "• Cell images 0–48 h after treatment\n• Captured every 0.5 h (display interval adjustable)\n• Cell-count / morphology change over time = effect\n• Scale bar = real size\n• Exportable as GIF",
                )}
                status={d.status_flags.time_lapse}
                meta={d.time_lapse?.well_id ? `well ${d.time_lapse.well_id}` : undefined}
                actions={<CellLineInline cell={d.cell_line} />}
              >
                <TimeLapseViewerPanel data={d.time_lapse} drugName={d.drug_name} />
              </PanelCard>
            </section>

            <section
              id="profiling"
              className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
            >
              <PanelCard
                flat
                title="Phenotypic Profiling"
                tooltip={t(
                  "Growth Rate — GR(t) = DMSO 대비 성장:\n   · 1 = DMSO 수준 · 0 = 정지 · <0 = 사멸\n   · clip −1~1.5\n   · 곡선 = 약효 관찰창(실제 촬영 시각)\nPhenome Tracking:\n   · vehicle 궤적축에서 벗어난 정도(표현형 이탈)",
                  "Growth Rate — GR(t) = growth vs DMSO:\n   · 1 = DMSO rate · 0 = stasis · <0 = death\n   · clipped −1…1.5\n   · curve = drug-effect window (real capture times)\nPhenome Tracking:\n   · deviation from the vehicle trajectory axis",
                )}
                status={d.status_flags.phenotypic}
                meta={
                  d.phenotypic?.gr_score !== null && d.phenotypic?.gr_score !== undefined
                    ? `GR score ${d.phenotypic.gr_score.toFixed(4)}`
                    : undefined
                }
                actions={
                  d.phenotypic ? (
                    <CsvExportButton
                      filename={`${exportBase}_profiling.csv`}
                      build={() => buildProfilingCsv(d.phenotypic!, exportMeta)}
                    />
                  ) : undefined
                }
              >
                <PhenotypicProfilingPanel data={d.phenotypic} />
              </PanelCard>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

// ===========================================================================
// Header (sticky) — identity + target switcher + section tabs (scroll-spy)
// ===========================================================================

/**
 * Backend drug_group values are internal slugs (e.g. "Epigenetic_chromatin",
 * "CDK_cell_cycle"). For human-facing header rendering we replace underscores
 * with " / " and capitalize each segment so the class line reads as natural
 * text — no chip styling needed.
 */
function formatDrugGroup(raw: string): string {
  return raw
    .split("_")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" / ");
}

const SECTION_NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "dynamics", label: "Target Module Dynamics" },
  { id: "phenome", label: "Phenome" },
];

/**
 * Scroll-spy hook — observes the listed section elements and returns the
 * id of the topmost visible one. Tuned via `rootMargin` so the active
 * change fires once a section's heading crosses just below the sticky
 * header (not when it merely peeks at the very bottom of the viewport).
 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActive(top.target.id);
      },
      { rootMargin: "-200px 0px -55% 0px", threshold: 0 },
    );
    const els: Element[] = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        els.push(el);
      }
    }
    return () => observer.disconnect();
  }, [ids.join("|")]);
  return active;
}

function DashboardHeader({
  d,
  plateId,
  target,
  activePpi,
  onTargetChange,
  onDoseChange,
}: {
  d: DashboardResponse;
  plateId: string | undefined;
  target: string;
  activePpi: PpiPanel | null;
  onTargetChange: (t: string) => void;
  /** Dose chip click — passes the folder-form label ("10uM"/"3uM") for the URL. */
  onDoseChange: (doseLabel: string) => void;
}) {
  const c = d.compound;
  const activeSection = useActiveSection(SECTION_NAV.map((s) => s.id));

  // Keep enrichment in lock-step with the active community (same as the
  // Pathway Enrichment panel) so the bulk export matches what's on screen.
  // Ranked by significance (adjusted p), not the artifact-prone Combined Score.
  const enrichmentTerms = [...(activePpi?.go_terms ?? d.enrichment)]
    .sort((a, b) => a.pvalue - b.pvalue)
    .slice(0, 12);

  const exportCtx = {
    ppi: activePpi,
    landscape: d.landscape,
    enrichment: enrichmentTerms,
    phenotypic: d.phenotypic,
    timeLapse: d.time_lapse,
    drugName: d.drug_name,
    meta: { plate: d.plate_id, drug: d.drug_name, drugId: d.drug_id, target },
    base: `${d.drug_id}_${target}`.replace(/[^A-Za-z0-9._-]+/g, "_"),
  };
  const zipBase = `${d.plate_id}_${d.drug_name}_${target}`;

  const conditions = [
    c.dose_um != null ? `${c.dose_um} µM` : null,
    d.cell_line.name,
    c.treatment_hours != null ? `${c.treatment_hours} h` : null,
  ].filter(Boolean) as string[];

  return (
    <header className="sticky top-0 z-30 bg-surface-elevated border-b border-line">
      {/* Top utility row — back link (left) · version (right).
       *  Replaced the 3-level breadcrumb (Workspace › Plate › Compound)
       *  with an explicit back affordance: the dominant navigation
       *  pattern is Compound → Plate (returning to the drug list),
       *  and "← Back to Plate {id}" reads as a clickable action where
       *  the breadcrumb read as decoration. */}
      <div className="pl-16 pr-4 lg:px-8 pt-3 flex items-center justify-between gap-3">
        <Link
          to={`/plates/${plateId}`}
          className="inline-flex items-center gap-1.5 text-body font-medium text-ink-secondary hover:text-ink-primary transition-colors duration-fast"
        >
          <span aria-hidden>←</span>
          <span>Back to Plate {plateId}</span>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          <DashboardExportMenu ctx={exportCtx} zipBase={zipBase} />
        </div>
      </div>

      {/* Identity body — single column (no right cluster). Each role
       *  carries an explicit relationship label so the user can read
       *  "what is what" at a glance, and Target switching happens
       *  inline as a chip row rather than off in the corner. */}
      <div className="pl-16 pr-4 lg:px-8 pt-2 pb-3">
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

        {d.available_targets.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-ink-muted text-body">
              {d.available_targets.length === 1 ? "Target" : "Targets"}
            </span>
            {d.available_targets.length === 1 ? (
              <span className="text-body text-ink-primary font-semibold">
                {d.available_targets[0]}
              </span>
            ) : (
              <div
                role="group"
                aria-label="Switch active target"
                className="flex flex-wrap items-center gap-1.5"
              >
                {d.available_targets.map((t) => (
                  <button
                    key={t}
                    className={t === target ? "chip chip--active" : "chip"}
                    onClick={() => onTargetChange(t)}
                    aria-pressed={t === target}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dose selector — only shown for multi-dose plates. Same chip pattern
            as Target so the two scopes read symmetrically. KPIs, GR, MoA and
            everything else downstream re-fetch with the new ?dose= param. */}
        {d.doses && d.doses.available.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-ink-muted text-body">Dose</span>
            <div
              role="group"
              aria-label="Switch dose"
              className="flex flex-wrap items-center gap-1.5"
            >
              {d.doses.available.map((opt) => {
                const isActive = d.doses?.current_dose === opt.dose_um;
                const doseLabel = `${opt.dose_um}uM`;
                return (
                  <button
                    key={opt.plate_id}
                    className={isActive ? "chip chip--active" : "chip"}
                    onClick={() => !isActive && onDoseChange(doseLabel)}
                    aria-pressed={isActive}
                  >
                    {opt.dose_um}μM
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {d.target_profile.drug_group && (
          <p className="mt-1 text-body text-ink-secondary">
            {formatDrugGroup(d.target_profile.drug_group)}
          </p>
        )}

        <div className="mt-2">
          <StatusBadge growth_class={d.phenotypic?.growth_class} />
        </div>

        {conditions.length > 0 && (
          <p className="mt-2 text-body text-ink-muted tabular">
            {conditions.join(" · ")}
          </p>
        )}

        <ExternalRefChips d={d} target={target} />
      </div>

      {/* Sticky horizontal section tab nav — with scroll-spy active state.
       * Active tab gets a 2px brand border-bottom + primary text; the
       * whole nav band itself sits between the identity row and the
       * page body so it reads as a tab strip rather than free links. */}
      <nav
        className="pl-16 pr-4 lg:px-8 border-t border-line"
        aria-label="Dashboard sections"
      >
        <ul className="flex items-center gap-1 -mb-px overflow-x-auto">
          {SECTION_NAV.map((it) => {
            const isActive = activeSection === it.id;
            return (
              <li key={it.id}>
                <a
                  href={`#${it.id}`}
                  onClick={(e) => {
                    // Bypass the browser's default hash jump (which ignored
                    // the sticky header height — landed past Dynamics into
                    // Phenome). Smooth-scroll the target via element ref so
                    // scroll-mt-[…] is honored consistently.
                    e.preventDefault();
                    const el = document.getElementById(it.id);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                      window.history.replaceState(null, "", `#${it.id}`);
                    }
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={`
                    inline-flex items-center px-3.5 py-2.5
                    text-body
                    border-b-2 transition-colors duration-fast
                    ${
                      isActive
                        ? "text-brand-primary border-brand-primary font-semibold"
                        : "text-ink-secondary border-transparent font-medium hover:text-ink-primary hover:border-brand-primary/40"
                    }
                  `}
                  style={
                    isActive
                      ? { background: "rgb(var(--color-brand-primary-rgb) / 0.10)" }
                      : undefined
                  }
                >
                  {it.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

/**
 * ExternalRefChips — flattened reference list rendered as chip-style
 * links inside the header identity block. Replaces the dedicated
 * Reference Databases card. Order: target-gene refs first (UniProt /
 * Ensembl / Entrez / HPA), then compound refs (MedChemExpress), then
 * derived MoA / literature search links (PubChem / ChEMBL / DrugBank).
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
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          target="_blank"
          rel="noreferrer"
          className="chip hover:chip--active"
        >
          {it.label}
        </a>
      ))}
    </div>
  );
}

// ===========================================================================
// Executive Summary — short narrative under the header
// ===========================================================================

/**
 * Executive Summary — one-liner identity + up to 3 finding bullets.
 *
 * Earlier version rendered `insight.mechanism` verbatim (often a 2-3
 * sentence paragraph), which buried the scan-target. Now we synthesize a
 * single-line identity from `target_class || drug_group` + the joined
 * target list, e.g. "PROTAC Degrader targeting SMARCA2 / SMARCA4". The
 * full mechanism paragraph stays in the API payload for downstream
 * consumers but is no longer rendered here.
 */
function ExecutiveSummary({ d }: { d: DashboardResponse }) {
  const t = useT();
  const insight = d.insight;
  const tp = d.target_profile;
  const identityKind = tp.target_class ?? tp.drug_group ?? null;
  const targetList = tp.targets.length > 0 ? tp.targets.join(" / ") : null;

  let identity: string | null = null;
  if (identityKind && targetList) identity = `${identityKind} targeting ${targetList}`;
  else if (identityKind) identity = identityKind;
  else if (targetList) identity = `Targeting ${targetList}`;

  const lines = insight?.key_findings.slice(0, 3).map((f) => f.title) ?? [];
  if (!identity && lines.length === 0) return null;

  return (
    <PanelCard
      title="Executive Summary"
      tooltip={t(
        "• 첫 줄 = 화합물 정체성 (타깃 클래스/약물군 + 타깃)\n• 아래 = 핵심 발견 상위 3개 (전체 패널 종합)\n• 대시보드를 한눈에 요약한 결론 층",
        "• First line = compound identity (target class / drug group + targets)\n• Below = top 3 key findings (synthesized across all panels)\n• The bottom-line summary of the whole dashboard",
      )}
    >
      {identity && (
        <p className="text-body-strong text-ink-primary">{identity}</p>
      )}
      {lines.length > 0 && (
        <ul className={`${identity ? "mt-2.5" : ""} flex flex-col gap-1.5`}>
          {lines.map((line, i) => (
            <li
              key={i}
              className="flex gap-2 text-body text-ink-secondary leading-relaxed"
            >
              <span
                className="text-brand-primary shrink-0 mt-0.5"
                aria-hidden
              >
                ›
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

// ===========================================================================
// Mechanistic Signatures (formerly Localization Annotations) — compact heatmap
// ===========================================================================

/**
 * Compact 4-row heatmap. Earlier version was ~230px tall with a gradient
 * legend below; user noted that read as more dominant than PPI/Landscape
 * even though it's an "interpretation layer", not the primary evidence.
 * Halved by:
 *   - smaller cells (12×8 vs 16×14)
 *   - tighter row gap
 *   - dropping the bottom Low→High gradient legend (was redundant —
 *     the per-cell intensity ramp already communicates the same scale)
 */
function MechanisticSignatures({ d }: { d: DashboardResponse }) {
  const t = useT();
  if (d.localization_annotations.length === 0) return null;
  // Top signature = the entry with the highest level. Marked with a ★
  // so the dominant interpretive layer is immediately scannable
  // (ties — first-encountered wins, since `reduce` keeps the first max).
  const topLevel = d.localization_annotations.reduce(
    (max, l) => (l.level > max ? l.level : max),
    -Infinity,
  );
  const topIndex = d.localization_annotations.findIndex(
    (l) => l.level === topLevel,
  );
  const isPlaceholder = d.localization_annotations.some((l) => l.placeholder);

  return (
    <PanelCard
      title="Mechanistic Signatures"
      meta={
        isPlaceholder
          ? t(
              "⚠ 예시(placeholder) 값 — 실제 moa_bars 데이터 연동 대기",
              "⚠ Placeholder values — awaiting real moa_bars data",
            )
          : undefined
      }
      tooltip={t(
        "화합물의 작용기전(MoA)을 4개 축으로 점수화 — 5칸 = 강도(0~5):\n• PAC (단백질 존재량 제어): 타깃 단백질 분해·감소 정도\n• Cytostatic: 세포분열·증식 정지 효과\n• Transcriptional Stress: 전사 스트레스 반응\n• DNA Damage Response: DNA 손상 반응\n• ★ = 가장 강한 축",
        "Mechanism of action (MoA) scored on 4 axes — 5 cells = strength (0–5):\n• PAC (Protein Abundance Control): degradation / loss of the target protein\n• Cytostatic: arrest of cell division / proliferation\n• Transcriptional Stress: transcriptional stress response\n• DNA Damage Response: DNA damage response\n• ★ = strongest axis",
      )}
    >
      <ul className="flex flex-col gap-2">
        {d.localization_annotations.map((l, idx) => {
          const clamped = Math.max(0, Math.min(5, l.level));
          const isTop = idx === topIndex && topLevel > 0;
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
                        className="block w-6 h-3.5 rounded-sm"
                        style={{ background: "rgb(var(--color-loc-low-rgb) / 0.08)" }}
                      />
                    );
                  }
                  const ratio = i / 4;
                  return (
                    <span
                      key={i}
                      className="block w-6 h-3.5 rounded-sm"
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
              <span
                className={
                  isTop
                    ? "text-body text-ink-primary font-semibold inline-flex items-center gap-1.5"
                    : "text-body text-ink-secondary"
                }
              >
                {l.label}
                {isTop && (
                  <span
                    aria-label="top signature"
                    title="Top signature for this compound"
                    className="text-status-warning"
                  >
                    ★
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </PanelCard>
  );
}

// ===========================================================================
// Bridge notice + cell-line popover
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
  const t = useT();
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
        {t("단백질 선택 해제", "Clear protein selection")}
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
