/**
 * Mock 텍스처 어댑터 - P3.1 generateMockTexture 를 TextureAdapter 인터페이스로 래핑.
 *
 * 특징:
 *   - 결정론적 (동일 task → 동일 결과)
 *   - 모든 task 지원 (supports 항상 true)
 *   - 실 AI 아님을 visual watermark 로 표시
 *   - 실 벤더 어댑터가 추가되기 전 fallback 경로 확보
 */

import { createHash } from "node:crypto";
import { generateMockTexture } from "../mock-generator.js";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";

export function createMockAdapter(): TextureAdapter {
  return {
    name: "mock",
    supports: () => true,
    async generate(task: TextureTask) {
      const png = generateMockTexture({
        prompt: task.prompt,
        seed: task.seed,
        width: task.width,
        height: task.height,
      });
      return {
        png,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: task.width,
        height: task.height,
      };
    },
  };
}
