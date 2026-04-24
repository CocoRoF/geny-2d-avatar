# Session 53 — BullMQ 드라이버 실장 선행 (ADR 0006 체크리스트 완결)

- **날짜**: 2026-04-19
- **범위**: 기획/결정 세션 (docs-only)
- **산출물**: [`progress/plans/bullmq-driver-prework.md`](../plans/bullmq-driver-prework.md), ADR 0006 D3 업데이트
- **상태**: 완료
- **선행**: 세션 44 (worker-generate skeleton), 47 (ADR 0006 Accepted), 50 (queue metrics), 51 (perf harness)
- **후행**: Runtime N+1 세션 시리즈 (plan §4 의 X~X+4)

---

## 1. 배경

ADR 0006 §D3 이 BullMQ 드라이버 교체 세션의 선행 조건 3개를 명시했다:

1. Redis 배포 결정 확정
2. `idempotency_key` → BullMQ `job.id` 매핑 전략
3. `geny_queue_*` 메트릭 카탈로그

세션 50 이 (3) 을 고정했으므로 남은 (1)(2) 를 본 세션에서 결정해 ADR 0006 체크리스트를 **완전히 닫는다**. 교체 자체는 Runtime 스프린트로 미루되, "무엇을 써야 하는지 모르겠다" 라는 unknown-unknown 을 전부 known 으로 전환하는 것이 목표.

docs-only 세션 — 실 차트/코드 추가는 Runtime 세션에 귀속(plan §1.3/§4 에 명시).

---

## 2. 설계 결정

### D1. Redis 배포 토폴로지 (ADR 0006 D3-1 close)

- **Foundation**: 인-메모리 JobStore 유지. dev/CI 에선 `redis:7.2-alpine` 단일 컨테이너로 BullMQ 로컬 테스트 가능(Taskfile `task redis:dev` 계획 기록).
- **Production**: **managed Redis 7.2+** (ElastiCache/Memorystore/Upstash), **단일 write-primary + 1 read-replica**, TLS `rediss://`, `maxmemory-policy: noeviction`.
- **Cluster 모드**: β 이전까지 **거부** — BullMQ 5.x 의 `{}` hash tag 제약 + MVP 규모(`docs/02 §9.3` 임계 큐 길이 1k) 대비 이득 불명확.
- **버전 고정**: BullMQ 5.x 가 `FCALL`/`LMPOP`/`XAUTOCLAIM` 을 사용 → ElastiCache 6.x 호환 모드 불가 (배포 결정 시 재검증 명시).

### D2. `idempotency_key` → `job.id` 매핑 (ADR 0006 D3-2 close)

- **결정**: schema pattern `^[A-Za-z0-9._:-]{8,128}$` 준수 키를 **원문 그대로** BullMQ `queue.add(name, data, { jobId: task.idempotency_key })` 에 전달.
- **근거**:
  - BullMQ 5.x 의 jobId 중복 반환 기능이 즉시 end-to-end 멱등성을 제공 — 재발명 거부.
  - 해시 변환 시 로그 grep 단절 → 디버깅 비용이 길이 통일의 이득을 초과.
  - `:` 등 특수문자는 BullMQ 내부 Redis key 구조와 충돌하지 않음 (prefix 만 `bull:{queueName}:` 로 고정).
- **edge case 4종** 명세 (plan §2.3 표): 진행 중 재submit → 같은 job 반환 / completed + purged → 새 잡 / failed + retained → 같은 잡 + `/retry` API 는 미래 세션 / 입력 검증 실패 → 400.
- **테스트 포인트 5종** 을 Runtime 교체 세션 PR 체크리스트에 고정.

### D3. ADR 0006 D3 체크리스트 완결 선언

ADR 0006 §D3 의 3 선행 조건을 전부 ✅ 로 마크. Runtime 교체 세션은 선행 blocker 없이 즉시 착수 가능 — plan §4 에서 세션 시리즈 5단계(X~X+4) 로 분해.

### D4. 본 세션에서 Helm 차트/코드 추가 **금지**

- `infra/helm/redis/`, `infra/helm/worker-generate/` 는 Runtime 세션에서 신설.
- `apps/worker-generate/src/router.ts` 의 `crypto.randomUUID()` → `task.idempotency_key` 전환도 Runtime 교체 세션(plan §2.5).
- **지금 추가하면** 인-메모리 store 에 "사용하지 않는 idempotency_key" 가 떠돌아 테스트 noise 증가. YAGNI.

---

## 3. 변경 산출물

**신규 파일**:
- `progress/plans/bullmq-driver-prework.md` (5 섹션, Redis 토폴로지 + idempotency 매핑 + edge case + 교체 세션 분해)
- `progress/sessions/2026-04-19-session-53-bullmq-driver-prework.md` (본 파일)

**수정 파일**:
- `progress/adr/0006-queue-persistence.md` — §D3 3 항목 ~~취소선~~ + ✅ 체크리스트 완결 선언
- `progress/INDEX.md` — 세션 로그 row 53 + §8 rotate (53 제거, 새 세션 추가)

**변경 없음 (명시)**:
- 코드 (`apps/` `packages/` `services/` `scripts/`) — 0 바이트
- 스키마 / lint 테이블 / Helm 차트 — 0 바이트
- `infra/observability/*` — 0 바이트 (세션 50 이 이미 queue metrics 고정)
- golden 20 step / validate-schemas checked=186 — 전부 불변

---

## 4. 검증

- `pnpm run test:golden` — 재실행하지 않음 (코드 무변경). 세션 51 의 20-step green 이 그대로 유효.
- `pnpm run validate-schemas` — 재실행하지 않음 (스키마 무변경, checked=186 유지).
- docs-only 세션 — lint 대상 없음.

---

## 5. 커밋

단일 커밋:

```
docs(queue): ADR 0006 체크리스트 완결 — Redis 토폴로지 + idempotency 매핑 결정 (세션 53)
```

포함:
- `progress/plans/bullmq-driver-prework.md` (신규)
- `progress/sessions/2026-04-19-session-53-bullmq-driver-prework.md` (신규, 본 파일)
- `progress/adr/0006-queue-persistence.md` (D3 updates)
- `progress/INDEX.md` (row 53 + §8 rotate)

---

## 6. 다음 세션

§8 의 새 순서 기준:

- **세션 54**: 실 벤더 staging 부하 회귀 (`perf-harness --http`, 세션 51 의 `--http` 플래그 + `createHttpAdapterFactories` 로 실 어댑터 p95 기준선).
- **세션 55**: fullbody v1.0.0 실 저작 1단계 (세션 52 계획 §7).
- **세션 56 후보**: BullMQ 드라이버 본체 실장 (plan §4 X 단계 — `packages/job-queue-bullmq/`).

세션 54 를 먼저 하는 이유: staging 환경 확보 타이밍에 강하게 의존. 확보 못 하면 세션 55(fullbody) 로 바로 진입.
