# omixai_tpd_ui

OmixAI-TPD 프론트엔드 — Target Protein Degradation plate 통합 분석 워크스페이스.

React 18 + TypeScript + Vite + Tailwind 기반의 dark-mode scientific dashboard.
디자인은 `design/style_guide.md` + `design/design_02/`, 컴포넌트 명세는 `docs/scientific-dashboard-redesign-v1.md` 참조.

## 폴더

```
omixai_tpd_ui/
├── frontend/        React 18 + TS + Vite 소스
│   ├── src/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── HANDOFF.md   ★ 개발자용 폴더 구조 / 인터랙션 / 디자인 진입점 정리
├── design/          시안 (design_01, design_02) + style_guide.md
└── docs/            scientific-dashboard-redesign-v1.md (PRD)
```

## 실행

```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
# LAN 노출:
npm run dev -- --host 0.0.0.0 --port 5174
```

타입 체크: `npm run typecheck`

## 백엔드

UI는 `/api/v1/...` 엔드포인트를 호출하며 dev 환경에서는 Vite가 `127.0.0.1:8000`으로 proxy합니다. Backend(FastAPI)는 본 레포의 `backend/`에 포함됩니다 (모노레포).

```bash
bash /mnt/c/Users/beloz/Documents/start-omixai-backend.sh   # venv 자동 생성 + uvicorn :8000
# 또는 프론트와 한 번에:
bash /mnt/c/Users/beloz/Documents/start-omixai-ui.sh --with-backend --open
```

데이터 루트는 `OMIXAI_DATA_ROOT`(기본 `/mnt/c/Users/beloz/Documents/TPD_UI_DB` — repo 밖 형제 폴더, 대용량 이미지라 git 미추적). 자세한 실행 옵션은 [RUN.md](RUN.md), **데이터 레이아웃 규약(plate/약물 폴더명·time-lapse 파일명 등)은 [backend/README.md](backend/README.md#데이터-레이아웃-규약)** 참조.

자세한 폴더 구조 / 핵심 인터랙션(양방향 Landscape↔PPI 등) / 디자인 토큰 변경 진입점은 [frontend/HANDOFF.md](frontend/HANDOFF.md) 참조.
