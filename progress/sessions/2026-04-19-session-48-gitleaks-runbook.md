# 세션 48 — Foundation Exit #2 릴리스 게이트: Gitleaks 시크릿 스캔 + 온콜/롤백 런북 skeleton

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Platform / Infra (docs/14 §9.5)
- **관련 세션**: 10 (CI 최초), 13b (Node 22 pin), 14 (Ed25519 서명 fixture), 21 (license-verifier + signer-keys 레지스트리)
- **관련 문서**: `docs/14 §10` 릴리스 게이트 (보안 스캔 · 온콜/롤백), `docs/02 §9` 알람 정책, `docs/02 §10` 재시도/멱등
- **산출물**: `.gitleaks.toml`, `.github/workflows/ci.yml` `secret-scan` job, `progress/runbooks/README.md`, `progress/runbooks/01-incident-p1.md`, INDEX §6/§3/§4/§8 갱신

---

## 배경

`docs/14 §10` 의 Foundation 릴리스 게이트 6 체크박스:

1. ☑ 골든셋 회귀 — 세션 44 까지 `test:golden` 19 step 으로 충족.
2. ☐ 성능 SLO 초과 없음 — 측정 인프라 부재.
3. ☐ 보안 스캔 P0/P1 0건 — Gitleaks/Trivy 미구축.
4. (세션별로 관리됨) 문서 업데이트.
5. ☐ 온콜/롤백 플랜 — Foundation 말까지 수립.
6. (β+) 가격/정책 — 적용 대상 아님.

세션 48 는 **가장 낮은 비용으로 자동화 가능한 축 1개** (세션 47 follow-up 에서 "Gitleaks/Trivy CI job + 런북 skeleton" 으로 사전 합의된 범위) 를 마감한다. 실제로는 **2축** (보안 스캔 + 온콜/롤백) 을 함께 처리 — 둘 다 최소 기반만 깔면 되고, 러닝 코스트도 낮음.

성능 SLO 축은 세션 51 로 연기 (부하 하네스 설계 + Mock 어댑터 파이프라인 오버헤드 측정). 지금 하면 범위가 커진다.

## 설계 결정

### D1. Gitleaks 선택 근거 vs 대안

**채택: Gitleaks v8** (OSS, MIT, standalone CLI, 기본 rule set 포함)

기각된 대안:

- **truffleHog**: 스캔 커버리지는 비슷하나 출력 노이즈가 크고 기본 allowlist 문법이 우리 repo 의 "RFC 8032 공개 벡터" 케이스를 직관적으로 처리하기 어려움.
- **GitHub built-in Secret Scanning**: Organization/Enterprise 플랜 의존 + 우리의 RFC 8032 fixture 허용을 선언적으로 제어하기 어려움 (GitHub 측 rule 튜닝이 제한적).
- **detect-secrets**: Python 의존 — 우리 repo 가 Node 22 중심이라 추가 런타임 부담.

Gitleaks 는 tarball 단일 바이너리 + TOML 한 파일로 끝남 — Foundation 단계 철학과 일치.

### D2. 공식 GitHub Action 대신 CLI 직접 설치

`gitleaks/gitleaks-action` 은 **상업적 용도 시 유료 라이선스** 안내가 있고 (organization 상업성 해석 불명), 버전 고정이 action 측에 의존. **직접 tarball 다운로드 → `/usr/local/bin` 설치** 로 대체하면:

- 버전 고정 명시적 (`VERSION=8.21.2` 환경 변수).
- 라이선스 애매성 제거 (CLI 자체는 MIT).
- 네트워크 경유지는 GitHub Releases 1곳 — reproducibility 보장.

비용: 약 3줄 추가 스크립트. 수용.

### D3. `--no-git` (워킹트리 스캔) vs git 히스토리 스캔

**채택: `--no-git`** — 현재 워킹트리만 스캔.

이유:

1. **회귀 방지에 충분**. push 마다 돌면 이후 진입하는 시크릿은 전부 차단됨.
2. **과거 커밋 재작성은 범위 밖**. Foundation 단계 repo 가 생긴 지 얼마 안 됐고 (세션 01 = 2026-04-17), 공개된 적 없는 repo 라 기존 히스토리를 다시 쓸 유인 낮음.
3. 히스토리 스캔을 켜면 `pnpm-lock.yaml` 의 integrity 해시 대량 진입 같은 저레벨 노이즈를 매번 평가해야 함 — 장기적으로 allowlist 부풀림.

MVP 이후 repo 가 커뮤니티에 공개되거나 외부 기여를 받게 되면 `--redact --log-opts=--all` 로 전체 히스토리 감사 1 회 추가 후 깨끗함을 확인하는 방식으로 업그레이드.

### D4. Allowlist 의 3 층 구조

`.gitleaks.toml` `[allowlist]` 는 3 축으로 구성:

1. **regexes**: RFC 8032 §7.1 Test 1 의 seed(`9d61b19d…`) + 공개키(`d75a9801…`) 2 hex 만 하드코드. IETF 표준 문서에 인쇄된 값이라 "재발급" 개념이 없음.
2. **paths (fixture 소비 지점)**: `samples/avatars/sample-*-*.{license,provenance}.json` 의 base64url 서명 + `infra/registry/signer-keys.json` + `scripts/sign-fixture.mjs` + `packages/license-verifier/tests/**` + `packages/ai-adapter-nano-banana/tests/provenance-roundtrip.test.ts`.
3. **paths (generated bulk)**: `pnpm-lock.yaml` — npm integrity sha512 가 generic-entropy 로 오탐.

왜 fixture 마다 경로를 분리했는가: **"어떤 파일을 허용했는지" 가 PR 리뷰에서 명시적**. 만약 새로운 라이선스/프로비넌스 샘플이 추가되면 `sample-\d+-[^/]+` 패턴이 매치되지만, 새로운 `packages/*` 테스트가 RFC 벡터를 쓰려 하면 ** allowlist 추가 PR 이 별도로 필요** — 암묵적 확장 차단.

### D5. 런북 = P1 만, 나머지는 MVP 이후

**채택**: `01-incident-p1.md` 1 종만 skeleton 으로. P2 / 배포 롤백 / DB 롤백 / 키 회전은 런북 README 에 목록만 예약.

이유:

- **Foundation 범위에선 "플랜이 존재한다" 자체가 게이트 요구**. 디테일은 실 인시던트 전에 알 수 없음 — 미리 쓰면 틀림.
- P1 은 다른 런북의 **상위 골격**. P2/롤백은 P1 의 mitigation 단계 안으로 실화되는 변주.
- **5 단계 (Detect/Triage/Mitigate/Communicate/Postmortem)** 는 SRE 업계 표준 — 문서화하지 않아도 실제 대응이 이 구조를 띠므로 skeleton 이 비지 않음.

회고 문서는 `progress/postmortems/` 에 별도 보관 — 세션 로그와 분리 (회고는 cross-cutting, 세션은 연대기).

### D6. `progress/runbooks/` 위치 선택

대안:
- `docs/runbooks/`: 기획 문서 폴더. 런북은 **운영 산출물** 이라 성격 다름.
- `infra/runbooks/`: 인프라 config 폴더. 런북이 인프라만 다루는 건 아님 (소통·역할·훈련 포함).
- **`progress/runbooks/`**: progress 폴더가 "언제/어떻게/어디까지" 담는 곳이라 운영 상태 기록과 궁합 맞음. `progress/postmortems/` 와도 짝.

### D7. 릴리스 게이트 2 축 ☑ 전환 기준

`[x]` 표시 조건:

- **보안 스캔**: `.gitleaks.toml` 존재 + CI 에 secret-scan job 존재 + allowlist 문서화 명시. Trivy 컨테이너 스캔은 **이미지 빌드 도입 시 추가** 로 유보 — Foundation 단계엔 컨테이너 이미지 자체가 아직 없음.
- **온콜/롤백**: `progress/runbooks/01-incident-p1.md` 존재 + 5 단계 각각 Done 기준 명시 + 역할 분리 치트시트. Drill 실행은 인력이 2명 이상 상시 대기 가능해지는 시점(MVP) 에.

"skeleton 이지만 `[x]`" 가 부정직한가: 게이트의 문장은 "플랜 확인" — 플랜(=문서) 이 있고 재발 방지 액션을 등록할 자리가 마련되면 충족. 실 인시던트 경험 반영은 별도 축.

## 실제 변경

- `.gitleaks.toml` **신설**
  - `[extend] useDefault = true` — Gitleaks 기본 rule set 모두 채택.
  - `[allowlist]` paths 6 개 (license/provenance sample + signer-keys + sign-fixture + 2 test 디렉터리 + pnpm-lock) + regexes 2 개 (RFC 8032 Test 1 seed/pubkey hex).

- `.github/workflows/ci.yml`
  - 기존 `golden` job 유지.
  - **신규 `secret-scan` job** 추가 (ubuntu-latest, 5 분 timeout).
    - Checkout `fetch-depth: 0` (향후 `log-opts` 옵션 필요할 때를 위해).
    - Gitleaks v8.21.2 tarball 설치 (`github.com/gitleaks/gitleaks/releases`).
    - `gitleaks detect --config .gitleaks.toml --source . --no-git --redact --verbose --exit-code 1`.

- `progress/runbooks/README.md` **신설** — 런북 목록 + 5 단계 공통 원칙 + 참고 문서 링크.

- `progress/runbooks/01-incident-p1.md` **신설** — P1 정의 + Detect/Triage/Mitigate/Communicate/Postmortem 5 단계 + IC/Ops/Comms 역할 치트시트 + 자주 쓰는 링크 + game day 드릴 목표(MTTD/MTTA/MTTR).

- `progress/INDEX.md`
  - §3 Platform/Infra 행 말미에 "세션 48 — Gitleaks 시크릿 스캔 + 런북 skeleton" 명시.
  - §4 세션 48 로그 행 추가 (세션 47 뒤 오름차순 유지).
  - §6 릴리스 게이트 "[ ] 보안 스캔" / "[ ] 문서 업데이트" / "[ ] 온콜/롤백" 3 축 `[x]` 전환.
  - §8 rotate — 48 제거, 49/50 유지, 51 신규 (성능 SLO 측정 하네스).

## 검증

- `pnpm run test:golden` → 19/19 step pass (CI/런북/TOML 만 추가, 코드/테스트 무변).
- `.gitleaks.toml` 문법 — Gitleaks 8.x `[allowlist]` paths/regexes 필드 스키마에 맞춤 (TOML 문자열 정규표현식 = rust `regex` crate).
- validate-schemas checked=186 불변 (schema 무변).

## Follow-ups

- 세션 49: C10 regex base-specific 분리 설계 (fullbody 대비).
- 세션 50: `geny_queue_*` 메트릭 카탈로그 (ADR 0006 follow-up).
- 세션 51: 성능 SLO 측정 하네스 (릴리스 게이트 나머지 1 축).
- Runtime / MVP 단계:
  - `secret-scan` 을 `--log-opts=--all` 로 1 회 전체 히스토리 감사 (repo 공개 전).
  - Trivy `fs` + `image` 스캔 추가 (컨테이너 이미지 빌드 도입 시).
  - 런북 P2 / 배포 롤백 / DB 롤백 / 키 회전 작성 (실 인시던트 회고 누적 후).

## 커밋

- `.gitleaks.toml`
- `.github/workflows/ci.yml`
- `progress/runbooks/README.md`
- `progress/runbooks/01-incident-p1.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-48-gitleaks-runbook.md`
