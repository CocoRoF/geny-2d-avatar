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
| **Rig & Parts** | `halfbody v1` 손 리깅 완성 | 🟡 템플릿 스켈레톤 초안 (세션 01) |
| **AI Generation** | nano-banana 어댑터 | ⚪ 미착수 |
| **Post-Processing & Fitting** | Stage 1, 3, 6 (alpha/color/pivot) | ⚪ 미착수 |
| **UX** | 에디터 뼈대 | ⚪ 미착수 |
| **Platform / Infra** | K8s + CI/CD | ⚪ 미착수 |
| **Data** | Postgres/S3/Redis, 스키마 초판 | 🟡 JSON Schema 초판 (세션 01) |
| **Pipeline** | 단일 아바타 DAG | ⚪ 미착수 |
| **Frontend** | 에디터 기본 레이아웃 | ⚪ 미착수 |

범례: 🟢 완료 · 🟡 진행중 · 🔴 블록 · ⚪ 미착수

---

## 4. 세션 로그

| # | 날짜 | 주제 | 상태 | 링크 |
|---|---|---|---|---|
| 01 | 2026-04-17 | Foundation 착수 — 저장소 스켈레톤, Schema 초판, halfbody v1 스펙, ADR 0001–0003 | 완료 | [링크](./sessions/2026-04-17-session-01-foundation-kickoff.md) |

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

---

## 8. 다음 3세션 예고 (Tentative)

- **세션 02**: `halfbody v1` 파츠 스펙 24개 모두 작성 + JSON Schema 검증 스크립트 + 최초 `justfile`/`Taskfile`.
- **세션 03**: AI Adapter Protocol (Python) 스켈레톤 + `nano-banana` 어댑터 스텁(키 없으면 mock), prompt builder v0.
- **세션 04**: Post-processing Stage 1 (Alpha Sanitation) Python 구현 + 단위 테스트 + 골든 1 아바타 입력 준비.

계획은 현재 맥락에서의 최선이며, 세션 시작 시 재평가한다.
