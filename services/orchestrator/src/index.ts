/**
 * `@geny/orchestrator-service` — 최초 서비스 bootstrap (세션 39).
 *
 * 세션 22/25/28/30 (어댑터 계약 + routeWithFallback + catalog + orchestrate) /
 * 세션 33 (MetricsHook + InMemoryMetricsRegistry) /
 * 세션 35/38 (exporter-core textureOverrides + exporter-pipeline runWebAvatarPipeline) /
 * 세션 36 (@geny/metrics-http createMetricsServer) 을 **하나의 얇은 엔트리포인트** 로 묶는다.
 *
 * Foundation 단계의 목표:
 *  - 실 HTTP 벤더 호출은 Mock 으로 대체 (세션 26 이후 http-client 교체는 옵션으로).
 *  - 레지스트리 / 메트릭 / orchestrate / pipeline 를 하나의 구성(configuration)으로 선언.
 *  - 같은 레지스트리 인스턴스를 createMetricsServer 에 연결해 `GET /metrics` scrape 즉시
 *    orchestrate 호출 결과가 보이도록.
 *
 * 설계 원칙:
 *  - `createOrchestratorService` 는 순수 wiring. 포트 바인딩은 `.listen(port)` 호출자가.
 *  - `factories` 기본값은 Mock. 호출자가 http 기반 팩토리를 부분 override 가능.
 *  - `services/orchestrator/src/main.ts` 가 CLI 엔트리 — `node dist/main.js --port 9090`.
 */

import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  InMemoryMetricsRegistry,
  buildRegistryFromCatalog,
  createRegistryMetricsHook,
  orchestrate,
  parseAdapterCatalog,
  type AdapterCatalog,
  type AdapterFactory,
  type AIAdapter,
  type GenerationTask,
  type MetricsHook,
  type OrchestrateOutcome,
} from "@geny/ai-adapter-core";
import {
  MockNanoBananaClient,
  NanoBananaAdapter,
} from "@geny/ai-adapter-nano-banana";
import {
  FluxFillAdapter,
  FluxFillMockClient,
  SDXLAdapter,
  SDXLMockClient,
} from "@geny/ai-adapters-fallback";
import {
  createMetricsServer,
  type CreateMetricsServerOptions,
} from "@geny/metrics-http";
import { loadTemplate, type Template } from "@geny/exporter-core";
import {
  runWebAvatarPipeline,
  type RunWebAvatarPipelineOptions,
} from "@geny/exporter-pipeline";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 레포 루트 (`pnpm-workspace.yaml` 가 있는 디렉터리) 를 위로 올라가며 찾는다. dist/ 와
 * dist-test/src/ 의 깊이가 달라도 같은 결과를 얻기 위함. 못 찾으면 null.
 */
function findRepoRoot(start: string): string | null {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

const REPO_ROOT = findRepoRoot(here);
const DEFAULT_CATALOG_PATH = REPO_ROOT
  ? resolve(REPO_ROOT, "infra", "adapters", "adapters.json")
  : resolve(here, "..", "..", "..", "infra", "adapters", "adapters.json");

/**
 * 어댑터 name → factory 맵. 기본값은 Mock 클라이언트 바인딩.
 * 호출자가 `{ "nano-banana": (e) => new NanoBananaAdapter({ client: realHttp, routingWeight: e.routing_weight }) }`
 * 로 부분 override 할 수 있다.
 */
/**
 * Mock 클라이언트의 `modelVersion` 은 카탈로그 `version` 과 다를 수 있으므로
 * (`mock-2026.04.18` vs `0.1.0` 등), `buildRegistryFromCatalog` 의 strict 매치를 위해
 * 카탈로그 version 을 덮어써 주입한다. 실제 HTTP 클라이언트는 생성자 옵션에서 이미
 * `modelVersion` 을 받으므로 이 덮어쓰기가 필요 없음.
 */
function aliasClient<T extends { readonly modelVersion: string }>(
  client: T,
  version: string,
): T {
  return Object.create(client, {
    modelVersion: { value: version, enumerable: true, writable: false },
  }) as T;
}

export function createMockAdapterFactories(): Record<string, AdapterFactory> {
  return {
    "nano-banana": (entry) =>
      new NanoBananaAdapter({
        client: aliasClient(new MockNanoBananaClient(), entry.version),
        routingWeight: entry.routing_weight,
        maxParallel: entry.max_parallel,
      }),
    "sdxl": (entry) =>
      new SDXLAdapter({
        client: aliasClient(new SDXLMockClient(), entry.version),
        routingWeight: entry.routing_weight,
        maxParallel: entry.max_parallel,
      }),
    "flux-fill": (entry) =>
      new FluxFillAdapter({
        client: aliasClient(new FluxFillMockClient(), entry.version),
        routingWeight: entry.routing_weight,
        maxParallel: entry.max_parallel,
      }),
  };
}

export interface CreateOrchestratorServiceOptions {
  /** adapter-catalog v1 JSON. 생략 시 `infra/adapters/adapters.json` 을 읽는다. */
  catalog?: AdapterCatalog;
  /** 카탈로그 JSON 경로. `catalog` 와 동시 지정 불가. */
  catalogPath?: string;
  /**
   * 어댑터 name → factory. 기본은 `createMockAdapterFactories()` (Foundation Mock).
   * 부분 override: `{ ...createMockAdapterFactories(), "nano-banana": httpFactory }`.
   */
  factories?: Record<string, AdapterFactory>;
  /** 추가 메트릭 훅 — 내부 registry 훅 뒤에 chain 으로 엮인다. */
  extraMetricsHook?: MetricsHook;
  /** createMetricsServer 에 전달할 fallback 핸들러(예: API 라우트). */
  metricsServerFallback?: CreateMetricsServerOptions["fallback"];
}

export interface OrchestratorService {
  readonly registry: InMemoryMetricsRegistry;
  readonly catalog: AdapterCatalog;
  readonly adapters: readonly AIAdapter[];
  readonly metricsHook: MetricsHook;
  /** orchestrate() 1회 호출 — 등록된 어댑터만 사용, 메트릭 자동 방출. */
  orchestrate(task: GenerationTask): Promise<OrchestrateOutcome>;
  /** runWebAvatarPipeline 위임 — 편의상 동일 서비스에서 export pipeline 도 제공. */
  runWebAvatarPipeline(
    template: Template,
    outDir: string,
    opts?: RunWebAvatarPipelineOptions,
  ): ReturnType<typeof runWebAvatarPipeline>;
  /** template 로드 위임. */
  loadTemplate(dir: string): Template;
  /** 메트릭 HTTP 서버 — `.listen(port, host, cb)` 로 바인딩 (아직 열리지 않음). */
  createMetricsServer(): Server;
  /**
   * Prometheus text exposition 을 직접 뽑기 (테스트/디버깅 용). HTTP 서버 없이도 호출 가능.
   */
  renderMetrics(): string;
}

export function createOrchestratorService(
  opts: CreateOrchestratorServiceOptions = {},
): OrchestratorService {
  if (opts.catalog && opts.catalogPath) {
    throw new Error("createOrchestratorService: catalog 와 catalogPath 는 동시에 지정할 수 없음");
  }
  const catalog =
    opts.catalog ??
    parseAdapterCatalog(
      JSON.parse(readFileSync(opts.catalogPath ?? DEFAULT_CATALOG_PATH, "utf8")),
    );

  const factories = opts.factories ?? createMockAdapterFactories();
  const adapterRegistry = buildRegistryFromCatalog(catalog, factories);

  const metricsRegistry = new InMemoryMetricsRegistry();
  const baseHook = createRegistryMetricsHook(metricsRegistry);
  const metricsHook: MetricsHook = opts.extraMetricsHook
    ? chainMetricsHooks(baseHook, opts.extraMetricsHook)
    : baseHook;

  return {
    registry: metricsRegistry,
    catalog,
    adapters: adapterRegistry.list(),
    metricsHook,
    async orchestrate(task) {
      return orchestrate(task, {
        catalog,
        factories,
        registry: adapterRegistry,
        metrics: metricsHook,
      });
    },
    runWebAvatarPipeline(template, outDir, pipelineOpts) {
      return runWebAvatarPipeline(template, outDir, pipelineOpts);
    },
    loadTemplate(dir) {
      return loadTemplate(dir);
    },
    createMetricsServer() {
      const serverOpts: CreateMetricsServerOptions = {};
      if (opts.metricsServerFallback) serverOpts.fallback = opts.metricsServerFallback;
      return createMetricsServer(metricsRegistry, serverOpts);
    },
    renderMetrics() {
      return metricsRegistry.renderPrometheusText();
    },
  };
}

/**
 * 두 MetricsHook 을 직렬로 호출하는 얇은 래퍼. 기본 registry hook 뒤에 외부 사용자의
 * 커스텀 훅 (예: OTEL span 기록 / 샘플 로거) 을 꽂기 위해 사용.
 */
function chainMetricsHooks(a: MetricsHook, b: MetricsHook): MetricsHook {
  return {
    onCall(ev) {
      a.onCall?.(ev);
      b.onCall?.(ev);
    },
    onFallback(ev) {
      a.onFallback?.(ev);
      b.onFallback?.(ev);
    },
  };
}

export { DEFAULT_CATALOG_PATH };
