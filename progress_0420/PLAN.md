# PLAN — 앞으로의 작업 (2026-04-20 기준, 세션 109+)

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
| **BL-MIGRATOR** — `packages/migrator/` skeleton 부재 | 신규 세션(세션 109 후보 B) | 없음 — 즉시 착수 가능 |
| **BL-LEGACY-CONSUMER** — legacy opt-in 복제를 먹을 소비자 없음 | Runtime 소비자 합류 시 | 세션 97 Runtime 착수(세션 105 D1 블로커 c) |

> 세션 105 D1 의 3 블로커(docs/03 §7.3 / migrator 부재 / 소비자 없음) 중 (b) migrator 는 **내부 해소 가능**, (a)(c) 는 외부 의존. (b) 를 먼저 푸는 게 병목을 가장 크게 줄인다.

---

## 2. 세션 후보 상세

### 후보 A — C13 deformer 트리 무결성 (세션 108 자연 연장)

- **범위**: `scripts/rig-template/physics-lint.mjs` 에 C13 블록 추가.
  - `nodes[].parent` 가 null 이거나 다른 `nodes[].id` 를 가리킬 것
  - `root_id` 가 `nodes[].id` 중 하나여야 함
  - 사이클 없음 (DFS 방문 기록)
  - orphan 없음 (root 에서 도달 가능해야 함)
- **진입 조건**: 없음 — self-contained. C12 와 동일 파일(`deformers.json`) 한 번 더 순회.
- **산출**: physics-lint rule 12→13, 테스트 21→25+ (음성 4 케이스 + 공식 5 템플릿 통과 sanity).
- **소요**: 1 세션.
- **리스크**: 없음. 기존 5 템플릿이 이미 트리 규칙을 지키고 있으므로 regress 0.
- **후속**: 없음(트리 축 완결). 다만 C11+C12+C13 누적으로 `physics-lint` → `rig-template-lint` 리브랜딩 임계점 도달 — 후보 D 참조.

### 후보 B — `packages/migrator/` skeleton + `v1.2.0→v1.3.0.mjs`

- **범위**:
  - 새 패키지 `@geny/migrator` (TS ESM, Node 22.11+). `package.json` + `tsconfig.json` + `src/index.ts` + `src/migrations/` 디렉터리.
  - 공개 API 제안: `migrate(templateDir, targetVersion, options)` → `{ patched: string[], errors: string[] }`. Migration 파일 포맷은 `src/migrations/<from>-to-<to>.mjs` 에 `{ from, to, apply(template) }` 기본 시그니처.
  - 첫 migration: `v1.2.0-to-v1.3.0.mjs` — 세션 27/37 migrator 로직을 이 패키지 안으로 이동(golden 불변 유지).
  - CLI shim `scripts/rig-template/migrate.mjs` 에 `@geny/migrator` import 추가(기존 ad-hoc 로직 제거).
- **진입 조건**: 없음 — self-contained. 단, golden 이 현 migrate shim 에 의존하므로 **출력 bit-by-bit 동일** 이어야 함.
- **산출**: 1 신규 패키지 + 1 신규 테스트(migrate round-trip v1.0.0→v1.3.0 sha256 동일). golden 29 step 통과 재확인.
- **소요**: 1~2 세션. migrator 로직 이동 + 테스트 작성 + (선택) `v1.3.0→v1.4.0` 템플릿 자리.
- **리스크**: 기존 migrate shim 의 부수 효과(예: parts/ahoge.spec.json 생성 순서)가 패키지 이동 시 drift 가능 — sha256 골든이 자동 회귀로 막는다.
- **후속**: BL-MIGRATOR 해소 → 후보 C(legacy opt-in 복제) 의 (b) 블로커 제거.

### 후보 C — legacy v1.0.0~v1.2.0 `parameter_ids` opt-in 복제

- **범위**: halfbody v1.0.0 / v1.1.0 / v1.2.0 의 공식 파츠 19 개에 `parameter_ids` 필드 추가(세션 107 halfbody v1.3.0 선언 내용 이식). 빈 배열 `[]` 은 "overall-only 명시"(세션 95 D2 / 98 D2 시맨틱).
- **진입 조건**: **두 축 동시 충족** 필요
  - (a) docs/03 §7.3 legacy 수정 허용 결정 — **BL-DEPRECATION-POLICY** 해소 필요(외부).
  - (b) migrator 가 legacy 를 patch 할 수 있어야 함 — **후보 B** 선행 권장.
  - (c) 소비자(Runtime)가 legacy opt-in 을 먹을 경로 존재 — **세션 97** 이후.
- **산출**: 19 파츠 × 3 버전 opt-in + golden sha256 3 개 추가 + 테스트.
- **소요**: 1 세션(patch 만) 혹은 2 세션(migrator 확장 포함).
- **리스크**: (a)(c) 가 안 풀리면 golden 만 늘어나고 소비자 없음 → 단순 보관 비용. 방지: (a)(c) 해소 전까지는 후보 C 착수 금지.

### 후보 D — `rig-template-lint` 리브랜딩

- **범위**: `scripts/rig-template/physics-lint.{mjs,test.mjs}` → `rig-template-lint.{mjs,test.mjs}`. golden step 의 `physics-lint` 호출 치환. README · 세션 doc 교차 참조 갱신. 헤더 코멘트 `C1~Cxx` 기준 재정렬.
- **진입 조건**: C13 도입(후보 A 완료) 이후 권장 — lint catalog 가 physics 외 3 축(C10 family / C11 parts / C12 deformers / C13 tree)으로 과반 이상이 될 때 리브랜딩 비용 정당화.
- **산출**: 파일 rename + golden step 재배선. test / lint 결과는 불변.
- **소요**: 1 세션(mechanical rename).
- **리스크**: 외부 문서의 하드코딩된 `physics-lint` 레퍼런스가 남을 수 있음 — grep 으로 전수 치환.

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
[즉시 착수 가능]
  세션 109 = 후보 A (C13 deformer 트리 무결성)
  세션 110 = 후보 B (migrator skeleton)  ← BL-MIGRATOR 해소

[외부 블록 해소 후]
  세션 ? = 후보 E (staging)      ← BL-STAGING 해소 시
  세션 ? = 후보 C (legacy opt-in) ← BL-DEPRECATION-POLICY + 후보 B 완료
  세션 ? = 후보 F (Runtime)      ← Foundation 종료 선언 + ADR 0007

[임계점 도달 시]
  세션 ? = 후보 D (rig-template-lint 리브랜딩)  ← 후보 A 완료 후
```

### 3.1 추천 실행 순서 근거

1. **후보 A 가 가장 먼저** — self-contained, 1 세션, 리스크 0. 세션 108 의 직접 연장선이라 컨텍스트 비용 최저.
2. **후보 B 가 그 다음** — 내부 블로커(BL-MIGRATOR) 해소만으로 legacy opt-in + 향후 v1.4.0 바이브 아웃 두 경로가 동시에 열린다. 외부 블록에 선행 투자.
3. **후보 C 는 (a)(b) 둘 다 풀릴 때까지 대기** — (b) 는 후보 B 로 자체 해소되지만 (a) 가 외부라서 무기한. 그 사이 다른 self-contained 세션을 소화.
4. **후보 D 는 A 이후 언제든** — mechanical 이라 급할 때 끼워넣기 좋음.
5. **후보 E / F 는 외부 의존** — 들어올 때 연속 묶음으로 소화.

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

## 7. 다음 즉시 행동 (세션 109)

**결정**: 후보 A — C13 deformer 트리 무결성.

**이유**:
- 세션 108 의 자연 연장(`deformers.json` 한 번 더 순회).
- self-contained, 외부 의존 0.
- 리스크 0 (기존 템플릿은 이미 트리 규칙 준수).
- 소요 1 세션 — 다음 iteration 에서 후보 B 로 이어갈 수 있음.

**선행 read**:
- `scripts/rig-template/physics-lint.mjs` — C12 블록 이후 C13 삽입 지점.
- `schema/v1/deformers.schema.json` — `nodes[].parent` / `root_id` 스키마 제약.
- `rig-templates/halfbody/v1.3.0/deformers.json` 샘플 — 트리 구조 관찰.
