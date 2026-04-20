/**
 * `@geny/worker-generate` CLI 인자 파싱 (세션 67 분리).
 *
 * main.ts 에서 분리된 이유: unit test 에서 `main()` 의 side-effect (server listen,
 * redis 연결, signal handler) 없이 parseArgs 만 호출하기 위함.
 *
 * `--concurrency N` (세션 67, 세션 66 D6 loop closer):
 *   BullMQ Worker concurrency. 범위 [1, 256]. 미지정 시 `GENY_WORKER_CONCURRENCY`
 *   env fallback → 숫자 파싱 실패/범위 이탈 시 throw. 둘 다 없으면 `undefined` 반환
 *   (BullMQ 기본값 1 이 적용됨 — `createBullMQConsumer` 가 concurrency 필드 생략).
 *   `--role producer|both` 에는 무의미 (producer 는 consumer 가 아니므로 무시되지
 *   않고 에러) — 단순화를 위해 flag 는 role 과 무관하게 받되, consumer 역할에서만 사용.
 */

export type DriverKind = "in-memory" | "bullmq";
export type Role = "producer" | "consumer" | "both";

export interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
  http: boolean;
  driver: DriverKind;
  queueName: string;
  role: Role;
  concurrency: number | undefined;
  /** 세션 88 — SafetyFilter 프리셋 spec. 원문 그대로 저장, main.ts 가 `parseSafetyPreset` 으로 해석. */
  safetyPreset: string | undefined;
}

export const DEFAULT_QUEUE_NAME = "geny-generate";
export const CONCURRENCY_ENV = "GENY_WORKER_CONCURRENCY";
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 256;

function parseConcurrency(raw: string, origin: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${origin} 는 정수여야 함: ${raw}`);
  }
  if (n < CONCURRENCY_MIN || n > CONCURRENCY_MAX) {
    throw new Error(`${origin} 는 ${CONCURRENCY_MIN}..${CONCURRENCY_MAX} 범위: ${raw}`);
  }
  return n;
}

export interface ParseArgsOptions {
  env?: NodeJS.ProcessEnv;
}

export function parseArgs(argv: readonly string[], opts: ParseArgsOptions = {}): CliArgs {
  const env = opts.env ?? process.env;
  let port = 9091;
  let host = "0.0.0.0";
  let catalog: string | undefined;
  let http = false;
  let driver: DriverKind = "in-memory";
  let queueName = DEFAULT_QUEUE_NAME;
  let role: Role = "both";
  let concurrencyCli: number | undefined;
  let safetyPreset: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") {
      const v = argv[++i];
      if (!v) throw new Error("--port 값 누락");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 65535) throw new Error(`--port 범위 오류: ${v}`);
      port = n;
    } else if (a === "--host") {
      const v = argv[++i];
      if (!v) throw new Error("--host 값 누락");
      host = v;
    } else if (a === "--catalog") {
      const v = argv[++i];
      if (!v) throw new Error("--catalog 값 누락");
      catalog = v;
    } else if (a === "--http") {
      http = true;
    } else if (a === "--driver") {
      const v = argv[++i];
      if (v !== "in-memory" && v !== "bullmq") {
        throw new Error(`--driver 는 "in-memory" 또는 "bullmq" 만 허용: ${v}`);
      }
      driver = v;
    } else if (a === "--queue-name") {
      const v = argv[++i];
      if (!v) throw new Error("--queue-name 값 누락");
      queueName = v;
    } else if (a === "--role") {
      const v = argv[++i];
      if (v !== "producer" && v !== "consumer" && v !== "both") {
        throw new Error(`--role 는 "producer"|"consumer"|"both" 만 허용: ${v}`);
      }
      role = v;
    } else if (a === "--concurrency") {
      const v = argv[++i];
      if (!v) throw new Error("--concurrency 값 누락");
      concurrencyCli = parseConcurrency(v, "--concurrency");
    } else if (a === "--safety-preset") {
      const v = argv[++i];
      if (!v) throw new Error("--safety-preset 값 누락");
      safetyPreset = v;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: worker-generate [--port N] [--host H] [--catalog PATH] [--http]" +
          " [--driver in-memory|bullmq] [--queue-name NAME]" +
          " [--role producer|consumer|both] [--concurrency N]" +
          " [--safety-preset noop|block-vendors:NAME[,NAME...]]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  if ((role === "producer" || role === "consumer") && driver !== "bullmq") {
    throw new Error(`--role ${role} 은 --driver bullmq 에서만 사용 가능`);
  }
  // CLI 우선, 없으면 env fallback — Helm chart 는 env 로 주입 (세션 66 D6).
  let concurrency: number | undefined = concurrencyCli;
  if (concurrency === undefined) {
    const envRaw = env[CONCURRENCY_ENV];
    if (envRaw !== undefined && envRaw !== "") {
      concurrency = parseConcurrency(envRaw, `env ${CONCURRENCY_ENV}`);
    }
  }
  return { port, host, catalog, http, driver, queueName, role, concurrency, safetyPreset };
}
