# Target Landscape의 anchor 미형성 & PPI 커뮤니티의 고립 노드

> 논의용 문서. 두 가지 자주 묻는 현상을 파이프라인 로직(`tpd_prot_pipeline/`)
> 기준으로 설명한다.
> 1. 타깃이 **proteomics에서 검출(measured)** 됐는데 landscape의 **anchor(✚)** 가
>    안 찍히고, 그런데도 **PCC**는 계산되는 이유
> 2. 커뮤니티를 클릭하면 PPI에서 **연결이 하나도 없는 단백질**이 한쪽에 떠 있는 이유

코드 레퍼런스는 `tpd_prot_pipeline/tpd_export/` 기준 `파일:라인`.

---

## 1. "측정은 됐는데 anchor가 안 된" 타깃 — 그래도 PCC는 나오는 이유

### 1.1 "타깃이 있다"는 두 개의 서로 다른 조건

| 조건 | 의미 | 산출물 |
|---|---|---|
| **measured** | 타깃이 proteomics/상관 행렬 `corr_real`에 존재 | **PCC (landscape z)** |
| **anchored** | 타깃이 size>20 PPI 커뮤니티의 멤버 (`target_have`) | **거리축(x) + ✚ target_point** |

이 둘은 **다른 데이터에서** 나온다. 그래서 한쪽만 성립할 수 있다.

### 1.2 PCC(z축)는 anchor와 무관하게 계산된다

landscape z = `target_corravg` = 커뮤니티 멤버들과 타깃의 평균 상관:

- `pipeline.py:151` — `target_corr_vec = corr_real.loc[target_name, :]`
- `community.py:99-100` — `target_corr = target_corr_vec[community_index]` → `mean`

즉 **타깃의 발현-상관 row 하나**만 있으면 모든 커뮤니티에 대해 z가 계산된다.
PPI 네트워크 멤버십과 무관하다. (타깃이 `corr_real`에도 없으면 — 즉 진짜 미측정이면 —
`_process_targets`가 그 타깃을 통째로 건너뛴다: `pipeline.py:400` → landscape 자체가 안 생김.)

### 1.3 anchor(✚)는 추가로 "큰 커뮤니티 소속"을 요구한다

거리축 x = "anchor(=타깃 커뮤니티)로부터의 hop 거리". 이건 타깃이 PPI 그래프에서
큰 모듈에 묶여야 의미가 생긴다. 타깃이 anchor가 되려면 **3중 필터**를 통과해야 한다:

| 필터 | 값 | 위치 | 탈락 시 |
|---|---|---|---|
| STRING 신뢰도 | `confid_score=400` | `ppi.py`, `config.py:53` | 타깃이 PPI에서 고립 노드 |
| 상관 유의성 | `corr_pval_cutoff=0.10` | `weights.py:39` | W 엣지 소멸 |
| 커뮤니티 크기 | `commu_size=20` | `community.py:102`, `config.py:63` | comms_df에서 제외 |

`W = P ⊙ R ⊙ g` (PPI 인접 ∩ 유의상관 ∩ 노드가중). 타깃의 STRING 파트너가 400 미만이거나,
공발현이 p<0.10을 못 넘기면 → W에서 고립 → 싱글톤 커뮤니티 → `commu_size>20`에서 탈락 →
`target_have=False` → **anchor 미형성**.

### 1.4 anchor 상태는 export에 라벨로 박힌다

`compute_target_meta` (`export.py:246-303`)가 세 가지로 분류하고
`landscape.json`/`on_target.json`에 `target_meta` + `target_point.source`로 기록한다:

| label | 조건 | target_point | UI 표시 |
|---|---|---|---|
| `in_community` | 큰 커뮤니티 멤버 | 실제 커뮤니티 좌표 / `source=anchor_community` | ✚ 정상 위치 |
| `isolated_in_ppi` | PPI 노드지만 size>20 커뮤니티 미소속 | `x=0, z=1.0` / `source=target_node_self` | ✚ 좌측(자기 자신 anchor) |
| `absent_from_ppi` | PPI 노드도 아님 | `{0,0,0}` / `source=placeholder` | ✚ 미표시 |

> 참고: `ppi.py`는 측정된 모든 단백질을 노드로 추가하므로(`add_nodes_from(expr_index - nodes)`),
> measured 타깃은 보통 최소 `isolated_in_ppi`다. `{0,0,0}` placeholder는 타깃명이 PPI 노드명과
> 매칭 안 되거나 구버전 export에서 나온다.

### 1.5 결과 — "반쪽짜리" landscape

`target_have=False`(anchor 미형성)이면:

- **z(PCC) 표면**: 진짜 데이터 ✅ ("타깃 발현과 함께 변동하는 정도")
- **x(거리)**: `ppi_dist.get(target,{}).get(g, 99)` → 타깃이 PPI 고립이면 전부 99로 붕괴
  (`community.py:96`) → 거리축 무의미
- **✚ target_point**: self-anchor(x=0,z=1) 또는 placeholder

즉 "표면 높이/색은 진짜, 거리축과 ✚만 빠진" 상태다.

### 1.6 핵심 증거 — run마다 갈린다

같은 타깃이 어떤 약물에선 anchor 되고 다른 약물에선 안 된다 (커뮤니티 구조는 그 run의
proteomics 상관에서 새로 계산되므로). 예: BRD9는 FHD-609/dBRD9/degrader-7에선 anchored,
DBr-1/degrader-6에선 미형성. → "타깃이 없어서"가 아니라 **그 데이터셋의 모듈 구조** 때문.

---

## 2. 커뮤니티 안에 "연결 없는 단백질"이 떠 있는 이유

### 2.1 멤버십과 표시 엣지는 서로 다른 그래프에서 온다

- **커뮤니티 멤버십** = 가중 그래프 `W = P ⊙ R ⊙ g` 위에서 **Louvain × N + consensus**
  (co-association 행렬 → average-linkage clustering, `community.py` `coassoc_matrix`/
  `consensus_from_coassoc`). W는 PPI **그리고** 유의상관 **그리고** 노드가중을 곱한 것.
- **화면에 그리는 엣지** = `ppi_net.subgraph(members)` 의 **STRING 엣지(≥400)** 뿐
  (`export.py:84-103`). 상관(R)으로 묶인 연결은 엣지로 안 그린다.

### 2.2 그래서 멤버지만 커뮤니티 내 엣지가 0인 노드가 생긴다

한 노드가 커뮤니티 C에 들어간 건 "여러 Louvain run에서 C의 멤버들과 자주 같이 묶였기"
때문(공발현 R + 약한 PPI + 가중 g의 조합)이다. 그런데 그 노드의 **고신뢰 STRING 파트너가
전부 다른 커뮤니티에 흩어져** 있으면, C의 subgraph 안에서는 엣지가 하나도 안 생긴다 →
**고립 노드**. fcose 레이아웃이 엣지 없는 노드를 바깥(한쪽)으로 밀어낸다.

### 2.3 실제 예시 (real 데이터)

`AU-24118 / SMARCA4_A02` 커뮤니티 145 (nodes=89, edges=495):

```
RBSN  corr=0.13  degree=9  is_target=False  → 커뮤니티 145 내 엣지 0개
```

`degree=9`는 **전체 PPI 네트워크에서의 연결 수**다(노드 속성, `export.py:88`).
RBSN의 9개 파트너가 모두 커뮤니티 145 밖에 있어서, 145의 subgraph에서는 0 엣지로 뜬다.

> 주의: 노드에 표시되는 `degree`는 전역 degree라서 **0이 아닐 수 있다**. "연결 없음"은
> 커뮤니티 *내부* 엣지가 없다는 뜻이지, 그 단백질이 PPI에서 아무 데도 안 붙는단 뜻이 아니다.

### 2.4 요약

| 질문 | 답 |
|---|---|
| 왜 커뮤니티에 들어갔나? | W(PPI∩상관∩가중) 위 consensus 클러스터링이 공발현 등으로 묶음 |
| 왜 엣지가 없나? | 표시 엣지는 STRING(≥400)만 — 그 노드의 STRING 파트너가 다른 커뮤니티에 있음 |
| degree는 왜 >0? | degree는 전역 PPI 연결 수(노드 속성), 커뮤니티 내 연결 수가 아님 |
| 왜 한쪽에 배치? | fcose가 엣지 없는 노드를 주변부로 밀어냄 |

---

## 부록 — 관련 파일

| 주제 | 파일:라인 |
|---|---|
| target_corr_vec (PCC 소스) | `pipeline.py:151` |
| target_corravg / distance | `community.py:95-101` |
| commu_size 필터 | `community.py:102` |
| W = P⊙R⊙g | `weights.py:22-50` |
| 필터 기본값 | `config.py:53,57,63` |
| compute_target_meta (anchor 라벨) | `export.py:246-303` |
| 커뮤니티 PPI subgraph(표시 엣지) | `export.py:84-103` |
| Louvain consensus | `community.py` (`coassoc_matrix`, `consensus_from_coassoc`) |
| measured 타깃 skip | `pipeline.py:400` |
