/**
 * 텍스처 생성 어댑터 계약 + 레지스트리 + orchestrate.
 *
 * docs/02-TEXTURE-PIPELINE.md §4 + docs/03-ARCHITECTURE.md §3.3 의 ai-adapter-core
 * 확장. 본 모듈은 apps/api 전용 경량 러너 — ai-adapter-core 의 `orchestrate()` 는
 * 파츠 생성 전제 (이전 스코프의 잔재) 라 우리 texture 경로는 자체 interface.
 *
 * P3.3 scope:
 *   - TextureAdapter 계약 정의
 *   - TextureAdapterRegistry (이름 → adapter + routing 우선순위)
 *   - runTextureGenerate(task, registry) - 기본 adapter 시도 + 실패 시 폴백 시퀀스
 *   - attempts[] 추적 → texture.manifest.json 의 generated_by.attempts 에 기록
 *
 * 실 AI 벤더 어댑터는 P3.4 에서 추가.
 */

export interface TextureTask {
  readonly preset: { readonly id: string; readonly version: string };
  readonly prompt: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /**
   * image-to-image 변형용 reference PNG. 어댑터가 image input 을 지원하면 prompt 와 함께
   * 보내 "이 이미지를 prompt 에 따라 수정" 하도록 요청한다. text-to-image 만 지원하는
   * 어댑터 (pollinations) 는 무시.
   */
  readonly referenceImage?: { readonly png: Buffer; readonly mimeType?: string };
  /**
   * Inpainting mask PNG. 우리 convention:
   *   alpha=255 (불투명/흰색) = 변형할 영역
   *   alpha=0  (투명/검정)   = 보존할 영역
   * OpenAI 어댑터는 자동으로 invert 후 /v1/images/edits 의 mask 필드로 전송.
   * Gemini 는 두 번째 inline_data + edit prompt 로 전달.
   * 후처리 단계 (inpaint-composite.ts) 에서 mask 외부 픽셀은 원본으로 강제 복원.
   */
  readonly inpaintMask?: { readonly png: Buffer; readonly mimeType?: string };
}

export interface TextureResult {
  readonly png: Buffer;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export interface TextureAdapter {
  /** 어댑터 식별자. manifest.generated_by.adapter 로 기록. 예: "mock", "nano-banana@1.2.0". */
  readonly name: string;
  /** 이 어댑터가 처리 가능한지 (예: 해상도 제한, prompt 제약 등). */
  readonly supports: (task: TextureTask) => boolean;
  readonly generate: (task: TextureTask) => Promise<TextureResult>;
}

export interface AdapterAttempt {
  readonly adapter: string;
  readonly status: "success" | "error";
  readonly error_code?: string;
  readonly error_message?: string;
  readonly latency_ms: number;
}

export interface RunResult {
  readonly result: TextureResult;
  readonly adapter: string;
  readonly attempts: ReadonlyArray<AdapterAttempt>;
}

export class TextureAdapterRegistry {
  private readonly adapters: TextureAdapter[] = [];

  register(adapter: TextureAdapter): void {
    if (this.adapters.some((a) => a.name === adapter.name)) {
      throw new Error("duplicate adapter name: " + adapter.name);
    }
    this.adapters.push(adapter);
  }

  list(): ReadonlyArray<TextureAdapter> {
    return [...this.adapters];
  }

  /**
   * task 를 처리 가능한 어댑터 목록 (등록 순서). 첫 번째가 primary.
   */
  eligible(task: TextureTask): ReadonlyArray<TextureAdapter> {
    return this.adapters.filter((a) => a.supports(task));
  }
}

export class NoEligibleAdapterError extends Error {
  constructor(task: TextureTask) {
    super(
      "No texture adapter eligible for task: preset=" +
        task.preset.id +
        "@" +
        task.preset.version +
        ", size=" +
        task.width +
        "x" +
        task.height,
    );
    this.name = "NoEligibleAdapterError";
  }
}

export class AllAdaptersFailedError extends Error {
  readonly attempts: ReadonlyArray<AdapterAttempt>;
  constructor(attempts: ReadonlyArray<AdapterAttempt>) {
    super(
      "All adapters failed (" + attempts.length + " attempts): " +
        attempts.map((a) => a.adapter + "=" + (a.error_code ?? "unknown")).join(", "),
    );
    this.name = "AllAdaptersFailedError";
    this.attempts = attempts;
  }
}

/**
 * task 를 eligible 어댑터에 순차 시도. 첫 성공 반환, 전부 실패 시 AllAdaptersFailedError.
 * 각 시도의 결과를 attempts[] 에 기록.
 */
export async function runTextureGenerate(
  task: TextureTask,
  registry: TextureAdapterRegistry,
): Promise<RunResult> {
  const eligible = registry.eligible(task);
  if (eligible.length === 0) {
    throw new NoEligibleAdapterError(task);
  }
  const attempts: AdapterAttempt[] = [];
  for (const adapter of eligible) {
    const t0 = Date.now();
    try {
      const result = await adapter.generate(task);
      const attempt: AdapterAttempt = {
        adapter: adapter.name,
        status: "success",
        latency_ms: Date.now() - t0,
      };
      attempts.push(attempt);
      return { result, adapter: adapter.name, attempts };
    } catch (err) {
      const e = err as Error;
      attempts.push({
        adapter: adapter.name,
        status: "error",
        error_code: (e as { code?: string }).code ?? e.name ?? "UNKNOWN",
        error_message: e.message,
        latency_ms: Date.now() - t0,
      });
    }
  }
  throw new AllAdaptersFailedError(attempts);
}
