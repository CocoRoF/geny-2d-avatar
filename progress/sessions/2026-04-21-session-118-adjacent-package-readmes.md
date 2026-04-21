# 세션 118 — 인접 프론트엔드 패키지 README 점검 (후보 L)

- **날짜**: 2026-04-21
- **선행**: 세션 117 (`@geny/web-avatar-renderer` README 착지). 같은 doc-only 패턴을 인접 3 패키지에 확장.
- **상태**: ✅ completed.
- **변경 범위**: `packages/web-editor-logic/README.md` (신규), `packages/web-editor-renderer/README.md` (신규), `packages/web-avatar/README.md` (갱신), `progress_0420/{INDEX,PLAN,SUMMARY}.md`, 세션 문서.
- **워크스트림**: Frontend / UX (doc-only).

## 1. 동기

세션 117 에서 `@geny/web-avatar-renderer` 의 README 를 착지 — 계약 패키지의 소비자 관점 문서 축을 처음으로 채웠다. PLAN §7 의 후보 L 은 자연스러운 확장 — 인접 프론트엔드 패키지 3 개의 README 상태를 점검하고 누락/스테일 항목을 보강한다. 모두 self-contained, doc-only, 코드 변경 0, 테스트 영향 0, 골든 영향 0.

선행 확인 결과:

| 패키지 | 기존 README | 조치 |
|---|---|---|
| `@geny/web-editor-logic` | **부재** | 신규 (세션 89/95/98/100~107 맥락 반영) |
| `@geny/web-editor-renderer` | **부재** | 신규 (세션 91/92/114 맥락 반영) |
| `@geny/web-avatar` | **존재 (세션 18 stage 2 기준)** | 스테일 — 세션 90(`setParameter`)/94(`playMotion`·`setExpression`)/114(렌더러 계약 분리) 미반영 |

후보 L 은 자율 모드에서 안전하게 소화 가능한 마지막 self-contained 축 — ADR 0007 Decision 이 채워지기 전까지 코드 기여는 외부 의존(사용자 리뷰 / 실 렌더러 합류) 을 기다려야 한다.

## 2. 변경

### 2.1 `packages/web-editor-logic/README.md` (신규)

사용자가 읽는 순서로 6 블록:

1. **현재 상태 (세션 89 → 107)** — `categoryOf` / `categorize` / `parametersForPart` 3 공개 API + 상수 3 개 (`CATEGORY_ORDER`, `GROUPS_FOR_CATEGORY`, `OVERALL_GROUP`).
2. **사용 예** — 사이드바 그룹 빌더 + 파츠 선택 → 파라미터 서브셋.
3. **API** — 3 함수 각각의 시그니처 + `categoryOf` role prefix 매칭 규칙 표 + `parametersForPart` 3-단 우선순위(parameter_ids 명시 ≻ role substring ≻ category group whitelist).
4. **타입** — `Category` / `PartLike` / `ParameterLike` 전부 명시. `PartLike.parameter_ids` 가 세션 98 opt-in 된 점 명시.
5. **소비자** — `apps/web-editor/index.html` 사이드바 + `e2e-check.mjs::runCategorize` + `parametersForPart` 카디널리티 어서션.
6. **빌드 / 테스트** + **참고 문서** — 세션 89/95/98 링크.

공식 5 템플릿에서 role→Other 매칭이 **0 개** 인 불변식 (세션 89 D1) 을 명시적으로 독립 박스로 떼 문서 중앙에 기록 — e2e 쪽 assertion 과 문서가 지탱하는 계약이 같다.

### 2.2 `packages/web-editor-renderer/README.md` (신규)

사용자가 읽는 순서로 6 블록:

1. **현재 상태 (세션 91 → 114)** — `createStructureRenderer` / 파라미터 기반 회전 / 양방향 선택 바인딩 / late-attach / `@geny/web-avatar-renderer` 계약 소비.
2. **사용 예** — `createStructureRenderer({ element, mount, onSelectPart })` + `setSelectedSlot` 프로그래매틱 선택 + getter 3 개.
3. **API** — 4 옵션 + `StructureRenderer` 5 멤버 모두 표로.
4. **`@geny/web-avatar-renderer` 계약과의 관계** — 세션 114 에서 승격 분리된 5 인터페이스(`RendererPart` / `RendererBundleMeta` / `RendererHost` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail`)의 **type-only import** 정책 + 런타임 JS dist 에 참조 0 건 검증 방법(`grep @geny/web-avatar-renderer packages/web-editor-renderer/dist/*.js` → 0). ADR 0007 Accept 이후에도 본 패키지의 구조 프리뷰 역할 불변.
5. **소비자** — `apps/web-editor` Preview + `apps/web-editor/scripts/e2e-check.mjs::runRendererMount`.
6. **빌드 / 테스트** + **ADR 0007 이후 진화 경로** 표 (A/D/E 각 옵션별 본 패키지 행로) + **참고 문서** — docs/09 / ADR 0007 / 세션 91/92/114 링크.

ADR 0007 경로별 표는 세션 117 README 와 동일 형식 — 본 패키지가 "구조 프리뷰 전용" 으로 유지되는 경우(A) / "dev-debug 모드 전용" 으로 강등되는 경우(E) 를 모두 독자에게 사전 제시.

### 2.3 `packages/web-avatar/README.md` (갱신, 2 블록)

기존 README 는 세션 18 stage 2 기준 — `setParameter` / `playMotion` / `setExpression` 이 "아직 throw" 인 것처럼 기술됐다. 세션 90 에서 write-through 구현됐고 세션 94 에서 모션/표정 상태 API 가 더해졌음에도 README 가 반영을 못 했다. 세션 114 의 렌더러 계약 분리도 누락.

두 지점을 **targeted Edit** 으로 갱신:

- (1) "현재 상태" 블록을 "세션 18 → 114" 로 재작성 — 체크박스 5 항목(번들 로더 / Custom Element + 5 이벤트 / 텍스처 atlas / 파라미터 write-through 세션 90 / 모션·표정 API 세션 94 / 렌더러 계약 분리 세션 114).
- (2) 이벤트 섹션을 5-row 표(`ready` / `error` / `parameterchange` / `motionstart` / `expressionchange`) + 상태 API 섹션(`setParameter` / `getParameters` / `playMotion` / `setExpression` / `currentMotion` / `currentExpression`) + 새 "렌더러 계약 (`@geny/web-avatar-renderer`)" 섹션 + "향후 계획 (Runtime 단계)" 로 확장.

**"렌더러 계약" 섹션** 은 본 패키지가 `@geny/web-avatar-renderer` 에 **의존하지 않는다** 는 docs/01 §8 계약을 명시. 렌더러 구현체(구조 프리뷰 `@geny/web-editor-renderer`, 테스트 더블 Null/Logging, 향후 PixiJS/WebGL2 실 구현체)는 전부 `<geny-avatar>` 의 **이벤트 계약** 을 통해 attach — 일방향 구독 패턴이 양방향 의존 제거.

## 3. 결정

### D1 — **`packages/web-avatar/README.md` 부분 갱신 vs 전면 재작성**

후보 1(**채택**): **두 지점만 Edit 으로 targeted 갱신** — 스테일한 "현재 상태" + 이벤트 섹션을 치환, 나머지(사용 예 / 입력 포맷 / `loadWebAvatarBundle` API / 결정론 규칙)는 세션 18 기준도 여전히 정확하므로 보존.
후보 2: 전면 재작성.

채택 이유:
- **정확한 부분 보존**: "사용 예" / "입력 포맷" / "결정론 규칙" 섹션은 세션 18 이후 **스키마 및 번들 빌더 경로 불변** — 전면 재작성 시 동일 문구 재생산 비용.
- **변경 diff 최소화**: 리뷰어/자율 모드 후속 세션이 "무엇이 왜 바뀌었나" 를 빠르게 읽을 수 있음.
- **스테일 구역 명확화**: 세션 90(`setParameter` 구현됨) / 세션 94(`playMotion`·`setExpression` 구현됨) / 세션 114(렌더러 계약 분리) 이 명시적으로 스테일한 두 지점이었다 — 그 두 지점만 치환.

### D2 — **3 패키지에 개별 README vs 단일 멀티패키지 README**

후보 1(**채택**): 각 패키지 안에 독립 README.
후보 2: `packages/README.md` 루트에 멀티패키지 개괄.

채택 이유:
- **npm/GitHub 패키지 페이지 경로**: 각 패키지의 `package.json::main` 옆 README 가 기본 진입점. 루트 README 는 그 진입을 대체하지 않음.
- **독립 소비 가능성**: `@geny/web-editor-logic` 은 이론상 외부 소비자 가능(3 공개 API). 독립 README 로 soft-boundary 유지.
- **세션 117 과 대칭**: 세션 117 의 `@geny/web-avatar-renderer/README.md` 도 패키지-독립 문서였다 — 같은 패턴을 적용.

### D3 — **세션 문서 상호 링크를 3 README 모두에 포함**

세션 117 D4 와 동일 판단 — 현 시점 `private: true`, 팀 내부 경로, 상대 경로 유지(`../../progress/sessions/...`). tarball 배포 시점에는 README 재작성. 각 README 의 참고 문서 섹션에 **관련 세션 3~4 개** 만 인용 — noise 방지.

| README | 인용 세션 |
|---|---|
| `web-editor-logic` | 89 (패키지 분리) / 95 (`parametersForPart` 도입) / 98 (`parameter_ids` 명시 계약) |
| `web-editor-renderer` | 91 (착지) / 92 (선택 바인딩) / 114 (계약 승격 분리) |
| `web-avatar` | 18 (번들 로더 + Custom Element) / 90 (`setParameter`) / 94 (모션·표정) / 114 (렌더러 계약 분리) |

### D4 — **기존 "향후 계획 (Stage 3+ 이후)" 문구 제거**

`packages/web-avatar/README.md` 의 세션 18 당시 "Stage 3+" 용어는 `docs/11 §7` 의 Foundation → Runtime 2 단 구조로 바뀐 뒤엔 스테일(stage 구분이 더 이상 외부 문서에 존재하지 않음). "향후 계획 (Runtime 단계)" 로 이름 교체 + **본 패키지 계약 불변** 명시를 세션 114 의 설계 의도와 정렬.

### D5 — **3 README 공통 구조(6 블록)**

세션 117 README 의 6 블록 구조(현재 상태 / 사용 예 / API / 계약 관계 / 빌드 테스트 / 참고 문서)를 **3 README 모두에 적용** — 독자가 인접 패키지를 읽을 때 섹션 순서가 동일해 "어디서 무엇을 찾을지" 를 일관되게 예측 가능. `web-avatar` 만은 기존 "입력 포맷" / "결정론 규칙" 섹션이 있어 7 블록이 됐지만, **세션 117 형식과 crosslink 가능한 최소 구조** 는 공유.

## 4. 테스트 결과

- **코드 변경 0**: `dist/` 영향 없음 (README 는 빌드 산출물이 아님).
- **골든 영향 0**: 30 step 불변.
- **패키지 테스트 영향 0**: 모든 패키지 테스트는 README 를 읽지 않음 — 회귀 위험 없음.
- **dist 바이트 영향 0**: README 는 `files` 필드에 이미 등재돼 있어 (해당 2 패키지는 `web-editor-logic` + `web-editor-renderer`) npm pack 시 tarball 에만 추가. 런타임 JS 바이트는 무증가.

## 5. 영향 · 후속

- **프론트엔드 패키지 문서 축 완결**: Foundation 15 패키지 중 프론트엔드 층 4 개(`@geny/web-avatar` / `-avatar-renderer` / `-editor-logic` / `-editor-renderer`) 모두 README 확보. 세션 117 이 앞문, 본 세션이 인접 3 개. 남은 11 패키지는 exporter / ai-adapter / post-processing / job-queue / worker / schema / metrics-http / migrator — 현재 README 상태는 이 세션 범위 밖.
- **세션 117 패턴 재사용 증거**: 6 블록 구조 + ADR 0007 경로별 표 + 참고 문서 상호 링크 패턴이 3 패키지 모두에 자연스럽게 적용 — 동일 패턴이 외부 패키지(npm 배포 전 prod-grade README 재작성 시)에도 전용 가능한 **템플릿** 으로 승격 여지 확보.
- **docs/11 §4 와의 중복**: `@geny/web-avatar` README 의 "사용 예" 는 docs/11 §4 와 일부 중복. 의도된 중복 — 소비자는 **패키지 내부 README** 를 먼저 읽는다. 수정 시 양쪽 동기화 의무.
- **세션 119 후보** (자율 모드 내에서 안전):
  - (M, 후보) 나머지 11 패키지 README 상태 점검 — 추가 누락/스테일 발견 시 보강. self-contained, doc-only.
  - (J, 후보, 신중 판단, 세션 117~118 이월) `renderer-observer` 가칭 — 실 렌더러 합류 전엔 시그널 노이즈 위험, ROI 낮음. **의견 필요**.
  - (I, 보류) Server Headless Renderer ADR — 사용자 의사 선행.
- **ADR 0007 Accept 대기 불변**: 본 세션은 계약 / 구현체 / consumer 경로 모두 불변. Accept 시 4 README 중 `@geny/web-avatar` + `@geny/web-avatar-renderer` 의 "현재 상태" / "Consumer Attachment Pattern" 섹션을 최소 업데이트. `@geny/web-editor-logic` / `@geny/web-editor-renderer` 는 렌더러 선택 무관.

## 6. 커밋

- 단일 커밋: `docs(web-editor-logic,web-editor-renderer,web-avatar): 인접 패키지 README 점검 (세션 118)`.
