# PLAN — 앞으로의 작업 (2026-04-20 기준, 세션 113+)

본 문서는 `SUMMARY.md` 의 현재 상태를 전제로, 다음 세션부터의 **우선순위 · 의존성 · 진입 조건 · 리스크** 를 정리한다. Foundation Exit 4/4 와 릴리스 게이트 3/3 이 닫힌 이후 단계이므로, 남은 작업은 (a) self-contained lint/안전망 확장, (b) legacy 호환성 정비, (c) 외부 의존 해소, (d) Runtime phase 전환 4 축으로 수렴한다.

---

## 0. 원칙

1. **self-contained 우선** — 외부 의존(cluster / 실 벤더 키 / 새 팀 리소스)이 없는 세션을 먼저 소화. 외부 블록이 풀린 시점에 한꺼번에 소화하지 않도록 분산.
2. **lint catalog 단일 책임** — `physics-lint` 안의 Cxx 는 각자 1 축. 한 세션에 2 축 묶지 말 것(세션 108 D5 선례).
3. **골든 불변식 보호** — sha256 기반 골든(halfbody v1.2.0/v1.3.0 aria+web-avatar, fullbody v1.0.0 zoe)은 의도된 변경 이외엔 건드리지 않음.
4. **ADR 0005 L1~L4 재확인** — 새 저자 개입이 발생하면 L1 migrator 자동패치 · L2 lint fatal · L3 저자 범위 · L4 파이프라인 불변식 각 축에서 누락이 없는지 역으로 훑기.
5. **매 세션 push** — `feedback_autonomous_sessions.md` 의무. 세션 doc `progress/sessions/` 에 추가 + `progress_0420/INDEX.md §1·§4` 최소 1 줄 갱신.

---

## 1. 블로커 지도

### 1.1 외부 의존 블로커 (지시 / 타팀 리소스 대기)

| 블로커 | 해소 조건 | 풀리면 열리는 세션 |
|---|---|---|
| **BL-STAGING** — K8s staging cluster access | 인프라팀 승인 + kubeconfig 배포 | 세션 96 (staging 배포) · observability 실 Prometheus 스크레이프 · E 단계 실 브라우저 preview |
| **BL-VENDOR-KEY** — 실 벤더 키 (nano-banana / sdxl / flux) | 각 벤더 계정 + quota | 실 벤더 분포 캡처(세션 88 D 후속) · BullMQ `attempts>1` 베이스라인 재캡처(세션 86 D6) |
| **BL-DEPRECATION-POLICY** — `docs/03 §7.3` 충돌 (legacy 수정 허용 범위) | 저자/PM 결정 — legacy minor-bump 허용인가 freeze 인가 | legacy v1.0.0~v1.2.0 `parameter_ids` opt-in 복제 (세션 105 D1 블로커 a) |

### 1.2 내부 블로커 (이 저장소 안에서 해소 가능)

| 블로커 | 해소 경로 | 선행 조건 |
|---|---|---|
| ~~**BL-MIGRATOR**~~ — ✅ 해소 (세션 111, `@geny/migrator@0.1.0`) | — | — |
| **BL-LEGACY-CONSUMER** — legacy opt-in 복제를 먹을 소비자 없음 | Runtime 소비자 합류 시 | 세션 97 Runtime 착수(세션 105 D1 블로커 c) |

> 세션 105 D1 의 3 블로커(docs/03 §7.3 / migrator 부재 / 소비자 없음) 중 (b) migrator 는 세션 111 에서 `@geny/migrator` 로 해소. (a)(c) 는 외부 의존 — 후보 C 착수는 둘 다 풀릴 때까지 대기.

---

## 2. 세션 후보 상세

### 후보 A — C13 deformer 트리 무결성 (세션 108 자연 연장) ✅ **완료 (세션 109)**

- **범위**: `scripts/rig-template/physics-lint.mjs` 에 C13 블록 추가 — 7 sub-rule (duplicate / root-missing / root-parent / parent-missing / non-root-null-parent / cycle / orphan).
- **산출**: physics-lint rule 12→**13**, 테스트 21→**30** (9 신규 케이스 2t~2ab). CLI header 에 `tree=<ok|skip>` 추가. 공식 5 템플릿 전부 tree=ok.
- **후속**: `rig-template-lint` 리브랜딩 임계 도달 — 후보 D 승격. **C14 후보** 신설 (parts↔deformers 사각형 완성).

### 후보 B — `packages/migrator/` skeleton + `v1.2.0→v1.3.0` ✅ **완료 (세션 111)**

- **실제 범위**:
  - `@geny/migrator@0.1.0` (TS ESM) 신규 — `src/{index,migrate,io,types}.ts` + `src/migrations/{index,v1-0-0-to-v1-1-0,v1-1-0-to-v1-2-0,v1-2-0-to-v1-3-0}.ts` + `src/migrations/data/{v1-1-0,v1-2-0,v1-3-0}.ts`.
  - 공개 API: `migrate(srcDir, outDir, options?)` / `planMigrations(from)` / `MIGRATORS`.
  - 3 migrator **전부 이식** (PLAN 원안은 v1.2.0→v1.3.0 만이었으나 세션 111 D1 에서 원자적 이식으로 상향).
  - CLI shim `scripts/rig-template/migrate.mjs` 530 줄 → 53 줄. dynamic import 로 `dist/index.js` 참조 (bare specifier / workspace 의존 추가 없음).
- **산출**: 1 신규 패키지 + 8 단위 테스트 + 골든 step 14 3-단 (build → test → CLI 회귀). 누적 패키지 13 → 14. 기존 CLI 테스트는 완전 pass — 출력 bit-by-bit 동일 확인.
- **후속**: BL-MIGRATOR 해소 → 후보 C(legacy opt-in 복제) 의 (b) 블로커 제거. v1.3.0→v1.4.0 은 본 skeleton 의 첫 external 확장 자리.

### 후보 C — legacy v1.0.0~v1.2.0 `parameter_ids` opt-in 복제

- **범위**: halfbody v1.0.0 / v1.1.0 / v1.2.0 의 공식 파츠 19 개에 `parameter_ids` 필드 추가(세션 107 halfbody v1.3.0 선언 내용 이식). 빈 배열 `[]` 은 "overall-only 명시"(세션 95 D2 / 98 D2 시맨틱).
- **진입 조건**: **두 축 동시 충족** 필요 (세션 111 에서 (b) 해소)
  - (a) docs/03 §7.3 legacy 수정 허용 결정 — **BL-DEPRECATION-POLICY** 해소 필요(외부).
  - ~~(b) migrator 가 legacy 를 patch 할 수 있어야 함~~ ✅ 세션 111 `@geny/migrator@0.1.0`.
  - (c) 소비자(Runtime)가 legacy opt-in 을 먹을 경로 존재 — **세션 97** 이후.
- **산출**: 19 파츠 × 3 버전 opt-in + golden sha256 3 개 추가 + 테스트.
- **소요**: 1 세션(patch 만) 혹은 2 세션(migrator 확장 포함).
- **리스크**: (a)(c) 가 안 풀리면 golden 만 늘어나고 소비자 없음 → 단순 보관 비용. 방지: (a)(c) 해소 전까지는 후보 C 착수 금지.

### 후보 D — `rig-template-lint` 리브랜딩 ✅ **완료 (세션 110)**

- **범위**: `scripts/rig-template/physics-lint.{mjs,test.mjs}` → `rig-template-lint.{mjs,test.mjs}`. golden step name `rig-template physics-lint` → `rig-template-lint`. docs/03 §6.2/§13.1 갱신. fullbody README / mao_pro_mapping 갱신. progress_0420/ 3 파일 갱신.
- **정책**: 세션 로그 (`progress/sessions/*`) 와 ADR 0005 는 역사 보존 — 당시 파일 이름(`physics-lint`) 그대로 유지. 에러 메시지 prefix `C1~C13` 도 그대로 — session 로그 / ADR 0005 의 역사 식별자 보존.
- **산출**: 파일 rename (git mv) + 내부 로그 prefix `[physics-lint]` → `[rig-template-lint]` + CLI Usage / error 메시지 rename. 공식 5 템플릿 lint 결과는 byte-equal 유지, golden 불변.
- **후속**: 향후 `scripts/rig-template/deformer-lint.mjs` 같은 수직 분리가 필요해지면 ADR 0005 L2 변경으로 처리.

### 후보 E — 세션 96 실 staging 배포

- **범위**: Helm install → kube-prometheus-stack 실제 스크레이프 확인 → `values-staging.yaml` 의 `release: kube-prometheus-stack` SM selector 매칭 검증 → worker-generate + orchestrator 양쪽 pod ready.
- **진입 조건**: **BL-STAGING** 해소 필수. cluster access + kubeconfig + (선택) Redis external endpoint 결정.
- **산출**: 실 staging 환경에서 observability 4 층(exposition/snapshot/e2e/fallback) 중 **실 Prometheus 스크레이프** 층을 닫는 첫 증거.
- **소요**: 1~2 세션.
- **리스크**: cluster 정책(RBAC / NetworkPolicy / storage class)이 로컬 docker 조건과 다를 수 있음 — runbook 01-incident-p1.md 적용 시나리오 드리블.

### 후보 F — 세션 97 Runtime 전환 착수 (Cubism/WebGL 실 렌더러 합류)

- **범위**: `@geny/web-avatar-runtime` (또는 web-editor-renderer 확장) 신규 패키지. Cubism SDK / PixiJS / WebGL 중 택일(ADR 후보). `<geny-avatar>` 커스텀 엘리먼트의 현 happy-dom 모의 렌더를 실 렌더러로 교체.
- **진입 조건**: Foundation 종료 선언 + 렌더러 기술 선택 ADR(신규 0007 후보).
- **산출**: 실 브라우저에서 halfbody/fullbody base 템플릿이 pose / motion / expression 변경에 따라 움직이는 첫 증거.
- **소요**: **큰 세션 묶음(5~10 세션)**. 단일 세션 불가.
- **리스크**: Foundation 의 "mock-first" 구조가 Runtime 에서 성립하지 않는 부분(real GL context / GPU / timing)이 다수 — 세션 분해 필요.

---

## 3. 우선순위 (2026-04-20 판단)

```
[완료]
  세션 109 = 후보 A (C13 deformer 트리 무결성) ✅
  세션 110 = 후보 D (rig-template-lint 리브랜딩) ✅
  세션 111 = 후보 B (migrator skeleton)         ✅ BL-MIGRATOR 해소
  세션 112 = 후보 G (C14 parts↔deformers)        ✅ 사각형 완결, L2 포화

[즉시 착수 가능 — self-contained 여지 거의 소진]
  세션 ? = v1.3.0→v1.4.0 migrator 자리 (리그 변경 합의 후)
  세션 ? = ADR 0007 초안 (렌더러 기술 선택) — Runtime 진입 선행

[외부 블록 해소 후]
  세션 ? = 후보 E (staging)      ← BL-STAGING 해소 시
  세션 ? = 후보 C (legacy opt-in) ← BL-DEPRECATION-POLICY 해소 시 (b 는 세션 111 에서 자체 풀림)
  세션 ? = 후보 F (Runtime)      ← Foundation 종료 선언 + ADR 0007
```

### 후보 G — C14 `parts ↔ deformers` 사각형 완성 ✅ **완료 (세션 112)**

- **실제 범위**: `parts/*.spec.json.deformation_parent` ↔ `deformers.nodes[].id` 교차 검증. parts 루프 재구성 (deformers.json 선로드, I/O 1 회 유지). `parts_deformation_parents_checked` 카운터 summary 노출.
- **산출**: rig-template-lint rule 13→**14**, 테스트 30→**34** (4 신규 케이스 2ac~2af). 공식 5 템플릿 clean + `parts_checked == parts_deformation_parents_checked` 전 버전 성립 (파츠 전원 deformer 연결 불변식 확정).
- **후속**: C11+C12+C13+C14 사각형 완결 → L2 저자 범위 포화. 세션 109 이후 self-contained lint 확장 여지 소진 — 다음 라운드는 Runtime(후보 F) 또는 외부 의존 해소.

### 3.1 추천 실행 순서 근거

1. ~~**후보 A**~~ — 세션 109 완료 ✅.
2. ~~**후보 D**~~ — 세션 110 완료 ✅.
3. ~~**후보 B**~~ — 세션 111 완료 ✅. BL-MIGRATOR 해소.
4. ~~**후보 G (C14)**~~ — 세션 112 완료 ✅. L2 사각형 완결.
5. **다음 self-contained 없음** — v1.3.0→v1.4.0 migrator 는 리그 변경 범위(외부 판단) 선행. ADR 0007 초안 작성은 self-contained 이지만 판단 축이 엔지니어링 + 라이선스 + UX 를 섞어야 해 사용자 의사 선행이 합리적.
6. **후보 C 는 (a) 외부 정책 해소 대기** — (b) 는 세션 111 에서 자체 풀림. (a)(c) 가 동시에 열릴 때 착수.
7. **후보 E / F 는 외부 의존** — 들어올 때 연속 묶음으로 소화.

### 3.2 비추 (하지 말 것)

- **C13 과 C11/C12 리팩터 동시 진행** — 세션 108 D5 가 명시적으로 축 분리 결정. 한 번에 묶으면 regression 원인 진단 비용 급증.
- **migrator 와 legacy opt-in 한 세션 압축** — sha256 골든이 3 개 추가되는데 migrator bit-drift 와 legacy patch 의 원인 구분이 흐려진다. 두 세션으로 분리 권장.
- **staging 배포 + observability e2e 재정비 묶음** — 실 cluster 문제(외부 원인)와 코드 회귀(내부 원인)가 섞이면 debugging 비용 폭발.

---

## 4. 품질 기준 (세션 종료 체크리스트)

모든 세션이 commit 전에 **이 5 축 통과** 를 문서화:

1. **타입 체크**: `pnpm run typecheck` 전체 green.
2. **테스트**: `pnpm run test` 패키지 전체 + `pnpm run test:golden` 29 step green (영향 범위만 실행한 경우 이유 문서화).
3. **lint**: physics-lint 21+ case + eslint/prettier 전수.
4. **세션 doc**: `progress/sessions/YYYY-MM-DD-session-NN-slug.md` 템플릿 9 섹션 + Decisions D1~Dn + Next 후속 세션 링크.
5. **index 갱신**: `progress_0420/INDEX.md §1·§4` 최소 1 줄 + (영향 축이 있으면) §2 워크스트림 상태 이모지.

---

## 5. 리스크 레지스터

| 리스크 | 가능성 | 영향 | 완화책 |
|---|---|---|---|
| sha256 골든 drift (migrator 이동 시) | 중 | 대 | 후보 B 에서 golden 동일 검증 **테스트로 고정** + 세션 doc D 에 bit-by-bit 불변 근거 명시 |
| legacy opt-in (후보 C) 를 소비자 없이 저장만 | 고 | 중 | 후보 C 의 진입 조건 (c) 를 통과 전까지 착수 금지 규칙 |
| `physics-lint` 리브랜딩 중 외부 참조 누락 | 중 | 소 | 후보 D 에서 `grep -r physics-lint` 전수 치환 + 세션 doc 에 치환 목록 첨부 |
| Runtime 합류 시 Mock-only 불변식 깨짐 (세션 85 D7 `cost_usd` success-only 가 실 성공률 0 일 때 divide-by-zero?) | 중 | 중 | 후보 F 착수 시 observability 불변식 8 메트릭 union 을 실벤더 샘플로 재검증하는 세션 분할 |
| staging Prometheus SM selector 불일치 | 중 | 중 | 후보 E 에서 `release: kube-prometheus-stack` 매칭 테스트 CI step 로 고정 |
| 세션 수 폭증으로 progress_0420/ 다시 비대화 | 저 | 소 | INDEX.md §1 은 **표 갱신만** 허용, §4 세션 로그는 한 줄 규칙. 대형 내용은 `progress/sessions/` 로 |

---

## 6. Foundation 종료 선언 기준

현 시점에서 Foundation Exit 4/4 + 릴리스 게이트 3/3 이 모두 닫혀 있으므로 **기술적 종료 자격** 은 이미 확보. 다만 "Runtime 전환 착수(후보 F)" 를 트리거하려면 추가로 다음 3 가지가 필요:

1. **ADR 0007 (렌더러 기술 선택)** — Cubism / PixiJS / Three.js / 자체 GL 중 택일 + 이유 + 성능/라이선스 함의.
2. **후보 A 완료 (C13)** — lint catalog 안정화. Runtime 진입 후 lint 변경은 단가가 크다.
3. **후보 B 완료 (migrator skeleton)** — Runtime 이 legacy / 신규 템플릿을 다 먹으려면 migrate 경로가 한 곳에 모여 있어야 함.

이 3 축이 닫히면 사용자에게 **"Foundation 종료 + Runtime 전환 착수 승인 요청"** 을 명시적으로 내보낸다. (자율 모드여도 phase 전환은 사용자 확인 의무.)

---

## 7. 다음 즉시 행동 (세션 113)

세션 112 C14 완결로 self-contained lint 여지는 소진. 자율 모드에서 다음 단계는 **(α) 외부 판단이 적고 (β) 사용자 합의 전에도 유용한** 후보를 찾아야 한다.

**1순위 후보 (자율 모드 권장)**: **ADR 0007 (렌더러 기술 선택) 초안 작성** — 후보 F (Runtime 전환) 의 선행 조건이자 self-contained.
- **범위**: `progress/adr/0007-renderer-technology.md` 신규. Cubism SDK / PixiJS / Three.js / 자체 WebGL2 네 방향을 **context / options / trade-offs / consequences** 4 축으로 비교. **decision 은 비워두고 사용자 의사 대기** — ADR 은 결론 없이도 "선행 조사" 로 가치 있음 (ADR 0003/0004 의 초안 단계 참조).
- **진입 조건**: 없음 — self-contained 조사 + 문서. 후보 F 진입 전에 읽혀야 하는 사전 연구.
- **산출**: ADR 1 개 + INDEX.md ADR 테이블 업데이트. 사용자 리뷰 시 decision 채움.
- **리스크**: decision 미완으로 끝내는 ADR 은 `Draft` 상태. 그러나 후보 F 진입 전 필수 자료이므로 가치 존재.

**2순위 — 사용자 판단 필요 후보**:
- **v1.3.0→v1.4.0 migrator 자리**: 세션 111 skeleton 의 첫 external 확장. 리그 변경 범위 결정(=어떤 파츠 / 파라미터 / deformer 가 바뀌는가) 이 사용자 입력 선행 필요 — 자율 모드에서 열 수 없음.
- **후보 C (legacy opt-in 복제)**: BL-DEPRECATION-POLICY 외부 + 소비자(세션 97) 대기 — 두 축 모두 풀리기 전 착수 금지.
- **후보 E (staging 배포)**: BL-STAGING 외부 클러스터 대기.

**자율 모드 결정**: 세션 113 에서는 **ADR 0007 초안** 을 쓴다. Decision 은 비워두고 Options / Context / Consequences 3 축을 채운 Draft 상태로 커밋 — 사용자가 다음 프롬프트로 방향을 정하면 그 지점을 결정 지점으로 삼아 후보 F 착수.

**선행 read**:
- `progress/adr/0003-rig-template-versioning.md` 와 `0005-rig-authoring-gate.md` — 템플릿(ADR 헤더/섹션/합의 경로) 참조.
- `packages/web-avatar/src/*` — 현 `<geny-avatar>` 커스텀 엘리먼트의 happy-dom 모의 인터페이스. 실 렌더러가 replace 할 표면 범위 파악.
- `docs/01`, `docs/14` §9 (Frontend) — Runtime 합류 시 기대 범위.

**세션 114 예약 후보**:
- Runtime 착수(후보 F) 본격 진입 — ADR 0007 decision 확정 후.
- v1.3.0→v1.4.0 migrator — 리그 변경 범위 합의 후.
