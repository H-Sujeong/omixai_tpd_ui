# OmixAI-TPD backend

FastAPI 서비스 — `TPD_UI_DB` 폴더를 in-memory로 로드해 Plate / Drug / Dashboard / PPI / Landscape / Time-lapse 데이터를 제공합니다. 본 백엔드는 `omixai_tpd_ui` 레포의 `backend/`에 포함됩니다(모노레포).

## 데이터 위치

기본값: `OMIXAI_DATA_ROOT` 환경변수, 미설정 시 `/mnt/c/Users/beloz/Documents/ui_workspace/TPD_UI_DB`.

```bash
export OMIXAI_DATA_ROOT="/mnt/c/Users/beloz/Documents/ui_workspace/TPD_UI_DB"
```

## 실행

```bash
# 권장: 런처 (venv 자동 처리)
bash /mnt/c/Users/beloz/Documents/start-omixai-backend.sh           # uvicorn :8000
bash /mnt/c/Users/beloz/Documents/start-omixai-ui.sh --with-backend # 프론트와 함께

# 수동
cd /mnt/c/Users/beloz/Documents/ui_workspace/omixai_tpd_ui/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> ⚠️ 이 WSL에는 `python3-venv`가 없어 `python3 -m venv`가 실패할 수 있습니다. 그 경우 `sudo apt install python3.12-venv` 한 번 설치하거나, 기존 작동 venv를 복사해 `pyvenv.cfg`/`bin/*`의 절대경로만 치환해 재사용합니다. 런처는 작동 venv가 있으면 그대로 씁니다.

OpenAPI 문서: <http://127.0.0.1:8000/docs>

## 데이터 레이아웃 규약

> 아래 규칙은 백엔드 로더(`app/data_loader.py`, `app/domain/dashboard.py`)가 실제로 파싱하는 방식을 정리한 것. **새 plate/약물/이미지를 추가할 때 반드시 따를 것.**

```
<OMIXAI_DATA_ROOT>/                         # 기본 TPD_UI_DB/
  plate_<PLATE>/                            # plate 1개 (예: plate_D3_10)
    D<n>_<m>_gr.csv                         # ★ 이 패턴 CSV가 있어야 "plate"로 인식
    D<n>_<m>_slope_class.csv                #   (D\d+_\d+_(gr|slope_class)\.csv)
    D<n>_target.csv                         # drug→target, E3 ligase, SMILES
    drug_group_summary.json
    target_map_clean.json                   # 카테고리 → target 리스트
    plate.py                                # well번호("305") → drug_name/hy_code/alias
    mosaic_4h/                              # plate 전체 timelapse (fallback)
      r{RR}_c{CC}_{H}h0.png                #   예: r03_c05_4h0.png
    <drug_id>/                              # 약물 1개 — 폴더명 = 정규 drug_id (아래)
      <TARGET>_<WELL>/                      # 예: BRD4_C05 (멀티타깃이면 여러 개)
        landscape.json
        on_target.json                      # ← json 유무 = dashboard asset 여부
      timelapse/
        {WELL}_{H}h_{N}cells.png            # 예: C05_0.5h_3056cells.png
```

### 핵심 규칙

- **Plate 인식**: 폴더에 `D\d+_\d+_(gr|slope_class).csv`가 있어야 백엔드가 plate로 등록. 메타 CSV가 없는 plate(예: 현재 `plate_D3_3`)는 drug 폴더가 있어도 `/api/v1/plates`에 **안 뜸**.

- **`drug_id` = 폴더명 규칙**: `drug_id = slugify(drug_name).lower()`. `slugify`는 `[^a-zA-Z0-9._-]+`를 `-`로 치환(= 공백·괄호·슬래시·`α` 등 → `-`, **언더스코어·점·하이픈은 보존**).
  - 예: `PROTAC BET degrader-1` → `protac-bet-degrader-1`, `MS9427 (TFA)` → `ms9427-tfa`, `dBET6` → `dbet6`.
  - ⚠️ **함정**: 사람이 만든 `PROTAC_BET_Degrader-1`(언더스코어)는 위 slug(하이픈)와 **불일치** → 백엔드가 자산을 연결 못 함. **드러그 폴더는 반드시 정규 `drug_id`(소문자·하이픈)로 명명**할 것. 정규 drug_id 목록은 레지스트리에서 `get_registry().list_plates()[0].drugs.keys()`로 얻음.

- **asset(=dashboard PPI/landscape) 기준**: 드러그 폴더 안에 `on_target.json` 또는 `landscape.json`이 있을 때만 `has_dashboard_assets=true`. **폴더만 있고 json이 없으면 자산 아님**(빈 timelapse-전용 폴더는 asset로 안 셈).

- **target 하위폴더명**: `<TARGET>_<WELL>` (예 `BRD4_C05` = target BRD4, well C05). 이름의 well suffix가 plate.py well 매핑과 일치해야 함.

- **DMSO** well(컬럼 1·12, row H 등 컨트롤)은 약물이 아님 → 70개 약물 집계에서 제외.

### Time-lapse 규약

- **원본 이미지**: `Documents/TimeLapse/<PLATE>/<WELL>/` — well별 폴더(96 well), well당 **97프레임**(0~48h, **0.5h 간격**), 파일명 `{WELL}_{H}h_{N}cells.png`(`{N}cells` = 그 시점 세포수).
- **배치**: 약물별 `<drug_id>/timelapse/`에 그 약물 well의 97프레임을 **이름 그대로** 복사.
- **파서**(`dashboard._frames_from_drug_assets`): 파일명에서 시간(**소수점 허용**)·`{N}cells` 파싱. 구형 mosaic 이름 `r{RR}_c{CC}_{H}h0.png`도 호환. `n_cells_t0`는 t=0 프레임 파일명에서 추출.
- **fallback**: 약물에 `timelapse/`가 없으면 plate `mosaic_4h/`에서 해당 well 프레임 사용.
- **표시 간격은 UI 옵션**: 백엔드는 **전체 프레임을 반환**하고, 프론트(`TimeLapseViewerPanel`)가 간격(0.5/1/2/4/6/12h)으로 **클라이언트 subsample**. 한 번에 1프레임만 lazy 로드 → 로딩속도 영향 없음. (간격은 데이터가 아니라 UI 설정)

### 신규 plate / 약물 추가 절차

1. **plate**: `plate_<PLATE>/`에 `D<n>_<m>_gr.csv` 등 메타 CSV + `plate.py`(well→drug) 배치 → 그래야 plate로 인식됨.
2. **약물**: `plate_<PLATE>/<drug_id>/` 생성(정규 drug_id 명). dashboard 자산이 있으면 `<TARGET>_<WELL>/{landscape,on_target}.json` 추가.
3. **time-lapse**: `<drug_id>/timelapse/`에 `TimeLapse/<PLATE>/<WELL>/`의 97프레임 복사.

## 주요 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/plates` | 분석 (plate) 목록 |
| GET | `/api/v1/plates/{plate_id}/drugs` | 해당 plate 내 약물 summary 테이블 |
| GET | `/api/v1/plates/{plate_id}/drugs/{drug_id}/dashboard?target=BRD3` | 약물 대시보드 단일 호출 (target 지정 가능) |
| GET | `/api/v1/plates/{plate_id}/drugs/{drug_id}/communities/{community_id}?target=BRD3` | 다른 community로 PPI 패널 재구성 |
| POST | `/api/v1/plates/{plate_id}/drugs/{drug_id}/communities/switch` | 노드 클릭으로 community 전환 |
| GET | `/api/v1/plates/{plate_id}/drugs/{drug_id}/interactome/{node_id}` | E12 Level 2 (ego + GO + decay) |
| GET | `/api/v1/files/mosaic/{plate_id}/{filename}` | mosaic_4h timelapse 이미지 |
| GET | `/api/v1/files/drug-asset/{drug_id}/timelapse/{filename}` | 약물 폴더 내부 timelapse 이미지 |

## 드러그 메타 크롤링

UniProt / MedChemExpress 가벼운 조회 (timeout, throttle 포함):

```bash
python -m scripts.crawl_drug_info               # 전체
python -m scripts.crawl_drug_info --limit 5     # 가볍게 검증
```

결과는 `backend/var/drug_info_cache.json` 에 저장되며, 다음 실행 시 누락된 항목만 채웁니다. 캐시가 있으면 dashboard 응답의 reference / pathway / moa 필드가 자동으로 풍부해집니다.
