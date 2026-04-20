#!/usr/bin/env node
// scripts/test-golden.mjs
// 단일 엔트리 골든 회귀 러너. 실행:
//   node scripts/test-golden.mjs
//   pnpm run test:golden   (루트 package.json 에 정의)
//
// 동작:
//  1) 스키마 + rig template 검증 (scripts/validate-schemas.mjs).
//  2) @geny/exporter-core 빌드 + 단위 테스트 (88 tests, byte-equal golden; 세션 15 +7, 13 +8).
//     이후 단계에서 각 TS 패키지는 자체 build/test 스크립트가 dist/ 를 만들어 workspace: 참조가 풀린다.
//  3) CLI 로 halfbody v1.2.0 번들을 임시 디렉터리에 조립, snapshot 을 기존 golden 과 byte 비교.
//  4) CLI `avatar` 로 sample-01-aria 번들을 조립, snapshot 을 아바타 단 golden 과 byte 비교 (세션 11).
//  5) CLI `web-avatar` 로 halfbody v1.2.0 web-avatar 번들을 조립, snapshot 을 golden 과 byte 비교 (세션 15).
//  6) apps/web-preview e2e — prepare+serve+fetch+loadWebAvatarBundle 체인 (세션 20). Foundation Exit #1 의 무인 축.
//  7) @geny/license-verifier tests — registry 파서 + verifyLicense/Provenance + tamper/expiry/scope 회귀 (세션 21).
//  8) @geny/ai-adapter-core tests — deterministicSeed/promptSha256 + AdapterRegistry 라우팅 + provenance 엔트리 빌더
//     + routeWithFallback() 헬퍼(5xx/4xx/safety/캐시 분기) + SafetyFilter 계약
//     + adapters.json catalog 파서 + factory 주입 + orchestrate() 단일 진입점
//     + MetricsHook/InMemoryMetricsRegistry/createRegistryMetricsHook (catalog §3 방출, 세션 22/28/30/33, 68 tests).
//  9) @geny/ai-adapter-nano-banana tests — capability matrix + BUDGET/CAPABILITY/DEADLINE/INVALID_OUTPUT 에러 매핑
//     + adapter → provenance → license-verifier round-trip (세션 22).
// 10) @geny/web-avatar tests — happy-dom 기반 `<geny-avatar>` DOM lifecycle 회귀 + loader 단위 테스트 (세션 23).
// 11) infra/helm/observability — chart configs sync + 구조 검증 (Chart.yaml / values / templates / `.Files.Get` 참조). 세션 24.
// 12) @geny/ai-adapters-fallback tests — SDXL(edit/style_ref) + Flux-Fill(mask) Mock 의 capability 매트릭스 + AdapterRegistry
//     통합 폴백 순서(nano-banana → sdxl → flux-fill) + HttpSDXLClient · HttpFluxFillClient 회귀 (세션 25/28).
// 13) @geny/post-processing tests — docs/06 §4 Stage 1 alpha sanitation (premult 라운드트립 + noise threshold +
//     tight bbox + 파이프라인 결과 sha256 golden, 세션 26) + §6 Stage 3 color normalize (RGB Reinhard + Lab*
//     경로 + fit-to-palette k-means k=4 ΔE ≤ cap 이동 + pre-atlas hook, 세션 29/32) + §4 step 3/4/5 확장
//     (morph close + feather + UV clip + 파이프라인 순서 회귀, 세션 35). 111 tests.
// 14) rig-template migrate — v1.0.0→v1.3.0 체인 + v1.2.0→v1.3.0 단일 hop + 결정론 (세션 27).
// 15) @geny/metrics-http tests — Node http `/metrics` + `/healthz` 핸들러 + createMetricsServer
//     e2e (orchestrator hook → scrape 반영) + HEAD/405/404/query-string 회귀 (12 tests, 세션 36).
// 16) @geny/exporter-pipeline tests — PNG decode/encode 라운드트립 + 결정론 + 실 템플릿
//     (halfbody/v1.2.0/textures/base.png) e2e + assembleWebAvatarBundle textureOverrides
//     훅을 채워 번들 생성 + path 보존 가드 회귀 (8 tests, 세션 38).
// 17) @geny/orchestrator-service tests — 최초 서비스 bootstrap. `infra/adapters/adapters.json`
//     로딩 + Mock 어댑터 3종 wiring + orchestrate→/metrics registry 반영 + extraMetricsHook
//     chain + createMetricsServer 실 HTTP 바인딩 + fallback 라우팅 + runWebAvatarPipeline 위임
//     회귀 (7 tests, 세션 39).
// 18) rig-template-lint — halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 physics.json 의 meta 카운트
//     무결성 + dictionary/settings id 1:1 + 파라미터 레퍼런스 + vertex_index 범위 + cubism_mapping
//     커버리지 + 출력 네이밍 규약(`_(sway|phys|fuwa)(_[lr])?$`) + parts↔parameters (C11) +
//     deformers↔parameters (C12) + deformer 트리 무결성 (C13) + baseline diff 회귀.
//     세션 40 physics-lint 출발 → 세션 110 리브랜딩.
// 19) @geny/worker-generate tests — Foundation 워커 skeleton. JobStore (submit→FIFO→succeed/fail,
//     stop guard, list ordering) + HTTP router (POST /jobs 202·GET /jobs/{id}·잘못된 JSON 400·
//     잘못된 CT 415·필드 검증·405+Allow·404) + wiring e2e (Mock 로 orchestrate→/metrics 반영 +
//     createHttpAdapterFactories 주입 fetch 로 config.model 이 request body `model` 로 전달되는
//     ADR 0005 L4 apiModel 분리 재검증). 16 tests, 세션 44.
// 20) perf-harness smoke — Foundation 성능 SLO (docs/14 §10) 하네스 회귀. worker-generate 를
//     in-process 기동 후 HTTP POST /jobs 20건을 concurrency 4 로 투하, accept + orchestrate
//     latency p50/p95/p99 + 에러율 + throughput 을 수집해 smoke 완화 SLO 대비 pass 확인.
//     SLO 강제 위반 path + jobs=0 경계 포함 3 cases (세션 51).
// 21) @geny/job-queue-bullmq tests — ADR 0006 §D3 X 단계. `BullMQDriver` 인터페이스 계약 +
//     `createBullMQJobStore` 팩토리 — idempotency_key → jobId 패스스루 + 특수문자/128-char
//     boundary + state 매핑 + orchestrate 실패 payload + drain/stop 멱등 (9 tests, 세션 60).
//     실 bullmq/ioredis 바인딩은 X+1 세션에서 결선.
// 22) observability-smoke parser tests — Prometheus exposition 파서 + histogram `_bucket/_sum/_count`
//     suffix 축약 + escape 된 label value 방어 (세션 78).
// 23) observability-snapshot-diff parser tests — baseline vs current exposition 구조 drift 감지
//     (added/removed/labelDrift) + smoke-snapshot-session-75.txt self-diff = 0 drift freeze guard
//     (8 tests, 세션 80).
// 24) apps/web-editor e2e — Foundation Exit #1 에디터 스캐폴드의 무인 E2E.
//     prepare → serve(:port) → HTTP 200×6 + loader 체인(avatar_id=avt.editor.halfbody.demo) +
//     categorize 4 카테고리 카디널리티 어서션 + `<geny-avatar>` happy-dom ready lifecycle (세션 81).
//     세션 91 — `@geny/web-editor-renderer` mount 어서션 추가 (구조 프리뷰 SVG + rotation).
// 25) @geny/web-editor-renderer tests — `<geny-avatar>` ready + parameterchange 구독으로
//     SVG 구조 프리뷰 (grid) 를 생성하는 `createStructureRenderer` 회귀. duck-typed
//     EventTarget 으로 실 element 없이 구동 (6 tests, 세션 91).
// 25) mock-vendor-server tests — 세션 82. nano-banana/sdxl/flux-fill HTTP 계약 재현 서버의
//     계약 회귀 (3 엔드포인트 결정론적 image_sha256 + 401/400/404 + latency/fail 주입 + argv 파서,
//     13 tests). 실 벤더 키 없이 HTTP 경로 end-to-end 를 두드릴 수 있도록 하는 dev/CI 도구.
// 26) observability Mock↔HTTP 스냅샷 drift 검사 — 세션 83. `smoke-snapshot-session-75.txt`
//     (Mock 어댑터 경로) ↔ `smoke-snapshot-http-session-83.txt` (`--vendor-mock` 로 캡처한 실
//     HTTP 어댑터 경로) 두 커밋된 스냅샷을 `observability-snapshot-diff.mjs` 로 structural drift=0
//     어서션. Mock → HTTP 전환이 관측 계약(metric 이름 + label 키 집합)을 보존한다는 Foundation
//     불변식 CI 고정. Redis/Docker 불필요 — 두 파일을 fs 로 읽어 비교만 하므로 수 ms.
// 27) observability-fallback-validate + fallback 스냅샷 검증 — 세션 84/85/86/88. (a) 파서 회귀
//     29 tests (1-hop 9 + 2-hop 5 + terminal 9 + unsafe 6 — readSample label exact-match,
//     hasAnySample TYPE-only 구분, listSamples partial-label, violation 경로) (b) 네 커밋된
//     베이스라인: `smoke-snapshot-fallback-session-84.txt` (1-hop 5xx, nano→sdxl) +
//     `smoke-snapshot-fallback-session-85-2hop.txt` (2-hop 5xx, nano→sdxl→flux-fill) +
//     `smoke-snapshot-terminal-session-86.txt` (terminal 5xx, 3 후보 전부 실패 → queue_failed_total
//     {reason=ai_5xx}) + `smoke-snapshot-unsafe-session-88.txt` (UNSAFE_CONTENT,
//     SafetyFilter 로 nano-banana 결과 차단 → sdxl 폴백 성공, reason="unsafe")
//     에 대해 각각 validator 실행. 1-hop 은 5 축, 2-hop 은 7 축, terminal 은 9 축,
//     unsafe 는 5 축 (unsafe status/reason label-set + sdxl success + queue_succeeded +
//     queue_failed TYPE-only). Foundation "fallback 경로(5xx 3 변종 + unsafe)가 관측 상
//     없었던 일이 되지 않는다" 불변식 4-way 고정.
// 어느 단계든 실패하면 non-zero exit. stderr 에 힌트 출력.

import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const STEPS = [
  { name: "validate-schemas", run: runSchemas },
  { name: "exporter-core tests", run: runExporterCoreTests },
  { name: "bundle golden diff", run: runBundleDiff },
  { name: "avatar bundle golden diff", run: runAvatarBundleDiff },
  { name: "web-avatar bundle golden diff", run: runWebAvatarBundleDiff },
  { name: "web-preview e2e", run: runWebPreviewE2E },
  { name: "license-verifier tests", run: runLicenseVerifierTests },
  { name: "ai-adapter-core tests", run: runAIAdapterCoreTests },
  { name: "ai-adapter-nano-banana tests", run: runAIAdapterNanoBananaTests },
  { name: "web-avatar dom lifecycle", run: runWebAvatarDomTests },
  { name: "observability chart verify", run: runObservabilityChartVerify },
  { name: "ai-adapters-fallback tests", run: runAIAdaptersFallbackTests },
  { name: "post-processing tests", run: runPostProcessingTests },
  { name: "rig-template migrate tests", run: runRigMigrateTests },
  { name: "metrics-http tests", run: runMetricsHttpTests },
  { name: "exporter-pipeline tests", run: runExporterPipelineTests },
  { name: "orchestrator-service tests", run: runOrchestratorServiceTests },
  { name: "rig-template-lint", run: runRigTemplateLintTests },
  { name: "worker-generate tests", run: runWorkerGenerateTests },
  { name: "perf-harness smoke", run: runPerfHarnessSmoke },
  { name: "job-queue-bullmq tests", run: runJobQueueBullMQTests },
  { name: "observability-smoke parser tests", run: runObservabilitySmokeParserTests },
  { name: "observability-snapshot-diff parser tests", run: runObservabilitySnapshotDiffTests },
  { name: "web-editor-logic tests", run: runWebEditorLogicTests },
  { name: "web-editor-renderer tests", run: runWebEditorRendererTests },
  { name: "web-editor e2e", run: runWebEditorE2E },
  { name: "mock-vendor-server tests", run: runMockVendorServerTests },
  { name: "observability Mock↔HTTP snapshot drift", run: runObservabilityMockHttpDriftCheck },
  { name: "observability fallback validator", run: runObservabilityFallbackValidator },
];

const failed = [];
for (const step of STEPS) {
  const t0 = Date.now();
  process.stderr.write(`[golden] ▶ ${step.name}\n`);
  try {
    await step.run();
    process.stderr.write(`[golden] ✔ ${step.name} (${Date.now() - t0} ms)\n`);
  } catch (err) {
    process.stderr.write(`[golden] ✖ ${step.name}\n${err.stack ?? err}\n`);
    failed.push(step.name);
  }
}

if (failed.length > 0) {
  process.stderr.write(`\n[golden] FAILED: ${failed.join(", ")}\n`);
  process.stderr.write(
    "[golden] 골든이 의도적으로 바뀌어야 한다면 다음을 참고:\n" +
      "          packages/exporter-core/tests/golden/halfbody_v1.2.0.*.json\n" +
      "          packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar*.json\n" +
      "          samples/avatars/sample-01-aria.bundle.snapshot.json\n" +
      "          를 새 결과로 덮어쓴 뒤 PR 에 '골든 갱신' 명시.\n",
  );
  process.exit(1);
}

process.stderr.write("\n[golden] ✅ all steps pass\n");

// ---------- steps ----------

async function runSchemas() {
  await run("node", ["scripts/validate-schemas.mjs"], { cwd: repoRoot });
}

async function runExporterCoreTests() {
  await run("pnpm", ["-F", "@geny/exporter-core", "test"], { cwd: repoRoot });
}

async function runBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    // CLI 는 snapshot 을 stdout, 로그를 stderr 로 분리한다 (세션 09).
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "bundle",
          "--template",
          "rig-templates/base/halfbody/v1.2.0",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(
          repoRoot,
          "packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json",
        ),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runAvatarBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-avatar-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "avatar",
          "--spec",
          "samples/avatars/sample-01-aria.export.json",
          "--rig-templates-root",
          "rig-templates",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(repoRoot, "samples/avatars/sample-01-aria.bundle.snapshot.json"),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `avatar bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runWebAvatarBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-web-avatar-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "web-avatar",
          "--template",
          "rig-templates/base/halfbody/v1.2.0",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(
          repoRoot,
          "packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar-bundle.snapshot.json",
        ),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `web-avatar bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runWebPreviewE2E() {
  await run("pnpm", ["-F", "@geny/web-preview", "test"], { cwd: repoRoot });
}

async function runWebEditorLogicTests() {
  // 세션 89 — categoryOf/categorize 단일 소스. index.html + e2e-check.mjs + (향후 editor-renderer)
  // 가 모두 이 dist 를 공유 → 규칙 drift 를 구조적으로 차단.
  await run("pnpm", ["-F", "@geny/web-editor-logic", "test"], { cwd: repoRoot });
}

async function runWebEditorRendererTests() {
  // 세션 91 — `<geny-avatar>` ready + parameterchange 를 구독해 SVG 구조 프리뷰를
  // 생성하는 `createStructureRenderer` 회귀. duck-typed EventTarget 으로 실 element
  // 없이 구동 (happy-dom Window + CustomEvent dispatch, 6 tests).
  await run("pnpm", ["-F", "@geny/web-editor-renderer", "test"], { cwd: repoRoot });
}

async function runWebEditorE2E() {
  await run("pnpm", ["-F", "@geny/web-editor", "test"], { cwd: repoRoot });
}

async function runMockVendorServerTests() {
  await run("node", ["scripts/mock-vendor-server.test.mjs"], { cwd: repoRoot });
}

async function runObservabilityMockHttpDriftCheck() {
  // 세션 83 — Mock ↔ HTTP 경로 관측 계약 동등성. --vendor-mock 으로 생성한 HTTP 경로 스냅샷이
  // Foundation Mock 스냅샷(세션 75) 과 metric 이름 · label 키 집합을 보존하는지 검사.
  await run("node", [
    "scripts/observability-snapshot-diff.mjs",
    "--baseline", "infra/observability/smoke-snapshot-session-75.txt",
    "--current", "infra/observability/smoke-snapshot-http-session-83.txt",
  ], { cwd: repoRoot });
}

async function runObservabilityFallbackValidator() {
  // 세션 84 — fallback 1-hop (nano→sdxl).
  // 세션 85 — fallback 2-hop (nano→sdxl→flux-fill).
  // 세션 86 — fallback terminal (3 후보 전부 실패 → queue_failed_total{reason=ai_5xx}).
  // 세션 88 — fallback unsafe (SafetyFilter 가 nano-banana 결과 차단 → sdxl 폴백 성공).
  // 네 베이스라인 모두 커밋돼 있고, 같은 validator 가 `--expect-hops {1|2}` /
  // `--expect-terminal-failure` / `--expect-unsafe` 로 분기. 파서 회귀 29 tests 도 본 step 에서
  // 실행 (1-hop 9 + 2-hop 5 + terminal 9 + unsafe 6).
  await run("node", ["scripts/observability-fallback-validate.test.mjs"], { cwd: repoRoot });
  await run("node", [
    "scripts/observability-fallback-validate.mjs",
    "--file", "infra/observability/smoke-snapshot-fallback-session-84.txt",
  ], { cwd: repoRoot });
  await run("node", [
    "scripts/observability-fallback-validate.mjs",
    "--file", "infra/observability/smoke-snapshot-fallback-session-85-2hop.txt",
    "--expect-hops", "2",
  ], { cwd: repoRoot });
  await run("node", [
    "scripts/observability-fallback-validate.mjs",
    "--file", "infra/observability/smoke-snapshot-terminal-session-86.txt",
    "--expect-terminal-failure",
  ], { cwd: repoRoot });
  await run("node", [
    "scripts/observability-fallback-validate.mjs",
    "--file", "infra/observability/smoke-snapshot-unsafe-session-88.txt",
    "--expect-unsafe",
  ], { cwd: repoRoot });
}

async function runLicenseVerifierTests() {
  await run("pnpm", ["-F", "@geny/license-verifier", "test"], { cwd: repoRoot });
}

async function runAIAdapterCoreTests() {
  // build 가 dist/ 를 만들어야 nano-banana 가 import 가능. 먼저 core 를 빌드.
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "test"], { cwd: repoRoot });
}

async function runAIAdapterNanoBananaTests() {
  // license-verifier dist 가 필요 (round-trip 테스트에서 import).
  await run("pnpm", ["-F", "@geny/license-verifier", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "test"], { cwd: repoRoot });
}

async function runWebAvatarDomTests() {
  // loader + happy-dom 기반 `<geny-avatar>` DOM lifecycle (세션 23).
  await run("pnpm", ["-F", "@geny/web-avatar", "test"], { cwd: repoRoot });
}

async function runObservabilityChartVerify() {
  // infra/helm/observability chart 구조 + canonical sync (세션 24).
  await run("node", ["scripts/verify-observability-chart.mjs"], { cwd: repoRoot });
}

async function runAIAdaptersFallbackTests() {
  // SDXL + Flux-Fill skeleton + AdapterRegistry 통합 폴백 (세션 25).
  // nano-banana 는 router integration test 에서 dist/ import.
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapters-fallback", "test"], { cwd: repoRoot });
}

async function runPostProcessingTests() {
  // docs/06 §4 Stage 1 alpha sanitation skeleton (세션 26).
  await run("pnpm", ["-F", "@geny/post-processing", "test"], { cwd: repoRoot });
}

async function runRigMigrateTests() {
  // halfbody v1.0.0→v1.3.0 migrator 체인 회귀 (세션 27).
  // 세션 111 — migrator 로직은 `@geny/migrator` 패키지로 이동. CLI shim 이 dist/ 로
  // dynamic import 하므로 빌드 선행. 패키지 내부 단위 테스트도 같이 돌린다.
  await run("pnpm", ["-F", "@geny/migrator", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/migrator", "test"], { cwd: repoRoot });
  await run("node", ["scripts/rig-template/migrate.test.mjs"], { cwd: repoRoot });
}

async function runMetricsHttpTests() {
  // @geny/metrics-http 는 @geny/ai-adapter-core 의 dist 에 의존. core 빌드 선행.
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/metrics-http", "test"], { cwd: repoRoot });
}

async function runExporterPipelineTests() {
  // exporter-core, post-processing 의 dist 에 의존 (NodeNext type import + workspace:*).
  await run("pnpm", ["-F", "@geny/exporter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/post-processing", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/exporter-pipeline", "test"], { cwd: repoRoot });
}

async function runRigTemplateLintTests() {
  // halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 전부 clean + 변조 negative 케이스
  // (C1~C13) + baseline diff. 세션 40 physics-lint 출발 → 세션 110 리브랜딩.
  await run("node", ["scripts/rig-template/rig-template-lint.test.mjs"], { cwd: repoRoot });
}

async function runOrchestratorServiceTests() {
  // 모든 runtime workspace dep 의 dist 가 필요. 개별로 빌드해 캐시 효과 유지.
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapters-fallback", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/metrics-http", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/post-processing", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/exporter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/exporter-pipeline", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/orchestrator-service", "test"], { cwd: repoRoot });
}

async function runWorkerGenerateTests() {
  // worker-generate 는 orchestrator-service + job-queue-bullmq dist 에 의존 (세션 63+). 그 이전
  // 체인은 이미 step 17 에서 빌드됨. CI clean runner 는 dist/ 캐시가 없으므로 명시 빌드.
  await run("pnpm", ["-F", "@geny/orchestrator-service", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/job-queue-bullmq", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/worker-generate", "test"], { cwd: repoRoot });
}

async function runPerfHarnessSmoke() {
  // 하네스는 `../apps/worker-generate/dist/index.js` 를 직접 import. step 19 의 `test` 는
  // `build:test → dist-test/` 만 만들고 `dist/` 는 건드리지 않으므로 여기서 main build 를 명시.
  await run("pnpm", ["-F", "@geny/worker-generate", "build"], { cwd: repoRoot });
  await run("node", ["scripts/perf-harness.test.mjs"], { cwd: repoRoot });
}

async function runJobQueueBullMQTests() {
  // ai-adapter-core dist 는 step 8 에서 빌드됨 — job-queue-bullmq 의 workspace 참조가 풀린다.
  await run("pnpm", ["-F", "@geny/job-queue-bullmq", "test"], { cwd: repoRoot });
}

async function runObservabilitySmokeParserTests() {
  // observability-smoke.mjs 의 Prometheus exposition 파서(extractMetricNames + readSampleValue)
  // 를 기동 없이 순수 단위 테스트. 세션 76.
  await run("node", ["scripts/observability-smoke.test.mjs"], { cwd: repoRoot });
}

async function runObservabilitySnapshotDiffTests() {
  // observability-snapshot-diff.mjs — exposition 파서 확장 (label key 집합) + diff 알고리즘
  // (added/removed/labelDrift/sampleCountDelta). smoke-snapshot-session-75.txt self-diff 회귀
  // 포함. 세션 80.
  await run("node", ["scripts/observability-snapshot-diff.test.mjs"], { cwd: repoRoot });
}

// ---------- util ----------

function run(cmd, args, opts) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

function diffInline(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  const n = Math.max(al.length, bl.length);
  const lines = [];
  for (let i = 0; i < n; i++) {
    if (al[i] === bl[i]) continue;
    if (al[i] !== undefined) lines.push(`- ${al[i]}`);
    if (bl[i] !== undefined) lines.push(`+ ${bl[i]}`);
  }
  return lines.slice(0, 200).join("\n");
}
