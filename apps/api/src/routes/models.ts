/**
 * GET /api/models — 사용 가능한 어댑터 / 모델 / 활성 상태를 한 번에 반환.
 *
 * builder.html 의 모델 선택 UI 가 페이지 로드 시 호출해 dropdown 채움.
 *
 * 응답 형식:
 *   {
 *     adapters: [
 *       {
 *         vendor: "nano-banana",
 *         label: "Google Gemini (Nano Banana)",
 *         activeModel: "gemini-3.1-flash-image-preview",
 *         active: true,
 *         requiresKey: "GEMINI_API_KEY",
 *         supportsImageToImage: true,
 *         availableModels: [
 *           { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2 (default)", recommended: true },
 *           { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro (premium)", premium: true },
 *           { id: "gemini-2.5-flash-image", label: "Nano Banana 2.5 (legacy, aspect-ratio bug)", deprecated: true },
 *         ],
 *       },
 *       ...
 *     ]
 *   }
 *
 * "active" 는 어댑터가 동작 가능한지 (키 있음 + DISABLED env 아님). UI 가 disabled state 표시할 때 사용.
 */

import type { FastifyPluginAsync } from "fastify";
import type { TextureAdapterRegistry } from "../lib/texture-adapter.js";

export interface ModelsRouteOptions {
  readonly adapters: TextureAdapterRegistry;
}

interface ModelEntry {
  readonly id: string;
  readonly label: string;
  readonly recommended?: boolean;
  readonly premium?: boolean;
  readonly deprecated?: boolean;
  readonly note?: string;
}

interface AdapterMeta {
  readonly vendor: string;
  readonly label: string;
  readonly activeModel: string;
  readonly active: boolean;
  readonly inactiveReason?: string;
  readonly requiresKey?: string;
  readonly supportsImageToImage: boolean;
  readonly availableModels: ReadonlyArray<ModelEntry>;
}

function nanoBananaMeta(): Pick<AdapterMeta, "label" | "requiresKey" | "supportsImageToImage" | "availableModels"> {
  return {
    label: "Google Gemini (Nano Banana)",
    requiresKey: "GEMINI_API_KEY",
    supportsImageToImage: true,
    availableModels: [
      {
        id: "gemini-3.1-flash-image-preview",
        label: "Nano Banana 2 (default, atlas-friendly)",
        recommended: true,
      },
      {
        id: "gemini-3-pro-image-preview",
        label: "Nano Banana Pro (highest quality, slower & expensive)",
        premium: true,
      },
      {
        id: "gemini-2.5-flash-image",
        label: "Nano Banana 2.5 (legacy, aspect-ratio bug)",
        deprecated: true,
        note: "1:1 collapse bug — 권장 안 함",
      },
    ],
  };
}

function openaiImageMeta(): Pick<AdapterMeta, "label" | "requiresKey" | "supportsImageToImage" | "availableModels"> {
  return {
    label: "OpenAI Images (org verification 필요)",
    requiresKey: "OPENAI_API_KEY",
    supportsImageToImage: true,
    availableModels: [
      {
        id: "gpt-image-1.5",
        label: "GPT Image 1.5 (default, transparent + input_fidelity)",
        recommended: true,
      },
      {
        id: "gpt-image-2",
        label: "GPT Image 2 (SOTA — transparent 미지원, atlas 부적합)",
        premium: true,
        note: "background:transparent 미지원이라 atlas 텍스처에는 1.5 권장",
      },
      {
        id: "gpt-image-1-mini",
        label: "GPT Image 1 Mini (cheap/fast preview)",
      },
      {
        id: "gpt-image-1",
        label: "GPT Image 1 (deprecated label)",
        deprecated: true,
      },
    ],
  };
}

function pollinationsMeta(): Pick<AdapterMeta, "label" | "supportsImageToImage" | "availableModels"> {
  return {
    label: "Pollinations.ai (공개 HTTP, 키 불필요)",
    supportsImageToImage: false,
    availableModels: [
      { id: "flux", label: "Flux (default)", recommended: true },
    ],
  };
}

function recolorMeta(): Pick<AdapterMeta, "label" | "supportsImageToImage" | "availableModels"> {
  return {
    label: "Local Recolor (sharp hue shift, 색만 변경, atlas 100% 보존)",
    supportsImageToImage: true,
    availableModels: [
      { id: "local-hue", label: "Local Hue Shift (deterministic)", recommended: true },
    ],
  };
}

function mockMeta(): Pick<AdapterMeta, "label" | "supportsImageToImage" | "availableModels"> {
  return {
    label: "Mock (결정론 placeholder)",
    supportsImageToImage: false,
    availableModels: [{ id: "mock", label: "Mock (deterministic)" }],
  };
}

export const modelsRoute: FastifyPluginAsync<ModelsRouteOptions> = async (fastify, opts) => {
  fastify.get("/api/models", async () => {
    const registered = opts.adapters.list();

    const result: AdapterMeta[] = [];
    // 어댑터별 vendor 식별 (name 의 prefix). 활성 상태 = 등록되어 있고 supports() 가 trivial task 에 true 일 가능성 (key 검증).
    for (const adapter of registered) {
      const name = adapter.name;
      // vendor 와 currentModel 파싱: "<vendor>@<model>".
      const at = name.indexOf("@");
      const vendor = at > 0 ? name.slice(0, at) : name;
      const activeModel = at > 0 ? name.slice(at + 1) : name;

      // 가짜 task 로 supports() 호출 — key/enabled 가 빠졌으면 false. 단 referenceImage 같은
      // task-specific 조건은 여기선 평가 못 하므로 "최소" 의미의 활성.
      const probeTask = {
        preset: { id: "tpl.base.v1.mao_pro", version: "1.0.0" } as const,
        prompt: "probe",
        seed: 0,
        width: 256,
        height: 256,
        // referenceImage 없음. recolor 어댑터는 여기서 false 반환 (referenceImage 필요) 하지만
        // UI 입장에서는 "활성"으로 표시 (실 호출 시점에 ref 가 있으면 동작).
      };
      const baseActive = adapter.supports(probeTask);

      let meta:
        | Pick<AdapterMeta, "label" | "requiresKey" | "supportsImageToImage" | "availableModels">
        | null = null;
      let inactiveReason: string | undefined;
      switch (vendor) {
        case "nano-banana":
          meta = nanoBananaMeta();
          if (!baseActive) inactiveReason = "GEMINI_API_KEY 없음 또는 GENY_NANO_BANANA_DISABLED";
          break;
        case "openai-image":
          meta = openaiImageMeta();
          if (!baseActive) inactiveReason = "OPENAI_API_KEY 없음 또는 GENY_OPENAI_IMAGE_DISABLED";
          break;
        case "pollinations":
          meta = pollinationsMeta();
          if (!baseActive) inactiveReason = "GENY_POLLINATIONS_DISABLED";
          break;
        case "recolor":
          meta = recolorMeta();
          // recolor 는 referenceImage + 색 키워드 필요해서 probe 에서 false 반환. UI 에서는 "활성" 으로 표시.
          break;
        case "mock":
          meta = mockMeta();
          break;
        default:
          meta = {
            label: vendor,
            supportsImageToImage: false,
            availableModels: [{ id: activeModel, label: activeModel }],
          };
      }

      const adapterMeta: AdapterMeta = {
        vendor,
        label: meta?.label ?? vendor,
        activeModel,
        // recolor 와 mock 은 referenceImage / 색 키워드 등 task-dependent 라 baseActive 와 무관하게 활성 표시.
        active:
          vendor === "recolor" || vendor === "mock" || vendor === "pollinations"
            ? true
            : baseActive,
        ...(inactiveReason ? { inactiveReason } : {}),
        ...(meta?.requiresKey ? { requiresKey: meta.requiresKey } : {}),
        supportsImageToImage: meta?.supportsImageToImage ?? false,
        availableModels: meta?.availableModels ?? [],
      };
      result.push(adapterMeta);
    }
    return { adapters: result };
  });
};
