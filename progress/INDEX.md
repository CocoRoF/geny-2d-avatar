# Progress Index

이 폴더는 구현 진행 사항의 단일 진실 공급원이다.
기획 문서(`docs/`) 는 **무엇을/왜**, 이 폴더는 **언제/어떻게/어디까지** 를 기록한다.

---

## 1. 추적 규칙

1. **모든 세션은 로그를 남긴다.** 빈 세션도 "왜 아무것도 안 했는가" 를 남긴다.
2. **로그 파일명**: `sessions/YYYY-MM-DD-session-NN-slug.md`. 하루 여러 세션이면 `NN` 증분.
3. **완료의 기준은 지표로**. "대충 됐다" 없음. 각 산출물의 "Done 정의" 가 있어야 한다.
4. **문서와 코드의 어긋남은 즉시 ADR**. 기획을 바꿀 땐 `docs/` 의 해당 문서 CHANGELOG 도 갱신.
5. **로드맵 대응**: 모든 작업은 `docs/14-roadmap-and-milestones.md` 의 워크스트림 중 하나에 귀속된다.

---

## 2. 현재 단계

| 항목 | 상태 |
|---|---|
| **현재 단계** | Foundation (2026 Q2 초) — `docs/14 §3` |
| **목표** | 단일 아바타를 API 호출 → 프리뷰 → Cubism export 까지 end-to-end |
| **완료 예정** | 2026 Q2 말 이전 |

Foundation Exit 체크리스트 (`docs/14 §3.3`):
- [ ] 단일 아바타 생성 → 프리뷰 → Cubism export 수동 테스트 성공 (세션 19 — 드라이버 완 + 세션 20 — D 단계 HTTP 자동화 + 세션 23 — happy-dom 기반 `<geny-avatar>` DOM lifecycle 회귀 (`ready`/`error`/stale-src cancel) 가 `test:golden` step 10 으로 CI 고정. 체크리스트 [`progress/exit-gates/01-single-avatar-e2e.md`](./exit-gates/01-single-avatar-e2e.md). E 단계(브라우저 시각 + Cubism Viewer) 수동 pass-through 필요)
- [x] CI 에서 골든 1 아바타 회귀 자동 (세션 10 + 세션 20 + 세션 23, `.github/workflows/ci.yml` + `pnpm run test:golden` 10 step)
- [ ] 관측 대시보드 3종 기본 동작 (세션 17 — config 완: `infra/observability/` Prometheus scrape + 3 alert rule + Grafana 3 대시보드 JSON. 실 배포는 Helm 세션)
- [x] 개발자 온보딩 1일 (세션 16 — 루트 README quickstart·9 CLI 표·troubleshooting 7종·scripts/Taskfile 갱신)

---

## 3. 워크스트림 상태

`docs/14 §9` 기준. 각 스트림의 **현재 산출물** 을 한 줄로.

| 스트림 | Foundation 목표 | 현재 상태 |
|---|---|---|
| **Rig & Parts** | `halfbody v1` 손 리깅 완성 | 🟡 v1.0.0~v1.2.0 (세션 02–07). v1.2.0 = Fuwa 5 + overall_warp 연결 + cloth_warp + 물리 9/12 Setting. 남은 3 Setting(ahoge/accessory/body_breath_phys)은 해당 파츠 도입 시 |
| **AI Generation** | nano-banana 어댑터 | 🟡 계약 + skeleton (세션 22) — `schema/v1/ai-adapter-task.schema.json` · `ai-adapter-result.schema.json` + `@geny/ai-adapter-core` v0.1.0 (AdapterRegistry + 결정론적 시드 + provenance 빌더) + `@geny/ai-adapter-nano-banana` v0.1.0 (Mock 클라이언트 + adapter→provenance→license-verifier round-trip). 실제 HTTP 구현은 세션 23+ |
| **Post-Processing & Fitting** | Stage 1, 3, 6 (alpha/color/pivot) | ⚪ 미착수 |
| **UX** | 에디터 뼈대 | ⚪ 미착수 |
| **Platform / Infra** | K8s + CI/CD + 관측 | 🟡 CI (세션 10/13b/20/21/22/23 — `test:golden` 10 step: schemas + exporter-core tests + bundle/avatar/web-avatar golden diff + web-preview e2e + license-verifier tests + ai-adapter-core tests + ai-adapter-nano-banana tests + web-avatar dom lifecycle) + 관측 선언 config (세션 17 — `infra/observability/` 메트릭 카탈로그 32개 · Prometheus scrape · 3 알람 · Grafana 3 대시보드) + 공개키 레지스트리 (세션 21 — `infra/registry/signer-keys.json`). K8s/Helm 미착수 |
| **Data** | Postgres/S3/Redis, 스키마 초판 | 🟡 JSON Schema 20종 (+signer-registry +ai-adapter-task/result) + avatar metadata/export/bundle-manifest/license/provenance 샘플 + ai-adapter task/result 샘플 1쌍 + Ed25519 서명 검증 + 레지스트리 기반 verify (세션 21 `@geny/license-verifier`) + adapter→provenance→verify round-trip (세션 22) + CI 자동 검증 (세션 01–05, 11–15, 18, 21, 22), DB/S3 미착수 |
| **Pipeline** | 단일 아바타 DAG | 🟡 `@geny/exporter-core` v0.6.0 — pose3 + physics3 + motion3 + cdi3 + model3 + exp3 변환기 + `assembleBundle()` + `assembleAvatarBundle()` + `assembleWebAvatarBundle()` stage 2 (텍스처 PNG/WebP + atlas.json emit) + 루트 `bundle.json` 매니페스트 (sha256 감사) + halfbody v1.2.0 golden 13종 (Cubism 11 + web-avatar 1 + atlas 1) + aria 번들 golden + CLI 9 subcommand (세션 08–15, 18). 남은 Exit 게이트: Editor 실측(#1) · 관측(#3) |
| **Frontend** | 에디터 기본 레이아웃 | 🟡 `@geny/web-avatar` v0.1.0 — `<geny-avatar>` Custom Element 스켈레톤 + `loadWebAvatarBundle()` + `ready/error` 이벤트 + happy-dom 기반 DOM lifecycle 회귀 (세션 18/23 — 실 customElement 등록 → `setAttribute("src")` → `ready` payload 스냅샷 + `INVALID_KIND` 에러 계약 + stale-src cancel, 12 tests CI). `apps/web-preview/` Foundation E2E 드라이버 + 자동 E2E (세션 19/20). 렌더링/제어 API 는 Stage 3+ |

범례: 🟢 완료 · 🟡 진행중 · 🔴 블록 · ⚪ 미착수

---

## 4. 세션 로그

| # | 날짜 | 주제 | 상태 | 링크 |
|---|---|---|---|---|
| 01 | 2026-04-17 | Foundation 착수 — 저장소 스켈레톤, Schema 초판, halfbody v1 스펙, ADR 0001–0003 | 완료 | [링크](./sessions/2026-04-17-session-01-foundation-kickoff.md) |
| 02 | 2026-04-17 | halfbody v1 파츠 스펙 24 + 디포머 트리 + CI 스키마 검증 | 완료 | [링크](./sessions/2026-04-17-session-02-halfbody-parts.md) |
| 03 | 2026-04-18 | halfbody v1 물리 팩 초판 + physics 스키마 + mao_pro 16 설정 매핑 | 완료 | [링크](./sessions/2026-04-18-session-03-physics.md) |
| 04 | 2026-04-18 | halfbody v1 모션 팩 7 + test_poses 20 + motion/test-poses 스키마 | 완료 | [링크](./sessions/2026-04-18-session-04-motions.md) |
| 05 | 2026-04-18 | avatar 샘플 + pose3 스키마 + HitArea 검증 + ADR 0004 | 완료 | [링크](./sessions/2026-04-18-session-05-avatar-pose.md) |
| 06 | 2026-04-18 | halfbody v1.1.0 bump — arm A/B variant + 첫 pose.json + greet.wave v2 | 완료 | [링크](./sessions/2026-04-18-session-06-arm-variants.md) |
| 07 | 2026-04-18 | halfbody v1.2.0 bump — Fuwa 5 파라미터 + overall_warp/cloth_warp + 물리 9 Setting (4 sway L/R 분리 + 5 fuwa) + docs/03 §12.1 #4 갱신 | 완료 | [링크](./sessions/2026-04-18-session-07-fuwa-physics.md) |
| 08 | 2026-04-18 | `@geny/exporter-core` v0.0.1 — 결정론적 변환 프레임(canonicalJson/loader) + pose3 변환기 + halfbody v1.1.0·v1.2.0 golden + CLI (10 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-08-exporter-core.md) |
| 08b | 2026-04-18 | `@geny/exporter-core` v0.1.0 — physics3 + motion3 변환기 + halfbody v1.2.0 physics3/idle.default/greet.wave golden + CLI 3 subcommand (23 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-08b-physics-motion.md) |
| 09 | 2026-04-18 | `@geny/exporter-core` v0.2.0 — cdi3 + model3 변환기 + `assembleBundle()` + halfbody v1.2.0 cdi3/model3/bundle snapshot golden + CLI 6 subcommand (48 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-09-cdi-model-bundle.md) |
| 10 | 2026-04-18 | `scripts/rig-template/migrate.mjs` (v1.0.0→v1.1.0→v1.2.0) + `scripts/test-golden.mjs` + root `pnpm run test:golden` + `.github/workflows/ci.yml` — Foundation Exit #2 ✅ | 완료 | [링크](./sessions/2026-04-18-session-10-migrate-ci.md) |
| 11 | 2026-04-18 | `schema/v1/avatar-export.schema.json` + aria `.export.json` + `@geny/exporter-core` v0.3.0 (`assembleAvatarBundle` + CLI `avatar`) + aria 번들 golden + `test:golden` 4단계 확장 (58 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-11-avatar-export.md) |
| 12 | 2026-04-18 | `schema/v1/expression-pack.schema.json` + halfbody v1.2.0 smile/wink/neutral `.expression.json` 3종 + `@geny/exporter-core` v0.4.0 (`convertExpression` + `expressionSlug` + bundle expressions/ + CLI `expression`) + FileReferences.Expressions (model3) + exp3 golden 3종 + aria 번들 재생성 (14 files) (68 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-12-expressions.md) |
| 13 | 2026-04-18 | `schema/v1/bundle-manifest.schema.json` (kind/format/template_id/avatar_id/files) + `@geny/exporter-core` v0.5.0 (번들 루트 `bundle.json` 자동 emit, sha256 감사, avatar_id pass-through) + halfbody/aria 번들 재생성 (14 → 15 files) + `bundle-manifest.test.ts` 8 신규 (76 tests pass) | 완료 | [링크](./sessions/2026-04-18-session-13-bundle-manifest.md) |
| 13b | 2026-04-18 | CI Node 20.11 → 22.11 pin bump (`.github/workflows/*.yml`, `.nvmrc`, engines) — `node --test` positional glob 미지원으로 세션 12/13 commits 에서 테스트 단계 실패 → 해결 (commit `f331022`) | 완료 | [링크](./sessions/2026-04-18-session-13b-ci-node22.md) |
| 14 | 2026-04-18 | `schema/v1/license.schema.json` (+ `provenance.schema.json`) — docs/11 §9 계약 (bundle_manifest_sha256 로 번들 결합, Ed25519 signer_key_id + signature) + `scripts/sign-fixture.mjs` (RFC 8032 Test 1 서명 헬퍼) + aria `.license.json` · `.provenance.json` 샘플 + validate-schemas 에 sha 교차확인 · 서명 검증 내장 (checked 130) | 완료 | [링크](./sessions/2026-04-18-session-14-license-provenance.md) |
| 15 | 2026-04-18 | Web Avatar 번들 stage 1 — `schema/v1/web-avatar.schema.json` + bundle-manifest kind 확장(+`web-avatar-bundle`) + `@geny/exporter-core` v0.6.0 (`convertWebAvatar` + `assembleWebAvatarBundle` + CLI `web-avatar`) + halfbody v1.2.0 web-avatar golden 2종 + `packages/web-avatar/` 스켈레톤 + `test:golden` step 5 (88 tests pass, checked 131) | 완료 | [링크](./sessions/2026-04-18-session-15-web-avatar.md) |
| 16 | 2026-04-18 | 개발자 온보딩 1일 (Foundation Exit #4) — 루트 `README.md` 9 섹션 (prereqs, 5분 quickstart, 레포 구조, 9 CLI 표, 샘플 서명 검증, 마이그레이션, CI, troubleshooting 7종) + `scripts/README.md` 4 엔트리 + `Taskfile.yml` `test:golden` task 추가 | 완료 | [링크](./sessions/2026-04-18-session-16-onboarding.md) |
| 17 | 2026-04-18 | 관측 대시보드 3종 config (Foundation Exit #3 준비) — `infra/observability/` 신설: `metrics-catalog.md` 32 메트릭 + Prometheus scrape 7 job + alert rule 3개(완주율/AI 5xx/큐) + Grafana 대시보드 3종 (Job Health 6 / Cost 6 / Quality 7 panel) + docs/02 §9 1:1 매핑 | 완료 | [링크](./sessions/2026-04-18-session-17-observability.md) |
| 18 | 2026-04-18 | Web Avatar stage 2 + `<geny-avatar>` 런타임 스켈레톤 — `schema/v1/atlas.schema.json` 신설 + `web-avatar.schema.json` (textures 치수/sha256 필수 + atlas 필드) + `@geny/exporter-core` loader 텍스처 스캐너 (PNG IHDR/WebP VP8) + `assembleWebAvatarBundle` stage 2 (PNG byte-copy + atlas.json emit) + halfbody v1.2.0 textures/base.png (4×4) + atlas golden + `@geny/web-avatar` v0.1.0 (loader + Custom Element + `ready`/`error`) (93 tests pass, checked 133) | 완료 | [링크](./sessions/2026-04-18-session-18-web-avatar-stage2.md) |
| 19 | 2026-04-18 | Foundation Exit #1 드라이버 — `apps/web-preview/` 신설 (`index.html` `<geny-avatar>` + metadata 패널 3종 + `scripts/prepare.mjs` 번들 2종 생성 (web-avatar halfbody + Cubism aria) + `scripts/serve.mjs` Node 내장 http 정적 서버) + `progress/exit-gates/01-single-avatar-e2e.md` 수동 E2E 체크리스트 5 단계 (A~E). 의존성 zero — 브라우저 스냅샷은 수동. | 완료 | [링크](./sessions/2026-04-18-session-19-web-preview.md) |
| 20 | 2026-04-18 | web-preview 자동 E2E — `apps/web-preview/scripts/e2e-check.mjs` (prepare + 임시 포트 serve + HTTP 6종 + `loadWebAvatarBundle` 체인 검증 manifest/meta/atlas) + `pnpm --filter @geny/web-preview run test` + `scripts/test-golden.mjs` step 6 추가 + Exit #1 체크리스트 D 단계 자동/시각 분할. Playwright 회피 — `node:http` + `fetch` + dynamic import. | 완료 | [링크](./sessions/2026-04-18-session-20-web-preview-e2e.md) |
| 21 | 2026-04-18 | 발급자 공개키 레지스트리 + `license.verify` ref impl (세션 14 blocker 해소) — `schema/v1/signer-registry.schema.json` 신설 + `infra/registry/signer-keys.json` (RFC 8032 Test 1 fixture key) + `@geny/license-verifier` v0.1.0 (`SignerRegistry`/`verifyLicense`/`verifyProvenance`/`verifySignedDocument` + CLI `license-verifier verify`) + 18 tests (registry 파서 + happy/tamper/expiry/scope/bundle-sha/round-trip) + `validate-schemas.mjs` 레지스트리 cross-check (checked=134) + `test-golden.mjs` step 7. | 완료 | [링크](./sessions/2026-04-18-session-21-license-verifier.md) |
| 22 | 2026-04-18 | AI 어댑터 계약 + nano-banana skeleton (AI Generation 스트림 착수) — `schema/v1/ai-adapter-task.schema.json` · `ai-adapter-result.schema.json` + `samples/ai-adapters/hair_front.{task,result}.json` + `@geny/ai-adapter-core` v0.1.0 (`AIAdapter`/`AdapterRegistry`/`AdapterError` 9 codes + `deterministicSeed`/`promptSha256` + `buildProvenancePartEntry`, 14 tests) + `@geny/ai-adapter-nano-banana` v0.1.0 (`NanoBananaAdapter` + `MockNanoBananaClient` + capability matrix 10 + adapter→provenance→license-verifier round-trip 1) + `validate-schemas.mjs` task↔result pair cross-check (checked=136) + `test-golden.mjs` step 8/9. | 완료 | [링크](./sessions/2026-04-18-session-22-ai-adapter.md) |
| 23 | 2026-04-18 | `<geny-avatar>` DOM lifecycle 회귀 (Foundation Exit #1 "실 DOM" 메우기) — `packages/web-avatar/` happy-dom ^15.11.7 devDep + `tests/dom-lifecycle.test.ts` 3 tests (golden bundle → `ready` payload 스냅샷 / 잘못된 kind → `error` `INVALID_KIND` / superseding src → stale load 취소) + `test-golden.mjs` step 10 `web-avatar dom lifecycle` (12 tests incl. 기존 loader 7 + element 2) + fs fetch 글로벌 override 전략 문서화. | 완료 | [링크](./sessions/2026-04-18-session-23-dom-lifecycle.md) |

---

## 5. 누적 산출물 맵

**디렉터리 책임자(단일 진실 공급원)**:

| 경로 | 책임 내용 | 관련 docs |
|---|---|---|
| `docs/` | 기획·설계·정책 | self |
| `progress/` | 진행 로그·ADR·세션 | self |
| `schema/` | 모든 내부 계약(JSON Schema) | 12 |
| `rig-templates/` | 공식 리그 템플릿 (구현) | 03, 04 |
| `apps/` | 실행 가능한 앱 (web, worker-*, api) | 02, 13 |
| `packages/` | 재사용 가능한 라이브러리 (sdk-ts, sdk-py, web-avatar…) | 11, 13 |
| `services/` | 장기 실행 서비스(orchestrator, exporter) | 02, 11 |
| `samples/` | 스키마 인스턴스 픽스처(avatars/, …) | 12 |
| `infra/` | Terraform, Helm, 관측 config | 13 §7, 02 §9 |
| `scripts/` | 개발 편의 스크립트 | 13 §12 |

---

## 6. 릴리스 게이트 대응

Foundation 단계 릴리스 게이트(`docs/14 §10`):

- [x] 골든셋 회귀 통과 — `@geny/exporter-core` 14 fixture (halfbody Cubism 11 + aria 번들 1 + halfbody web-avatar 2) + 번들 루트 `bundle.json` 해시 감사 (세션 13) + `pnpm run test:golden` 10 step CI (세션 08/08b/09/10/11/12/13/15/20/21/22/23 — step 6 = web-preview e2e, step 7 = license-verifier tests, step 8 = ai-adapter-core tests, step 9 = ai-adapter-nano-banana tests incl. provenance round-trip, step 10 = web-avatar dom lifecycle (happy-dom))
- [ ] 성능 SLO 초과 없음 — 측정 인프라 부재
- [ ] 보안 스캔 P0/P1 0건 — Gitleaks/Trivy 아직 미구축
- [ ] 문서 업데이트 — 세션별로 관리
- [ ] 온콜/롤백 플랜 — Foundation 말까지 수립

---

## 7. ADR 인덱스

구체 결정은 [`./adr/`](./adr/).

| # | 제목 | 날짜 | 상태 |
|---|---|---|---|
| [0001](./adr/0001-monorepo-layout.md) | 저장소 레이아웃 (monorepo, docs/13 §13 채택) | 2026-04-17 | Accepted |
| [0002](./adr/0002-schema-first-contract.md) | 스키마-우선 계약 (JSON Schema 를 단일 진실 공급원으로) | 2026-04-17 | Accepted |
| [0003](./adr/0003-rig-template-versioning.md) | 리그 템플릿 버저닝 (SemVer, `tpl.base.v{major}.*`) | 2026-04-17 | Accepted |
| [0004](./adr/0004-avatar-as-data.md) | 참조형 아바타 (meta + part_instance 참조, pose3 템플릿 측) | 2026-04-18 | Accepted |

---

## 8. 다음 3세션 예고 (Tentative)

- **세션 24**: Observability Helm chart — `infra/observability/` config 를 실 배포 가능한 차트로 끌어올려 Exit #3 완결 (Prometheus + Grafana + alertmanager values.yaml + 3 dashboards provisioning).
- **세션 25**: AI 어댑터 2차 — `HttpNanoBananaClient` 실 HTTP 구현 + 벤더 에러 → `AdapterError` 매핑 테이블 + SDXL/Flux-Fill 폴백 어댑터 skeleton + 캐시 레이어(`hash(adapter, model_version, prompt_hash, ref_hash, seed, size)`).
- **세션 26**: Post-Processing Stage 1 (alpha cleanup) skeleton — `@geny/post-processing` 신설, `scripts/pp-stage1-mask.mjs` + alpha premult 라운드트립 golden + docs/12 §10 stage 경로 첫 단계. 혹은 rig 확장 (v1.3 body) 우선.

계획은 현재 맥락에서의 최선이며, 세션 시작 시 재평가한다.
