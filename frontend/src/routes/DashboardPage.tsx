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
import type { DashboardResponse, PpiPanel } from "@/types/api";

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
        `community ${cid} 선택 → PPI 재구성`,
        `selected community ${cid} → PPI rebuilt`,
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

        {/* === Row 1: Landscape 50% + PPI 50% ============================
         *  (swapped 2026-06-02 — Landscape sits left as the primary
         *  navigation surface; PPI panel updates on landscape clicks,
         *  so left→right reading order = cause→effect.) */}
        <div className="grid grid-cols-12 gap-5">
          <section
            id="landscape"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
          >
            <PanelCard
              title="Target Landscape"
              tooltip={t(
                "x=Distance, y=−log10(p), z=avg(PCC). 2D contour 기본, 3D 토글 가능. 점 클릭 → PPI 재구성. ✚ = target community. PCC 슬라이더로 임계값 이상 community만 필터.",
                "x=Distance, y=−log10(p), z=avg(PCC). 2D contour by default, 3D toggle available. Click a point → PPI rebuilt. ✚ = target community. PCC slider filters communities above the threshold.",
              )}
              status={d.status_flags.landscape}
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
                  highlightCommunity={selectedCommunity}
                  onCommunityClick={handleLandscapeClick}
                  height={554}
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
              title={`PPI Network · community ${activePpi?.current_community_id ?? "—"}`}
              tooltip={t(
                "노드=단백질(크기=연결 수). 색 = 타깃과의 상관(PCC) — 양성(파랑)=타깃과 함께 ↑(activated/상향 조절), 음성(보라)=타깃과 반대로 ↓(suppressed/하향 조절), 중립(회색)=뚜렷한 변화 없음. 엣지=STRING 상호작용(두께=신뢰도, 가까울수록 강함). 노드 클릭=단백질 정보, 엣지 클릭=관련 community 안내. community 전환은 landscape에서.",
                "Nodes = proteins (size = degree). Color = correlation (PCC) with the target — positive (blue) = moves up with the target (activated / up-regulated), negative (purple) = moves opposite (suppressed / down-regulated), neutral (grey) = no clear change. Edges = STRING interactions (thickness = confidence; closer = stronger). Node click = protein info; edge click = related community. Switch communities from the landscape.",
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
                  <div className="h-[520px] flex items-center justify-center">
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
                    height={520}
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
        </div>

        {/* === Row 2: Pathway 50% + Imaging-column 50% =================== */}
        <div className="grid grid-cols-12 gap-5">
          <section
            id="pathway"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px]"
          >
            <PanelCard
              title="Pathway Enrichment"
              tooltip={t(
                "현재 community 단백질들의 GO 기능 농축. 막대=enrichment score(길수록 강함), 색=카테고리(BP/MF/CC), p=유의확률. 이 community가 어떤 생물학적 기능에 모여 있는지 보여줌.",
                "GO functional enrichment of the current community's proteins. Bar = enrichment score (longer = stronger), color = category (BP/MF/CC), p = significance. Shows which biological functions this community is concentrated in.",
              )}
              actions={
                d.enrichment?.length ? (
                  <CsvExportButton
                    filename={`${exportBase}_enrichment.csv`}
                    build={() => buildEnrichmentCsv(d.enrichment, exportMeta)}
                  />
                ) : undefined
              }
            >
              <EnrichmentBar terms={d.enrichment} />
            </PanelCard>
          </section>

          <section
            id="imaging"
            className="col-span-12 lg:col-span-6 min-w-0 scroll-mt-[200px] flex flex-col gap-5"
          >
            <PanelCard
              title="Time-lapse Imaging"
              tooltip={t(
                "약물 처리 후 0–48시간 세포 이미지(0.5h 간격 촬영, 표시 간격 조절 가능). 시간에 따른 세포 수·형태 변화로 표현형 효과를 확인. 스케일바=실제 크기 기준.",
                "Cell images 0–48 h after treatment (captured every 0.5 h; display interval adjustable). Read cell-count/morphology change over time for the phenotypic effect. Scale bar = real size.",
              )}
              status={d.status_flags.time_lapse}
              meta={d.time_lapse?.well_id ? `well ${d.time_lapse.well_id}` : undefined}
              actions={<CellLineInline cell={d.cell_line} />}
            >
              <TimeLapseViewerPanel data={d.time_lapse} drugName={d.drug_name} />
            </PanelCard>

            <PanelCard
              title="Phenotypic Profiling"
              tooltip={t(
                "Growth Rate: GR(t)=DMSO 기준 상대 성장(1=DMSO 수준, 0=정지, <0=사멸; clip −1~1.5). 곡선은 초기·후기 구간을 제외한 약효 관찰창(실제 촬영 시각). Phenome Tracking: vehicle 궤적축에서 벗어난 정도(표현형 이탈).",
                "Growth Rate: GR(t) = growth relative to DMSO (1 = DMSO rate, 0 = stasis, <0 = death; clipped −1…1.5). The curve spans the drug-effect window (early/late frames excluded, real capture times). Phenome Tracking: deviation from the vehicle trajectory axis.",
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
  { id: "ppi", label: "PPI" },
  { id: "landscape", label: "Landscape" },
  { id: "pathway", label: "Pathway" },
  { id: "imaging", label: "Imaging" },
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
}: {
  d: DashboardResponse;
  plateId: string | undefined;
  target: string;
  activePpi: PpiPanel | null;
  onTargetChange: (t: string) => void;
}) {
  const c = d.compound;
  const activeSection = useActiveSection(SECTION_NAV.map((s) => s.id));

  const exportCtx = {
    ppi: activePpi,
    landscape: d.landscape,
    enrichment: d.enrichment,
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
    <PanelCard title="Executive Summary">
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

  return (
    <PanelCard
      title="Mechanistic Signatures"
      tooltip={t(
        "각 항목의 5칸 = 신호 강도(level/5). 이 화합물의 기전 시그니처(국소화 등) 상대 강도를 보여주며, ★는 가장 강한 항목.",
        "Each row's 5 cells = signature strength (level out of 5) — the relative intensity of this compound's mechanistic signatures (e.g. localization); ★ marks the strongest.",
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
