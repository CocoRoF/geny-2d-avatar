/**
 * `@geny/metrics-http` — Prometheus `/metrics` Node http 노출 얇은 층.
 *
 * 세션 33 에서 `@geny/ai-adapter-core` 에 `InMemoryMetricsRegistry` +
 * `renderPrometheusText()` 가 도착했다. 본 패키지는 그 문자열을 Node `http` 핸들러로
 * 꺼내, worker/api 서비스가 두 줄로 scrape 가능한 endpoint 를 얻게 한다.
 *
 * 계약:
 *  - `GET /metrics` → 200, `Content-Type: text/plain; version=0.0.4; charset=utf-8`, body=exposition.
 *  - `GET /healthz` → 200, `text/plain; charset=utf-8`, body=`ok\n` (liveness; Prometheus 와 무관).
 *  - `HEAD` 는 `GET` 와 동일 상태/헤더, 본문 없음.
 *  - 그 외 method → 405, `Allow: GET, HEAD`.
 *  - 그 외 path → 404, `text/plain`.
 *
 * 설계 원칙:
 *  - 외부 의존성 0 (Node built-ins + `@geny/ai-adapter-core` 타입만).
 *  - 레지스트리는 본 패키지가 소유하지 않는다 — 호출자가 `createRegistryMetricsHook(reg)` 로
 *    orchestrator 에 훅을 꽂고, 동일 `reg` 인스턴스를 여기로 넘긴다.
 *  - Prometheus exposition content-type 은 `version=0.0.4` 로 고정 (catalog §3).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { InMemoryMetricsRegistry } from "@geny/ai-adapter-core";

/** Prometheus text exposition format 0.0.4 의 공식 content-type. */
export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/**
 * `(req, res)` 핸들러를 돌려준다. 기존 http 서버에 얹거나, `createMetricsServer` 가
 * 내부적으로 사용한다. path 매칭은 query string 제거 후 정확 일치 — prefix 매칭 없음.
 */
export function createMetricsRequestHandler(
  registry: InMemoryMetricsRegistry,
): (req: IncomingMessage, res: ServerResponse) => void {
  return function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    const path = url.split("?", 1)[0] ?? "/";
    const method = req.method ?? "GET";

    if (path === "/metrics") {
      if (method !== "GET" && method !== "HEAD") {
        respondMethodNotAllowed(res);
        return;
      }
      const body = registry.renderPrometheusText();
      const bodyBuf = Buffer.from(body, "utf8");
      res.statusCode = 200;
      res.setHeader("Content-Type", PROMETHEUS_CONTENT_TYPE);
      res.setHeader("Content-Length", String(bodyBuf.byteLength));
      res.setHeader("Cache-Control", "no-store");
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(bodyBuf);
      }
      return;
    }

    if (path === "/healthz") {
      if (method !== "GET" && method !== "HEAD") {
        respondMethodNotAllowed(res);
        return;
      }
      const body = "ok\n";
      const bodyBuf = Buffer.from(body, "utf8");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Length", String(bodyBuf.byteLength));
      res.setHeader("Cache-Control", "no-store");
      if (method === "HEAD") {
        res.end();
      } else {
        res.end(bodyBuf);
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("not found\n");
  };
}

function respondMethodNotAllowed(res: ServerResponse): void {
  res.statusCode = 405;
  res.setHeader("Allow", "GET, HEAD");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("method not allowed\n");
}

export interface CreateMetricsServerOptions {
  /** 추가 라우트. 기본 `/metrics` + `/healthz` 에 잡히지 않는 요청은 이 핸들러로 위임. 미지정 시 404. */
  fallback?: (req: IncomingMessage, res: ServerResponse) => void;
}

/**
 * 독립형 http 서버. 호출자는 `listen(port, host?)` 만 호출하면 된다.
 * `fallback` 을 주면 `/metrics|/healthz` 이외의 경로를 처리할 수 있어, 작은 worker/api
 * 서비스 하나에 메트릭과 도메인 라우트를 동시에 실을 수 있다.
 */
export function createMetricsServer(
  registry: InMemoryMetricsRegistry,
  opts: CreateMetricsServerOptions = {},
): Server {
  const metricsHandler = createMetricsRequestHandler(registry);
  return createServer((req, res) => {
    const url = req.url ?? "/";
    const path = url.split("?", 1)[0] ?? "/";
    if (path === "/metrics" || path === "/healthz") {
      metricsHandler(req, res);
      return;
    }
    if (opts.fallback) {
      opts.fallback(req, res);
      return;
    }
    metricsHandler(req, res);
  });
}
