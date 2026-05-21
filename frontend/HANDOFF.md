# OmixAI-TPD frontend — Handoff

React 18 + TypeScript + Vite + Tailwind 기반의 dark-mode scientific dashboard.

## 디자인 컨텍스트

- **디자인 시스템**: `design/style_guide.md` (dark navy + purple primary)
- **레퍼런스 시안**: `design/design_02/index.html`
- **PRD**: `docs/PRD/02-design/scientific-dashboard-redesign-v1.md`
- 모든 시각 정확값(hex / px / spacing)은 **`src/styles/tokens.css`** 의 CSS 변수로만 참조.
  컴포넌트 코드에서 hex / px 인라인 금지 (디자인 변동 흡수 정책).

## 폴더 구조

```
frontend/
├── public/                      favicon 등 정적 자산
├── src/
│   ├── main.tsx                 entry
│   ├── router.tsx               react-router-dom routes
│   ├── styles/
│   │   ├── tokens.css           ★ 디자인 토큰 단일 출처
│   │   └── main.css             Tailwind + .panel-card / .chip / .btn / .sidebar-* 등
│   ├── components/
│   │   ├── AppShell.tsx         좌측 sidebar + workspace 골격, useSidebar context
│   │   ├── Sidebar.tsx          240px 사이드바 (Workspace + drug sub-tabs + System)
│   │   ├── PanelCard.tsx        gradient card shell
│   │   ├── StatusBadge.tsx
│   │   └── LoadingBlock.tsx     Loading / Error / Empty 표준 상태
│   ├── routes/
│   │   ├── PlateListPage.tsx    /plates — plate(분석) 카드 그리드
│   │   ├── DrugSummaryPage.tsx  /plates/:plateId — 약물 sci-table
│   │   ├── DashboardPage.tsx    /plates/:plateId/drugs/:drugId — KPI + tabs + insight sidebar
│   │   └── NotFoundPage.tsx
│   ├── features/
│   │   ├── kpi/KpiStrip.tsx
│   │   ├── tabs/TabBar.tsx              (현재 sidebar 사용 — 보조용)
│   │   ├── insight-sidebar/InsightSidebar.tsx
│   │   ├── ppi-graph/
│   │   │   ├── PpiGraph.tsx             cytoscape wrapper (node + edge tap)
│   │   │   ├── PpiLegend.tsx            semantic role legend
│   │   │   └── relatedCommunity.ts      ★ 양방향 인터랙션 헬퍼
│   │   ├── landscape/Landscape.tsx      Plotly 3D surface + scatter
│   │   ├── phenotypic/PhenotypicProfilingPanel.tsx  GR + Phenome
│   │   ├── time-lapse/TimeLapseViewerPanel.tsx
│   │   ├── enrichment/EnrichmentBar.tsx
│   │   └── interactome-slide/InteractomeSlide.tsx   E12 슬라이드 L1/L2
│   ├── api/
│   │   ├── client.ts            fetch wrapper
│   │   └── queries.ts           TanStack Query 훅
│   └── types/
│       ├── api.ts               backend Pydantic schemas mirror
│       └── shims.d.ts           cytoscape-cose-bilkent 등 타입 보강
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts               /api → 127.0.0.1:8000 proxy
```

## 실행

```bash
npm install
npm run dev                       # http://localhost:5173 (dev에서는 port 5173 기본)
# or LAN 노출:
npm run dev -- --host 0.0.0.0 --port 5174
```

타입 체크: `npm run typecheck`

## 백엔드

FastAPI (`omix_tpd/backend/`) 가 `/api/v1/...` 응답. Vite dev server가 `/api`를 `127.0.0.1:8000`으로 프록시.

`backend/README.md` 참조해서 실행 (Python 3.11+, `pip install -r requirements.txt`, `uvicorn app.main:app`).

## 디자인 변경할 때 진입점

| 변경 | 파일 |
|---|---|
| 컬러 팔레트 / 다크 톤 / 폰트 / spacing / radius / shadow | `src/styles/tokens.css` |
| 카드 / 사이드바 / chip / badge / 버튼 베이스 스타일 | `src/styles/main.css` |
| Tailwind 클래스 매핑 (`bg-surface-card` 등) | `tailwind.config.ts` |
| PPI 노드 시맨틱 색상 (target / activated / suppressed / info / unknown) | `tokens.css` `--color-role-*` + `PpiGraph.tsx` style array |
| 사이드바 메뉴 항목 | `src/components/Sidebar.tsx` |

## 핵심 인터랙션

1. **약물 진입**: Drug Summary 테이블 → 약물명 클릭 = 기본 target dashboard, **target chip 클릭** = 해당 target dashboard
2. **Multi-target 전환**: dashboard top bar 오른쪽 target chip 클릭
3. **양방향 Landscape ↔ PPI** (Network 탭):
   - Landscape 3D scatter point click → 해당 community의 PPI 그래프로 재구성
   - **PPI edge click** → `findRelatedCommunityFromEdge()` 로 관련 community 계산 → landscape의 magenta diamond marker가 그 피크로 이동 + PPI panel 재구성
   - 알림: `BridgeNotice` 컴포넌트가 방향(PPI→Landscape / Landscape→PPI / Node jump) + 매칭 이유(shared / nearest) 노출
4. **PPI node click**: E12 Interactome 슬라이드 패널(오른쪽 520px) 열림 + 다른 community로 점프 (있을 경우)

## 알려진 한계 / TODO

- Raw Data 탭은 disabled (v2)
- Plotly 3D landscape는 60×60 grid surface가 무거워서 screenshot tool에서 timeout 날 수 있음 (실제 브라우저는 정상)
- `node_community_index`가 큰 약물 (예: dBET6 BRD3 = 4266 entries) 일 때 응답 ~180KB. v2에서 lazy load 고려.
- 사이드바 Help / Settings는 placeholder (disabled)
