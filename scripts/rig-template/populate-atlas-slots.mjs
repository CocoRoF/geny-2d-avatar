#!/usr/bin/env node
/**
 * scripts/rig-template/populate-atlas-slots.mjs
 *
 * 프리셋의 `parts/*.spec.json` 의 `uv_box_px` 값을 참조하여
 * `textures/atlas.json` 의 `slots[]` 를 채워 넣는다.
 *
 * 동작:
 *   1) template.manifest.json 의 canvas.{width,height} 를 기준 픽셀 프레임으로 사용.
 *   2) parts/*.spec.json 순회 → 각 spec 의 `slot_id` + `uv_box_px` 를 정규화 UV 로 변환.
 *   3) atlas.json 의 textures[0] 를 참조 텍스처로 고정 (spec 당 single-texture 가정).
 *   4) slot_id 알파벳 정렬 후 atlas.json.slots 에 기록.
 *
 * **주의**: derived preset (halfbody/fullbody) 용 — uv_box_px 가 design-time placeholder.
 *           3rd-party preset (mao_pro) 은 .moc3 drawable-level 추출 필요 (별도 스크립트).
 *
 * 사용:
 *   node scripts/rig-template/populate-atlas-slots.mjs \
 *     --template rig-templates/base/halfbody/v1.3.0
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const templateDir = arg("template");
if (!templateDir) {
  console.error("Usage: populate-atlas-slots.mjs --template <rig-template-dir>");
  process.exit(2);
}

const TPL = resolve(templateDir);
const manifest = JSON.parse(await readFile(join(TPL, "template.manifest.json"), "utf8"));
const canvasW = manifest.canvas.width;
const canvasH = manifest.canvas.height;
const atlasPath = join(TPL, "textures", "atlas.json");
const atlas = JSON.parse(await readFile(atlasPath, "utf8"));

if (atlas.textures.length === 0) {
  console.error("[populate-atlas] textures[] 비어있음 — 먼저 texture 파일 등록 필요");
  process.exit(1);
}
const texturePath = atlas.textures[0].path;

// parts/*.spec.json 전수
const partsDir = join(TPL, "parts");
if (!existsSync(partsDir)) {
  console.error("[populate-atlas] parts/ 디렉토리 없음");
  process.exit(1);
}

const slots = [];
const files = (await readdir(partsDir)).filter((f) => f.endsWith(".spec.json")).sort();
for (const f of files) {
  const spec = JSON.parse(await readFile(join(partsDir, f), "utf8"));
  const { slot_id, uv_box_px } = spec;
  if (!slot_id || !uv_box_px) continue;
  const { x, y, w, h } = uv_box_px;
  // 정규화 UV [u0, v0, u1, v1] — (0,0)=좌상, (1,1)=우하.
  const u0 = x / canvasW;
  const v0 = y / canvasH;
  const u1 = (x + w) / canvasW;
  const v1 = (y + h) / canvasH;
  // 수치 0..1 clamp (범위 밖 방지).
  const clamp = (v) => Math.max(0, Math.min(1, v));
  slots.push({
    slot_id,
    texture_path: texturePath,
    uv: [clamp(u0), clamp(v0), clamp(u1), clamp(v1)],
  });
}

// slot_id 알파벳 정렬
slots.sort((a, b) => (a.slot_id < b.slot_id ? -1 : a.slot_id > b.slot_id ? 1 : 0));

atlas.slots = slots;
await writeFile(atlasPath, JSON.stringify(atlas, null, 2) + "\n");

console.log(`[populate-atlas] ✅ ${slots.length} slots written → ${atlasPath}`);
console.log(`   canvas: ${canvasW}×${canvasH}, texture: ${texturePath}`);
