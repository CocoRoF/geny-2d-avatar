/**
 * /api/texture/generate/slots - 슬롯별 AI 생성 + atlas 패킹.
 *
 * 요청 body (JSON):
 *   {
 *     preset_id:      "tpl.base.v1.halfbody",
 *     preset_version: "1.3.0",
 *     prompt:         "pastel anime girl",
 *     seed?:          42,
 *     slot_overrides?: { hair_front: "long bangs", ... },
 *     palette_hint?:  { primary: "#A0C8FF", hair: "#F7D58A" },
 *     slots?:         ["hair_front", "face_base"]  // 주어지면 그 슬롯만, 아니면 atlas 전체.
 *   }
 *
 * 동작:
 *   1) preset atlas 조회 → atlas width/height + slots[] + textures[0]
 *   2) planSlotGenerations → 각 slot 에 prompt/seed
 *   3) 각 slot 을 runTextureGenerate 병렬 실행. 슬롯 이미지 크기 = slot UV 영역 * atlas size,
 *      단 최소 64, 최대 1024 로 캡.
 *   4) 빈 atlas PNG 에서 시작 → 각 slot 결과를 sharp composite 로 UV 영역에 합성
 *   5) 최종 PNG 저장 → texture_id + manifest (mode=ai_generate/slots)
 *   6) 응답: { texture_id, sha256, slot_results: [{ slot_id, adapter, attempts, success }] }
 */

import type { FastifyPluginAsync } from "fastify";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { writeTextureManifest } from "../lib/texture-manifest.js";
import {
  runTextureGenerate,
  type TextureAdapterRegistry,
  type AdapterAttempt,
} from "../lib/texture-adapter.js";
import { planSlotGenerations, type PaletteHint } from "../lib/slot-prompts.js";
import { applySlotFeather } from "../lib/slot-feather.js";

const DEFAULT_FEATHER_PX = 4;

export interface SlotsRouteOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir: string;
  readonly adapters: TextureAdapterRegistry;
}

interface AtlasSlot {
  readonly slot_id: string;
  readonly texture_path?: string;
  readonly uv: readonly [number, number, number, number];
}

interface AtlasShape {
  readonly textures: readonly { readonly width: number; readonly height: number }[];
  readonly slots: readonly AtlasSlot[];
}

interface SlotResultRecord {
  readonly slot_id: string;
  readonly adapter?: string;
  readonly attempts: ReadonlyArray<AdapterAttempt>;
  readonly success: boolean;
  readonly error?: string;
  readonly error_code?: string;
  readonly bytes?: number;
}

async function readAtlas(rigTemplatesRoot: string, id: string, version: string) {
  const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
  if (!m || !m[1] || !m[2]) return null;
  const atlasPath = join(rigTemplatesRoot, m[1], m[2], "v" + version, "textures", "atlas.json");
  if (!existsSync(atlasPath)) return null;
  try {
    return JSON.parse(await readFile(atlasPath, "utf8")) as AtlasShape;
  } catch {
    return null;
  }
}

export const textureGenerateSlotsRoute: FastifyPluginAsync<SlotsRouteOptions> = async (
  fastify,
  opts,
) => {
  const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
  const texturesDir = resolve(opts.texturesDir);
  const registry = opts.adapters;
  await mkdir(texturesDir, { recursive: true });

  fastify.post("/api/texture/generate/slots", async (request, reply) => {
    const body = request.body as
      | {
          preset_id?: string;
          preset_version?: string;
          prompt?: string;
          seed?: number;
          slot_overrides?: Record<string, string>;
          palette_hint?: PaletteHint;
          slots?: string[];
          feather_px?: number;
        }
      | undefined;

    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        error: { code: "INVALID_BODY", message: "application/json body 필요" },
      });
    }
    const { preset_id, preset_version, prompt } = body;
    if (!preset_id || !preset_version || typeof prompt !== "string" || prompt.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "MISSING_FIELDS",
          message: "preset_id, preset_version, prompt 필요.",
        },
      });
    }
    const seed = Number.isFinite(body.seed) ? (body.seed as number) : 0;
    const featherPx = Number.isFinite(body.feather_px)
      ? Math.max(0, Math.min(32, Math.round(body.feather_px as number)))
      : DEFAULT_FEATHER_PX;

    const atlas = await readAtlas(rigTemplatesRoot, preset_id, preset_version);
    if (!atlas) {
      return reply.code(404).send({
        error: {
          code: "PRESET_NOT_FOUND",
          message: preset_id + "@" + preset_version + " 또는 atlas.json 없음.",
        },
      });
    }
    if (atlas.slots.length === 0) {
      return reply.code(422).send({
        error: {
          code: "ATLAS_SLOTS_EMPTY",
          message:
            "atlas.slots[] 가 비어있어 슬롯별 생성 불가. 3rd-party wrapper preset (예: mao_pro) 은 drawable 추출 (Phase 3 scripts/rig-template/extract-atlas) 후 지원.",
        },
      });
    }
    const atlasTex = atlas.textures[0];
    if (!atlasTex) {
      return reply.code(500).send({
        error: { code: "ATLAS_EMPTY", message: "atlas.textures[] 비어있음." },
      });
    }

    // 대상 슬롯 필터링. body.slots 주어지면 그 집합만, 아니면 전체.
    const allSlots = atlas.slots;
    const wantedIds = new Set(body.slots ?? allSlots.map((s) => s.slot_id));
    const targetSlots = allSlots.filter((s) => wantedIds.has(s.slot_id));
    if (targetSlots.length === 0) {
      return reply.code(400).send({
        error: {
          code: "NO_MATCHING_SLOTS",
          message: "지정된 slots[] 와 매칭되는 atlas slot 없음.",
        },
      });
    }

    // atlas 전체 크기: 최대 2048 cap + 최소 256 floor. 4x4 같은 placeholder atlas
    // 에서도 30 slot 이 각자 최소 1px 이상을 차지할 수 있도록 floor 적용.
    const atlasWidth = Math.max(256, Math.min(atlasTex.width, 2048));
    const atlasHeight = Math.max(256, Math.min(atlasTex.height, 2048));

    // 슬롯별 plan.
    const plan = planSlotGenerations({
      global_prompt: prompt.trim(),
      seed,
      slots: targetSlots.map((s) => ({ slot_id: s.slot_id })),
      ...(body.slot_overrides !== undefined ? { slot_overrides: body.slot_overrides } : {}),
      ...(body.palette_hint !== undefined ? { palette_hint: body.palette_hint } : {}),
    });

    // 각 슬롯 병렬 생성.
    const slotMap = new Map(targetSlots.map((s) => [s.slot_id, s]));
    const generations = await Promise.all(
      plan.map(async (p) => {
        const slot = slotMap.get(p.slot_id)!;
        const [u0, v0, u1, v1] = slot.uv;
        const slotW = Math.max(64, Math.min(1024, Math.round((u1 - u0) * atlasWidth)));
        const slotH = Math.max(64, Math.min(1024, Math.round((v1 - v0) * atlasHeight)));
        try {
          const run = await runTextureGenerate(
            {
              preset: { id: preset_id, version: preset_version },
              prompt: p.prompt,
              seed: p.seed,
              width: slotW,
              height: slotH,
            },
            registry,
          );
          return { slot, plan: p, run, error: null as Error | null };
        } catch (err) {
          return { slot, plan: p, run: null, error: err as Error };
        }
      }),
    );

    // atlas 결과 composite. 빈 투명 RGBA 에서 시작.
    let composite = sharp({
      create: {
        width: atlasWidth,
        height: atlasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png();

    const slotResults: SlotResultRecord[] = [];
    const compositions: sharp.OverlayOptions[] = [];

    for (const g of generations) {
      if (g.error || !g.run) {
        const e = g.error as (Error & { code?: string; attempts?: ReadonlyArray<AdapterAttempt> }) | null;
        const attempts = e?.attempts ?? [];
        // AllAdaptersFailedError 로 감싸지면 e.code 가 없음. 마지막 어댑터 시도의
        // error_code 를 슬롯 level 에러로 승격해 벤더 원인을 보존.
        const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
        slotResults.push({
          slot_id: g.slot.slot_id,
          attempts,
          success: false,
          error: e?.message ?? "unknown",
          error_code: lastAttempt?.error_code ?? e?.code ?? "UNKNOWN",
        });
        continue;
      }
      const [u0, v0, u1, v1] = g.slot.uv;
      const left = Math.round(u0 * atlasWidth);
      const top = Math.round(v0 * atlasHeight);
      const w = Math.round((u1 - u0) * atlasWidth);
      const h = Math.round((v1 - v0) * atlasHeight);
      if (w <= 0 || h <= 0) {
        slotResults.push({
          slot_id: g.slot.slot_id,
          attempts: g.run.attempts,
          success: false,
          error: "slot UV area 0",
          error_code: "INVALID_UV",
        });
        continue;
      }
      // 생성 이미지를 슬롯 크기로 resize (sharp resize) 후 edge feather 적용 → composite.
      const resized = await sharp(g.run.result.png).resize(w, h).png().toBuffer();
      const feathered = await applySlotFeather(resized, {
        width: w,
        height: h,
        featherPx,
      });
      compositions.push({ input: feathered, left, top });
      slotResults.push({
        slot_id: g.slot.slot_id,
        adapter: g.run.adapter,
        attempts: g.run.attempts,
        success: true,
        bytes: g.run.result.png.length,
      });
    }

    // 슬롯이 모두 실패한 경우 composite 건너뛰고 500.
    const successCount = slotResults.filter((r) => r.success).length;
    if (successCount === 0) {
      return reply.code(502).send({
        error: {
          code: "ALL_SLOTS_FAILED",
          message: "모든 슬롯 생성 실패 (" + slotResults.length + " slots).",
          slot_results: slotResults,
        },
      });
    }

    composite = composite.composite(compositions);
    const finalPng = await composite.toBuffer();

    const sha256 = createHash("sha256").update(finalPng).digest("hex");
    const textureId = "tex_" + randomUUID().replace(/-/g, "");
    const outPath = join(texturesDir, textureId + ".png");
    await writeFile(outPath, finalPng);
    await writeTextureManifest({
      texturesDir,
      textureId,
      atlasSha256: sha256,
      width: atlasWidth,
      height: atlasHeight,
      bytes: finalPng.length,
      preset: { id: preset_id, version: preset_version },
      mode: "ai_generate",
      adapter: "slots-composite",
      prompt: prompt.trim(),
      seed,
      notes:
        "P4.2 slot-composite: " + successCount + "/" + slotResults.length + " slots succeeded.",
    });

    return {
      texture_id: textureId,
      sha256,
      width: atlasWidth,
      height: atlasHeight,
      bytes: finalPng.length,
      prompt: prompt.trim(),
      seed,
      preset: { id: preset_id, version: preset_version },
      slot_count: slotResults.length,
      success_count: successCount,
      slot_results: slotResults,
      feather_px: featherPx,
      note:
        "P4.5 슬롯별 생성 + edge feather (" +
        featherPx +
        "px). 실패한 슬롯은 transparent. 자세한 내역은 slot_results[] 참조.",
    };
  });
};
