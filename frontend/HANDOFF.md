# OmixAI-TPD frontend — Handoff

React 18 + TypeScript + Vite + Tailwind 기반의 dark-mode scientific dashboard.
3-tab horizontal layout (Phenotype / Network / Mechanism), 사이드바는 app nav 전용,
mobile drawer 지원, dark navy + `#A855F7` purple primary.

> **2026-05-21 대규모 리팩토링 완료.** Sidebar의 drug sub-tabs → horizontal TabBar로 이전,
> URL을 탭/타겟 상태의 단일 출처로 통일, mobile drawer 추가, 디자인 토큰 alpha 지원,
> 4개 컴포넌트(BridgeNotice/KpiStrip/LoadingBlock/InteractomeSlide)의 hidden visual bug 일괄 해결.
> 자세한 단계별 diff는 git history 참조.

## 디자인 컨텍스트

- **디자인 시스템**: `design/style_guide.md` (dark navy + purple primary)
- **레퍼런스 시안**: `design/design_02/index.html`
- **PRD**: `docs/PRD/02-design/scientific-dashboard-redesign-v1.md`
- **모든 시각 정확값**(hex / px / spacing)은 **`src/styles/tokens.css`** 의 CSS 변수로만 참조.
  컴포넌트 코드에서 hex / px 인라인 **절대 금지** (디자인 변동 흡수 정책).
  - Plotly trace 색만 예외 (JS 문자열 전달 필요) — 그래도 가급적 `getComputedStyle()`로 토큰 읽기 권장.

## 핵심 아키텍처 패턴

이 부분은 코드만 봐서는 안 드러나니, 신규 작업 전에 꼭 읽고 들어갈 것.

### 1. URL = 탭/타겟 상태의 단일 출처

`?tab=phenotype&target=BRD2` 형태의 URL search params가 **유일한** view state.
- 컴포넌트 내부 `useState` 동기화 금지 (이전 SidebarContext는 양방향 sync 때문에 flicker 발생 → Step 1에서 제거).
- 탭/타겟 변경은 `setSearchParams({ tab, target }, { replace: true })` 한 곳에서만.
- 새로고침 / 북마크 / Slack 링크 공유 모두 동일 view 재현.
- 레거시 / 잘못된 `?tab=overview` 같은 값은 `DashboardPage`의 redirect useEffect가 자동으로 `phenotype`으로 교체.

### 2. 네비게이션 두 축 명확히 분리

| 축 | 컴포넌트 | 역할 | 모바일 |
|---|---|---|---|
| **App nav** | `Sidebar` (240px, 좌측) | 어느 페이지(Plates 등) | `<lg`에서 햄버거 드로어로 |
| **View nav** | `TabBar` (3탭, topbar 안) | Drug 안에서 어느 view(Phenotype/Network/Mechanism) | 가로 스크롤 가능 |

이 분리는 의도된 것 — 사이드바에 drug sub-tabs를 두면 "app 네비"와 "view 네비"가 같은 시각 공간을 두고 다투게 됨. Step 3에서 분리.

### 3. Dual-token 컬러 시스템 ⚠️ 중요

각 brand/status 컬러마다 **두 종류의 CSS var**가 존재. 잘못 쓰면 silent fail:

```css
/* tokens.css */
--color-brand-primary:     #A855F7;       /* solid hex, for `color: var(--color-brand-primary)` 직접 사용 */
--color-brand-primary-rgb: 168 85 247;    /* RGB triplet, Tailwind alpha modifier 전용 */
```

**언제 어느 걸 쓰나:**
- `main.css`에서 `color: var(--color-X);` `background: var(--color-X);` → **hex 변수**
- `tailwind.config.ts`의 컬러 정의 → **rgb 변수** + `<alpha-value>` placeholder
- Tailwind 클래스 (`bg-brand-primary`, `border-brand-primary/40`, `ring-status-success/30`) → 자동으로 rgb 변수 거쳐 컴파일

**왜 두 개냐:** Tailwind는 `var(...)`에서 hex를 디컴포즈 못함 → opacity 모디파이어(`/40` 등)가 silent하게 컴파일 실패. 이걸 잡으려면 색을 `rgb(... / <alpha-value>)` 형태로 정의해야 하는데, 그러면 `main.css`의 `color: var(--color-X)` 직접 사용처가 깨짐. 그래서 dual-token. (Step 8 발견 + 해결)

**컬러 추가할 때:** brand/status면 hex + rgb 둘 다, surface/text/border처럼 alpha 안 쓰는 카테고리는 hex만.

### 4. `--height-topbar` 레이아웃 토큰

`InteractomeSlide`의 `top:` 값. Topbar 높이(breadcrumb + h1 + p + meta row + TabBar) 합산을 정적으로 180px로 잡음. 변동 가능성은 ResizeObserver 패턴으로 v2 검토.

### 5. 모바일 드로어

`AppShell.tsx`가 `useState(mobileOpen)` 보유:
- 햄버거 버튼(`lg:hidden fixed top-3 left-3`) → 클릭 시 open
- 백드롭(`lg:hidden fixed inset-0 bg-black/60`) 클릭, Esc, 사이드바 Link 클릭 시 close
- Sidebar는 `max-lg:translate-x-{0|-100%}`로 슬라이드 인/아웃
- Body scroll lock (prev 값 백업해서 cleanup 시 복원)

## 폴더 구조

```
frontend/
├── public/                      favicon 등 정적 자산
├── src/
│   ├── main.tsx                 entry
│   ├── router.tsx               react-router-dom routes
│   ├── styles/
│   │   ├── tokens.css           ★ 디자인 토큰 단일 출처 (dual-token 패턴)
│   │   └── main.css             Tailwind + .panel-card / .chip / .btn / .sidebar-* / .tabbar-*
│   ├── components/
│   │   ├── AppShell.tsx         pure layout + mobile drawer state (SidebarContext 없음)
│   │   ├── Sidebar.tsx          240px 사이드바, app nav 전용 (Plates만), 모바일 드로어
│   │   ├── TopbarMetaRow.tsx    breadcrumb 아래 정적 메타 (Dose · HY · Cell line · refs)
│   │   ├── PanelCard.tsx        gradient card shell
│   │   ├── StatusBadge.tsx
│   │   └── LoadingBlock.tsx     Loading / Error / Empty 표준 상태
│   ├── routes/
│   │   ├── PlateListPage.tsx    /plates — plate 카드 그리드
│   │   ├── DrugSummaryPage.tsx  /plates/:plateId — 약물 sci-table
│   │   ├── DashboardPage.tsx    /plates/:plateId/drugs/:drugId — 3 탭 + insight sidebar
│   │   └── NotFoundPage.tsx
│   ├── features/
│   │   ├── kpi/KpiStrip.tsx                            sentiment ring (alpha 30%)
│   │   ├── tabs/TabBar.tsx                             ★ horizontal 3탭, a11y 완비 (role=tablist)
│   │   ├── insight-sidebar/InsightSidebar.tsx
│   │   ├── ppi-graph/
│   │   │   ├── PpiGraph.tsx                            cytoscape, 반응형 height (360/440/520)
│   │   │   ├── PpiLegend.tsx                           semantic role legend
│   │   │   └── relatedCommunity.ts                     ★ 양방향 인터랙션 헬퍼
│   │   ├── landscape/Landscape.tsx                     Plotly 3D surface + scatter
│   │   ├── phenotypic/
│   │   │   ├── PhenotypicProfilingPanel.tsx            Phenotype 탭의 풀뷰
│   │   │   └── PhenotypicMiniCard.tsx                  Network 탭 상단 → Phenotype 점프 카드
│   │   ├── time-lapse/TimeLapseViewerPanel.tsx
│   │   ├── enrichment/EnrichmentBar.tsx
│   │   └── interactome-slide/InteractomeSlide.tsx      E12 슬라이드 L1/L2, maxWidth: 100vw
│   ├── api/
│   │   ├── client.ts            fetch wrapper
│   │   └── queries.ts           TanStack Query 훅
│   └── types/
│       ├── api.ts               backend Pydantic schemas mirror
│       └── shims.d.ts           cytoscape-cose-bilkent 등 타입 보강
├── index.html
├── package.json
├── tailwind.config.ts           brand/status는 rgb(var(...) / <alpha-value>) 패턴
├── tsconfig.json
└── vite.config.ts               /api → 127.0.0.1:8000 proxy
```

## 실행

```bash
npm install
npm run dev                       # http://localhost:5173
# LAN 노출:
npm run dev -- --host 0.0.0.0 --port 5174
```

타입 체크: `npm run typecheck` · 빌드: `npm run build`

## 백엔드

FastAPI (`omix_tpd/backend/`) 가 `/api/v1/...` 응답. Vite dev server가 `/api`를 `127.0.0.1:8000`으로 프록시.

`backend/README.md` 참조해서 실행 (Python 3.11+, `pip install -r requirements.txt`, `uvicorn app.main:app`).

## 디자인 변경할 때 진입점

| 변경 | 파일 |
|---|---|
| 컬러 팔레트 / 다크 톤 / 폰트 / spacing / radius / shadow | `src/styles/tokens.css` |
| **alpha 지원 새 컬러** (`bg-X/40` 같은 모디파이어 쓸 거면) | `tokens.css`에 `--color-X-rgb` 추가 + `tailwind.config.ts`에 `rgb(var(--color-X-rgb) / <alpha-value>)` |
| 카드 / 사이드바 / chip / badge / 버튼 / **TabBar** 베이스 스타일 | `src/styles/main.css` |
| Tailwind 클래스 매핑 | `tailwind.config.ts` |
| **탭 추가/제거/이름 변경** | `DashboardPage.tsx`의 `DashboardTab` 타입 + `VALID_TABS` set + `tabs` 배열 |
| PPI 노드 시맨틱 색상 (target / activated / suppressed / info / unknown) | `tokens.css` `--color-role-*` + `PpiGraph.tsx` style array |
| 사이드바 메뉴 항목 | `src/components/Sidebar.tsx` |
| Topbar 메타 정보 표시 항목 | `src/components/TopbarMetaRow.tsx` |
| Topbar 높이 변경 시 | `tokens.css`의 `--height-topbar` 동기화 (`InteractomeSlide` 영향) |

## 핵심 인터랙션

1. **약물 진입**: Drug Summary 테이블 → 약물명 클릭 = 기본 target dashboard, **target chip 클릭** = 해당 target dashboard
2. **Multi-target 전환**: dashboard topbar 오른쪽 target chip 클릭. URL의 `target` param이 업데이트되고 PPI/Insight/Landscape가 그 target에 맞게 재구성.
3. **탭 전환**: TabBar 클릭 또는 `←/→/Home/End` 키 (a11y 완비). URL의 `tab` param 동기화. 잘못된 값은 phenotype로 자동 redirect.
4. **양방향 Landscape ↔ PPI** (Network 탭):
   - Landscape 3D scatter point click → 해당 community의 PPI 그래프로 재구성
   - **PPI edge click** → `findRelatedCommunityFromEdge()`로 관련 community 계산 → landscape의 magenta diamond marker가 그 피크로 이동 + PPI panel 재구성
   - 알림: `BridgeNotice` 컴포넌트가 방향(PPI→Landscape / Landscape→PPI / Node jump) + 매칭 이유(shared / nearest) 노출
5. **PPI node click**: E12 Interactome 슬라이드(`maxWidth: 100vw`) 열림 + 다른 community로 점프 (있을 경우)
6. **Phenotype ↔ Network 점프**: Network 탭 상단의 `PhenotypicMiniCard` 클릭 → `?tab=phenotype` 점프. 사용자가 "왜?" 탐색 중에 "무엇?" 컨텍스트 잃지 않도록.

## 알려진 한계 / TODO

- Plotly 3D landscape는 60×60 grid surface가 무거워서 screenshot tool에서 timeout 날 수 있음 (실제 브라우저는 정상)
- `node_community_index`가 큰 약물 (예: dBET6 BRD3 = 4266 entries) 일 때 응답 ~180KB. v2에서 lazy load 고려.
- 사이드바 Help / Settings는 placeholder (disabled)
- `PpiGraph`가 community 전환 시 cytoscape 인스턴스를 destroy+recreate (`randomize: true`) → 멘탈 맵 손실 + perf. v2에서 community별 노드 위치 캐시 + 부드러운 transition 권장.
- `--height-topbar`는 정적 180px. 데이터에 따라 실제 토픽바 165~200px 범위 변동 → 슬라이드 상단 약간의 gap 가능. v2에서 ResizeObserver로 측정값을 CSS var로 publish 패턴 검토.
- Landscape/PpiGraph의 일부 Plotly/cytoscape trace 색이 JS 문자열로 하드코딩 (`#A855F7`) — `getComputedStyle().getPropertyValue('--color-brand-primary')`로 동적 읽기 가능하지만 첫 paint 시 색 점프 trade-off. 현재 정적.
- `PlateListPage` / `DrugSummaryPage`도 `px-8` 사용 — 모바일에서 햄버거와 겹칠 수 있음. `pl-16 pr-4 lg:px-8` 동일 패턴 적용 필요 (follow-up).

## 자주 빠지는 함정

- **Tailwind opacity modifier가 안 듣는다**: 그 컬러 토큰에 `-rgb` 변형이 정의돼 있는지 확인. 없으면 `tokens.css`에 RGB triplet 추가 + `tailwind.config.ts`에 등록.
- **InteractomeSlide가 topbar에 가린다**: topbar 높이를 바꿨다면 `--height-topbar` 동기화 잊지 말 것.
- **URL과 useState 동기화 코드를 다시 짜고 싶다**: 안 됨. URL이 단일 출처. 컴포넌트는 `useSearchParams`로 읽기만.
- **Sidebar에 새 메뉴 추가하려는데 모바일에서 안 닫힌다**: `<Link>`에 `onClick={onCloseMobile}` 빼먹지 않기.
- **`#A871FF` 가 어디 있다**: 이전 색 drift. 모두 `#A855F7`로 통일됨. 혹시 다시 나오면 PR에서 지적.
