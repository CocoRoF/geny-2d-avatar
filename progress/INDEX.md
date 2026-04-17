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
- [ ] 단일 아바타 생성 → 프리뷰 → Cubism export 수동 테스트 성공
- [ ] CI 에서 골든 1 아바타 회귀 자동
- [ ] 관측 대시보드 3종 기본 동작
- [ ] 개발자 온보딩 1일

---

## 3. 워크스트림 상태

`docs/14 §9` 기준. 각 스트림의 **현재 산출물** 을 한 줄로.

| 스트림 | Foundation 목표 | 현재 상태 |
|---|---|---|
| **Rig & Parts** | `halfbody v1` 손 리깅 완성 | 🟡 v1.0.0~v1.2.0 (세션 02–07). v1.2.0 = Fuwa 5 + overall_warp 연결 + cloth_warp + 물리 9/12 Setting. 남은 3 Setting(ahoge/accessory/body_breath_phys)은 해당 파츠 도입 시 |
| **AI Generation** | nano-banana 어댑터 | ⚪ 미착수 |
| **Post-Processing & Fitting** | Stage 1, 3, 6 (alpha/color/pivot) | ⚪ 미착수 |
| **UX** | 에디터 뼈대 | ⚪ 미착수 |
| **Platform / Infra** | K8s + CI/CD | ⚪ 미착수 |
| **Data** | Postgres/S3/Redis, 스키마 초판 | 🟡 JSON Schema 10종 + avatar 샘플 1 + CI 자동 검증 (세션 01–05), DB/S3 미착수 |
| **Pipeline** | 단일 아바타 DAG | 🟡 `@geny/exporter-core` v0.2.0 — pose3 + physics3 + motion3 + cdi3 + model3 변환기 + `assembleBundle()` + halfbody v1.2.0 golden 8종 + CLI 6 subcommand (세션 08, 08b, 09). 남은 Exit 게이트: 마이그레이션 + CI (세션 10) |
| **Frontend** | 에디터 기본 레이아웃 | ⚪ 미착수 |

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
| `infra/` | Terraform, Helm | 13 §7 |
| `scripts/` | 개발 편의 스크립트 | 13 §12 |

---

## 6. 릴리스 게이트 대응

Foundation 단계 릴리스 게이트(`docs/14 §10`):

- [ ] 골든셋 회귀 통과 — 아직 골든셋 부재 (세션 03+에서 편성 예정)
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

- **세션 10**: 마이그레이션 스크립트(`scripts/rig-template/migrate.mjs`) + 골든셋 회귀 CI (`pnpm test:golden`). v1.0.0/v1.1.0 → v1.2.0 자동 bump, Github Actions 에 `pnpm -r build && pnpm -r test` + `node scripts/validate-schemas.mjs` 편성. Foundation Exit 체크리스트 2번 달성.
- **세션 11**: `samples/avatars/sample-01-aria` 재작성 + avatar 단에서 end-to-end export 스모크 (rig template + avatar refs → Cubism 번들 폴더 with moc/texture override).
- **세션 12**: Expression(exp3) 변환기 + Web Avatar 번들 포맷 가교.

계획은 현재 맥락에서의 최선이며, 세션 시작 시 재평가한다.
