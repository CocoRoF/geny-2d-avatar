# 세션 46 — ADR 0005 교차 참조 docs 반영 (§13.1 커밋 조건 + §4.4 번들 path 불변식)

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Rig & Parts · Pipeline (docs/14 §9)
- **관련 세션**: 40 (physics-lint authoring gate), 43 (ADR 0005 명문화), 38/41 (exporter-pipeline)
- **관련 ADR**: [0005](../adr/0005-rig-authoring-gate.md) L1 migrator auto-patch · L2 physics-lint fatal · L3 저자 판단 · L4 파이프라인 불변식
- **산출물**: `docs/03 §13.1` 신설, `docs/06 §4.4` 신설, INDEX 갱신

---

## 배경

세션 43 의 ADR 0005 는 4 계층 저작 게이트를 문서로 확정했지만, **기여자가 실제로 보는 두 가이드 (docs/03 리그 스펙, docs/06 후처리)** 는 ADR 를 직접 참조하지 않았다. 결과적으로 "lint 통과 = 커밋 조건" (L2) 과 "번들 path 불변성" (L4) 이 ADR 본문에만 있고, 저자/개발자가 먼저 읽는 가이드에서는 감춰진 상태. 본 세션은 그 두 링크를 공식화한다.

ADR 0005 의 §"Follow-ups" 에서 명시적으로 지목됐던 항목 — "docs/03 §13 에 lint 통과를 커밋 조건으로 추가" — 을 닫는다.

## 설계 결정

### D1. docs/03 에는 §13.1 하위 섹션으로 삽입 (§13 재작성 거부)

§13 "템플릿 작성 가이드" 의 기존 5항 체크리스트는 템플릿 내용(파라미터 범위·PNG·test_poses·물리 프리셋·README intended vibe) 을 다루고, 커밋 프로세스 gate 와는 성격이 다르다. §13 을 통째로 재작성해 두 가지를 섞기보다 **§13.1 "커밋 조건 — 저작 게이트"** 로 분리해, 기존 체크리스트는 "무엇을 쓰는가" 그대로 유지하고 하위 섹션에 "어떻게 통과시켜 커밋하는가" 를 쌓는다.

§13.1 에는:
- physics-lint C1~C10 을 커밋 차단(warning 아님) 으로 명시.
- `rig-template migrate` step 도 chain-clean 을 요구.
- 저작 판단 값 (weight/delay/mobility, vertex, 모션 타이밍, 파츠 이미지) 은 lint 대상 아니지만 lint 통과 상태로 커밋.
- ADR 0005 4 계층(L1~L4) 교차 링크.

### D2. docs/06 에는 §4.4 "불변식 — 번들 path 보존" 을 Stage 1 안에 삽입

원래 ADR 0005 L4 "번들 path 불변성" 은 세션 35 의 `textureOverrides` path 가드에서 파생됐고, 이는 Stage 1 (alpha sanitation) 이 첫 consumer. §4 (Stage 1) 에 "4.4 불변식 — 번들 path 보존" 하위 섹션을 추가해 **왜 path 를 건드리면 안 되는가(slot identity key)** 와 **참조 구현(exporter-pipeline `buildTextureOverride`)** · **회귀 테스트(golden step 16 byte-equal)** 를 한 곳에 모음.

§4.4 를 Stage 1 에만 둬도 Stage 2~6 에 동일 규칙이 암묵적으로 적용 — 후처리 stage 가 늘어날 때 §4.4 의 "모든 후처리는 픽셀만 대체한다" 문장이 umbrella.

### D3. 별도 §섹션 신설 거부 ("Appendix: 저작 게이트")

옵션 중 하나는 docs/03 말미 또는 docs/06 말미에 Appendix 섹션으로 ADR 0005 요약을 복붙하는 것. 거부 이유:
- ADR 자체가 이미 자족적(진술 + 대안 기각 + follow-ups) — 복붙은 drift 위험.
- 저자가 실제로 읽는 흐름(체크리스트 → 커밋)에 가이드가 섞여 있어야 정보가 닿음. 분리된 Appendix 는 스킵됨.

## 실제 변경

- `docs/03-rig-template-spec.md`
  - §13.1 "커밋 조건 — 저작 게이트 (ADR 0005)" 신설 (§13 본문 체크리스트 5항 뒤).
  - physics-lint C1~C10 커밋 차단 + warning 없음 + `rig-template migrate` clean chain + ADR 0005 L1~L4 링크 + docs/06 §4 와 ADR 링크.
- `docs/06-post-processing-pipeline.md`
  - §4.4 "불변식 — 번들 path 보존 (ADR 0005 L4)" 신설 (§4.3 자동 검증 뒤, §5 앞).
  - `assembleWebAvatarBundle` textureOverrides path 가드 근거 + `@geny/exporter-pipeline` `runWebAvatarPipeline` 참조 구현 + golden step 16 byte-equal 회귀.
- `progress/INDEX.md`
  - §3 Rig & Parts 행에 "**46 docs/03 §13.1 + docs/06 §4.4 교차 참조**" 추가.
  - §4 세션 46 로그 행 추가 (세션 45 뒤, 오름차순 유지).
  - §8 다음 3세션 예고 rotate — 46 제거, 47/48 유지, 49 추가 (C10 base-specific 분리 설계).

## 검증

- `pnpm run test:golden` → 19/19 step pass (docs 전용 변경, 코드/테스트 무변).
- validate-schemas `checked=186` 불변.
- 링크 sanity: `grep -n "0005" docs/03 docs/06` 가 기대 위치에서 매치.

## Follow-ups

- 세션 47: worker-generate 큐 영속성 검토 (JobStore 인터페이스가 Redis/BullMQ/SQLite 드라이버 교체에 충분한지).
- 세션 48: Foundation Exit #2 릴리스 게이트 정리 — Gitleaks/Trivy CI 추가.
- 세션 49: C10 regex base-specific 분리 (`--base <name>` 플래그 또는 template manifest 필드).

## 커밋

- `docs/03-rig-template-spec.md`
- `docs/06-post-processing-pipeline.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-46-adr-0005-docs-crossref.md`
