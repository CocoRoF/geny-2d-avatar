# Session 08 — `packages/exporter-core` v0.0.1: 스켈레톤 + pose3 변환기

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Platform/Infra (패키지 초판)
- **Linked docs**: `docs/11 §3`, `docs/11 §3.2.1`, `docs/13 §13`
- **Linked ADRs**: `progress/adr/0003`, `progress/adr/0004`

---

## 1. 목표 (Goals)

- [x] `packages/exporter-core/` 디렉터리 생성 — pnpm workspace 에 자동 편입 (`packages/*` 와일드카드).
- [x] 결정론적(deterministic) Cubism 변환 라이브러리의 골격:
  - TypeScript, ESM, strict 모드, NodeNext 모듈 해상도.
  - `pnpm -F @geny/exporter-core build` 로 `dist/` 생성.
  - `pnpm -F @geny/exporter-core test` 로 Node built-in `node:test` 기반 golden 테스트.
- [x] `canonicalJson()` 유틸 — 객체 키 알파벳 정렬, 2-space indent, LF 줄바꿈, 마지막 개행 1개. 모든 변환기가 동일 직렬화 함수를 쓴다.
- [x] `pose3` 변환기 — 템플릿의 `pose.json` (snake_case) + parts/*.spec.json 의 `cubism_part_id` 로 Cubism `pose3.json` (PascalCase) 생성. 결과는 `docs/11 §3.2.1` 예시와 일치.
- [x] golden 회귀: halfbody v1.1.0 & v1.2.0 의 pose → 각각 기대 byte 결과를 `packages/exporter-core/tests/golden/` 에 커밋. 테스트는 byte-for-byte 비교.
- [x] 최소 CLI: `node packages/exporter-core/dist/cli.js pose --template <dir> --out <file>` — v1.2.0 로 스모크 테스트.
- [x] `packages/README.md` 에 `exporter-core` 한 줄 추가.

### 범위 경계 (세션 08b / 09 로 미룸)

- `physics3.json` 변환기 (가장 큼 — mao_pro 필드 규약 정확성 확보 필요). **세션 08b**.
- `motion3.json` 변환기 (per pack — segment 인코딩 그대로 옮김). **세션 08b**.
- `cdi3.json` — 파라미터/파츠 UI 메타 (그룹, 한국어 이름). **세션 09**.
- `model3.json` — 번들 FileReferences·Groups·HitAreas 결합. **세션 09**.
- `.moc3` 바이너리 — Live2D 라이선스 SDK 필요, 당분간 제외 (docs/11 §4.5).
- 마이그레이션 스크립트 `scripts/rig-template/migrate.mjs` — **세션 10**.

이 범위 설정은 "가장 단순한 변환기로 전체 파이프라인 틀을 잡고, 다음 세션들에서 덧붙인다" 원칙 (§4 D2).

## 2. 사전 맥락 (Context)

- ADR 0004 는 avatar 를 "template + PartInstance refs + version" 로 정의. exporter 는 이를 Cubism 번들(`avatar_{id}/`) 로 **결정론적** 변환 — 동일 입력 → 동일 바이트.
- docs/11 §3.2.1 이 pose3 의 구체 예시를 제공 — session 06 에서 도입된 arm A/B mutex 구조가 곧바로 실사용 예(halfbody v1.1.0/v1.2.0).
- docs/13 §13 의 저장소 구조는 `packages/` 에 재사용 라이브러리, `services/exporter/` 에 장기 실행 서비스를 배치. exporter-core 는 둘 사이의 공용 로직 — 배치 변환 도구·CI 골든셋·서비스 worker 모두 이 패키지를 참조.
- Foundation Exit 체크리스트(`docs/14 §3.3`) 의 "단일 아바타 생성 → 프리뷰 → Cubism export 수동 테스트 성공" 항목은 exporter-core 가 최소한의 형태로라도 존재해야 달성 가능. 세션 08a 는 그 출발점.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 패키지 스켈레톤 | `packages/exporter-core/package.json`, `tsconfig.json`, `README.md`, `src/`, `tests/` | `pnpm install` 직후 `pnpm -F @geny/exporter-core build` 통과. | ✅ |
| canonicalJson | `src/util/canonical-json.ts` | 재귀 key-sort + 2sp indent + LF + 마지막 개행. 테스트 2종 (기본 + 중첩·배열). | ✅ |
| pose3 변환기 | `src/converters/pose.ts` | 입력: `{poseDoc, partsById}`. 출력: Cubism pose3 (Type/FadeInTime/Groups). | ✅ |
| 템플릿 I/O 헬퍼 | `src/loader.ts` | `loadTemplate(dir)` → `{ manifest, parameters, deformers, physics?, pose?, parts, motions }`. | ✅ |
| golden 회귀 | `tests/golden/halfbody_v1.1.0.pose3.json`, `halfbody_v1.2.0.pose3.json` | byte-for-byte 일치. | ✅ |
| CLI | `src/cli.ts`, `bin/exporter-core.mjs` | `exporter-core pose --template <dir> --out <file>` 동작. | ✅ |
| packages/README 업데이트 | `packages/README.md` | `exporter-core` 행 추가. | ✅ |

## 4. 결정 (Decisions)

- **D1 (TypeScript + ESM + NodeNext)**: 모노레포 전체 기본 스택(docs/13). runtime 은 node ≥ 20.11 — built-in test runner(`node:test`) 사용해 Jest/Vitest 의존성 회피. 패키지 런타임 의존성 0개(devDependencies 에 `typescript` + `@types/node` 둘).
- **D2 (세션 08a 는 pose3 한 변환기만)**: 가장 작고 구조가 명확(2 mutex group × 2 items). 큰 구조 결정(모듈 경계, canonicalJson, loader, golden 회귀 워크플로)을 먼저 고정한 뒤, 세션 08b 에서 physics3/motion3 를 덧붙인다. "완벽하게" 가 아니라 "결정론 프레임이 서야" 한다.
- **D3 (canonicalJson 의 키 정렬은 ASCII 알파벳 순)**: `JSON.stringify` 의 `replacer` 로 구현. 이유: ES2020 이후 객체 키 순서는 삽입 순서 보장이지만 "저자마다 다른 순서 → 다른 바이트" 문제가 있다. 정렬은 `Intl.Collator` 없이 `String.prototype.localeCompare('en-US-u-co-standard')` 대신 `a < b` 바이트 비교로 안정성 우선 — 한글·이모지 혼입 시 locale 변동 없음.
- **D4 (pose3 Id 해상도는 parts/*.spec.json 의 cubism_part_id)**: pose.json 의 `slot_id` 는 우리 내부 ID. Cubism 런타임은 `Id` 에 실제 `PartArmLA` 등 PascalCase part id 를 요구. 매핑은 parts 스펙의 `cubism_part_id` 에 이미 존재 → 단순 lookup. 슬롯이 parts 에 없거나 `cubism_part_id` 누락 시 변환 실패(throw).
- **D5 (FadeInTime default 0.5 보존)**: pose.schema.json 의 기본값(0.5) 을 그대로 복제. 템플릿이 생략했으면 0.5 삽입 — 결정론 확보.
- **D6 (Groups 는 원래 순서 유지, Id 내부 정렬 없음)**: 다른 JSON 은 key-sort 하지만 Groups 의 **배열 원소 순서** 는 `pose.json` 원본 순서를 따른다. 이유: mutex 그룹 내 순서는 우선순위(default visible 슬롯 결정) 의미가 있음 — Cubism 런타임이 첫 Id 를 default 로 해석. 임의 정렬 금지.
- **D7 (Link 기본값 빈 배열)**: pose.schema.json 에서 `default: []`. 변환기는 원본에 `link` 가 없으면 `[]` 주입(결정론).
- **D8 (golden 비교는 byte, 텍스트 normalize 안 함)**: 생성 파일은 그대로 `readFileSync(..., 'utf8')` 로 읽고 문자열 동등성 비교. 공백·줄바꿈 차이는 곧장 실패. canonicalJson 이 그래서 중요 — 모든 생성물은 이 함수를 지나야 한다.
- **D9 (패키지 네임스페이스 `@geny/exporter-core`)**: package.json `name`. 동일 네임스페이스에 `@geny/web-avatar`, `@geny/sdk-ts` 등이 붙는다. 레지스트리 게시는 아직 아님(`private: true`).
- **D10 (tsconfig 3-split: base + build + test)**: `tsconfig.json` 은 공통 옵션만, `tsconfig.build.json` 은 `rootDir: ./src, outDir: ./dist`, `tsconfig.test.json` 은 `rootDir: ./, outDir: ./dist-test` (src+tests 둘 다 컴파일). 이유: 테스트가 `../src/...` 로 소스를 임포트해야 하는데 단일 tsconfig 로 `rootDir: ./` 하면 dist/src/index.js 가 돼 package.json `exports` 가 지저분해진다. 분리로 `dist/index.js` flat + `dist-test/` 테스트용을 동시에 얻는다.

## 5. 변경 요약 (Changes)

- 새 디렉터리 `packages/exporter-core/` — 파일 10여 개.
- `packages/README.md` — exporter-core 행 추가.
- `progress/INDEX.md` — 세션 08 row, Pipeline workstream 🟡 로 승격, next-sessions 08b/09/10 로 재배치.

## 6. 블록 (Blockers / Open Questions)

- pnpm 설치 환경이 CI 에 없음 — 세션 10 의 골든 CI 설정 시 `pnpm install --frozen-lockfile` + `pnpm -r build` 를 Github Actions 단계에 추가 필요.
- `@geny/exporter-core` 는 현재 private. 게시 여부는 SDK 정책과 연동 결정(세션 10 이후 로드맵 재평가).
- moc3 생성 불가 문제 — 외부 Cubism Editor 의존. 세션 10~12 부근에서 "moc3 없이도 VTube Studio 가 최소 로드" 시나리오 확인 필요.

## 7. 다음 세션 제안 (Next)

- **세션 08b (예정)**: `physics3.json` + `motion3.json` 변환기. physics 는 mao_pro 필드(Input/Output/Vertices/Normalization) 정확성 확보, motion 은 segment 인코딩 그대로 복제. v1.2.0 의 9 Setting · 7 motion pack 이 golden 입력.
- **세션 09**: `cdi3.json` + `model3.json` 변환기. parameters.json + deformers.json + parts/* + manifest.hit_areas → 단일 번들. 처음으로 진짜 "로드 가능한 Cubism 패키지" 산출 (텍스처·moc3 제외).
- **세션 10**: `scripts/rig-template/migrate.mjs` — v1.0.0/v1.1.0 → v1.2.0 avatar 자동 bump. `samples/avatars/sample-01-aria` 재작성. 골든셋 CI 편성.

## 8. 지표 (Metrics)

- **패키지 수**: packages/ 하위 2개 (README만 제외하면 실제 빌드 패키지 1개 — `@geny/exporter-core`).
- **빌드 산출물**: `packages/exporter-core/dist/` — `index.js` + `cli.js` + `loader.js` + `converters/pose.js` + `util/canonical-json.js` (+ d.ts + source map).
- **골든 fixture**: 2 (halfbody v1.1.0 + v1.2.0 의 pose3).
- **테스트 수**: 10 (canonicalJson 4 + pose3 6: golden ×2 + 단위 ×4).
- **라인 수**: 488 (src + tests 합계, `wc -l`).
- **검증**: `node scripts/validate-schemas.mjs` → `checked=124 failed=0` (변경 없음). + 신규 `pnpm -F @geny/exporter-core test` → 10/10 pass. + CLI 스모크: `node packages/exporter-core/dist/cli.js pose --template rig-templates/base/halfbody/v1.2.0 --out <tmp>` → golden 과 byte-for-byte 일치 (343 bytes).

## 9. 인용 (Doc Anchors)

- [docs/11 §3 Cubism 번들 구조](../../docs/11-export-and-deployment.md#3-cubism-핵심)
- [docs/11 §3.2.1 Pose3 대체 포즈 그룹](../../docs/11-export-and-deployment.md#321-pose3-대체-포즈-그룹)
- [docs/13 §13 저장소 구조](../../docs/13-tech-stack.md#13-저장소-구조repo-layout-제안)
- [ADR 0004 참조형 아바타](../adr/0004-avatar-as-data.md)
