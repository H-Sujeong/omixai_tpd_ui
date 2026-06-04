# omixai_tpd_ui — 실행 가이드 (WSL 기반)

이 프로젝트의 Node / Python 환경은 **WSL 안**에 설치돼 있어 dev 서버도 WSL에서 띄웁니다.

## 파일

| 경로 | 역할 |
|---|---|
| `C:\Users\beloz\Documents\start-omixai-ui.sh` | 메인 런처 (Vite + 옵션: 백엔드, Cloudflare Tunnel) |
| `C:\Users\beloz\Documents\start-omixai-backend.sh` | 백엔드(FastAPI) 단독 런처 |
| `C:\Users\beloz\Documents\start-omixai-ui.ps1` | Windows 측 wrapper — 내부에서 `wsl bash …` 호출 |

## 빠른 시작 (백엔드까지 한 번에)

WSL 터미널에서:
```bash
bash /mnt/c/Users/beloz/Documents/start-omixai-ui.sh --with-backend --open
```

이 한 줄이:
1. 백엔드가 8000 포트에 떠있으면 재사용, 아니면 background 로 기동 → ready 될 때까지 대기
2. (최초 1회) `npm install`
3. Vite dev 서버를 5174 포트에 띄움
4. Windows 기본 브라우저로 자동 오픈
5. **Ctrl+C 한 번으로 Vite + 백엔드 + (옵션) 터널 전부 정리**

### Windows PowerShell 에서 똑같이
```powershell
cd C:\Users\beloz\Documents
.\start-omixai-ui.ps1 --with-backend --open
```
(처음 막히면 1회: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`)

## 옵션

| 플래그 | 효과 |
|---|---|
| `--with-backend` | FastAPI 백엔드를 같이 띄움. **이미 떠있으면 새로 안 띄우고 재사용**. 통합 모드에서는 reload 비활성화(프로세스 트리 단순화). |
| `--public` | Cloudflare Tunnel로 인터넷 노출. `https://*.trycloudflare.com` 발급 + Windows 클립보드 복사 |
| `--open` | 시작되면 Windows 기본 브라우저로 자동 오픈 |
| `--port 5175` | Vite 포트 변경 (기본 5174) |
| `--backend-port 8001` | 백엔드 포트 변경 (기본 8000) |

조합 예:
```bash
bash /mnt/c/Users/beloz/Documents/start-omixai-ui.sh --with-backend --public --open
```

## 백엔드만 단독 실행

```bash
bash /mnt/c/Users/beloz/Documents/start-omixai-backend.sh
```

옵션:

| 플래그 | 효과 |
|---|---|
| `--port 8001` | 포트 변경 |
| `--host 0.0.0.0` | WSL 외부에서도 접근 가능 (reload 자동 비활성) |
| `--no-reload` | watch 비활성 (단일 프로세스) |
| `--data-root /path` | `OMIXAI_DATA_ROOT` 덮어쓰기 (기본 `/mnt/c/Users/beloz/Documents/TPD_UI_DB`) |

OpenAPI 문서: <http://127.0.0.1:8000/docs>

## 접근 방법

### 로컬 (Windows 호스트)
- UI:      `http://localhost:5174/`
- 백엔드 API:  `http://localhost:8000/`
- 백엔드 Docs: `http://localhost:8000/docs`

(WSL2의 localhost 자동 포워딩 덕분에 Windows 브라우저에서 그대로 접근)

### LAN (같은 Wi-Fi의 다른 기기)
WSL2 기본 네트워킹은 NAT라 Windows LAN IP로 바로 못 옵니다. 두 가지 중 하나를 1회 설정:

**방법 A — Windows 포트프록시 (관리자 PowerShell, 1회만)**
```powershell
netsh interface portproxy add v4tov4 listenport=5174 listenaddress=0.0.0.0 connectport=5174 connectaddress=<WSL_IP>
New-NetFirewallRule -DisplayName "omixai_tpd_ui 5174" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private,Domain
```
WSL IP는 WSL 재시작마다 변경 → 매번 갱신 부담. 런처가 실행 시 명령 한 줄을 IP 채워서 출력해줍니다.

**방법 B — WSL mirrored networking (Windows 11 22H2+ 권장, 영구)**
`%USERPROFILE%\.wslconfig`:
```
[wsl2]
networkingMode=mirrored
```
적용: PowerShell `wsl --shutdown` → WSL 재진입. 이후 WSL의 0.0.0.0 바인딩이 곧장 LAN에 노출됨 (포트프록시 불필요).

### 인터넷
`--public` 사용 시 발급되는 `https://<랜덤>.trycloudflare.com`을 공유. HTTPS 자동.
- 매 실행마다 새 URL. 영구 URL은 ngrok reserved domain 또는 Cloudflare named tunnel 필요 (별도)
- cloudflared 가 WSL 에 없으면 GitHub releases 에서 `~/.local/bin/cloudflared` 로 자동 다운로드

⚠️ **인터넷 노출 주의**: dev 서버는 소스맵/HMR이 그대로 노출됨. 인증 없음. 데모/프리뷰 용도만.

## 종료

| 상황 | 방법 |
|---|---|
| 정상 종료 (Vite + 백엔드 + tunnel 한 번에) | 실행 중인 터미널에서 **Ctrl+C** — 스크립트 trap이 전부 정리 |
| 백엔드만 따로 띄운 경우 | 그 터미널에서 Ctrl+C |
| 잔여 확인 (WSL) | `pgrep -af 'cloudflared\|vite\|uvicorn\|node.*vite'` |
| 강제 정리 (WSL) | `pkill -f cloudflared; pkill -f vite; pkill -f uvicorn` |
| 포트 점유 확인 (Windows) | `Get-NetTCPConnection -LocalPort 5174,8000 -ErrorAction SilentlyContinue` |
| 포트프록시 제거 (Windows, 관리자) | `netsh interface portproxy delete v4tov4 listenport=5174 listenaddress=0.0.0.0` |
| 방화벽 룰 제거 (Windows, 관리자) | `Remove-NetFirewallRule -DisplayName "omixai_tpd_ui 5174"` |

## 백엔드 동작 메모

- 데이터 루트 기본값: `/mnt/c/Users/beloz/Documents/TPD_UI_DB`
- `OMIXAI_DATA_ROOT` 환경변수 또는 `--data-root` 로 덮어쓰기
- 백엔드 미실행 시 UI는 보이지만 `/api/v1/...` 호출이 502/504 (vite proxy 가 거절). DevTools Network 탭에서 확인.
- `--with-backend` 통합 모드는 backend 의 reload 를 끕니다. 파일 변경마다 자동 재시작이 필요하면 백엔드를 별도 터미널에서 `start-omixai-backend.sh` 로 따로 실행하세요.

## 통합 모드 동작 / 트레이드오프

| 측면 | 동작 |
|---|---|
| 백엔드 ready 대기 | 8000 포트 TCP 응답 폴링, 최대 60초. 그 안에 못 뜨면 backend log tail 띄우고 종료. |
| 이미 떠있는 백엔드 | TCP probe 로 감지해서 새로 안 띄우고 재사용 (포트 두 번 잡지 않음). |
| Backend reload | 통합 모드에선 `--no-reload`. 파일 변경 자동 재시작 원하면 단독 실행. |
| Log 출력 | 백엔드 로그는 `/tmp/omixai-backend.XXXX.log` 에 저장. Vite 로그는 stdout. 종료 시 백엔드 로그 경로를 안내 (디버깅용 보존). |
| 종료 처리 | `trap cleanup EXIT INT TERM` 으로 자식 워커까지 `pkill -P` + `kill -TERM` |
| 실패 시 | 백엔드가 60초 내 안 뜨면 그 즉시 종료 + 마지막 40줄 stderr 출력 |

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `vite는 내부 또는 외부 명령...` (Windows) | Windows 측에서 직접 `npm run dev` 시도. WSL 에서 실행하세요. |
| `node not in WSL PATH` | WSL Node 미설치. `nvm` 추천: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh \| bash` → `nvm install --lts` |
| UI는 뜨는데 데이터 없음 | 백엔드 미실행. `--with-backend` 추가 or 단독 실행. DevTools Network 에서 `/api/...` 응답 확인. |
| 백엔드 startup 60초 timeout | 데이터 루트가 큰 경우 첫 로딩 오래 걸림. 단독 실행 후 로그 확인. |
| LAN 에서 안 열림 | 위 LAN 섹션의 방법 A 또는 B 적용 |
| `EADDRINUSE` | `pkill -f vite` / `pkill -f uvicorn` 후 재시도. 또는 `--port` / `--backend-port` 변경 |
| Cloudflare URL 안 뜸 | `cloudflared --version` 직접 / 사내망에서 Cloudflare 차단 가능 |
| WSL IP 가 매번 바뀜 | LAN 방법 B (mirrored networking) 권장 |
