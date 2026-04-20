# 세션 113 — ADR 0007 (브라우저 런타임 렌더러 기술 선택) 초안

- **날짜**: 2026-04-21
- **선행**: 세션 112 (C14 parts↔deformers, 리그 저작 게이트 L2 포화).
- **상태**: ✅ completed (ADR **Draft**. Decision 공란 — 사용자 리뷰 대기).
- **변경 범위**: `progress/adr/0007-renderer-technology.md` (신규), `progress_0420/{INDEX,PLAN,SUMMARY}.md` 갱신, 세션 문서.

## 1. 동기

세션 112 로 self-contained lint 확장 여지가 소진됐다. `progress_0420/PLAN.md §7` 의 자율 모드 지침대로 다음 단계를 "사용자 판단 선행이 필요한 후보"로 옮기기 전에, **Runtime 전환(후보 F) 진입 선행 자료** 를 미리 정리해둬야 한다. ADR 0007 은 네 렌더러 경로 — PixiJS / Three.js / Cubism Web SDK / 자체 WebGL2 — 를 한 문서에서 저울질한 Draft 이며, Decision 은 사용자 / PM 리뷰 대기.

`docs/13-tech-stack.md §2.2` 가 이미 "WebGL2 우선, PixiJS β / 자체 미니 런타임 GA" 라는 잠정안을 갖고 있지만, 이는 **합의 절차 없이** 기술 스택 문서 한 줄에 묻혀 있어 ADR 레벨의 권위가 없다. 같은 문서가 pending ADR 이름으로 `0013-pixijs-vs-own-mini-renderer.md` 를 적고 있는데 저장소의 실제 ADR 번호 운영(0001→0006 순차)과도 어긋난다. 본 ADR 은 번호를 **0007 로 통일** 하면서 잠정안을 **옵션 비교표** 로 승격시켰다.

## 2. 변경

### 2.1 `progress/adr/0007-renderer-technology.md` (신규, ~200 줄)

- **Status**: Draft (pending decision). "Accepted 로 승격되는 시점은 별도 커밋" 명시.
- **Scope / Non-goals** 를 명확히 분리 — in: 브라우저 런타임 렌더러만. out: 서버 Headless Renderer (docs/08 §4), Cubism Export (docs/11 §3), 모바일 네이티브.
- **Context** 에 현재 번들 계약 (`packages/web-avatar/src/types.ts:62-76` 의 `WebAvatarJson`) 을 직접 인용 — 렌더러가 "변환 없이" 먹어야 할 형태를 고정.
- **Options** 5 개 (A~E):
  - A: PixiJS v8 (MIT, scene-graph + mesh, fit 🟢 중상)
  - B: Three.js r160+ (MIT, 2D 에 과잉, fit 🟡 중)
  - C: Cubism Web SDK (상용, 벤더 종속 + moc3 변환 필수, fit 🔴 낮음 — 단, Cubism Import Viewer 가 제품 요구로 확정되면 부분 채택 가능)
  - D: 자체 WebGL2 (MIT-free, 번들 ~40KB 이상적이지만 β 납기 리스크 과도)
  - E: 하이브리드 A→D (`docs/13 §2.2` 잠정안의 공식화, 인터페이스 패키지 선행 분리가 실현 조건)
- **Decision 공란** — 4 가지 확정 경로를 명시 (E 권장 기본값 / D 직진 / A 고정 / C 부분 채택).
- **Consequences** 공통 + 옵션별 테이블 (번들 크기 / 라이선스 / 초기 구현 속도 / GA 까지 위험 / 교체 비용 5 축).
- **Open Questions 4 개** — (1) Cubism Import 제품 요구 여부 (2) iOS Safari 지원 타임라인 (3) Server Headless Renderer 와의 코드 공유 정책 (4) 성능 목표 (fps / 파츠 한계).
- **Follow-ups 5 개** — 리뷰 승격, Spike 세션, docs/13 재작성, Server Headless 별도 ADR, Cubism Import 결정.

### 2.2 `progress_0420/INDEX.md`

- §1 헤더 "세션 112 직후" → "세션 113 직후", 누적 세션 112 → 113 (4일 → 5일 — 2026-04-21 진입).
- §3 ADR 테이블에 0007 행 추가 (Status: **Draft**).

### 2.3 `progress_0420/PLAN.md`

- §7 "다음 즉시 행동" 을 세션 113 → 세션 114 로 전진. ADR 0007 초안 완료 상태 반영.

### 2.4 `progress_0420/SUMMARY.md`

- 타임라인 항목 14 로 세션 113 추가 — "ADR 0007 Draft 로 Runtime 전환 선행 문서 정비".
- §13 pending 테이블의 ADR 0007 상태 ⚪→Draft 로 변경.

## 3. 결정

### D1 — **Draft 로 커밋, Decision 공란 유지**

자율 모드가 의사결정 지점을 침범하지 않도록 Decision 을 쓰지 않았다. 대신 4 가지 확정 경로를 나열해 **사용자가 prompt 한 줄로 pick** 할 수 있도록 정리. ADR 0006 같은 "Accepted at creation" 패턴과 대비되지만, 본 결정은 번들 크기/라이선스/일정을 동시에 묶는 프로덕트 결정이므로 엔지니어링만으로 닫을 수 없다.

### D2 — **ADR 번호 통일 (0007)**

`docs/13 §2.2` 가 pending 이름으로 `0013-pixijs-vs-own-mini-renderer.md` 를 적고 있지만 이는 과거 잠정치. 저장소 ADR 번호는 순차(0001~0006)이므로 본 ADR 도 0007 로 통일. docs/13 측 수정은 본 ADR "Follow-ups" 에 포함 — 사용자 승격 커밋 시 동반 수정 권장.

### D3 — **Option B (Three.js) 를 "fit 열위" 로 기록**

본 저자 판단: 2D 도메인에서 3D 엔진은 기능 과잉이며 유일한 강점(morph target expression blend)도 A/D 로 재현 가능. 명시적 반대 의견이 없으면 탈락 후보 — 리뷰 시 되살릴 수 있게 표는 남겼다.

### D4 — **Option C (Cubism Web SDK) 를 "부분 채택 가능" 으로 열어둠**

전체 채택은 기각 (라이선스·avatar-as-data 철학 충돌). 그러나 "Cubism Editor 에서 만든 에셋을 불러와 보여주는 Viewer" 가 제품 요구에 들어가면 **병렬 렌더러 레인** 으로 도입 가능. 이 질문은 Open Question #1 로 남겼다.

### D5 — **Foundation Exit 4/4 는 여전히 유효**

본 ADR 은 Runtime 전환 선행 자료이지 Foundation 범위 재검토가 아니다. `<geny-avatar>` 의 현 happy-dom 모의 렌더 계약은 그대로 유지되며, 어떤 옵션을 골라도 `ready/parameterchange/motionstart/expressionchange` 4 이벤트는 보존 대상.

## 4. 테스트 결과

문서 변경만 — 코드 / 테스트 / 골든 회귀 없음. ADR 문서는 `docs/*` / `progress/*` 영역이라 CI 의 golden lane 영향도 0.

## 5. 영향 · 후속

- **세션 114 후보**: 사용자 리뷰 대기 기간에 자율 모드에서 열 수 있는 self-contained 후보가 없다면 **"인터페이스 패키지 선행 분리"** Spike 가 가장 합리적. Option E 의 실현 조건이자 A/D/E 어디로 가도 버려지지 않는 작업 — `packages/web-avatar/src/types.ts` 에서 `RendererBundleMeta` / `RendererHost` 등 duck-typed 인터페이스를 추출해 `@geny/web-avatar-renderer` 라는 새 패키지로 승격하면 ADR Decision 확정 전에도 코드 조직을 개선 가능.
- **Open Questions 는 사용자 선행 판단** — 자율 모드에서 닫지 않는다.
- **docs/13-tech-stack.md** 은 ADR 확정 후 업데이트 (pending ADR 이름 치환 + 잠정 문구 제거).

## 6. 커밋

- 단일 커밋: `docs(adr): 0007 렌더러 기술 선택 Draft (세션 113)`.
