/**
 * BullMQ `Queue`/`QueueEvents` 를 얇게 추상화한 드라이버 계약.
 *
 * 세션 60 (ADR 0006 §D3 X 단계) 은 실 `bullmq`/`ioredis` 의존성을 **도입하지 않는다** —
 * 본 파일이 선언하는 `BullMQDriver` 인터페이스만 있으면 `createBullMQJobStore()` 는 단위
 * 테스트 가능. 실 BullMQ 바인딩(`createBullMQDriverFromRedis`) 은 X+1 세션 (worker-generate
 * wiring) 에서 별도 파일로 도착한다.
 *
 * 이렇게 분리한 이유:
 *  - Foundation CI 는 Redis 를 띄우지 않음. fake driver 로 state machine / idempotency /
 *    error payload 매핑을 **계약 수준**에서 고정할 수 있음.
 *  - 실 BullMQ 는 Lua 스크립트 + Redis 7 streams 에 의존 — `ioredis-mock` 으로는 5.x 동작을
 *    완전히 재현할 수 없다. 진짜 검증은 staging 의 `perf-harness --driver bullmq` (X+4).
 *  - ADR 0006 §D3 테스트 포인트 (5종) 중 (1) idempotency 재제출 동일 id 반환 (2) 특수문자
 *    jobId 저장/조회 (3) 128-char boundary — 3종은 드라이버 인터페이스 계약만으로 검증 가능.
 */

/** `submit` 시 task payload 를 BullMQ `queue.add` 의 `data` 로 전달하기 위한 얇은 포장. */
export interface BullMQJobData {
  /** schema: ai-adapter-task. JSON.stringify 가능해야 함. */
  readonly payload: unknown;
  /** 원문 `idempotency_key`. 로그/디버깅용으로도 data 안에 보관. */
  readonly idempotency_key: string;
  /** 제출 시각 (ISO8601). orchestrate 경로가 시각 비교 없이 바로 쓸 수 있도록. */
  readonly submitted_at: string;
}

/**
 * BullMQ 내부 상태 문자열 — BullMQ 5.x `Job.getState()` 의 반환값.
 *
 * ADR 0006 §D2 매핑:
 *   waiting    → queued
 *   delayed    → queued  (지연 실행도 MVP 에선 queued 로 통합)
 *   waiting-children → queued  (parent/child 모델 미사용, 방어적 매핑)
 *   prioritized → queued
 *   active     → running
 *   completed  → succeeded
 *   failed     → failed
 *   unknown    → failed  (이미 removed or missing: Runtime 튜닝 시 orphan handling)
 */
export type BullMQJobState =
  | "waiting"
  | "delayed"
  | "waiting-children"
  | "prioritized"
  | "active"
  | "completed"
  | "failed"
  | "unknown";

export interface BullMQJobSnapshot {
  readonly id: string;
  readonly state: BullMQJobState;
  readonly data: BullMQJobData;
  readonly returnvalue?: unknown;
  readonly failedReason?: string | undefined;
  readonly timestamp: number;
  readonly processedOn?: number | undefined;
  readonly finishedOn?: number | undefined;
}

/**
 * `BullMQDriver` — 본 패키지가 의존하는 최소 API. 실 BullMQ `Queue` + `QueueEvents` 합성으로
 * X+1 세션에서 구현. 단위 테스트는 같은 인터페이스의 in-process fake 드라이버를 주입.
 *
 * 계약:
 *  - `add({ jobId, data })` 는 **idempotent**. 동일 `jobId` 재호출 시 기존 스냅샷을 그대로
 *    반환하며 큐에 새 엔트리를 만들지 않는다(BullMQ `queue.add({ jobId })` 공식 동작).
 *  - `getJob(id)` 는 없으면 `null` 반환 (removed-on-complete 이후 등).
 *  - `getCounts()` 는 4 상태 카운트 — `geny_queue_*` 메트릭 gauge 소스 (세션 50 카탈로그).
 *  - `close()` 는 graceful shutdown. 멱등.
 */
export interface BullMQDriver {
  add(args: { jobId: string; data: BullMQJobData }): Promise<BullMQJobSnapshot>;
  getJob(id: string): Promise<BullMQJobSnapshot | null>;
  /** 전체 잡 스냅샷 (list 용 — MVP 범위, 페이징 없음). */
  listJobs(): Promise<readonly BullMQJobSnapshot[]>;
  getCounts(): Promise<BullMQQueueCounts>;
  close(): Promise<void>;
}

export interface BullMQQueueCounts {
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
}

/**
 * BullMQ 상태 → `JobStatus` (ADR 0006 §D2). 단일 진실 공급원 — driver 와 JobStore 양쪽에서 참조.
 */
export function mapBullMQState(state: BullMQJobState): "queued" | "running" | "succeeded" | "failed" {
  switch (state) {
    case "waiting":
    case "delayed":
    case "waiting-children":
    case "prioritized":
      return "queued";
    case "active":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
    case "unknown":
      return "failed";
  }
}
