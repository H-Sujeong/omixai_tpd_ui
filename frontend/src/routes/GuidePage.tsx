import { useState } from "react";
import { useT } from "@/store/uiLang";

/**
 * User guide. Three sections (Plate / Drug / Dashboard) each pairing an
 * annotated mockup of the page (public/guide/*.svg, numbered callouts) with a
 * matching numbered explanation list. Walks the user from plate composition →
 * navigating back → exporting data. Bilingual via useT.
 */

type Section = "plate" | "drug" | "dashboard";

interface Note {
  n: number;
  ko: string;
  en: string;
}

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
  { n: 4, ko: "약물 행 — 약물명 클릭 = 기본 타깃 대시보드로 진입.", en: "Drug row — click the name = open the default-target dashboard." },
  { n: 5, ko: "Target chip — 클릭하면 해당 타깃의 대시보드로 진입(멀티타깃).", en: "Target chip — click to open that specific target's dashboard (multi-target)." },
  { n: 6, ko: "GR score / Class — 성장률 점수와 효과 분류(세포독성 등).", en: "GR score / Class — growth-rate score and effect classification (e.g. cytotoxic)." },
  { n: 7, ko: "Asset ✓/○ — 분석 자산 유무(○ = 자산 없음).", en: "Asset ✓/○ — whether analysis assets exist (○ = none)." },
  { n: 8, ko: "Export plate ⬇ — 플레이트 단위 일괄 ZIP(약물/타깃/포맷 체크박스 선택).", en: "Export plate ⬇ — plate-level bulk ZIP (pick drugs / targets / formats)." },
];

const DASHBOARD: Note[] = [
  { n: 1, ko: "← D3_10 — 이 plate의 약물 목록으로 돌아가기.", en: "← D3_10 — back to this plate's drug list." },
  { n: 2, ko: "Target 전환 chip — 멀티타깃 화합물에서 타깃 변경(PPI·Landscape 재구성).", en: "Target switcher chips — change target for multi-target compounds (PPI & landscape rebuild)." },
  { n: 3, ko: "Export ⬇ — 현재 타깃의 선택 항목을 일괄 ZIP으로(체크박스).", en: "Export ⬇ — bundle the current target's selected items into one ZIP (checkboxes)." },
  { n: 4, ko: "KPI strip — GR score · Effect · Target · Community 등 핵심 지표(색 점 = 상태).", en: "KPI strip — key metrics: GR score · effect · target · community (colored dot = sentiment)." },
  { n: 5, ko: "Target Landscape — community 분포(x=거리, y=−log10p, z=avg(PCC)). ✚=타깃, 점 클릭→PPI 재구성.", en: "Target Landscape — community map (x = distance, y = −log10p, z = avg(PCC)). ✚ = target; click a point → rebuild PPI." },
  { n: 6, ko: "PPI Network — 단백질 상호작용(노드=단백질, 엣지 두께=STRING 신뢰도, 가까울수록 강함). 노드 클릭=단백질 정보.", en: "PPI Network — protein interactions (nodes = proteins, edge thickness = STRING confidence, closer = stronger). Node click = protein info." },
  { n: 7, ko: "Pathway Enrichment — 현재 community의 GO 기능 농축(막대=score, 색=BP/MF/CC).", en: "Pathway Enrichment — GO functional enrichment of the current community (bar = score, color = BP/MF/CC)." },
  { n: 8, ko: "Time-lapse Imaging — 0–48h 세포 이미지(0.5h 촬영), 간격 조절 + GIF export, 스케일바.", en: "Time-lapse Imaging — cell images 0–48 h (0.5 h capture), interval selector + GIF export, scale bar." },
  { n: 9, ko: "Phenotypic Profiling — GR(t) 곡선(DMSO 대비 성장, 1=DMSO수준·0=정지·<0=사멸) + Phenome 이탈.", en: "Phenotypic Profiling — GR(t) curve vs DMSO (1 = DMSO rate, 0 = stasis, <0 = death) + Phenome deviation." },
  { n: 10, ko: "Mechanistic Signatures — 기전 시그니처 강도(5칸 = level/5, ★=최강).", en: "Mechanistic Signatures — signature strength (5 cells = level/5, ★ = strongest)." },
  { n: 11, ko: "패널별 CSV ⬇ / ⓘ — 각 박스 데이터를 CSV·전용 포맷으로 내보내기, ⓘ 위에 마우스를 올리면 해석 도움말.", en: "Per-panel CSV ⬇ / ⓘ — export each box's data (CSV / dedicated formats); hover ⓘ for how-to-read help." },
];

const SECTIONS: Record<Section, { img: string; notes: Note[]; titleKo: string; titleEn: string; descKo: string; descEn: string }> = {
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
};

export function GuidePage() {
  const t = useT();
  const [section, setSection] = useState<Section>("plate");
  const s = SECTIONS[section];

  const tabs: Array<{ k: Section; label: string }> = [
    { k: "plate", label: t("플레이트", "Plate") },
    { k: "drug", label: t("약물", "Drug") },
    { k: "dashboard", label: t("대시보드", "Dashboard") },
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

      {/* Section tabs */}
      <div className="mb-5 flex gap-1 rounded-md overflow-hidden border border-line bg-surface-elevated w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.k}
            type="button"
            onClick={() => setSection(tab.k)}
            className={`px-4 py-1.5 text-body transition-colors ${
              section === tab.k
                ? "bg-brand-primary/15 text-brand-primary font-medium"
                : "text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <h2 className="text-ink-primary text-card font-semibold">{t(s.titleKo, s.titleEn)}</h2>
      <p className="mt-1 mb-4 text-ink-secondary text-body" style={{ lineHeight: 1.6 }}>
        {t(s.descKo, s.descEn)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 items-start">
        {/* Annotated mockup */}
        <figure className="rounded-lg border border-line bg-surface-card overflow-hidden">
          <img
            key={section}
            src={s.img}
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

      <p className="mt-6 text-meta text-ink-muted">
        {t(
          "※ 그림은 이해를 돕기 위한 예시(임의 데이터)이며 실제 화면과 세부 수치는 다를 수 있습니다.",
          "※ Figures are illustrative examples (placeholder data); actual screens and numbers may differ.",
        )}
      </p>
    </div>
  );
}
