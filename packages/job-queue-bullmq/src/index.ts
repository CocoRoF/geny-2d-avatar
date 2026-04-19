/**
 * `@geny/job-queue-bullmq` — BullMQ-backed JobStore 드라이버 (ADR 0006 §D3 X 단계).
 *
 * 공개 API:
 *  - `createBullMQJobStore({ driver, orchestrate })` — 팩토리.
 *  - `BullMQDriver` — 드라이버 계약 (실 bullmq/ioredis 바인딩은 X+1 세션).
 *  - `mapBullMQState()` — BullMQ state → `JobStatus` 매핑 함수.
 */

export {
  createBullMQJobStore,
  type BullMQJobStore,
  type CreateBullMQJobStoreOptions,
  type JobRecord,
  type JobStatus,
} from "./job-store.js";

export {
  mapBullMQState,
  type BullMQDriver,
  type BullMQJobData,
  type BullMQJobSnapshot,
  type BullMQJobState,
  type BullMQQueueCounts,
} from "./driver.js";
