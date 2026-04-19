/**
 * `@geny/worker-generate` — orchestrator-service 바인딩된 Foundation 워커 skeleton.
 *
 * 책임:
 *  1. `@geny/orchestrator-service` 의 `createOrchestratorService()` 로 orchestrator wiring.
 *  2. `JobStore` 를 만들어 `svc.orchestrate` 에 바인딩.
 *  3. HTTP 서버 하나에 `/metrics`, `/healthz` (orchestrator) + `/jobs*` (router) 를 동시 실음.
 *
 * docs/02 §4 JobRunner → worker 분리 실험. 큐/영속성은 Runtime 단계의 Redis/BullMQ 로 교체.
 */

import type { Server } from "node:http";

import {
  createOrchestratorService,
  type CreateOrchestratorServiceOptions,
  type OrchestratorService,
} from "@geny/orchestrator-service";

import { createJobStore, type JobStore } from "./job-store.js";
import { createJobRouter } from "./router.js";

export { createJobStore, type JobStore, type JobRecord, type JobStatus } from "./job-store.js";
export { createJobRouter, validateTask } from "./router.js";

export interface CreateWorkerGenerateOptions {
  /** orchestrator-service 를 미리 만들어 주입. 생략 시 `orchestratorOptions` 로 기본 생성. */
  service?: OrchestratorService;
  /** `createOrchestratorService()` 에 그대로 전달 (service 미주입 경로). */
  orchestratorOptions?: Omit<CreateOrchestratorServiceOptions, "metricsServerFallback">;
  /** 잡 라우터 로그 싱크. */
  logger?: Parameters<typeof createJobRouter>[0]["logger"];
}

export interface WorkerGenerate {
  readonly service: OrchestratorService;
  readonly store: JobStore;
  /** `/metrics` + `/healthz` + `/jobs*` 를 같은 Server 에 실은 것. */
  createServer(): Server;
}

/**
 * 워커를 하나의 프로세스 단위로 조립한다. 내부 연결 순서:
 *
 *   1) 임시 ref 를 만들고, JobStore 가 `ref.current!.orchestrate(task)` 를 부르게 한다.
 *   2) 그 store 를 품은 router 를 만든다 (닫힌 클로저로 store 참조 유지).
 *   3) router 를 `metricsServerFallback` 으로 끼운 `OrchestratorService` 를 만든다.
 *   4) ref.current 에 서비스를 꽂아 1) 의 bind 를 활성화.
 *
 * 이 순서 덕분에 외부 주입 없이도 circular wiring 없이 구성된다.
 */
export function createWorkerGenerate(opts: CreateWorkerGenerateOptions = {}): WorkerGenerate {
  const ref: { current: OrchestratorService | null } = { current: null };

  const store = createJobStore({
    orchestrate: async (task) => {
      if (!ref.current) throw new Error("worker-generate: orchestrator not yet bound");
      return ref.current.orchestrate(task);
    },
  });

  const routerOpts = opts.logger === undefined
    ? { store }
    : { store, logger: opts.logger };
  const router = createJobRouter(routerOpts);

  const service = opts.service ?? createOrchestratorService({
    ...(opts.orchestratorOptions ?? {}),
    metricsServerFallback: router,
  });
  ref.current = service;

  return {
    service,
    store,
    createServer() {
      return service.createMetricsServer();
    },
  };
}
