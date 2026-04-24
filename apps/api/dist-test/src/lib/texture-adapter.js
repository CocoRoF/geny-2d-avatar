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
export class TextureAdapterRegistry {
    adapters = [];
    register(adapter) {
        if (this.adapters.some((a) => a.name === adapter.name)) {
            throw new Error("duplicate adapter name: " + adapter.name);
        }
        this.adapters.push(adapter);
    }
    list() {
        return [...this.adapters];
    }
    /**
     * task 를 처리 가능한 어댑터 목록 (등록 순서). 첫 번째가 primary.
     */
    eligible(task) {
        return this.adapters.filter((a) => a.supports(task));
    }
}
export class NoEligibleAdapterError extends Error {
    constructor(task) {
        super("No texture adapter eligible for task: preset=" +
            task.preset.id +
            "@" +
            task.preset.version +
            ", size=" +
            task.width +
            "x" +
            task.height);
        this.name = "NoEligibleAdapterError";
    }
}
export class AllAdaptersFailedError extends Error {
    attempts;
    constructor(attempts) {
        super("All adapters failed (" + attempts.length + " attempts): " +
            attempts.map((a) => a.adapter + "=" + (a.error_code ?? "unknown")).join(", "));
        this.name = "AllAdaptersFailedError";
        this.attempts = attempts;
    }
}
/**
 * task 를 eligible 어댑터에 순차 시도. 첫 성공 반환, 전부 실패 시 AllAdaptersFailedError.
 * 각 시도의 결과를 attempts[] 에 기록.
 */
export async function runTextureGenerate(task, registry) {
    const eligible = registry.eligible(task);
    if (eligible.length === 0) {
        throw new NoEligibleAdapterError(task);
    }
    const attempts = [];
    for (const adapter of eligible) {
        const t0 = Date.now();
        try {
            const result = await adapter.generate(task);
            const attempt = {
                adapter: adapter.name,
                status: "success",
                latency_ms: Date.now() - t0,
            };
            attempts.push(attempt);
            return { result, adapter: adapter.name, attempts };
        }
        catch (err) {
            const e = err;
            attempts.push({
                adapter: adapter.name,
                status: "error",
                error_code: e.code ?? e.name ?? "UNKNOWN",
                error_message: e.message,
                latency_ms: Date.now() - t0,
            });
        }
    }
    throw new AllAdaptersFailedError(attempts);
}
//# sourceMappingURL=texture-adapter.js.map