# 세션 47 — ADR 0006 잡 큐 영속성 전략 + `JobStore` 인터페이스 gap 감사

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Pipeline · Platform (docs/14 §9, docs/02 §4/§8.2)
- **관련 세션**: 36 (`@geny/metrics-http`), 39 (orchestrator-service bootstrap), 42 (HTTP 팩토리), 44 (worker-generate skeleton + 인-메모리 FIFO)
- **관련 ADR**: [0006](../adr/0006-queue-persistence.md) 신설
- **산출물**: `progress/adr/0006-queue-persistence.md`, INDEX §7 ADR 인덱스 + §4 row 47 + §3 Pipeline 행 + §8 rotation

---

## 배경

세션 44 에서 `apps/worker-generate/` 의 인-메모리 FIFO `JobStore` 를 만들며 "Runtime 단계 이후 Redis/BullMQ 로 교체" 라는 방향만 적어두고 구체 결정은 미뤘다. 세션 44 follow-up 에 "드라이버 교체에 충분한지 재검토" 가 남아 있었고, §8 로드맵도 세션 47 를 그 자리로 예정했다.

본 세션은 실제 코드는 건드리지 않는다. 질문만 결정한다:
1. Runtime 드라이버는 무엇으로 가는가?
2. 현재 `JobStore` 인터페이스가 교체에 충분한가?
3. 지금 고칠 것이 있는가?

## 설계 결정 (ADR 0006 요약)

### D1. Runtime 드라이버 = Redis + BullMQ

핵심 근거: `docs/02 §8.2` 인프라 기본선에 Redis 가 이미 포함 (세션/토큰/썸네일 캐시 용도). 잡 큐를 위해 별도 클러스터를 띄우지 않고 **같은 Redis 의 BullMQ namespace** 를 추가하는 것이 운영 부담 최소 증가 경로.

대안 기각:
- **SQLite**: 단일 프로세스 귀속 — 멀티-워커 확장 시 파일락 경합이 병목.
- **Postgres SKIP LOCKED**: 가능하지만 retry/delayed/priority 를 직접 구현해야 함. BullMQ 가 성숙.
- **NATS / Kafka**: MVP(큐 길이 < 10k) 에 과대 사양.
- **자체 Redis Lua**: 재발명 거부.

### D2. 현재 `JobStore` 인터페이스 gap 7 축 감사 → 전부 "드라이버 교체 시점" 에 닫힘

감사 표 (ADR 0006 §"Decision" D2 참조):

| Gap | 현재 | BullMQ 필요 | 조치 타이밍 |
|---|---|---|---|
| ack/nack 명시성 | throw→failed | lease + moveToCompleted/Failed | **교체 시** 상태 매핑 어댑터 |
| worker identity / lease | 단일 프로세스 flag | visibility timeout + heartbeat | BullMQ 내부 (인터페이스 무관) |
| replay on startup | 없음 | delayed/waiting 키셋 복원 | BullMQ 자동 (인터페이스 무관) |
| priority | FIFO 만 | `add({ priority })` | **교체 시** `submit({ priority? })` 옵셔널 필드 추가 |
| DLQ / poison | 없음 | failed 집합 + `retryJobs()` | **교체 시** `retry(id)` / `failedList()` 추가 |
| waitFor 로컬성 | Map resolve | pub/sub 또는 폴링 | HTTP 라우터가 이미 폴링(`GET /jobs/{id}`) — 영향 없음 |
| TTL / 보관 | Map 무한 | `removeOnComplete/Fail` | BullMQ 옵션 (인터페이스 무관) |

**결론**: 현재 인터페이스는 "사후 정당화 단순성" 이 아니라 "의식적 최소성" 이다. 지금 고칠 건 없다.

### D3. Runtime 교체 선행 조건 3개

드라이버 구현 세션 이전에 충족해야:

1. **Redis 버전/토폴로지 확정** — `docs/02 §8.2` 에 Redis 만 있고 구체 사양 없음.
2. **`idempotency_key` ↔ BullMQ `job.id` 매핑** 결정 — 자유 문자열 → 해시 필요할 수 있음.
3. **`geny_queue_*` 메트릭 카탈로그 확장** — `infra/observability/metrics-catalog.md` 에 추가, Grafana panel 확장.

→ 세션 50 로 §8 에 큐 메트릭 카탈로그 항목 선예약.

### D4. Foundation 범위에서 `JobStore` 인터페이스 확장 **금지**

priority/retry/DLQ 를 미리 추가하면 테스트가 YAGNI 로직을 떠안음. ADR 로 "지금 추가 금지" 를 명시해 저자 유혹을 차단.

## 실제 변경

- `progress/adr/0006-queue-persistence.md` 신설 — Context/Decision(D1~D4)/Consequences/Follow-ups.
- `progress/INDEX.md`:
  - §3 Pipeline 행 worker-generate 서술에 "ADR 0006" 한 문장 추가.
  - §4 세션 47 로그 행 추가 (세션 46 뒤 오름차순).
  - §7 ADR 인덱스 0006 행 추가.
  - §8 rotate — 47 제거, 48/49 유지, 50 신규 (queue 메트릭 카탈로그).
- `progress/sessions/2026-04-19-session-47-queue-persistence-adr.md` — 본 로그.

## 검증

- `pnpm run test:golden` → 19/19 step pass (docs 전용 변경).
- validate-schemas `checked=186` 불변.

## Follow-ups

- 세션 48: Foundation Exit #2 릴리스 게이트 정리 (Gitleaks/Trivy CI).
- 세션 49: C10 regex base-specific 분리 (fullbody 준비).
- 세션 50: `geny_queue_*` 메트릭 카탈로그 — BullMQ 도입 전에도 계약 동결 가능.
- Runtime N+1: `createBullMQJobStore(redisConn, opts)` 구현 + 위 7 gap 전부 닫기.

## 커밋

- `progress/adr/0006-queue-persistence.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-47-queue-persistence-adr.md`
