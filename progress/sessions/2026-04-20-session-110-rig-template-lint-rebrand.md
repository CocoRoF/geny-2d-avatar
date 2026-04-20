# 세션 110 — physics-lint → rig-template-lint 리브랜딩

**일자**: 2026-04-20
**워크스트림**: Platform / Infra (CI)
**선행 세션**: 세션 99 (C11), 세션 108 (C12), 세션 109 (C13)
**선행 ADR**: [0005](../adr/0005-rig-authoring-gate.md) L2 저자 범위

---

## 1. 문제

`physics-lint` 는 세션 2~66 의 초기 범위(PhysicsSetting 17 설정 · vertex count · cubism map) 에서 이름이 주어졌다. 세션 67 이후 C6~C10 family/parts 체크가 들어왔고, 세션 99/108/109 에서 C11 (parts↔parameters) · C12 (deformers↔parameters) · C13 (deformers tree) 가 누적되며 **physics 도메인을 상당히 넘어선 cross-cutting lint catalog** 로 성장했다.

세션 108 D1 에서 "임계점 미도달" 로 보류했던 리브랜딩 결정을 세션 109 후속(§4)에서 "이제 뒤집어도 무방" 으로 승격. 세션 110 에서 수행.

---

## 2. 변경

### 2.1 파일 rename (git mv — history 보존)

- `scripts/rig-template/physics-lint.mjs` → `scripts/rig-template/rig-template-lint.mjs`
- `scripts/rig-template/physics-lint.test.mjs` → `scripts/rig-template/rig-template-lint.test.mjs`

### 2.2 live 참조 치환

| 파일 | 변경 |
|---|---|
| `scripts/rig-template/rig-template-lint.mjs` | 헤더 코멘트 재작성 (rename 및 세션 110 각주 명시) / CLI Usage 스트링 업데이트 / stdout prefix `[physics-lint ${templateDir}]` → `[rig-template-lint ${templateDir}]` / 에러 메시지 prefix `physics-lint: ...` → `rig-template-lint: ...` |
| `scripts/rig-template/rig-template-lint.test.mjs` | 헤더 / import path (`./physics-lint.mjs` → `./rig-template-lint.mjs`) / mkdtemp prefix / 최종 로그 `[physics-lint] ✅` → `[rig-template-lint] ✅` |
| `scripts/test-golden.mjs` | step 주석 (C1~C13 기준으로 서술) / step name `rig-template physics-lint` → `rig-template-lint` / 함수 이름 `runPhysicsLintTests` → `runRigTemplateLintTests` / 테스트 실행 경로 치환 |
| `docs/03-rig-template-spec.md` | §6.2 의 `FAMILY_OUTPUT_RULES` 참조 경로 / §13.1 `physics-lint fatal` → `rig-template-lint fatal` + C11/C12/C13 확장 설명 |
| `rig-templates/base/fullbody/v1.0.0/README.md` | L2 소개 문구 + 파일 링크 |
| `rig-templates/base/fullbody/v1.0.0/physics/mao_pro_mapping.md` | `physics-lint --family fullbody` → `rig-template-lint --family fullbody` (세션 110 이전 이름 physics-lint), C1~C10 → C1~C13 |
| `progress_0420/INDEX.md` | §1 `rig-template-lint rules` 행 + §2 Platform/Infra 한 줄 + §4 세션 후보 재배열 |
| `progress_0420/SUMMARY.md` | 타임라인 items 2/9 prefix 변경 + items 10(C13)/11(rebrand) 신규 + §1.5 제목 + §7.1 카운트 + §13 pending 표 ✅ |
| `progress_0420/PLAN.md` | 후보 D 상태 ✅ 완료 / §3 우선순위 재배열 / §7 다음 행동을 세션 111 migrator 로 전환 |
| `progress/adr/0005-rig-authoring-gate.md` | Addendum 추가 — 본문 C1~C10 은 역사 그대로 두고, 2026-04-20 리브랜딩과 C11~C13 확장을 뒤에 덧붙임 |

### 2.3 의도적 미치환 (history 보존 정책)

| 대상 | 이유 |
|---|---|
| `progress/sessions/*.md` (108 개) | 세션 로그는 당시 시점의 1 차 사료. rename 은 소급 적용하지 않음. |
| `progress/INDEX.md` (legacy) | `progress_0420/INDEX.md` 가 권위 인덱스 선언(세션 108) 이후 legacy. 본문 보존. |
| ADR 0005 본문 | L2 범위 설명의 역사 식별자 보존. Addendum 으로 리브랜딩 기록만 추가. |
| `rig-templates/base/fullbody/v1.0.0/template.manifest.json` | `intended_vibe` 에 "physics-lint C1~C10" 언급 — exporter-core 가 이 필드를 소비하지 않지만 fullbody golden sha256 의 간접 위험 제거를 위해 스킵. 후속 세션에서 L4 골든 재승격 동반 시 함께 갱신. |
| 에러 메시지 prefix `C1~C13` | 세션 로그 / ADR 0005 역사 식별자. 포맷 `rig-template-lint: C13-cycle ...` 에서 **C13-cycle** 축을 보존 — 과거 로그와 역참조 가능. |

### 2.4 회귀

- `node scripts/rig-template/rig-template-lint.test.mjs` — **30/30 pass** (21 세션 99 전 + 9 세션 109 C13).
- `node scripts/test-golden.mjs` — **all steps pass**. 5 공식 템플릿 lint 출력 byte-equal:
  - halfbody v1.0.0 — `[rig-template-lint ...halfbody/v1.0.0] ✅ parts=... deformers=... tree=ok`
  - halfbody v1.1.0/v1.2.0/v1.3.0 동일 포맷
  - fullbody v1.0.0 — `deformers=29/53params tree=ok`

---

## 3. 결정 축 (D1–D4)

### D1. git mv 로 history 보존
- **결정**: `git mv scripts/rig-template/physics-lint.{mjs,test.mjs} rig-template-lint.{mjs,test.mjs}`.
- **이유**: GitHub/GitLab 의 rename detection 임계(50% 유사도)를 안정적으로 타고, blame 체인이 끊어지지 않도록. `git log --follow` 로 세션 2~109 의 변경 내역을 이어서 추적 가능해야 C11/C12/C13 의 도입 맥락이 사라지지 않음.

### D2. 에러 메시지 prefix `C1~C13` 보존
- **결정**: 에러 포맷 `rig-template-lint: C1-* ...` 형태로 **C 넘버만 유지**. `C1-vertex-mismatch` 같은 sub-key 도 그대로.
- **이유**: 세션 67/99/108/109 의 로그에서 `C1-*` 을 검색해 증적을 찾는 패턴이 정착. prefix 를 리브랜딩하면 역참조가 끊겨 문서 가치가 하락. lint 이름과 규칙 식별자는 **독립 축** — 하나 바꿔도 다른 쪽은 고정.

### D3. `template.manifest.json intended_vibe` 스킵
- **결정**: fullbody v1.0.0 manifest 의 `intended_vibe` 스트링에서 "physics-lint C1~C10" 표현은 건드리지 않음.
- **이유**: 해당 필드는 exporter-core 의 번들 로직에서 **소비되지 않는** 정보 태그지만, fullbody zoe 번들 sha256 golden 이 manifest 전체 바이트를 해시한다. 리스크:value 가 비대칭(역사 문구 1 줄 vs 사고 시 골든 재승격 1 세션). 후속 세션에서 다른 이유로 bump 할 때 동반 업데이트.

### D4. docs/03 §13.1 에서 C11~C13 확장 설명 추가
- **결정**: lint catalog 가 docs/03 §13.1 의 "C1~C10" 단일 블록에서 "C1~C13 + 각각 검사 대상" 표로 확장.
- **이유**: 리브랜딩 세션이 name change 만 하고 내용을 그대로 두면 docs/03 이 stale 해진다. 이름을 바꾸는 김에 실제 13 규칙의 최종 스펙을 명문화 — lint 자체가 L2 저자 범위의 주요 기록이므로 docs/03 이 권위 있어야 함.

---

## 4. 후속 (세션 111+)

- **세션 111 후보 B (migrator skeleton)** 로 진입. `packages/migrator/` 신규 + `v1.2.0→v1.3.0.mjs` — BL-MIGRATOR 해소. self-contained.
- **C14 (parts↔deformers 사각형)** — 언제든 끼워넣기 가능. 후보 B 이후 또는 병렬.
- **legacy v1.0.0~v1.2.0 opt-in** — BL-DEPRECATION-POLICY 대기.
- **staging 배포 (세션 96)** — BL-STAGING 대기.

---

## 5. 인덱스 갱신

- `progress/sessions/` 에 본 파일 추가 (세션 110).
- `progress_0420/INDEX.md`:
  - §1 세션 109 → **110**.
  - §1 rig-template-lint 행 — "세션 110 리브랜딩(이전 physics-lint)" 명시.
  - §2 Platform/Infra 축 문장 재작성.
  - §4 세션 후보 B (migrator) 를 최우선 승격 + C14 후보 G 신설.
- `progress_0420/SUMMARY.md`:
  - 타임라인 items 10 (C13) / 11 (rebrand) 신규.
  - §1.5 제목 재지정.
  - §13 pending 표 — 리브랜딩 행 ✅.
- `progress_0420/PLAN.md`:
  - §2 후보 D 상태 ✅.
  - §3 우선순위 세션 111 = 후보 B 로 업데이트.
  - §7 다음 즉시 행동 재작성.
- `progress/adr/0005-rig-authoring-gate.md`:
  - 본문 보존 + Addendum (2026-04-20) — rename + C11~C13 확장 요약.

---

## 6. 산출물 요약

| 영역 | 변경 |
|---|---|
| `scripts/rig-template/physics-lint.{mjs,test.mjs}` | → `rig-template-lint.{mjs,test.mjs}` (git mv) + 본문 prefix 치환 |
| `scripts/test-golden.mjs` | step name · 함수명 · 실행 경로 업데이트 |
| `docs/03` / fullbody README / mao_pro_mapping | live 참조 갱신, C1~C10 → C1~C13 |
| `progress_0420/*` 3 파일 | 타임라인/index/PLAN 전체 갱신 |
| `progress/adr/0005` | Addendum 추가 (본문 역사 보존) |
| `progress/sessions/*.md` (108 개) | **미변경** — 1 차 사료 보존 |
| 회귀 | 테스트 30/30 + golden all steps pass. 공식 5 템플릿 lint 결과 byte-equal (tree=ok). |
