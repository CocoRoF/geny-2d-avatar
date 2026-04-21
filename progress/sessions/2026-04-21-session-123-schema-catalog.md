# Session 123 — schema/README 재작성: v1 스키마 22 종 실측 카탈로그

- **Date**: 2026-04-21
- **Workstreams**: Data / Platform (문서 축)
- **Linked docs**: `docs/03` · `docs/04` · `docs/05` · `docs/06` · `docs/08` · `docs/11` · `docs/12`
- **Linked ADRs**: `progress/adr/0002-schema-first-contract.md`

---

## 1. 목표 (Goals)

- [x] `schema/README.md` 의 **구조 블록** 을 현 `schema/v1/` 실측 (21 `.schema.json` + `common/ids.json` = 22) 과 일치시킨다.
- [x] 존재하지 않는 placeholder (`style-profile.schema.json`, `export-job.schema.json`, `schema/examples/`) 를 제거하고, 누락된 8 스키마 (adapter-catalog / deformers / motion-pack / palette / parameters / physics / pose / test-poses) 를 추가한다.
- [x] 세션 122 에서 확립한 **4-라인 고정 구조** (보장/소비자/Docs/도입) 를 schema 카탈로그에도 적용한다.

## 2. 사전 맥락 (Context)

- 이전 세션 (122) — `progress/runbooks/02-golden-step-catalog.md` 신규 + CI 30 step × 5 분류 × 4-라인 색인. 인접 드리프트 (`scripts/README.md` · INDEX §1·§2) 해소.
- 세션 121 D1 — **claims vs logs 분리 원칙**: 현재 상태 문서(INDEX/SUMMARY/memory/각 README)는 **제자리에서** 갱신, 세션 로그는 역사 기록으로 불변. 본 세션의 `schema/README.md` 는 전자 — in-place 재작성이 정석.
- 세션 122 D2 — **4-라인 고정 구조**: 보장(invariant) / 소비자(consumer) / Docs(anchor) / 도입(session). golden step runbook 에서 30 항목에 동일 포맷 적용. 본 세션에 재활용.
- 실측 (session 시작 시):
  - `schema/v1/` = 21 `.schema.json` + `common/ids.json` = 22.
  - 현 README `구조` 블록 = 14 실존 + 2 placeholder = 16 (8 누락 + 2 가공).
  - `schema/examples/` 디렉터리 **미존재** (README 마지막 줄 언급).
  - `validate-schemas.mjs` 실측 = `checked=244 failed=0` (README 에는 "세션 02 예정" 문구만 — CI 게이트 골든 승격 이력 미반영).
- 차단 요소: 없음 (자기완결적 문서 축).
- 가정: docs/05 §12.6 adapter-catalog 는 세션 30 도입(git log 확인), docs/06 §6.4 palette 는 세션 32, 나머지 6 은 세션 01~05 초기 저작 — `git log --diff-filter=A` 로 실측.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| schema/README.md 재작성 | `schema/README.md` | 22 스키마 실측 카탈로그 + 7 그룹 (리그·파츠 5 / 모션·표정·포즈 4 / 번들 5 / AI 3 / 라이선스 3 / 후처리 1 / 공용 1) + 각 항목 4-라인 + placeholder/examples 언급 제거 | 🟢 |
| 세션 doc | `progress/sessions/2026-04-21-session-123-schema-catalog.md` | 템플릿 9 섹션 + 결정 3 건 | 🟢 |
| INDEX/PLAN/SUMMARY 갱신 | `progress_0420/{INDEX,PLAN,SUMMARY}.md` | 세션 123 ✅ 기록 + `schema/README` 메타 정합성 축 추가 + 세션 124 후보 (거의 소진) | 🟢 |
| auto-memory 갱신 | `memory/project_foundation_state.md` | 세션 123 스냅샷 반영 | 🟢 |

## 4. 결정 (Decisions)

### D1. 재작성 위치 — `schema/README.md` (in-place) vs `progress/runbooks/03-schema-catalog.md` (신규 runbook)

**선택**: in-place 재작성 (`schema/README.md`).

**근거**:
- 세션 121 D1 **claims vs logs 분리 원칙**: 디렉터리별 현재 상태는 그 디렉터리의 canonical README 에 둔다 — schema/ 의 canonical 은 `schema/README.md` 자체이며, 이미 존재한다(드리프트만 있음).
- runbook 의 목적은 **운영 경로 색인** (01 비상 / 02 정상 CI). schema 는 개발자가 "어떤 스키마가 있지?" 에 답하는 **정적 카탈로그** — 다른 축.
- 새 runbook 을 만들면 `schema/README.md` 와 중복되어 또 다른 드리프트 원점이 된다.

### D2. 7 그룹 분류 — 기능축 vs docs 챕터축

**선택**: **기능축 + docs 챕터 크로스 레퍼런스**. 리그·파츠 (docs/03·04) / 모션·표정·포즈 (docs/03§6·11§3) / 번들 (docs/11§3·§4) / AI (docs/05) / 라이선스 (docs/11§9) / 후처리 (docs/06) / 공용.

**근거**:
- docs 챕터축만으로는 docs/11 이 9 개를 담아 그룹이 불균등(번들 + 라이선스 + pose + expression). 독자가 "어떤 계약이 있는지" 파악하기 어렵다.
- 기능축이면 리그 5 / 모션 4 / 번들 5 / AI 3 / 라이선스 3 / 후처리 1 / 공용 1 = 22 로 짝수 가까이 분포, 개발자가 찾기 쉽다.
- 각 그룹 헤더에 `(docs/NN)` 앵커를 병기해 docs 축으로도 진입 가능.

### D3. legacy placeholder 처리 — `style-profile` / `export-job` 완전 제거

**선택**: README 에서 완전 삭제. docs 챕터는 유지 (docs/10 §3, docs/12 §4.9 는 계획 문서).

**근거**:
- 두 스키마는 **한 번도 작성된 적이 없음** (`git log schema/v1/style-profile.schema.json` → 이력 없음).
- "(미작성)" 주석을 단 채 남기면 **"곧 쓸 예정"** 으로 오독될 위험 — Foundation 은 끝났고 둘 다 Runtime 이후 스코프.
- docs 챕터에 아직 §3/§4.9 기술이 있으면 그곳에서 안내되며, 스키마 실측 카탈로그와는 층이 다름.
- 데이터의 최후 권위는 `schema/v1/` 디렉터리 그 자체 — ls 결과와 일치시키는 것이 최소 보장.

## 5. 변경 요약 (Changes)

- `schema/README.md` — §2 "구조" 블록 ASCII 트리를 **§2 "카탈로그 (v1 — 22 계약)"** 으로 전면 교체. 7 그룹 × 4-라인 × 22 항목. §3 "검증" 에 `checked=244 failed=0` 실측 + golden step 1 pointer (`progress/runbooks/02-golden-step-catalog.md §1`). `schema/examples/` 언급 제거 (디렉터리 미존재).

## 6. 블록 (Blockers / Open Questions)

- 없음. 외부 의존 없는 문서 재작성.
- 열린 질문: 세션 124 진입점 — 자율 후보가 실질적으로 소진됨 (§ 7 참조).

## 7. 다음 세션 제안 (Next)

**자율 후보 소진 신호**. 세션 117~123 로 문서·분석·검증·색인·카탈로그 축 전부 정리됨:
- 121 (progress_0420 메타) → 122 (golden step runbook) → 123 (schema/README) = 3 연속 문서 축.
- 남은 후보:
  - **J renderer-observer** — ROI 낮음 (세션 117~119 에서 이월, 외부 소비자 없음).
  - **I Server Headless ADR** — 사용자 의사 선행 필요 (ADR 0007 Draft 리뷰 대기 중, Headless 는 0007 결정에 의존).
  - **1차 Runtime 진입** — ADR 0007 Accept 전에는 불가.
- 권장: **ADR 0007 리뷰 대기**. 자율로 더 얇은 문서 축을 짜내기보다 사용자 입력을 기다리는 편이 정확.
- 세션 124 자율 대안(극저 ROI): (α) docs/ 와 packages/ README 간 anchor 유효성 1-pass 스캔 / (β) `progress/adr/*` 의 docs 역참조 색인 생성 / (γ) `progress/runbooks/` 3번째 항목 — rig-template-lint C1~C14 rule 카탈로그.

(γ) 가 셋 중 가장 자기완결적·값 있음 — 현재 14 rule 의 보장·테스트 케이스·도입 세션이 `@geny/rig-template-lint` 코드에만 존재, 운영/검수 관점 색인 없음.

## 8. 지표 (Metrics)

- 변경 라인: `schema/README.md` 46 → 140+ 줄 (카탈로그 22 항목 × 4 라인 + 그룹 헤더 7).
- 테스트: `pnpm run test:golden` 은 이 변경에 무관 (README 만 수정), `node scripts/validate-schemas.mjs` → `checked=244 failed=0` ✓.
- 빌드: 해당 없음 (문서).
- 드리프트 수정: 2 제거 (style-profile / export-job placeholder) + 1 제거 (`schema/examples/` 언급) + 8 추가 (adapter-catalog / deformers / motion-pack / palette / parameters / physics / pose / test-poses).

## 9. 인용 (Doc Anchors)

- [docs/03-rig-template-spec.md §3·§4·§6](../../docs/03-rig-template-spec.md)
- [docs/04-part-slot-spec.md §3](../../docs/04-part-slot-spec.md)
- [docs/05-ai-generation-pipeline.md §2.2·§12.6](../../docs/05-ai-generation-pipeline.md)
- [docs/06-post-processing.md §6.4](../../docs/06-post-processing.md)
- [docs/08-qc-and-review.md §3](../../docs/08-qc-and-review.md)
- [docs/11-bundle-format.md §3·§4·§9](../../docs/11-bundle-format.md)
- [docs/12-api-and-data.md §3·§4.5·§4.9·§4.10](../../docs/12-api-and-data.md)
- [ADR 0002](../adr/0002-schema-first-contract.md) · [ADR 0003](../adr/0003-rig-template-versioning.md)
- [세션 122 runbook](../runbooks/02-golden-step-catalog.md) — 4-라인 구조 선례.
