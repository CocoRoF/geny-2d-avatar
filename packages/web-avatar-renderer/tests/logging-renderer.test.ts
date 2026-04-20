/**
 * `createLoggingRenderer` 회귀 — NullRenderer 의 상태 추적 + 주입된 logger 로 각
 * 이벤트 보고. 세션 115.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createLoggingRenderer,
  type LoggingRendererEvent,
  type RendererBundleMeta,
  type RendererHost,
} from "../src/index.js";

function sampleMeta(partCount = 2): RendererBundleMeta {
  return {
    parts: Array.from({ length: partCount }, (_, i) => ({
      role: `role_${i}`,
      slot_id: `slot_${i}`,
    })),
    parameters: [{ id: "head_angle_x", range: [-30, 30], default: 0 }],
  };
}

function makeHost(initialBundle?: { meta: RendererBundleMeta }): RendererHost {
  const target = new EventTarget();
  return Object.assign(target, {
    bundle: initialBundle ?? null,
  }) as unknown as RendererHost;
}

function makeCapture(): {
  readonly log: LoggingRendererEvent[];
  readonly logger: (evt: LoggingRendererEvent) => void;
} {
  const log: LoggingRendererEvent[] = [];
  return { log, logger: (evt) => log.push(evt) };
}

test("createLoggingRenderer: ready dispatch logs + updates inner state", () => {
  const host = makeHost();
  const { log, logger } = makeCapture();
  const r = createLoggingRenderer({ element: host, logger });

  const meta = sampleMeta(3);
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: { meta } } }));

  assert.equal(r.partCount, 3);
  assert.equal(r.readyCount, 1);
  assert.equal(log.length, 1);
  assert.equal(log[0]!.kind, "ready");
  assert.deepEqual(log[0]!.kind === "ready" ? log[0]!.meta : null, meta);
  r.destroy();
});

test("createLoggingRenderer: parameterchange logs detail + updates state", () => {
  const host = makeHost();
  const { log, logger } = makeCapture();
  const r = createLoggingRenderer({ element: host, logger });

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 12 } }),
  );
  assert.deepEqual(r.lastParameterChange, { id: "head_angle_x", value: 12 });
  assert.equal(log.length, 1);
  assert.equal(log[0]!.kind, "parameterchange");
  if (log[0]!.kind === "parameterchange") {
    assert.deepEqual(log[0]!.detail, { id: "head_angle_x", value: 12 });
  }
  r.destroy();
});

test("createLoggingRenderer: late-attach bundle fires ready once + logs", () => {
  const meta = sampleMeta(4);
  const host = makeHost({ meta });
  const { log, logger } = makeCapture();
  const r = createLoggingRenderer({ element: host, logger });

  assert.equal(r.partCount, 4);
  assert.equal(r.readyCount, 1);
  assert.equal(log.length, 1, "logger fired for late-attach");
  assert.equal(log[0]!.kind, "ready");
  r.destroy();
});

test("createLoggingRenderer: malformed payloads never reach logger", () => {
  const host = makeHost();
  const { log, logger } = makeCapture();
  const r = createLoggingRenderer({ element: host, logger });

  host.dispatchEvent(new CustomEvent("ready", { detail: null }));
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: {} } }));
  host.dispatchEvent(new CustomEvent("parameterchange", { detail: null }));
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: 1, value: 0 } as never }),
  );

  assert.equal(log.length, 0);
  assert.equal(r.readyCount, 0);
  assert.equal(r.parameterChangeCount, 0);
  r.destroy();
});

test("createLoggingRenderer: destroy emits destroy event + halts further logs", () => {
  const host = makeHost();
  const { log, logger } = makeCapture();
  const r = createLoggingRenderer({ element: host, logger });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(1) } } }),
  );
  assert.equal(log.length, 1);

  r.destroy();
  assert.equal(log.length, 2, "destroy event appended");
  assert.equal(log[1]!.kind, "destroy");

  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(5) } } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "x", value: 1 } }),
  );
  assert.equal(log.length, 2, "post-destroy events not logged");
});
