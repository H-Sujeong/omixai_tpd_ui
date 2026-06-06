# UI 시각화 알고리즘 전수 재점검 (2026-06-06)

각 시각화에 쓰인 알고리즘을 데이터 출처(실데이터 / 휴리스틱 / 합성)와 정확성 기준으로 감사.
범례: ✅ 정상 · ⚠️ 주의(휴리스틱·일관성·표현) · 🔴 합성/하드코딩이 실데이터처럼 표시("합성하지마" 위반).

---

## 🔴 합성·하드코딩이 실데이터처럼 표시됨 (우선 조치)

| # | 항목 | 내용 | 위치 | 경고표시 |
|---|---|---|---|---|
| 1 | **Drug Mechanism summary** | `var/drug_info_cache.json`이 **없음** → 모든 약물에 `_MOA_TEMPLATE`("{drug} is a heterobifunctional PROTAC degrader…")가 Mechanism summary로 표시. molecular glue/비-PROTAC엔 사실과 다름. pathway도 group 기반 fallback. | `drug_info.py:52-71`, `InsightSidebar.tsx:40` | ❌ 없음 |
| 2 | **GR 시간축** | 실 CSV에 `frame_time_hr` 없음 → `10.0 + i*0.5` (10.0–23.5h)를 합성해 실제 촬영 시각처럼 x축·라벨·KPI창에 표시 | `data_loader.py:339-342`, `config.py:43-44` | ❌ 없음 |
| 3 | **n_cells_t0 = 2915** | cell count 없는 프레임(mosaic 출처)에서 하드코딩 2915를 측정 세포수처럼 표시 | `dashboard.py:826` | ❌ 없음 |
| 4 | **실험 메타데이터** | `"U2OS · 48h treatment · 4h imaging cadence"`·`treatment_hours=48`·`U2OS` 하드코딩. **timelapse는 0.5h 간격이라 "4h cadence"는 모순** | `dashboard.py:739,774,787` | ❌ 없음 |
| 5 | **Mechanistic Signatures (MoA)** | 현재 80개 자산 전부 `_meta.placeholder=true` (seed_moa_bars MD5 해시값), 실 moa_bars 0개. **단, ⚠ 배지로 표시됨(정직)** | `seed_moa_bars.py:50-54` | ✅ 있음 |

> 매핑 로직 자체(`_moa_bars_to_annotations`)는 충실 — 실데이터가 들어오면 그대로 동작. 문제는 "현재 표시되는 값이 가짜"라는 점.

---

## ⚠️ 정확성·일관성·표현 주의 (휴리스틱은 실데이터 기반이나 검토 필요)

| # | 항목 | 내용 | 위치 |
|---|---|---|---|
| 6 | **role 분류 이중화** | 백엔드 `_classify_role`(corr ≥0.5 활성 / ≤−0.3 억제 / 0.1 info)와 프론트 노드 색(±0.2)이 **불일치**. `role` 필드는 계산되지만 그래프 색엔 안 쓰임 → 툴팁/색이 서로 다른 얘기 | `dashboard.py:53-63` vs `PpiGraph.tsx:56-57` |
| 7 | **node_community_index 과대표기** | ego(1-hop) 증강이 클러스터 안 된 bridging 노드를 이웃 커뮤니티 멤버로 표기. `_ppi_panel_from_on_target`와 `_ppi_panel_for_community`가 같은 노드를 **다르게** 보고 | `dashboard.py:242-254` vs `305-312` |
| 8 | **2D/3D Distance축 방향 반대** | 2D 정방향 / 3D 역방향 → 모드 전환 시 좌우 미러, near/far 오인 가능 | `Landscape.tsx` 2D vs `xaxis.autorange:"reversed"` |
| 9 | **kernelSurface W0=0.04** | NW 가중평균에 baseline 추가로 **convexity가 깨짐** → sparse 영역에서 피크 높이를 밀도 의존적으로 과소표시. overshoot는 없으나 표면 높이가 실제 avg(PCC)와 다름(colorbar는 avg(PCC) 라벨) | `Landscape.tsx` kernelSurface |
| 10 | **Phenome Tracking DMSO 0선** | DMSO 궤적을 정의상 평평한 0으로 그리는데 "측정 vehicle 궤적"처럼 보임 | `dashboard.py:481` |
| 11 | **Target Confidence KPI** | 타깃 노드 corr 없으면 파트너 top-3 |corr| 평균으로 대체하면서 "PPI corr (target node)"로 라벨 | `dashboard.py:609-623` |
| 12 | **p=0.05 "significance cutoff"** | 다중검정 보정 안 된 ECDF 경험 p값에 고전적 "유의성 기준" 라벨. 3D에선 z=0 평면 위 선이라 의미 모호 | `Landscape.tsx` SIG_Y |
| 13 | **self-anchor y=0** | 프론트는 self-peak을 y=0(=p=1, 유의성 선 아래)에 둠. 파이프라인 정의(`y=-log10(self_p)`, 고유의성)와 모순 | `dashboard.py:389`, `Landscape.tsx` anchorPoint |
| 14 | **yClip이 표면도 바꿈** | −log10p 3×IQR 클립이 viewport뿐 아니라 surface 도메인/대역폭도 변경 → 같은 데이터가 outlier 유무로 다르게 평활 | `Landscape.tsx` surfaceGrid/yClip |

---

## ✅ 정상 (실데이터 + 알고리즘 정확)

- **PPI 파이프라인**: STRING(`max(exp,db)≥400`), `W=P⊙R⊙g`(p<0.10, std quantile-clip), Louvain×1000+consensus(res 2.0, cut 0.2, size>20) — 실데이터·정확.
- **PPI 렌더**: fcose `idealEdgeLength=45+(1-s)*125`, `edgeElasticity=0.1+s*0.45`, edge width `mapData(score,0,1000,0.5,4.5)`, node size `clamp(18+deg*1.5,18,60)`, 색=실 corr/is_target — 정상.
- **Landscape**: surface가 NW로 **bounded**(RBF overshoot 해결, 검증 완료), color norm symmetric(0=중립), yClip 정직(off-screen 카운트 표시), protein finder hops=hub BFS(정확).
- **GO Enrichment**: 실 community go_terms(score/pvalue/category), width=score/max — 정상.
- **GR y값**: 실측 CSV 값, `gr_score=relative_slope`(실 slope_class), growth_class 임계값은 실값 위 투명 휴리스틱.
- **Biomarkers**: 실 PPI(target 우선 + |corr| 상위 partner).
- **MoA quantization 로직**·upstream delta_z/ssGSEA — 충실(실데이터 들어오면 정상).
- **live path에 합성 PPI/landscape fallback 없음** — 자산 없으면 None→"데이터 없음".

## 🧹 죽은 코드
- `synthesize.py`의 `synth_ppi_panel`/`synth_landscape_panel`/가짜 GO 생성기 — **미사용(dead)**. `phenome_track_from_gr`(실데이터 변환)만 실사용. 사고 방지 위해 분리/삭제 권장.

---

## 권장 조치 우선순위
1. 🔴 #1 Drug MoA 텍스트 — 실 crawl 없으면 템플릿 대신 비우거나 "(placeholder)" 표기.
2. 🔴 #3 `n_cells_t0=2915` 제거 → cell count 없으면 null/미표시.
3. 🔴 #4 하드코딩 메타(48h/4h/U2OS) — 실값 없으면 표기 제거 또는 "미상", 최소한 "4h cadence" 모순 제거.
4. 🔴 #2 GR 시간축 — 파이프라인 `frame_time_hr` 재export가 정답(메모리 reference_gr_pipeline 참조).
5. ⚠️ #6 role 임계값 일원화(백엔드↔프론트), #9 W0 재검토, #13 self-anchor y, #8 축방향 일관화.
6. 🧹 synthesize.py 정리.
