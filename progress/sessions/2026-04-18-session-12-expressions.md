# Session 12 — Expression(exp3) 변환기 + halfbody v1.2.0 표정 3종

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Rig & Parts
- **Linked docs**: `docs/11 §3.2.2`, `docs/12 §4.10`, `docs/03 §12.1 #8`, `docs/18 Expression`
- **Linked ADRs**: 신규 없음 (스키마-우선 계약 ADR 0002 적용)
- **Previous**: 세션 11 — avatar-export + `assembleAvatarBundle` (commit `0e8e37c`)

---

## 1. 목표 (Goals)

- [x] `schema/v1/expression-pack.schema.json` — Geny 내부 표정 팩 포맷. Cubism `.exp3.json` 으로 변환되는 중간 계약.
- [x] `schema/v1/rig-template.schema.json` 확장 — `expressions_dir` (const) + `compat.expression_packs` (optional 배열).
- [x] `rig-templates/base/halfbody/v1.2.0/` — 표정 3종(`smile`/`wink`/`neutral`) 으로 Add/Multiply/Overwrite 3 Blend 모드 전수 커버.
- [x] `scripts/validate-schemas.mjs` — expression 파일 파서 + manifest 선언/파일 1:1 교차 검증 + target_id 파라미터 존재 검증.
- [x] `@geny/exporter-core` v0.3.0 → v0.4.0:
  - `loader.ts` 에 expressions 로딩.
  - `converters/expression.ts` — `convertExpression({pack, manifest, parameters})` + `convertExpressionFromTemplate(tpl, id)`.
  - `converters/model.ts` — `FileReferences.Expressions` 지원.
  - `bundle.ts` — `expressions/<slug>.exp3.json` 자동 포함.
  - `cli.ts` — `expression` 서브커맨드 (+ bundle/avatar 파급).
  - tests 10 신규, golden 3 신규, halfbody/aria 번들 golden 재생성.
- [x] `progress/INDEX.md` — session 12 row, Pipeline 스트림 상태 갱신.

### 범위 경계

- **Web Avatar 번들 포맷**(`@geny/web-avatar` 호환 zip/manifest)은 **이 세션 밖**. 세션 11 의 Next 묶음 중 Expression 만 분리. Web Avatar 는 정책·런타임 의존성이 크므로 별도 세션.
- **Part opacity 를 대상으로 하는 exp3** 는 지원하지 않는다 (Cubism 공식 예제도 Parameter 만 사용. 세션 09 motion 와 동일 결정).
- **표정의 UI 라벨·아이콘** (docs/09) 은 나중에 cdi3 확장 or 별도 메타 파일에서 다룬다.

## 2. 사전 맥락 (Context)

- **docs/11 §3.2.2** — Blend 모드 3종(`Add` / `Multiply` / `Overwrite`). 샘플 `mao_pro` 가 표정 8개 제공.
- **docs/03 §12.1 #8** — "표정 Blend 3종 모두 우리 포맷이 지원해야 한다" 명시.
- **세션 09 motion** — internal(`motion-pack`) → Cubism(`motion3`) 변환 패턴을 수립. expression 도 동일 구조로 대칭 설계.
- **Cubism 공식 `exp3.json` 스키마** (mao_pro/expressions/\*.exp3.json 기준):
  ```json
  {
    "Type": "Live2D Expression",
    "FadeInTime": 0.5,
    "FadeOutTime": 0.5,
    "Parameters": [
      { "Id": "ParamEyeLSmile", "Value": 1.0, "Blend": "Add" },
      …
    ]
  }
  ```
- **halfbody v1.2.0 파라미터 표** — 이미 `eye_smile_l/r`, `mouth_up/down`, `brow_*`, `eye_form_*` 등 표정에 충분한 축을 보유. 새 파라미터 추가 불필요.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 |
|---|---|---|
| expression-pack schema | `schema/v1/expression-pack.schema.json` | JSON Schema 2020-12, additionalProperties false. `pnpm run validate:schemas` 통과. |
| rig-template 확장 | `schema/v1/rig-template.schema.json` | `expressions_dir` (const `expressions/`, optional), `compat.expression_packs` optional. 기존 템플릿 invalid 되지 않음. |
| halfbody v1.2.0 expressions | `rig-templates/base/halfbody/v1.2.0/expressions/{smile,wink,neutral}.expression.json` + `template.manifest.json` 갱신 | 3개 표정, 3 Blend 모드 전수. manifest.compat.expression_packs 에 선언. validate 통과. |
| validate-schemas 확장 | `scripts/validate-schemas.mjs` | expression 파일 파싱·target_id·manifest 선언 cross-check. |
| expression converter | `packages/exporter-core/src/converters/expression.ts` | `convertExpression` + `convertExpressionFromTemplate`. FadeIn/FadeOut + Parameters. Cubism 매핑 누락 시 throw. |
| model3 Expressions | `packages/exporter-core/src/converters/model.ts` | `FileReferences.Expressions` = `[{Name, File}]`. 비어있으면 키 생략. |
| bundle expressions | `packages/exporter-core/src/bundle.ts` | `expressions/<slug>.exp3.json` 자동 포함. `<names.expressionsDir>` 오버라이드 가능. |
| CLI expression | `packages/exporter-core/src/cli.ts` | `expression --template <dir> --id <expression.smile> --out <file>`. bundle/avatar 는 자동 포함. |
| tests | `packages/exporter-core/tests/expression.test.ts` | ≥8 tests (golden 3 + edge). |
| goldens | `packages/exporter-core/tests/golden/halfbody_v1.2.0__{smile,wink,neutral}.exp3.json` + halfbody/aria bundle snapshot 재생성 + halfbody model3 재생성 | byte-for-byte. |
| 버전 bump | `packages/exporter-core/package.json` | `0.3.0` → `0.4.0`. |
| test:golden | `scripts/test-golden.mjs` | 기존 4단계 유지 — 번들 diff 스텝 2개가 expression 을 포함해 검증. |
| INDEX | `progress/INDEX.md` | session 12 row, Pipeline 상태 `v0.4.0` 으로. |

## 4. 결정 (Decisions)

- **D1 (expression-pack 은 motion-pack 과 분리된 스키마)**: motion 은 시간축 curve, expression 은 per-param offset + Blend. 공통화하면 필드 반쪽만 쓰이는 리유 union 이 되어 가독성이 떨어진다.
- **D2 (internal target_id 는 snake_case 파라미터 ID, Cubism 매핑은 변환 시 해결)**: motion 과 동일 규칙. `mouth_up` → `ParamMouthUp`. 매핑 누락 시 즉시 throw.
- **D3 (expression_id 포맷 `expression.<name>`)**: motion 의 `idle.default` 와 대칭. 파일명 `expressions/<name>.expression.json`, 번들 출력 `expressions/<name>.exp3.json` — slug 규칙은 packSlug 재사용 (`.` → `_`).
- **D4 (fade 기본값 0.5s)**: Cubism 관행. 스키마 default 지만 항상 명시 권장(결정론).
- **D5 (Blend 모드 enum 그대로 PascalCase 유지)**: internal 에서도 `Add|Multiply|Overwrite`. Cubism 공식 리터럴과 1:1 일치 → 변환 시 문자열 재포장 필요 없음.
- **D6 (target Parameter only)**: exp3 스펙상 Part 도 가능하나 공식 샘플 전부 Parameter 전용. motion(세션 09 D6) 과 동일하게 `part_opacity` 미지원.
- **D7 (`FileReferences.Expressions` 는 있을 때만)**: 비어있으면 model3.json 의 `Expressions` 키를 생략한다. 빈 배열 서비스가 Cubism Viewer 에서 UI 에 빈 그룹을 그리는 일부 빌드 이슈 회피.
- **D8 (goldens 재생성 일괄)**: halfbody 번들·aria 번들·halfbody model3 는 expressions 가 추가되면 내용이 바뀐다. 이 세션에서 한 번만 재생성 + 새 expression golden 3 추가. 이후 세션은 이 baseline 기반으로 회귀.
- **D9 (버전 0.4.0 bump)**: expression 단 스펙 + 번들 포함 추가. 하위 converter API 는 변경 없으므로 SemVer minor.

## 5. 변경 요약 (Changes)

- `schema/v1/expression-pack.schema.json` — 신규.
- `schema/v1/rig-template.schema.json` — `expressions_dir` + `compat.expression_packs` 추가.
- `schema/README.md` — expression-pack 항목 추가.
- `scripts/validate-schemas.mjs` — expression 파일 + 교차 검증 편성.
- `rig-templates/base/halfbody/v1.2.0/expressions/{smile,wink,neutral}.expression.json` — 신규.
- `rig-templates/base/halfbody/v1.2.0/template.manifest.json` — expressions_dir + compat.expression_packs 선언.
- `packages/exporter-core/src/loader.ts` — expressions 로딩.
- `packages/exporter-core/src/converters/expression.ts` — 신규.
- `packages/exporter-core/src/converters/model.ts` — FileReferences.Expressions.
- `packages/exporter-core/src/bundle.ts` — expressions/*.exp3.json.
- `packages/exporter-core/src/cli.ts` — `expression` 서브커맨드.
- `packages/exporter-core/src/index.ts` · `package.json` — export + version bump.
- `packages/exporter-core/tests/expression.test.ts` — 신규 (~8 tests).
- `packages/exporter-core/tests/golden/halfbody_v1.2.0__{smile,wink,neutral}.exp3.json` — 신규.
- `packages/exporter-core/tests/golden/halfbody_v1.2.0.model3.json` — 재생성.
- `packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json` — 재생성.
- `samples/avatars/sample-01-aria.bundle.snapshot.json` — 재생성.
- `progress/INDEX.md` — session 12 row.

## 6. 블록 (Blockers / Open Questions)

- **표정 UX 라벨(한/영/일 이름 + 아이콘)**: 현재 expression-pack 에 display_name 정도만 허용. 에디터 노출 시 CDI3 쪽으로 옮길지 별도 파일로 둘지는 UI 세션(세션 13+) 에서 재논의.
- **Blend 병합 순서**: Cubism 런타임이 정의한다 — Add 누적 → Multiply 곱산 → Overwrite 덮어쓰기. 현재 우리 포맷은 **per-param 단일 항목만 허용**. 동일 param 여러 엔트리 시 검증에서 거부.

## 7. 다음 세션 제안 (Next)

- **세션 13**: 관측 대시보드 3종 기본 동작 (Foundation Exit #3) — 로깅 스키마·Prometheus·Grafana 뼈대.
- **세션 14**: 개발자 온보딩 1일 달성 (Foundation Exit #4) — README·quickstart·troubleshooting.
- **세션 15 후보**: Web Avatar 번들 포맷(docs/11 §4) — `@geny/web-avatar` 파일 구성 + loader 스모크.

## 8. 지표 (Metrics)

- **스키마 수**: 11 → 12 (expression-pack).
- **변환기/번들러**: 7 → 8 (+ expression).
- **골든 fixture 수**: 9 → 12 (+3 expressions, halfbody bundle/model3 · aria bundle 는 재생성이지 증가는 아님).
- **테스트 수**: 58 → 68 (+10 expression).
- **번들 파일 수 (halfbody v1.2.0)**: 11 → 14 (+3 expressions).
- **CI 체크포인트**: test:golden = 4 단계 유지.

## 9. 인용 (Doc Anchors)

- [docs/11 §3.2.2 Expression Blend 규약](../../docs/11-export-and-deployment.md#322-expression-exp3-blend-규약)
- [docs/03 §12.1 mao_pro 기준선](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [progress session 09 cdi+model+bundle](./2026-04-18-session-09-cdi-model-bundle.md)
