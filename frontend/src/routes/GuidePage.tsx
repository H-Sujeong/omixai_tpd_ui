import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useT, useUiLang } from "@/store/uiLang";

/**
 * User guide. Three sections (Plate / Drug / Dashboard) each pairing an
 * annotated mockup of the page (public/guide/*.svg, numbered callouts) with a
 * matching numbered explanation list. Walks the user from plate composition →
 * navigating back → exporting data. Bilingual via useT.
 */

type Section =
  | "sidebar"
  | "plate"
  | "drug"
  | "dashboard"
  | "dashboard-dynamics"
  | "dashboard-timecourse"
  | "dashboard-phenome";

// Hash slug ↔ Section. Sidebar flyout uses these slugs (Sidebar.tsx::GUIDE_SECTIONS).
const HASH_TO_SECTION: Record<string, Section> = {
  "sidebar":              "sidebar",
  "plate":                "plate",
  "drug":                 "drug",
  "dashboard":            "dashboard",
  "dashboard-dynamics":   "dashboard-dynamics",
  "dashboard-timecourse": "dashboard-timecourse",
  "dashboard-phenome":    "dashboard-phenome",
};

interface Note {
  n: number;
  ko: string;
  en: string;
}

const SIDEBAR: Note[] = [
  { n: 1, ko: "TPD 로고 — 워크스페이스(플레이트 목록) 홈으로 이동.", en: "TPD logo — go to the workspace home (plate list)." },
  { n: 2, ko: "플레이트 아이콘 — 플레이트 목록 페이지.", en: "Plate icon — the plate list page." },
  { n: 3, ko: "(i) 아이콘 — 지금 보고 있는 이 사용 설명서.", en: "(i) icon — this user guide you're reading now." },
  { n: 4, ko: "언어 토글(한/EN) — 전체 UI를 한국어/영어로 전환.", en: "Language toggle (한/EN) — switch the whole UI between Korean and English." },
  { n: 5, ko: "테마 토글 — 다크/라이트 모드 전환.", en: "Theme toggle — switch dark / light mode." },
];

const PLATE: Note[] = [
  { n: 1, ko: "워크스페이스 요약 — 전체 plate · 화합물 · well 수.", en: "Workspace summary — total plates · compounds · wells." },
  { n: 2, ko: "정렬 — 제목 / 생성일 / 업데이트 / 약물수, ↑↓로 방향 전환.", en: "Sort — Title / Created / Updated / Compounds, ↑↓ toggles direction." },
  { n: 3, ko: "뷰 전환 — 카드형 ↔ 테이블형 (설정은 저장됨).", en: "View toggle — Card ↔ Table (preference persists)." },
  { n: 4, ko: "플레이트 카드 — 클릭하면 그 plate의 약물 목록으로 들어감.", en: "Plate card — click to open that plate's drug list." },
  { n: 5, ko: "메타 — Set · Cell line · Dose · 관찰시간 · 생성/업데이트일.", en: "Metadata — Set · cell line · dose · observation time · created/updated dates." },
  { n: 6, ko: "Outcome 구성 막대 — 화합물 결과 비율(Asset Only/Cytotoxic/Static/No Asset).", en: "Outcome bar — compound result mix (Asset Only / Cytotoxic / Static / No Asset)." },
  { n: 7, ko: "Asset Coverage — 분석 자산(json)을 가진 화합물 수 / 전체.", en: "Asset coverage — compounds with analysis assets (json) / total." },
  { n: 8, ko: "View Plate → — 플레이트 상세(약물 목록)로 진입.", en: "View Plate → — enter the plate's drug list." },
];

const DRUG: Note[] = [
  { n: 1, ko: "← Plates — 워크스페이스(플레이트 목록)로 돌아가기.", en: "← Plates — back to the workspace (plate list)." },
  { n: 2, ko: "검색/필터 — 약물명·코드·타깃 검색, 그룹·효과 필터.", en: "Search / filters — by drug name·code·target, plus group & effect filters." },
  { n: 3, ko: "Assets only — 분석 자산이 있는 약물만 표시.", en: "Assets only — show only drugs that have analysis assets." },
  { n: 4, ko: "Composition 바 — 이 플레이트 화합물의 결과 구성(Asset Only/Cytotoxic/Static/No Asset)을 한눈에.", en: "Composition bar — the plate's compound result mix (Asset Only / Cytotoxic / Static / No Asset) at a glance." },
  { n: 5, ko: "약물 행 — 약물명 클릭 = 기본 타깃 대시보드로 진입.", en: "Drug row — click the name = open the default-target dashboard." },
  { n: 6, ko: "Target chip — 클릭하면 해당 타깃의 대시보드로 진입(멀티타깃).", en: "Target chip — click to open that specific target's dashboard (multi-target)." },
  { n: 7, ko: "GR score / Class — 성장률 점수와 효과 분류(세포독성 등).", en: "GR score / Class — growth-rate score and effect classification (e.g. cytotoxic)." },
  { n: 8, ko: "Asset ✓/○ — 분석 자산 유무(○ = 자산 없음).", en: "Asset ✓/○ — whether analysis assets exist (○ = none)." },
  { n: 9, ko: "Export plate ⬇ — 플레이트 단위 일괄 ZIP(약물/타깃/포맷 체크박스 선택).", en: "Export plate ⬇ — plate-level bulk ZIP (pick drugs / targets / formats)." },
];

const DASHBOARD: Note[] = [
  { n: 1, ko: "← Back to Plate — 이 plate의 약물 목록으로 돌아가기(헤더 좌상단).", en: "← Back to Plate — return to this plate's drug list (top-left of the header)." },
  { n: 2, ko: "헤더 — 화합물명(dBET6) + Target 전환 chip(멀티타깃 시 클릭하면 PPI·Landscape 재구성) + 약물군.", en: "Header — compound name (dBET6) + Target switcher chips (click to rebuild PPI & landscape for that target) + drug group." },
  { n: 3, ko: "Export ⬇ — 현재 타깃의 선택 항목을 일괄 ZIP으로(체크박스).", en: "Export ⬇ — bundle the current target's selected items into one ZIP (checkboxes)." },
  { n: 4, ko: "Executive Summary — 화합물 기전 한 줄 요약(모든 박스가 공유하는 컨텍스트).", en: "Executive Summary — one-line mechanism summary (shared context for every box)." },
  { n: 5, ko: "KPI strip — Phenotype Shift · Cell Viability · Target Confidence · Toxicity (색 점 = 상태).", en: "KPI strip — Phenotype Shift · Cell Viability · Target Confidence · Toxicity (colored dot = sentiment)." },
  { n: 6, ko: "Mechanistic Signatures — 기전 시그니처 강도(각 행 5칸 = level/5).", en: "Mechanistic Signatures — signature strength (each row's 5 cells = level/5)." },
  { n: 7, ko: "Target Landscape — community 분포(x=거리, y=−log10p, z=avg(PCC)). ✚=타깃, 점 클릭→PPI 재구성.", en: "Target Landscape — community map (x = distance, y = −log10p, z = avg(PCC)). ✚ = target; click a point → rebuild PPI." },
  { n: 8, ko: "PPI Network — 단백질 상호작용(엣지 두께=STRING 신뢰도, 가까울수록 강함). 노드 클릭=단백질 정보.", en: "PPI Network — protein interactions (edge thickness = STRING confidence, closer = stronger). Node click = protein info." },
  { n: 9, ko: "Pathway Enrichment — 현재 community의 GO 기능 농축(막대=score, 색=BP/MF/CC).", en: "Pathway Enrichment — GO functional enrichment of the current community (bar = score, color = BP/MF/CC)." },
  { n: 10, ko: "Time-lapse Imaging — 0–48h 세포 이미지(0.5h 촬영), 간격 조절 + GIF export, 스케일바.", en: "Time-lapse Imaging — cell images 0–48 h (0.5 h capture), interval selector + GIF export, scale bar." },
  { n: 11, ko: "Phenotypic Profiling — GR(t) 곡선(DMSO 대비, 1=DMSO수준·0=정지·<0=사멸) + Phenome 이탈.", en: "Phenotypic Profiling — GR(t) curve vs DMSO (1 = DMSO rate, 0 = stasis, <0 = death) + Phenome deviation." },
  { n: 12, ko: "패널별 CSV ⬇ / ⓘ — 각 박스 데이터를 CSV·전용 포맷으로 export, ⓘ 위에 마우스를 올리면 해석 도움말.", en: "Per-panel CSV ⬇ / ⓘ — export each box's data (CSV / dedicated formats); hover ⓘ for how-to-read help." },
];

const SECTIONS: Record<Section, { img: string; notes: Note[]; titleKo: string; titleEn: string; descKo: string; descEn: string }> = {
  sidebar: {
    img: "/guide/sidebar.svg",
    notes: SIDEBAR,
    titleKo: "0. 사이드바 (전역 내비게이션)",
    titleEn: "0. Sidebar (global navigation)",
    descKo: "왼쪽 64px 아이콘 레일은 앱 어디서나 보이는 전역 내비게이션입니다. 상단은 페이지 이동, 하단은 언어·테마 전환.",
    descEn: "The 64px icon rail on the left is the global navigation, visible everywhere. Top icons move between pages; the bottom toggles language and theme.",
  },
  plate: {
    img: "/guide/plate.svg",
    notes: PLATE,
    titleKo: "1. 플레이트 목록",
    titleEn: "1. Plate list",
    descKo: "실험 플레이트를 고르는 첫 화면. 정렬·뷰를 바꾸고 카드로 결과 구성을 한눈에 본 뒤 플레이트로 들어갑니다.",
    descEn: "The entry screen for picking an experiment plate. Sort/switch views, scan each card's outcome mix, then open a plate.",
  },
  drug: {
    img: "/guide/drug.svg",
    notes: DRUG,
    titleKo: "2. 약물 목록 (플레이트 내부)",
    titleEn: "2. Drug list (inside a plate)",
    descKo: "플레이트 안 화합물 표. 검색·필터로 좁히고, 약물/타깃을 클릭해 대시보드로 들어가거나 플레이트 단위로 export합니다.",
    descEn: "The compound table inside a plate. Filter/search, click a drug/target to open its dashboard, or export the whole plate.",
  },
  dashboard: {
    img: "/guide/dashboard.svg",
    notes: DASHBOARD,
    titleKo: "3. 대시보드 (화합물 × 타깃)",
    titleEn: "3. Dashboard (compound × target)",
    descKo: "한 화합물·타깃의 전체 분석. KPI와 각 박스(Landscape·PPI·Enrichment·Time-lapse·Phenotypic·Signatures)를 보고, 타깃을 전환하거나 데이터를 export합니다.",
    descEn: "Full analysis for one compound × target. Read the KPIs and each box (landscape, PPI, enrichment, time-lapse, phenotypic, signatures), switch target, or export data.",
  },
  // ── Dashboard sub-sections — content from docs/guide_dashboard.md (planning). ──
  // Images come from /guide/guide-dashboard-<key>(-en).png, swapped at render
  // time. Tight 3-bullet notes per the spec (KO|EN side-by-side, no numbers).
  "dashboard-dynamics": {
    img: "/guide/guide-dashboard-dynamics.png",
    notes: [
      { n: 1,
        ko: "✚ = 타깃, 점·노드 = 함께 묶이는 단백질(community/모듈).",
        en: "✚ = target; dots/nodes = proteins grouped together (community/module)." },
      { n: 2,
        ko: "노드 색 = 타깃과 함께 ↑증가(주황) / ↓감소(파랑).",
        en: "Node color = moves with the target ↑up (orange) / ↓down (blue)." },
      { n: 3,
        ko: "상단 0h/4h/24h 버튼 = 그 시점 데이터 그대로(raw). ⊕ 시간축 분석으로 시간 비교 열기.",
        en: "Top 0h/4h/24h = that timepoint's raw data. ⊕ Timecourse opens the time comparison." },
    ],
    titleKo: "Target Module Dynamics",
    titleEn: "Target Module Dynamics",
    descKo: "약물이 타깃 단백질 모듈을 어떻게 바꾸는지 보는 한 시점의 지도입니다. 왼쪽 Landscape(지형도) + 오른쪽 PPI(회로도)가 한 몸.",
    descEn: "A one-timepoint map of how the drug reshapes the target's protein module — Landscape (left) and PPI network (right) as one unit.",
  },
  "dashboard-timecourse": {
    img: "/guide/guide-dashboard-timecourse.png",
    notes: [
      { n: 1,
        ko: "행 = 모듈(top GO 이름), 열 = 0h/4h/24h, 칸 색 = 신호 세기 (파랑 −, 빨강 +).",
        en: "Row = module (top GO label), col = 0h/4h/24h, cell color = signal (blue −, red +)." },
      { n: 2,
        ko: "오른쪽 패턴 칩이 자동으로 판정 (아래 5종).",
        en: "The pattern chip on the right is an automatic verdict (5 types below)." },
      { n: 3,
        ko: "★ = 타깃 community(타깃이 속한 모듈) · 지표 참여율 / 평균 PCC 토글.",
        en: "★ = target community (the module the target belongs to) · metric participation / avg PCC." },
    ],
    titleKo: "Timecourse — 모듈 × 시점 히트맵 (opt-in)",
    titleEn: "Timecourse — Module × time heatmap (opt-in)",
    descKo: "각 모듈이 시간(0h→24h)에 따라 어떻게 변했나를 한 표로. 0h = 약물 처리 전, 24h 모듈을 기준 칸으로 고정해 비교합니다. (원하는 사람만 — opt-in)",
    descEn: "One table of how each module changed over time (0h→24h). 0h = pre-treatment; 24h modules are the fixed reference bins. (opt-in — only if you want it)",
  },
  "dashboard-phenome": {
    img: "/guide/guide-dashboard-phenome.png",
    notes: [
      { n: 1,
        ko: "GR(t): 1 = DMSO 수준 · 0 = 정지 · <0 = 사멸 (보라 = 약물, 점선 = DMSO).",
        en: "GR(t): 1 = DMSO rate · 0 = stasis · <0 = death (purple = drug, dashed = DMSO)." },
      { n: 2,
        ko: "Phenome Tracking: vehicle(대조) 궤적에서 벗어난 정도 = 표현형 이탈.",
        en: "Phenome Tracking: deviation from the vehicle trajectory = phenotype drift." },
      { n: 3,
        ko: "Time-lapse 이미지(0–48h)로 세포 형태·수 변화를 직접 확인.",
        en: "Time-lapse imaging (0–48h) shows morphology/count change directly." },
    ],
    titleKo: "Phenome — Time-lapse · Phenotypic Profiling",
    titleEn: "Phenome — Time-lapse · Phenotypic Profiling",
    descKo: "분자 변화의 결과 — 세포가 실제로 어떻게 반응했나. 성장 속도(GR)와 표현형 이탈, 그리고 실제 이미지로 확인.",
    descEn: "The outcome of the molecular changes — how the cells actually responded: growth rate (GR), phenotype drift, and the real images.",
  },
};

// Pattern verdict table for the Timecourse sub-section. Labels + criteria
// mirror TimecourseDrawer.classifyPattern (STRONG=0.20, WEAK=0.10) so the
// guide stays the single source of truth users can verify against the data.
// a₀ / a₂₄ = avg PCC at 0h / 24h ·  p₀ / p₂₄ = participation rate
const TIMECOURSE_PATTERNS: Array<{
  ko: string; en: string; descKo: string; descEn: string;
  criteria: string; chip: string;
}> = [
  { chip: "🟣", ko: "관계 반전 −→+", en: "Flipped −→+",
    descKo: "baseline 음(−) → 24h 양(+). 강한 약물 신호.",
    descEn: "negative at baseline → positive by 24h; strong signal.",
    criteria: "a₀ ≤ −0.20  ∧  a₂₄ ≥ +0.20" },
  { chip: "🟣", ko: "관계 반전 +→−", en: "Flipped +→−",
    descKo: "baseline 양(+) → 24h 음(−). 강한 약물 신호 (반대 방향).",
    descEn: "positive at baseline → negative by 24h; strong signal (opposite direction).",
    criteria: "a₀ ≥ +0.20  ∧  a₂₄ ≤ −0.20" },
  { chip: "🔴", ko: "관계 강화", en: "Amplified",
    descKo: "원래 있던 동변동을 약물이 강화 (부호 동일, |avg PCC| 증가).",
    descEn: "drug strengthened an existing co-variation (same sign, |avg PCC| grew).",
    criteria: "sign(a₀) = sign(a₂₄)  ∧  |a₂₄| − |a₀| ≥ 0.15" },
  { chip: "🔴", ko: "관계 형성", en: "Formed",
    descKo: "baseline 약함 → 24h 새 관계 형성.",
    descEn: "weak at baseline → new relationship by 24h.",
    criteria: "|a₀| < 0.10  ∧  |a₂₄| ≥ 0.20" },
  { chip: "🔵", ko: "관계 해체", en: "Dissolved",
    descKo: "baseline 강한 모듈이 24h에 약화 + 참여율 동반 감소.",
    descEn: "strong baseline module weakened by 24h, with participation also dropping.",
    criteria: "|a₀| ≥ 0.20  ∧  |a₂₄| < 0.10  ∧  p₀ − p₂₄ > 0.20" },
  { chip: "⚪", ko: "관계 유지", en: "Stable",
    descKo: "약하지 않은 신호가 거의 안 변함 — 약물 효과 미약.",
    descEn: "a non-trivial signal barely changes — weak drug effect.",
    criteria: "|a₂₄ − a₀| < 0.10  ∧  |a₂₄| ≥ 0.10" },
  { chip: "⚪", ko: "관계 약함", en: "Weak",
    descKo: "전 시점에서 신호가 약함 — 위 어느 분류에도 해당 안 됨 (fallback).",
    descEn: "weak signal across all timepoints — none of the above rules fire (fallback).",
    criteria: "otherwise" },
];

// Community-formation explainer notes (shown under the dashboard section).
// Mirrors the pipeline logic in tpd_prot_pipeline/tpd_export
// (weights.py build_W · community.py louvain+consensus · config.py defaults).
const COMMUNITY: Note[] = [
  {
    n: 1,
    ko: "입력 — 세 조건을 모두 만족하는 단백질 쌍만 연결됩니다. P = STRING PPI(신뢰도 ≥400) · R = 유의한 발현 상관(p<0.10) · g = 발현 변동성 가중. 셋을 원소별 곱(⊙)해 가중 그래프 W를 만듭니다(W = P ⊙ R ⊙ g). → 의미: “물리적으로 알려진 관계(P)” ∩ “이 실험에서 실제로 같이 움직임(R)”을 동시에 만족해야 엣지가 생기므로, W는 조건 특이적인 반응 네트워크입니다.",
    en: "Inputs — only protein pairs satisfying all three are linked. P = STRING PPI (confidence ≥400) · R = significant co-expression (p<0.10) · g = expression-variability weight. Their element-wise product (⊙) builds the weighted graph W (W = P ⊙ R ⊙ g). → Meaning: an edge requires both a known physical relationship (P) and actually moving together in this experiment (R), so W is a condition-specific response network.",
  },
  {
    n: 2,
    ko: "Louvain ×1000 — W 위에서 서로 다른 seed로 Louvain 군집화를 1000번 반복합니다(resolution 2.0). → 의미: Louvain은 seed에 따라 경계가 흔들리는 알고리즘이라, 한 번 결과를 그대로 믿으면 우연한 분할일 수 있습니다. 1000번은 그 불안정성을 측정하기 위한 것입니다.",
    en: "Louvain ×1000 — run Louvain community detection 1000× on W with different seeds (resolution 2.0). → Meaning: Louvain's boundaries shift with the random seed, so a single run may be an accidental split; the 1000 runs exist to measure that instability.",
  },
  {
    n: 3,
    ko: "Consensus — 두 단백질이 1000번 중 함께 묶인 빈도(co-association)로 거리를 만들고 average-linkage 군집화 후 거리 0.2에서 컷. → 의미: “거의 매번 같이 묶인” 단백질만 한 community로 인정합니다. 운 좋게 한두 번 같이 묶인 쌍은 걸러지므로, 남는 경계는 신뢰할 수 있는 모듈입니다.",
    en: "Consensus — turn how often two proteins co-clustered across the 1000 runs into a distance, average-linkage cluster it, then cut at 0.2. → Meaning: only proteins that grouped together nearly every time count as one community; pairs that co-clustered by luck are filtered out, so the surviving boundaries are trustworthy modules.",
  },
  {
    n: 4,
    ko: "Size 필터 — 멤버 20개 이하의 community는 제외합니다. → 의미: 통계적으로 경로 농축이나 평균 상관을 논하기 어려운 작은 조각·외톨이를 버려, Landscape에 해석 가치가 있는 모듈만 남깁니다.",
    en: "Size filter — communities with ≤20 members are dropped. → Meaning: tiny fragments and singletons (too small to support pathway enrichment or a meaningful average correlation) are discarded, leaving only interpretable modules on the Landscape.",
  },
  {
    n: 5,
    ko: "결과 — 남은 community가 Landscape의 점이 되고, 타깃이 속한 community가 anchor(✚)입니다. → 의미: anchor는 “약물 타깃이 사는 기능 모듈”이고, 다른 점들은 그 모듈과 얼마나 함께 조절되는지로 배치됩니다. 단, 화면 PPI는 STRING 엣지(≥400)만 그리므로 상관 R로만 묶인 멤버는 내부 엣지 없이 한쪽에 떠 보일 수 있습니다(누락이 아니라 ‘발현은 같이 움직이나 물리적 연결은 다른 모듈에 있음’).",
    en: "Result — surviving communities become the Landscape dots; the target's community is the anchor (✚). → Meaning: the anchor is the functional module the drug target lives in, and the other dots are placed by how strongly they co-regulate with it. Note the on-screen PPI draws only STRING edges (≥400), so a member grouped purely by correlation R can sit off to the side with no internal edge — not a bug, but “co-moves in expression while its physical links live in another module.”",
  },
];

export function GuidePage() {
  const t = useT();
  const lang = useUiLang((s) => s.lang);
  const location = useLocation();
  const [section, setSection] = useState<Section>("sidebar");
  // Communities explainer collapse (under Dynamics). Deep content — hidden by
  // default per the 2026-06-07 design call ("내용 너무 딥해").
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const s = SECTIONS[section];

  // Cross-link from the Timecourse isolated-case callout to the community
  // exception note, which lives behind a collapse on the Dynamics sub-section.
  const goToCommunityException = () => {
    setSection("dashboard-dynamics");
    setCommunitiesOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("community-exception")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Anchor sync — the sidebar flyout navigates with /guide#dashboard-dynamics
  // etc.; pick up the hash and jump to that section on mount + on hash change.
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    const mapped = HASH_TO_SECTION[hash];
    if (mapped) setSection(mapped);
  }, [location.hash]);

  const tabs: Array<{ k: Section; label: string; indent?: boolean }> = [
    { k: "sidebar",              label: t("사이드바", "Sidebar") },
    { k: "plate",                label: t("플레이트", "Plate") },
    { k: "drug",                 label: t("약물", "Drug") },
    { k: "dashboard",            label: t("대시보드", "Dashboard") },
    { k: "dashboard-dynamics",   label: "Dynamics",   indent: true },
    { k: "dashboard-timecourse", label: "Timecourse", indent: true },
    { k: "dashboard-phenome",    label: "Phenome",    indent: true },
  ];

  return (
    <div className="flex-1 pl-16 pr-4 lg:px-8 py-8 mx-auto w-full max-w-[1100px]">
      <header className="mb-6">
        <h1 className="text-ink-primary" style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          {t("사용 설명서", "User Guide")}
        </h1>
        <p className="mt-2 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
          {t(
            "플레이트 선택 → 약물/타깃 진입 → 대시보드 해석 → 뒤로가기·데이터 export까지의 흐름을 그림으로 안내합니다.",
            "A visual walkthrough: pick a plate → open a drug/target → read the dashboard → navigate back and export data.",
          )}
        </p>
      </header>

      {/* Section tabs — Dashboard sub-sections (Dynamics / Timecourse /
          Phenome) are visually nested via the indent prefix. */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-md border border-line bg-surface-elevated w-fit p-1">
        {tabs.map((tab) => (
          <button
            key={tab.k}
            type="button"
            onClick={() => setSection(tab.k)}
            className={`px-3 py-1.5 text-body rounded transition-colors ${
              section === tab.k
                ? "bg-brand-primary/15 text-brand-primary font-medium"
                : "text-ink-secondary hover:text-ink-primary"
            } ${tab.indent ? "ml-3" : ""}`}
          >
            {tab.indent ? <span className="text-ink-muted mr-1.5">○</span> : null}
            {tab.label}
          </button>
        ))}
      </div>

      <h2 className="text-ink-primary text-card font-semibold">{t(s.titleKo, s.titleEn)}</h2>
      <p className="mt-1 mb-4 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
        {t(s.descKo, s.descEn)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 items-start">
        {/* Annotated mockup — Dashboard sub-sections (Dynamics/Timecourse/
            Phenome) have a localized -en.png; legacy sections fall back to the
            single image they ship with. */}
        <figure className="rounded-lg border border-line bg-surface-card overflow-hidden">
          <img
            key={`${section}-${lang}`}
            src={
              section.startsWith("dashboard-") && lang === "en"
                ? s.img.replace(/\.png$/, "-en.png")
                : s.img
            }
            alt={t(s.titleKo, s.titleEn)}
            className="w-full block"
            style={{ background: "#0b1220" }}
          />
        </figure>

        {/* Numbered explanations */}
        <ol className="flex flex-col gap-2.5">
          {s.notes.map((note) => (
            <li key={note.n} className="flex gap-2.5 items-start">
              <span
                className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full text-caption font-bold"
                style={{ width: 20, height: 20, background: "var(--color-brand-primary)", color: "#fff" }}
              >
                {note.n}
              </span>
              <span className="text-ink-secondary text-body" style={{ lineHeight: 1.5 }}>
                {t(note.ko, note.en)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Isolated-target callout — Timecourse only. Shown right under the
          notes so readers learn what "no ★ row" means before they study the
          heatmap, with a one-tap link into the deeper exception note. */}
      {section === "dashboard-timecourse" && (
        <div className="mt-5 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-body text-ink-secondary" style={{ lineHeight: 1.55 }}>
          <span className="text-status-warning font-semibold mr-1.5" aria-hidden="true">⚠</span>
          {t(
            "타깃이 어느 모듈에도 속하지 않으면(isolated) ★ 행이 없고 \"타깃 community 없음\"으로 표시됩니다.",
            "If the target belongs to no module (isolated), the ★ row is absent and the heatmap shows \"no target community\".",
          )}{" "}
          <button
            type="button"
            onClick={goToCommunityException}
            className="text-brand-primary hover:underline font-medium"
          >
            {t("→ 커뮤니티 예외 안내 보기", "→ See the community exception note")}
          </button>
        </div>
      )}

      {/* Pattern verdict table — shown only on the Timecourse sub-section.
          Labels + criteria mirror TimecourseDrawer.classifyPattern. */}
      {section === "dashboard-timecourse" && (
        <section className="mt-8 pt-6 border-t border-line">
          <h3 className="text-ink-primary text-body-strong font-semibold mb-1">
            {t("패턴 분류 — 자동 판정 기준", "Pattern verdict — classification rules")}
          </h3>
          <p className="text-meta text-ink-muted mb-3" style={{ lineHeight: 1.5 }}>
            {t(
              "a₀ / a₂₄ = 0h / 24h 평균 PCC · p₀ / p₂₄ = 참여율. 위에서부터 차례로 검사하여 처음 매치되는 규칙이 채택됩니다.",
              "a₀ / a₂₄ = avg PCC at 0h / 24h · p₀ / p₂₄ = participation rate. Rules are checked top to bottom; the first match wins.",
            )}
          </p>
          <ul className="flex flex-col gap-3">
            {TIMECOURSE_PATTERNS.map((p) => (
              <li
                key={p.en}
                className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 items-start text-body"
              >
                <span className="font-semibold text-ink-primary whitespace-nowrap">
                  {p.chip} {t(p.ko, p.en)}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-ink-secondary" style={{ lineHeight: 1.5 }}>
                    {t(p.descKo, p.descEn)}
                  </span>
                  <code
                    className="text-meta text-ink-muted bg-surface-soft rounded px-2 py-0.5 font-mono whitespace-pre-wrap break-words self-start"
                  >
                    {p.criteria}
                  </code>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-meta text-ink-muted">
        {t(
          "※ 그림은 이해를 돕기 위한 예시(임의 데이터)이며 실제 화면과 세부 수치는 다를 수 있습니다.",
          "※ Figures are illustrative examples (placeholder data); actual screens and numbers may differ.",
        )}
      </p>

      {/* Communities explainer — deep content, kept under Dynamics and behind
          a collapse so it doesn't dominate the sub-section. */}
      {section === "dashboard-dynamics" && (
        <section className="mt-10 pt-8 border-t border-line">
          <button
            type="button"
            onClick={() => setCommunitiesOpen((o) => !o)}
            aria-expanded={communitiesOpen}
            className="w-full text-left flex items-center gap-3 hover:bg-surface-soft rounded-md px-2 py-2"
          >
            <span
              className="text-ink-primary font-bold leading-none"
              style={{ fontSize: "1.1em" }}
              aria-hidden="true"
            >
              {communitiesOpen ? "▼" : "▶"}
            </span>
            <h2 className="text-ink-primary text-card font-semibold">
              {t("커뮤니티(community)는 어떻게 만들어지나?", "How a community is formed?")}
            </h2>
          </button>
          {communitiesOpen && <CommunityDefinition />}
        </section>
      )}
    </div>
  );
}

/**
 * CommunityDefinition — bottom-of-dashboard explainer for what a "community"
 * is on the Target Landscape / PPI panels. Pairs a language-neutral SVG flow
 * diagram (P ⊙ R ⊙ g → Louvain ×1000 → consensus → size>20 → landscape) with a
 * bilingual numbered walkthrough, matching the page's mockup+notes pattern.
 * The pipeline mirrors tpd_prot_pipeline/tpd_export (weights.py / community.py).
 */
function CommunityDefinition() {
  const t = useT();
  return (
    <div className="mt-4">
      <div className="mt-1 mb-4 flex flex-col gap-2 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
        <p>
          {t(
            "Landscape의 점과 PPI 패널의 단위인 community는 PPI 연결만으로 정해지지 않습니다. PPI·발현 상관·노드 가중을 모두 곱한 그래프 위에서 Louvain을 1000번 돌려 합의(consensus)로 묶인 모듈입니다.",
            "A community — the unit behind each Landscape dot and the PPI panel — is not defined by PPI links alone. It is a module agreed upon by running Louvain 1000× over a graph that multiplies PPI, expression correlation, and node weight together.",
          )}
        </p>
        <p>
          {t(
            "의미상으로 community는 “이 약물 처리에서 실제로 함께 반응하는 기능 모듈”입니다. PPI만 쓰면 어떤 약물에서나 똑같이 나오는 일반 상호작용 지도가 되지만, 여기에 이 실험의 발현 상관(R)을 곱하기 때문에 같이 움직인 단백질만 묶입니다 — 즉 같은 타깃이라도 약물·데이터셋마다 community 구성이 달라집니다.",
            "Conceptually a community is “a functional module that actually responds together under this treatment.” PPI alone yields a generic interaction map that looks the same for any drug; multiplying in this experiment’s expression correlation (R) keeps only proteins that move together — so the same target can land in different communities across drugs and datasets.",
          )}
        </p>
        <p>
          {t(
            "그래서 Landscape에서 한 점(community)에 가까운지·높은지는 “타깃이 속한 기능 모듈과 얼마나 직접적으로 함께 조절되는가”를 읽는 것이고, 그 모듈의 단백질 구성·경로 농축이 곧 약물 기전 해석의 후보가 됩니다.",
            "So how close / high a dot (community) sits on the Landscape reads as “how directly it is co-regulated with the module the target lives in,” and that module’s protein membership and pathway enrichment become the candidate reading of the drug’s mechanism.",
          )}
        </p>
      </div>

      <figure className="rounded-lg border border-line bg-surface-card overflow-hidden">
        <CommunityFlowSvg />
      </figure>

      <ol className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2.5">
        {COMMUNITY.map((note) => (
          <li key={note.n} className="flex gap-2.5 items-start">
            <span
              className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full text-caption font-bold"
              style={{ width: 20, height: 20, background: "var(--color-brand-primary)", color: "#fff" }}
            >
              {note.n}
            </span>
            <span className="text-ink-secondary text-body" style={{ lineHeight: 1.5 }}>
              {t(note.ko, note.en)}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-meta text-ink-muted" style={{ lineHeight: 1.6 }}>
        {t(
          "⊙ = 원소별 곱(세 조건의 AND). 기본값: STRING confid_score 400 · corr p<0.10 · Louvain resolution 2.0 · seeds 1000 · consensus cut 0.2 · community size>20.",
          "⊙ = element-wise product (the AND of all three). Defaults: STRING confid_score 400 · corr p<0.10 · Louvain resolution 2.0 · 1000 seeds · consensus cut 0.2 · community size>20.",
        )}
      </p>

      <TargetNotInCommunity />
    </div>
  );
}

/**
 * Exception callout for the dashboard guide: "What if the target (✚) isn't in
 * any community?" Plain-language summary for guide readers — 4 causes, then the
 * two readings of the biologically meaningful case, then how to tell them apart.
 */
function TargetNotInCommunity() {
  const t = useT();
  const causes: { n: number; ko: string; en: string; tagKo: string; tagEn: string; signal: boolean }[] = [
    {
      n: 1,
      ko: "측정이 안 됨 — 질량분석에서 타깃이 검출되지 않음(발현량이 너무 낮거나 세포 특이적).",
      en: "Not measured — the target wasn't detected by mass-spec (too low-abundance or cell-specific).",
      tagKo: "데이터 한계", tagEn: "data limit", signal: false,
    },
    {
      n: 2,
      ko: "DB에 정보 없음 — 상호작용 DB(STRING)에 타깃 정보가 부족(연구가 적은 단백질).",
      en: "No DB info — the interaction DB (STRING) lacks data for the target (a poorly-studied protein).",
      tagKo: "DB 한계", tagEn: "DB limit", signal: false,
    },
    {
      n: 3,
      ko: "함께 변하는 이웃이 없음 — 측정·DB엔 있는데, 타깃과 같이 움직이는 단백질 그룹이 안 생김.",
      en: "No co-moving neighbors — present in both, but no group of proteins moves together with the target.",
      tagKo: "진짜 신호 ★", tagEn: "real signal ★", signal: true,
    },
    {
      n: 4,
      ko: "모듈이 너무 작음 — 작게 뭉치긴 했지만 멤버 20개 이하라 noise로 보고 제외됨.",
      en: "Module too small — it did group, but with ≤20 members it's treated as noise and dropped.",
      tagKo: "회색지대", tagEn: "grey zone", signal: false,
    },
  ];

  return (
    <div id="community-exception" className="mt-6 rounded-lg border border-line bg-surface-card p-4 scroll-mt-24">
      <h3 className="text-ink-primary text-body-strong font-semibold inline-flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-full text-caption font-bold"
          style={{ width: 20, height: 20, background: "var(--color-brand-primary)", color: "#fff" }}
        >
          ?
        </span>
        {t("타깃(✚)이 community에 안 묶였다면?", "What if the target (✚) isn't in any community?")}
      </h3>

      <p className="mt-2 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
        {t(
          "데이터 오류가 아닙니다. 타깃은 있는데 타깃과 “함께 변하는 단백질 그룹”이 안 만들어진 상태입니다. 원인은 4가지:",
          "Not a data error. The target is there, but no “group of proteins that move together with it” formed. Four causes:",
        )}
      </p>

      <ol className="mt-2.5 flex flex-col gap-2">
        {causes.map((c) => (
          <li key={c.n} className="flex gap-2.5 items-start">
            <span
              className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded-full text-caption font-bold"
              style={{
                width: 20, height: 20,
                background: c.signal ? "var(--color-brand-primary)" : "rgb(var(--color-loc-low-rgb) / 0.18)",
                color: c.signal ? "#fff" : "var(--color-text-muted)",
              }}
            >
              {c.n}
            </span>
            <span className="text-ink-secondary text-body" style={{ lineHeight: 1.5 }}>
              {t(c.ko, c.en)}{" "}
              <span
                className="ml-1 align-middle rounded px-1.5 py-0.5 text-caption font-medium"
                style={{
                  background: c.signal ? "rgb(var(--color-brand-primary-rgb) / 0.15)" : "rgb(var(--color-loc-low-rgb) / 0.10)",
                  color: c.signal ? "var(--color-brand-primary)" : "var(--color-text-muted)",
                }}
              >
                {t(c.tagKo, c.tagEn)}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
        {t(
          "특히 ③(가장 흔하고 의미 있음)은 두 가지로 읽힐 수 있습니다:",
          "Case ③ in particular (the most common and meaningful) can be read two ways:",
        )}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        <li className="flex gap-2 text-body text-ink-secondary" style={{ lineHeight: 1.5 }}>
          <span className="text-brand-primary shrink-0 mt-0.5" aria-hidden>›</span>
          <span>
            {t(
              "좋은 신호 (선택적 분해): 약이 타깃만 깔끔히 분해 → 같이 떨어지는 단백질이 없음. 선택성 좋은 분해제의 정상 모습.",
              "Good signal (selective degradation): the drug cleanly degrades only the target → nothing co-drops with it. The normal look of a selective degrader.",
            )}
          </span>
        </li>
        <li className="flex gap-2 text-body text-ink-secondary" style={{ lineHeight: 1.5 }}>
          <span className="text-brand-primary shrink-0 mt-0.5" aria-hidden>›</span>
          <span>
            {t(
              "약한 신호 (효과 약함): 약이 그 시점에 타깃을 거의 못 건드림 → 변동 신호가 없어서 그룹이 안 생김.",
              "Weak signal (low effect): the drug barely affected the target at that timepoint → no change signal, so no group forms.",
            )}
          </span>
        </li>
      </ul>

      <p className="mt-3 text-meta text-ink-muted" style={{ lineHeight: 1.6 }}>
        {t(
          "어떻게 구별하나: PAC 점수가 높고 타깃 변동성이 크면 “좋은 신호”, 둘 다 낮으면 “약한 신호”. 4h→24h 비교도 도움(24h에 모듈이 생기면 효과가 늦게 나온 것).",
          "How to tell: high PAC score + high target variability → “good signal”; both low → “weak signal”. Comparing 4h→24h also helps (if a module forms by 24h, the effect simply came later).",
        )}
      </p>
    </div>
  );
}

/**
 * Language-neutral flow diagram, drawn on the same dark canvas as the other
 * guide figures (bg #0b1220, cards #131c33, brand #A855F7). Five stages:
 * three inputs (P/R/g) converge into W, then Louvain → consensus → result.
 */
function CommunityFlowSvg() {
  // shared palette (matches public/guide/*.svg)
  const C = {
    card: "#131c33",
    line: "#27324d",
    brand: "#A855F7",
    ink: "#E2E8F0",
    sec: "#aeb9cb",
    mut: "#8a97ad",
    up: "#F59E0B",
    down: "#185FA5",
    wire: "#64748b",
  };
  const box = (x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} rx={10} fill={C.card} stroke={C.line} strokeWidth={1} />
  );
  // arrow: horizontal connector with a small triangle head
  const arrow = (x1: number, x2: number, y: number) => (
    <g stroke={C.wire} fill={C.wire}>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} strokeWidth={1.6} />
      <polygon points={`${x2},${y} ${x2 - 7},${y - 4} ${x2 - 7},${y + 4}`} stroke="none" />
    </g>
  );
  // input chip: big letter + two-line description
  const chip = (x: number, y: number, letter: string, l1: string, l2: string, color: string) => (
    <g>
      <rect x={x} y={y} width={150} height={44} rx={9} fill="#16203a" stroke={C.line} strokeWidth={1} />
      <text x={x + 18} y={y + 28} fontSize={17} fontWeight={700} fill={color} textAnchor="middle">
        {letter}
      </text>
      <text x={x + 40} y={y + 19} fontSize={9.5} fill={C.sec} textAnchor="start">{l1}</text>
      <text x={x + 40} y={y + 33} fontSize={9.5} fill={C.mut} textAnchor="start">{l2}</text>
    </g>
  );

  return (
    <svg
      viewBox="0 0 980 270"
      width="100%"
      style={{ display: "block", background: "#0b1220" }}
      fontFamily="Malgun Gothic, Segoe UI, sans-serif"
      role="img"
      aria-label="Community formation pipeline: P, R and g combine into the weighted graph W, then Louvain x1000, consensus clustering, a size>20 filter, and the resulting landscape communities."
    >
      {/* ── Stage 1: three inputs ───────────────────────────────── */}
      {chip(14, 60, "P", "PPI adjacency", "STRING ≥ 400", C.ink)}
      {chip(14, 112, "R", "co-expression", "p < 0.10", C.up)}
      {chip(14, 164, "g", "node weight", "variability", C.down)}
      <text x={182} y={104} fontSize={15} fontWeight={700} fill={C.brand} textAnchor="middle">⊙</text>
      <text x={182} y={156} fontSize={15} fontWeight={700} fill={C.brand} textAnchor="middle">⊙</text>
      {/* converging wires into W */}
      <g stroke={C.wire} strokeWidth={1.2} fill="none">
        <line x1={164} y1={82} x2={206} y2={124} />
        <line x1={164} y1={134} x2={206} y2={124} />
        <line x1={164} y1={186} x2={206} y2={124} />
      </g>

      {/* ── Stage 2: W weighted graph ───────────────────────────── */}
      {box(210, 64, 150, 120)}
      <text x={285} y={88} fontSize={17} fontWeight={700} fill={C.ink} textAnchor="middle">W</text>
      <text x={285} y={104} fontSize={10} fill={C.brand} textAnchor="middle">= P ⊙ R ⊙ g</text>
      {/* tiny weighted-graph glyph */}
      <g stroke={C.wire} strokeWidth={1}>
        <line x1={258} y1={150} x2={300} y2={132} />
        <line x1={300} y1={132} x2={322} y2={158} />
        <line x1={258} y1={150} x2={285} y2={168} />
        <line x1={285} y1={168} x2={322} y2={158} />
      </g>
      {[[258, 150, C.up], [300, 132, C.down], [322, 158, C.down], [285, 168, C.up]].map(
        ([cx, cy, f], i) => (
          <circle key={i} cx={cx as number} cy={cy as number} r={4} fill={f as string} />
        ),
      )}

      {arrow(360, 396, 124)}

      {/* ── Stage 3: Louvain ×1000 ──────────────────────────────── */}
      {box(398, 64, 176, 120)}
      <text x={486} y={88} fontSize={13} fontWeight={700} fill={C.ink} textAnchor="middle">Louvain</text>
      <text x={486} y={103} fontSize={10} fill={C.mut} textAnchor="middle">×1000 seeds · res 2.0</text>
      {/* three mini partitions with different groupings */}
      {[
        { x: 410, groups: [C.up, C.up, C.down, C.down] },
        { x: 470, groups: [C.up, C.down, C.up, C.down] },
        { x: 530, groups: [C.down, C.up, C.up, C.up] },
      ].map((p, gi) => (
        <g key={gi}>
          <rect x={p.x} y={120} width={48} height={50} rx={6} fill="#0f1830" stroke={C.line} strokeWidth={1} />
          {[
            [14, 14], [34, 16], [16, 36], [34, 36],
          ].map(([dx, dy], di) => (
            <circle key={di} cx={p.x + dx} cy={120 + dy} r={3.4} fill={p.groups[di]} />
          ))}
        </g>
      ))}

      {arrow(574, 610, 124)}

      {/* ── Stage 4: consensus + size filter ────────────────────── */}
      {box(612, 64, 176, 120)}
      <text x={700} y={88} fontSize={13} fontWeight={700} fill={C.ink} textAnchor="middle">Consensus</text>
      <text x={700} y={103} fontSize={9.5} fill={C.mut} textAnchor="middle">co-assoc · avg-linkage</text>
      {/* mini dendrogram + cut line at 0.2 */}
      <g stroke={C.sec} strokeWidth={1.1} fill="none">
        <path d="M636 150 V138 H654 V150" />
        <path d="M672 150 V142 H690 V150" />
        <path d="M645 138 V126 H681 V142" />
      </g>
      <line x1={624} y1={131} x2={764} y2={131} stroke={C.brand} strokeWidth={1} strokeDasharray="3 3" />
      <text x={768} y={134} fontSize={9} fill={C.brand} textAnchor="start">cut 0.2</text>
      {/* size filter chip */}
      <rect x={648} y={158} width={104} height={18} rx={9} fill="#231b3a" stroke={C.line} strokeWidth={1} />
      <text x={700} y={170} fontSize={10} fontWeight={600} fill={C.brand} textAnchor="middle">size &gt; 20</text>

      {arrow(788, 824, 124)}

      {/* ── Stage 5: resulting communities on landscape ─────────── */}
      {box(826, 64, 140, 120)}
      <text x={896} y={88} fontSize={12.5} fontWeight={700} fill={C.ink} textAnchor="middle">Communities</text>
      <text x={896} y={103} fontSize={9.5} fill={C.mut} textAnchor="middle">Landscape · ✚ target</text>
      {[
        [852, 150, C.up], [884, 128, C.down], [912, 158, C.down],
        [940, 138, C.down], [922, 118, C.up], [864, 168, C.down],
      ].map(([cx, cy, f], i) => (
        <circle key={i} cx={cx as number} cy={cy as number} r={3.6} fill={f as string} />
      ))}
      <text x={852} y={154} fontSize={12} fontWeight={700} fill={C.up} textAnchor="middle">✚</text>

      {/* footnote inside canvas */}
      <text x={89} y={236} fontSize={9.5} fill={C.mut} textAnchor="start">
        measured proteins = nodes · only pairs passing P AND R (and weighted by g) get an edge
      </text>
    </svg>
  );
}
