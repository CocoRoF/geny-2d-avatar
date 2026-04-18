# Session 16 — 개발자 온보딩 1일 (Foundation Exit #4)

- **Date**: 2026-04-18
- **Workstreams**: Platform / Infra (DX), Data (문서 정합)
- **Linked docs**: `docs/14 §3.3` (Foundation Exit 체크리스트), `docs/13` (스택·도구)
- **Linked ADRs**: 신규 없음 (기존 ADR 재인용)
- **Previous**: 세션 15 — Web Avatar 번들 stage 1 (commit `c340b49`)

---

## 1. 목표 (Goals)

- [x] 루트 `README.md` — 신규 개발자가 로컬 → green CI 까지 **5분** 안에 도달 가능.
- [x] `scripts/README.md` 업데이트 — 세션 13b/14/15 에 추가된 3 스크립트 반영.
- [x] `Taskfile.yml` — `test:golden` 태스크 노출 (`check` 가 의존하도록).
- [x] `progress/INDEX.md` — Foundation Exit #4 체크박스 ✅ + 세션 16 row.

### 범위 경계 (의도적으로 하지 않은 것)

- **`apps/` / `services/` / `infra/` README 본격 재작성**: 세션 12 시점 이후 크게 바뀐 게 없고, 각 서브디렉터리는 여전히 스켈레톤 단계. 루트 README 가 이들을 요약으로 가리키면 충분.
- **CONTRIBUTING.md / PR 템플릿**: 저장소는 현재 1인 autonomous 개발 흐름. 다인 체제 도입 시 작성 — 현재는 오버엔지니어링.
- **예제 UI / 스크린샷**: 아직 UI 자체가 없음. 세션 19(Foundation Exit #1) 에서 쓰일 때 추가.
- **영문판 README**: 기획 문서 자체가 한국어 기반. 번역은 외부 배포가 시작될 때.

## 2. 사전 맥락 (Context)

- **Foundation Exit #4**: `docs/14 §3.3` 의 마지막 체크박스. "새 사람이 1일 안에 이 레포를 이해하고 기여 시작 가능한가?" 측정.
- **세션 13b (commit `f331022`) 교훈**: Node 버전 불일치로 CI 가 terminal 에서 passing 이어도 actions 에서 fail. README 는 이를 Prerequisites 에 명시.
- **세션 14 (commit `2ddbbf5`)**: license/provenance 서명 흐름이 도입. 온보딩 README 가 sign-fixture 사용법을 예시로 노출.
- **세션 15 (commit `c340b49`)**: CLI subcommand 가 8 → 9 개로 증가 (+`web-avatar`). 온보딩 표에 반영.
- **세션 13 D1 / 08 D5**: 결정론·번들 매니페스트의 핵심 결정 2가지는 README 에서 직접 인용 — 신규 개발자가 "왜 canonical JSON?" "왜 bundle.json 이 자신을 제외?" 을 30초 안에 찾을 수 있어야 함.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 루트 README | `README.md` | 9 섹션 (intro, prereqs, quickstart, layout, workflows, CI, status, troubleshooting, links). 실제 `pnpm run test:golden` 이 green 이 되는 명령을 포함. | 🟢 |
| scripts 설명 | `scripts/README.md` | 4 엔트리 (validate-schemas, test-golden, sign-fixture, rig-template/migrate). Node 22.11 전제 명시. | 🟢 |
| go-task 태스크 | `Taskfile.yml` | `task test:golden` 신규, `task check` 가 `validate:schemas + test:golden` 을 의존. | 🟢 |
| INDEX | `progress/INDEX.md` | Foundation Exit #4 체크, 세션 16 row, 다음 3세션 재배열 (16 삭제, 18→17, 19 신설). | 🟢 |
| 세션 로그 | `progress/sessions/2026-04-18-session-16-onboarding.md` | 본 파일. | 🟢 |

## 4. 결정 (Decisions)

- **D1 (1-page README 지양)**: 체크리스트형 섹션 9개를 한 파일에 담되, 각 섹션 내부에서 상세 문서(`docs/`, `progress/`) 로 링크. 장점: 온보딩 1일이 목표이므로 "무엇을 더 읽을지" 를 한 페이지에서 그려줘야 한다. 단점: 길이 — 이는 TOC 필요 시 재고.
- **D2 (Quickstart 명령은 복붙 가능한 literal)**: `pnpm install --frozen-lockfile && pnpm run test:golden` 을 그대로 복붙하면 green 이 되어야 한다. 별도 `.env`, 토큰, 외부 서비스 불필요. 지금 단계는 이것이 가능하므로 그대로 제공.
- **D3 (Troubleshooting 은 **관찰된** 증상만)**: 세션 13b (Node 20 에러), 세션 14 (sha 교차검증), 세션 15 (CLI 캐시) 등에서 **실제로 만난** 함정만 표에 수록. 가상의 "이럴 수도 있음" 은 기록하지 않음 (rot 방지).
- **D4 (9 CLI subcommand 표)**: `bundle` / `avatar` / `web-avatar` 의 차이가 신규 개발자에게 헷갈리는 지점. 명시적 표 + 각 1-liner 예시를 제공.
- **D5 (sign-fixture 샘플 명령을 README 본문에 inline)**: Node ESM dynamic import 예시가 쓸 만하고, 실행 가능성을 빠르게 증명. 실행 증적은 `validate-schemas.mjs` CI 검증이므로, README 의 예시는 개발자 자가 확인용.
- **D6 (Taskfile 이 pnpm script 의 wrapper 역할 유지)**: go-task 를 쓰고 싶은 개발자와 pnpm 만 쓰는 개발자 모두 수용. 의존 관계는 `check → [validate:schemas, test:golden]` 로 확장.

## 5. 변경 요약 (Changes)

- `README.md` — 신규 (9 섹션).
- `scripts/README.md` — 전면 재작성 (4 스크립트 목록 + Node 22.11 주석).
- `Taskfile.yml` — `test:golden` 태스크 추가, `check` 가 이를 의존.
- `progress/INDEX.md` — Foundation Exit #4 ✅, 세션 16 row, 다음 3세션 예고 재배열.
- `progress/sessions/2026-04-18-session-16-onboarding.md` — 본 파일.

## 6. 블록 (Blockers / Open Questions)

- **"1일" 측정 어떻게 검증하나**: 현재는 저자(AI) 의 직관 + 5-step quickstart 가 실제 green 이라는 사실. 신규 개발자의 실측은 팀이 확장되는 시점에서만 가능.
- **docs ↔ README drift**: docs/ 가 18 문서, README 가 이들을 얕게 요약. 앞으로 docs 가 바뀌면 README 도 touch 해야 — 향후 세션에서 의도적으로 점검.
- **`apps/web/` 등 하위 앱이 실제 구현되면**: 현재 README 의 "Repo Layout" 섹션의 `apps/ services/` 주석("폴더·README 만") 이 더 이상 맞지 않게 됨. 세션 19+ 에서 갱신 예정.
- **영문 README 필요 시점**: 외부 오픈소스 배포 결정(세션 17+ 라이선스 정책) 이후.

## 7. 다음 세션 제안 (Next)

- **세션 17**: 관측 대시보드 3종 (Foundation Exit #3) — Prometheus/Grafana 뼈대 + `docs/13 §12` 메트릭 정의 반영. **또는** 발급자 공개키 레지스트리 + `license.verify` 엔드포인트(세션 14 blocker 해소).
- **세션 18**: Web Avatar stage 2 — 텍스처 PNG/WebP 번들 + atlas 메타. `<geny-avatar>` 런타임 스켈레톤 시작.
- **세션 19**: Foundation Exit #1 (단일 아바타 end-to-end 수동 테스트) — 최소 web UI or CLI-only 문서화된 워크플로.

## 8. 지표 (Metrics)

- **Foundation Exit 체크리스트**: 1/4 → 2/4 (세션 10 골든 + 세션 16 온보딩). 남은 2 = Editor #1, 관측 #3.
- **루트 레벨 문서 수**: README 0 → 1.
- **CI 변경 없음**: 세션 16 는 문서/메타 전용.
- **`pnpm run test:golden`**: 88 tests / 5 steps green 유지.
- **커밋 크기**: ~단일 커밋, 5 파일 편집.

## 9. 인용 (Doc Anchors)

- [docs/14 §3.3 Foundation Exit 체크리스트](../../docs/14-roadmap-and-milestones.md)
- [progress session 13b Node 22 bump](./2026-04-18-session-13b-ci-node22.md)
- [progress session 14 license/provenance](./2026-04-18-session-14-license-provenance.md)
- [progress session 15 web-avatar stage 1](./2026-04-18-session-15-web-avatar.md)
