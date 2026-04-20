# 세션 117 — `@geny/web-avatar-renderer` README 착지

- **날짜**: 2026-04-21
- **선행**: 세션 114 (계약 패키지 선행 분리) + 세션 115 (Null/Logging 구현체) + 세션 116 (apps/web-editor 첫 consumer 경로).
- **상태**: ✅ completed.
- **변경 범위**: `packages/web-avatar-renderer/README.md` (신규), `progress_0420/{INDEX,PLAN,SUMMARY}.md`, 세션 문서.
- **워크스트림**: Frontend / Platform (doc-only).

## 1. 동기

세션 114~116 3 세션에 걸쳐 `@geny/web-avatar-renderer` 는 (i) 5 인터페이스 + 2 가드 (세션 114), (ii) Renderer 베이스 + Null/Logging 구현체 2 (세션 115), (iii) `apps/web-editor` 가 `?debug=logger` 로 소비하는 첫 경로 (세션 116) 까지 확보됐다. 그러나 **패키지 자체 README 가 비어있었다** — `package.json::files: ["dist", "README.md"]` 가 이미 파일을 참조하고 있었고, 세션 114 의 sibling `@geny/web-avatar` 는 README 가 있는 상태였다.

세션 117 는 PLAN §7 후보 K 에 정렬 — "계약 수정 없이, 내부 README 만 추가" — 를 그대로 집행. ADR 0007 Draft 리뷰 대기, 실 staging 외부 의존, 실 벤더 키 외부 의존 상황에서 남은 self-contained 소규모 축 중 **가장 위험 없는 것**. 코드 변경 0, 테스트 영향 0, 골든 영향 0. 계약 패키지의 소비자 관점 문서 축이 처음으로 채워진다.

## 2. 변경

### 2.1 `packages/web-avatar-renderer/README.md` (신규)

사용자가 읽는 순서로 6 블록:

1. **현재 상태 (세션 114~116)** — 체크박스 리스트로 세 세션의 결과를 요약. ADR 0007 Decision 불변 원칙을 명시.
2. **사용 예** — (a) 타입-only 참조, (b) `createNullRenderer` 예제 + state readout 설명, (c) `createLoggingRenderer` 예제 + logger 필수 이유(D3), (d) `apps/web-editor` `?debug=logger` wire-through.
3. **API** — 5 타입 / Renderer 베이스 / 2 가드 / 2 팩토리 / LoggingRendererEvent discriminated union 전부 표로.
4. **Consumer Attachment Pattern** — 실 구현체 및 consumer 가 계약을 먹을 때 따르는 4 축 (호스트 주입 / 2 축 최소 집합 / late-attach 의무 / destroy 후 상태 동결). ADR 0007 경로별 예상 귀결 표 (A/D/E 별 패키지 분포).
5. **빌드 / 테스트** — `pnpm -F ... build` / `test` 명령 + 21 테스트 분포 + 골든 step 2 단 (build → test) 이유 (D6, 세션 115).
6. **참고 문서** — docs/13 / ADR 0007 / 세션 114/115/116 doc 상호 링크.

`apps/web-editor` 의 wire-through 는 `?debug=logger` URL 쿼리 예시 + e2e assertion 링크까지 노출. 소비자가 계약을 읽는 최초 경로에서 "이 계약이 실제로 어떻게 소비되는지" 를 바로 볼 수 있도록 했다.

### 2.2 `progress_0420/{INDEX,PLAN,SUMMARY}.md`

- INDEX 헤더 세션 116 → 117 + 패키지 행에 README 착지 언급 + Frontend 워크스트림 행에 세션 117 확장.
- PLAN 헤더 "117+" → "118+". §3 완료 표에 세션 117 ✅ (후보 K). §7 "다음 즉시 행동" 을 세션 118 로 전진 — 후보 L(나머지 프론트엔드 패키지 README 점검) + 후보 J(renderer-observer, 신중 판단) + 후보 I(Server Headless ADR, 보류).
- SUMMARY 헤더 116 → 117. §13 pending 표에 README 행 ✅ 추가 (doc-only 표시).

## 3. 결정

### D1 — **README 단일 문서 vs 별도 Consumer Guide 분리**

후보 1(**채택**): 단일 `README.md` 에 계약 + API + Consumer Attachment + 빌드/테스트를 모두 담음.
후보 2: `README.md` 는 개요만, `docs/consumer-guide.md` 혹은 `CONTRIBUTING.md` 로 심화 내용 분리.

채택 이유:
- **진입 경로 단일화**: `npm view @geny/web-avatar-renderer readme` 혹은 GitHub 패키지 페이지가 기본으로 읽는 파일은 `README.md`. 분리하면 소비자가 깊이 들어가야 attachment pattern 을 본다.
- **분량이 아직 분할을 요구할 수준 아님**: 200 줄 내외 — 스크롤 1~2 회.
- **ADR 0007 Accept 이후 분리 여지**: 실 구현체 합류 시 "렌더러 종류별 가이드" 가 필요해지면 그때 `docs/consumer-guide.md` 를 쪼개도 늦지 않음. 지금 분리하면 1~2 페이지짜리가 되어 가독성 해침.

### D2 — **ADR 0007 경로별 귀결 표를 README 에 포함 vs 링크만**

후보 1(**채택**): Option A/D/E 별로 예상 패키지 분포 + 본 패키지와의 관계를 표로 직접 기술.
후보 2: ADR 0007 을 링크만 하고 상세는 ADR 본문에 맡김.

채택 이유:
- **독자 관점**: README 를 읽는 이는 "내가 실 구현체를 쓰게 되면 본 패키지는 어떻게 관여하나?" 를 즉시 알고 싶어한다. ADR 을 따로 열게 하면 질문이 답을 얻기 전에 이탈할 가능성.
- **ADR 0007 본문 보호**: ADR 본문은 **의사결정 논의** 의 기록이지 소비자 문서가 아님. 두 축을 섞지 않음.
- **Decision 공란 상태에서의 중립성**: 표는 "Decision 불변인 부분" 만 담는다 — 각 Option 이 어떤 이름의 패키지로 등장할지 + 본 패키지가 어떤 역할을 맡을지. "어느 Option 이 권장인지" 는 ADR 의 권한으로 남김.

### D3 — **`?debug=logger` 예시를 README 에 노출**

세션 116 의 dev 전용 스위치를 README 에 포함할지 고민:
- **포함 시 (채택)**: 소비자가 "계약 + 구현체 + 실 consumer 예시" 를 한 번에 볼 수 있음. apps/web-editor 가 구체적인 참조 구현.
- **비포함 시**: dev 스위치라 production 소비자가 혼동할 여지 있음.

채택 후, 별도 섹션("apps/web-editor 의 wire-through")으로 구분 + `dev/debug` 라는 성격을 본문에 명시해 혼동 방지. production 에서는 NullRenderer 혹은 실 구현체가 자리한다는 점도 "Consumer Attachment Pattern" 섹션에서 암시.

### D4 — **세션 문서 상호 링크를 README 에 포함**

`progress/sessions/2026-04-21-session-{114,115,116}-*.md` 는 **내부 의사결정 기록** 이다. 외부 소비자(팀 외부)가 패키지를 npm 으로 설치하게 되면 이 링크들은 깨질 수 있다. 그럼에도 채택한 이유:
- **현 시점엔 private** — `package.json::private: true`. 배포 대상 아님.
- **팀 내부 온보딩 경로**: 새 세션에 합류한 Claude/사람이 "왜 이렇게 분리됐는가" 를 찾아갈 단일 경로 제공.
- **상대 경로 유지**: monorepo 루트 기준 `../../progress/sessions/...` 로 — 패키지를 tarball 로 뽑으면 링크가 깨지지만, 그 시점이 오면 README 를 재작성.

## 4. 테스트 결과

- **`@geny/web-avatar-renderer` 단위 테스트**: 21 green (세션 115 결과 불변).
- **회귀**: 골든 영향 없음 (코드/dist 변경 0, `files` 필드의 README 만 채움).
- **빌드**: `pnpm -F @geny/web-avatar-renderer build` → dist/ 변경 없음.
- **dist 바이트 무증가**: README 는 `files` 에 이미 선언돼 있어 npm pack 시 bundle 크기는 원래 규격대로. 런타임 런 바이트는 0 (README 는 빌드 산출물이 아님).

## 5. 영향 · 후속

- **계약 패키지 소비자 관점 문서 축 확립**: 지금까지 `progress/sessions/` 에만 있던 계약 설명이 소비자가 일반적으로 읽는 경로(`README.md`)로 이동. 세션 97 Runtime 착수 후 `@geny/web-avatar-renderer-pixi` 등이 합류하면 같은 패턴으로 README 를 덧붙이면 됨.
- **ADR 0007 Accept 트리거 조건 불변**: Accept 시 README §"현재 상태" + §"Consumer Attachment Pattern/ADR 0007 경로별 예상 귀결" 두 곳을 최소 업데이트. 나머지는 계약 패키지 자체 변화가 없는 한 그대로.
- **후보 J/K 의 분할 구조 확정**: PLAN §7 의 후보 K 는 본 세션으로 완결. 남은 후보 L(인접 패키지 README 점검) 은 세션 118 이후 이어받을 수 있음 (소규모 self-contained).
- **docs/13-tech-stack.md §2.2 영향 없음**: 본 README 는 `@geny/web-avatar-renderer` 패키지의 소비자 문서이고, `docs/13` 은 시스템 전체의 기술 스택 문서. 계층이 다르므로 양쪽 독립 유지.
- **세션 118 후보** (자율 모드 내에서 안전):
  - (L, 후보) 인접 프론트엔드 패키지(`@geny/web-avatar` / `-editor-logic` / `-editor-renderer`) README 점검 — 세션 114~117 맥락 추가 또는 누락 채움. self-contained, doc-only.
  - (J, 후보, 신중 판단, 세션 117 이월) `renderer-observer` 가칭 — 실 렌더러 합류 전엔 시그널 노이즈 위험.
  - (I, 보류) Server Headless Renderer ADR — 사용자 의사 선행.

## 6. 커밋

- 단일 커밋: `docs(web-avatar-renderer): 패키지 README 착지 (세션 117)`.
