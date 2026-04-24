# 세션 49 — physics-lint C10 base family 별 분리 (fullbody 대비 설계)

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Rig & Parts (docs/14 §9)
- **관련 세션**: 40 (physics-lint 10 규칙 도입), 43 (ADR 0005 L2 physics-lint fatal), 46 (docs/03 §13.1 커밋 조건)
- **관련 ADR**: [0005](../adr/0005-rig-authoring-gate.md) L2 (physics-lint fatal)
- **산출물**: `scripts/rig-template/physics-lint.mjs` `FAMILY_OUTPUT_RULES`, `scripts/rig-template/physics-lint.test.mjs` +4 cases, `docs/03 §6.2` + `§13.1` 교차 링크 갱신, INDEX §3/§4/§8

---

## 배경

세션 40 에서 physics-lint 의 C10 규칙은 **출력 파라미터 네이밍 접미사** 를 단일 전역 regex `_(sway|phys|fuwa)(_[lr])?$` 로 고정했다. halfbody v1.0.0~v1.3.0 에 한해 이것으로 충분했지만, docs/14 §9 로드맵에는 **fullbody base** 가 예고돼 있고 schema `template.manifest.schema` 의 `family` enum 에는 이미 `halfbody` 외에도 `chibi`/`fullbody`/`masc_halfbody`/`feline`/`custom` 5종이 선언돼 있다 (`schema/v1/rig-template.schema.json`).

세션 40 follow-up 에 "fullbody base 에서 필요한 허용 접미사 재검토" 가 남아 있었고, §8 로드맵도 세션 49 를 그 자리로 예정했다. 본 세션은 **fullbody 템플릿 저작 없이 규칙 테이블만** 분리한다 — 실 저작은 별도 세션 시리즈에서.

## 설계 결정

### D1. 단일 regex → family 별 rule 테이블

대안:

- **유지 (단일 regex)**: 가장 간단하지만 halfbody 에 하반신 파츠 물리가 들어와도 검출 못함 — "base 가 상반신이면 `leg_*` 물리가 실수" 라는 불변식을 기계적으로 보장할 수 없다.
- **`--family` CLI 플래그만**: 저자가 매번 명시해야 함 → 잊기 쉬움. 자동 탐지가 맞다.
- ✅ **manifest.family 자동 탐지 + rule 테이블 분리**: `template.manifest.json` 에서 family 읽어 자동 선택. `--family` 는 migration 리허설 / 테스트용 escape hatch.

rule 스키마:

```js
{
  pattern: /_(sway|phys|fuwa)(_[lr])?$/,  // 허용 접미사
  forbiddenPrefixes: ["leg_", "foot_", "skirt_", "tail_"],  // 금지 접두사
}
```

### D2. 부정 제약(forbidden prefix) 이 왜 positive 확장보다 먼저인가

fullbody 에 관해 "어떤 새 접미사가 필요한가" 는 아직 모른다 (`_wave`? `_jiggle`? `_bounce`?). 근거 없이 미리 확장하면 YAGNI. 반면 **halfbody 에 하반신 파츠 물리가 오면 틀렸다** 는 불변식은 명확 — docs/03 §1 "family=halfbody 는 상반신 전용" 에서 이미 선언된 것.

따라서 Foundation 범위에선:
- **positive (접미사 확장)**: 없음. 실 저작 세션에서 PR 로 추가.
- **negative (금지 접두사)**: halfbody / masc_halfbody 에 4개 고정.

### D3. rule 테이블이 schema 의 family enum 전체를 커버해야 함

**채택**: 테이블에 6종 전부 엔트리. `chibi`/`fullbody`/`feline`/`custom` 은 halfbody 와 동일 접미사 regex + forbidden 없음(temp holding) — 실 저작 시점에 저자가 tighten 할 자리.

`chibi`/`masc_halfbody` 는 schema enum 에만 있고 아직 템플릿이 없음. 미리 등록해 두면:
- 나중에 실 저작 시 "lint 가 알아본다" → 첫 커밋부터 게이트 작동.
- 테이블에 없으면 세션 49 가 lint 에 `if (family !== "halfbody")` 같은 특수 케이스 필요 — 더 복잡.

**미등록 family 는 explicit throw** (`family="alien_species"` 같은 오타 / 미래 커스텀 family) — 새 base 추가 시 반드시 PR 에서 rule 등록 의무. 조용한 통과 금지.

### D4. C10 → C10-suffix / C10-forbidden 분리

단일 `C10` 라벨이 두 제약(접미사 / 접두사)을 섞으면 실패 원인 분류가 어려움. **에러 메시지 prefix 를 `C10-suffix` / `C10-forbidden` 로 분리**:
- 테스트에서 "어느 쪽이 걸렸는가" 정확히 assert 가능.
- PR 리뷰에서 저자가 "접미사 규약 위반" vs "scope 위반" 구분 빠름.
- 향후 C10-* 추가 확장 (예: 국제화 이슈로 비-ASCII 금지 C10-ascii) 에도 확장 가능.

### D5. `leg_sway` 같은 "접미사 OK / 접두사 NG" 케이스 발견

halfbody 에 `leg_sway` 를 physics output 으로 억지로 넣어보면:
- C10-suffix: **통과** (`_sway` 로 끝남).
- C10-forbidden: **실패** (`leg_` 로 시작 = halfbody scope 위반).

두 규칙이 직교함을 테스트로 고정 — 접미사만 보는 원래 규약은 scope 위반을 잡지 못한다는 증거.

### D6. `--family` override 의 정당한 쓰임

**허용 쓰임**:
- 마이그레이션 리허설: "halfbody 를 fullbody 로 승격하면 어떻게 되나".
- 테스트: 위 leg_sway 케이스를 fullbody override 하에 재검증해 "fullbody 에선 통과" 를 명시.

**금지 쓰임**:
- 커밋된 템플릿의 family 와 다른 값으로 lint 우회. CI 는 `--family` 없이 manifest.family 로만 돈다 (`scripts/test-golden.mjs` step 18).

### D7. manifest.family 누락 시 거동

schema 에 `family` 는 `required` 라 정상 파일이면 있어야 함. 그러나 in-progress 저작 / 마이그레이션 중간 상태에서 부재할 수 있어, lint 는 **explicit error** (throw) — "family 없음 + override 없음" 안내. 기본값 `halfbody` 로 조용히 떨어지지 않음 (drift 위험).

## 실제 변경

- `scripts/rig-template/physics-lint.mjs`
  - 상수 `OUTPUT_NAME_PATTERN` 제거 → `FAMILY_OUTPUT_RULES` `Object.freeze` 테이블 (export). schema 의 family enum 6종 모두 엔트리.
  - `lintPhysics(dir, options)` 2-인자 시그니처. `options.familyOverride` 옵셔널.
  - manifest.family → rule lookup. family 누락/미등록 → explicit error throw.
  - C10 분기 2단: `rule.pattern.test()` (C10-suffix) + `rule.forbiddenPrefixes.some(p => dest.startsWith(p))` (C10-forbidden).
  - `summary.family` 필드 노출.
  - CLI `--family <name>` 플래그 파싱 (baseline 과 동일 패턴).
  - stdout summary 에 `family=...` 토큰 추가.

- `scripts/rig-template/physics-lint.test.mjs`
  - `import { FAMILY_OUTPUT_RULES, diffPhysics, lintPhysics }`.
  - 2e 기존 `C10` 매치 검증을 `C10-suffix` 로 바꿔 에러 분기 regression 방지.
  - 2h (신규): halfbody + `leg_sway` output → parameters/cubism_mapping 까지 보조 셋업 → lint 시 **정확히 C10-forbidden 1건만** 발생 확인. C10-suffix 는 `_sway` 로 끝나므로 통과.
  - 2i (신규): 같은 fixture 를 `--family fullbody` override 로 lint → clean (forbidden 없음).
  - 2j (신규): 미등록 family(`"alien_species"`) override → throw 검증.
  - 2k (신규): `FAMILY_OUTPUT_RULES` 테이블이 schema enum 6종 전부 커버하는지 리플렉션.

- `docs/03-rig-template-spec.md`
  - §6.2 에 "Base family 별 추가 제약 (세션 49, ADR 0005 L2)" bullet 추가 — halfbody/masc_halfbody 의 forbidden prefix 4종 명시 + 새 family 추가 시 rule 등록 PR 의무.
  - §13.1 lint 참조 문장을 "C10-suffix / C10-forbidden 2종 + `--family` override 지원" 으로 갱신.

- `progress/INDEX.md`
  - §3 Rig & Parts 행 말미에 `FAMILY_OUTPUT_RULES` 테이블 / `--family` override / C10 분리 한 문장 추가.
  - §4 세션 49 로그 행 추가 (세션 48 뒤 오름차순 유지).
  - §8 rotate — 49 제거, 50/51 유지, 52 신규 (fullbody family 실 저작 착수 검토).

## 검증

- 단독: `node scripts/rig-template/physics-lint.test.mjs` → 13/13 check pass (기존 9 + 신규 4).
- 전체: `pnpm run test:golden` → 19/19 step pass (step 18 physics-lint 이 13 checks 로 확장 됨).
- validate-schemas `checked=186` 불변 (schema 무변).

## Follow-ups

- 세션 50: `geny_queue_*` 메트릭 카탈로그 (ADR 0006 follow-up).
- 세션 51: 성능 SLO 측정 하네스.
- 세션 52: fullbody family 실 저작 착수 검토 — 이 세션의 `FAMILY_OUTPUT_RULES.fullbody` 엔트리가 실 저작 첫 날 부족한지 / 접미사 확장이 필요한지 재평가.

## 커밋

- `scripts/rig-template/physics-lint.mjs`
- `scripts/rig-template/physics-lint.test.mjs`
- `docs/03-rig-template-spec.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-49-physics-lint-family.md`
