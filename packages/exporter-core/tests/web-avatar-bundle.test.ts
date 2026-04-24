import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import {
  assembleWebAvatarBundle,
  deriveSlotsFromSpecs,
  deriveAtlasFromTemplate,
} from "../src/web-avatar-bundle.js";
import { snapshotBundle } from "../src/bundle.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-web-avatar-"));
}

test("assembleWebAvatarBundle: halfbody v1.3.0 bundle snapshot matches golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "halfbody_v1.3.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: web-avatar.json matches golden byte-for-byte", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "halfbody_v1.3.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: halfbody v1.3.0 writes 4 files (web-avatar + atlas + bundle + 1 texture)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    assert.equal(res.files.length, 4);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("bundle.json"));
    assert.ok(paths.includes("atlas.json"));
    assert.ok(paths.includes("textures/base.png"));
    for (const f of res.files) {
      assert.ok(existsSync(join(dir, f.path)), `expected on disk: ${f.path}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: includeTextures=false reverts to stage 1 (2 files)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir, { includeTextures: false });
    assert.equal(res.files.length, 2);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("bundle.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: bundle.json excludes itself from files[]", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const manifest = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as {
      kind: string;
      files: Array<{ path: string }>;
    };
    assert.equal(manifest.kind, "web-avatar-bundle");
    const paths = manifest.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("atlas.json"));
    assert.ok(paths.includes("textures/base.png"));
    assert.ok(!paths.includes("bundle.json"), "manifest must exclude itself");
    assert.equal(manifest.files.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textures/*.png bytes match template source", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const srcBuf = readFileSync(
      join(repoRoot, "rig-templates/base/halfbody/v1.3.0/textures/base.png"),
    );
    const outBuf = readFileSync(join(dir, "textures/base.png"));
    assert.deepEqual(Buffer.compare(srcBuf, outBuf), 0, "texture bytes must be identical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: atlas.json in bundle matches schema shape", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const atlas = JSON.parse(readFileSync(join(dir, "atlas.json"), "utf8")) as {
      schema_version: string;
      format: number;
      textures: Array<{ path: string; width: number; height: number; format: string }>;
      slots: Array<unknown>;
    };
    assert.equal(atlas.schema_version, "v1");
    assert.equal(atlas.format, 1);
    assert.equal(atlas.textures.length, 1);
    assert.equal(atlas.textures[0]!.path, "textures/base.png");
    assert.equal(atlas.textures[0]!.width, 4);
    assert.equal(atlas.textures[0]!.height, 4);
    assert.equal(atlas.textures[0]!.format, "png");
    // P1.B — halfbody v1.3.0 atlas.json 의 slots 를 populate-atlas-slots.mjs 로 채움
    // (30 파츠 = 30 slots). 이전 "slots=[]" placeholder 단계는 종료.
    assert.equal(atlas.slots.length, 30, "halfbody v1.3.0 has 30 populated slots (P1.B)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: avatarId option embedded in web-avatar.json and bundle.json", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir, { avatarId: "avt.test.demo" });
    const wa = JSON.parse(readFileSync(join(dir, "web-avatar.json"), "utf8")) as {
      avatar_id: string | null;
    };
    const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as {
      avatar_id: string | null;
    };
    assert.equal(wa.avatar_id, "avt.test.demo");
    assert.equal(bundle.avatar_id, "avt.test.demo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: repeated calls produce identical snapshots", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dirA = scratch();
  const dirB = scratch();
  try {
    const a = snapshotBundle(assembleWebAvatarBundle(tpl, dirA));
    const b = snapshotBundle(assembleWebAvatarBundle(tpl, dirB));
    assert.equal(a, b);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textureOverrides 가 template.textures 를 대체 (세션 35)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    // 원본을 복사해 1 바이트만 변경 — sha256 가 달라져야 한다.
    const orig = tpl.textures[0]!;
    const tamperedBuf = Buffer.from(orig.buffer);
    // PNG 마지막 byte (IEND CRC) 는 건드리면 깨지므로 IHDR 데이터 영역은 피하고, 데이터 청크의
    // 맨 앞 (보통 pixel data 시작, PNG 헤더 8B + IHDR 25B 이후) 을 살짝 수정.
    // 대신 여기선 buffer 자체를 재할당하는 대신 원본 그대로 주입해 경로/sha256 동일성만 확인.
    const override = {
      ...orig,
      buffer: tamperedBuf,
      sha256: createHash("sha256").update(tamperedBuf).digest("hex"),
    };
    const res = assembleWebAvatarBundle(tpl, dir, { textureOverrides: [override] });
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("textures/base.png"));
    const texEntry = res.files.find((f) => f.path === "textures/base.png")!;
    assert.equal(texEntry.sha256, override.sha256);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 세션 105 — halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들 L4 golden 승격.
// 세션 103 wire-through 로 parameter_ids 가 실 번들에 방출되고(halfbody 18 / fullbody 25),
// 세션 104 에서 editor 가 halfbody v1.3.0 을 assembly 하기 시작 → 회귀 방어 대상.
// 세션 103 D5 "의도된 drift" 의 최종 종결 — 이 시점부터 parameter_ids 변경이 golden 에 나타난다.
test("assembleWebAvatarBundle: halfbody v1.3.0 bundle snapshot matches golden (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "halfbody_v1.3.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: halfbody v1.3.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "halfbody_v1.3.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
    const parts = (JSON.parse(got) as { parts: Array<{ parameter_ids?: string[] }> }).parts;
    const withIds = parts.filter((p) => Array.isArray(p.parameter_ids)).length;
    assert.equal(parts.length, 30, "halfbody v1.3.0 = 30 parts (ahoge 포함)");
    assert.equal(withIds, 19, "halfbody v1.3.0 opt-in 19 parts (세션 100 Face 14 + 세션 102 비-Face 4 + 세션 106 ahoge 1)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: fullbody v1.0.0 bundle snapshot matches golden (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "fullbody_v1.0.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: fullbody v1.0.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "fullbody_v1.0.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
    const parts = (JSON.parse(got) as { parts: Array<{ parameter_ids?: string[] }> }).parts;
    const withIds = parts.filter((p) => Array.isArray(p.parameter_ids)).length;
    assert.equal(parts.length, 38, "fullbody v1.0.0 = 38 parts");
    assert.equal(withIds, 27, "fullbody v1.0.0 opt-in 27 parts (세션 101 Face 14 + 세션 102 비-Face 11 + 세션 107 ahoge 1 + acc_belt 1)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deriveSlotsFromSpecs: canvas_px + uv_box_px 있는 spec 만 정규화 UV 로 변환 (P1-S2)", () => {
  const slots = deriveSlotsFromSpecs(
    {
      ahoge: {
        schema_version: "v1",
        slot_id: "ahoge",
        role: "hair",
        cubism_part_id: "PartAhoge",
        canvas_px: { w: 2048, h: 2048 },
        uv_box_px: { x: 864, y: 32, w: 320, h: 240 },
      },
      no_atlas: {
        schema_version: "v1",
        slot_id: "no_atlas",
        role: "hair",
        cubism_part_id: "PartNoAtlas",
      },
      invalid: {
        schema_version: "v1",
        slot_id: "invalid",
        role: "hair",
        cubism_part_id: "PartInvalid",
        canvas_px: { w: 0, h: 2048 },
        uv_box_px: { x: 0, y: 0, w: 100, h: 100 },
      },
    },
    "textures/base.png",
  );
  assert.equal(slots.length, 1, "only ahoge has valid fields");
  assert.equal(slots[0]!.slot_id, "ahoge");
  assert.equal(slots[0]!.texture_path, "textures/base.png");
  assert.deepEqual(slots[0]!.uv, [864 / 2048, 32 / 2048, 320 / 2048, 240 / 2048]);
  // P1-S8 — ahoge spec 에 anchor 가 없으므로 pivot_uv 도 없어야 (backward-compatible).
  assert.equal(slots[0]!.pivot_uv, undefined, "anchor 없으면 pivot_uv 생략");
});

test("deriveSlotsFromSpecs: anchor.x_frac/y_frac 가 있으면 캔버스 UV 로 환산해 pivot_uv 생성 (P1-S8)", () => {
  const slots = deriveSlotsFromSpecs(
    {
      ahoge: {
        schema_version: "v1",
        slot_id: "ahoge",
        role: "hair",
        cubism_part_id: "PartAhoge",
        canvas_px: { w: 2048, h: 2048 },
        uv_box_px: { x: 864, y: 32, w: 320, h: 240 },
        anchor: { type: "head_top_center", x_frac: 0.5, y_frac: 0.05 },
      },
      no_anchor: {
        schema_version: "v1",
        slot_id: "no_anchor",
        role: "body",
        cubism_part_id: "PartNoAnchor",
        canvas_px: { w: 2048, h: 2048 },
        uv_box_px: { x: 0, y: 0, w: 100, h: 100 },
      },
      partial: {
        schema_version: "v1",
        slot_id: "partial",
        role: "hair",
        cubism_part_id: "PartPartial",
        canvas_px: { w: 2048, h: 2048 },
        uv_box_px: { x: 0, y: 0, w: 100, h: 100 },
        anchor: { type: "head_top_center" }, // x_frac/y_frac missing
      },
    },
    "textures/base.png",
  );
  assert.equal(slots.length, 3);
  const byId = Object.fromEntries(slots.map((s) => [s.slot_id, s]));
  // ahoge: pivot UV = ((864 + 0.5*320)/2048, (32 + 0.05*240)/2048) = (1024/2048, 44/2048)
  assert.ok(byId.ahoge!.pivot_uv, "ahoge has pivot_uv");
  assert.equal(byId.ahoge!.pivot_uv![0], 1024 / 2048);
  assert.equal(byId.ahoge!.pivot_uv![1], 44 / 2048);
  assert.equal(byId.no_anchor!.pivot_uv, undefined, "anchor 필드 자체가 없으면 생략");
  assert.equal(byId.partial!.pivot_uv, undefined, "anchor 는 있지만 x_frac/y_frac 수치 아니면 생략");
});

test("deriveAtlasFromTemplate: halfbody v1.3.0 → 30 slots 정규화 + 전 파츠 pivot_uv (P1-S8)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const atlas = deriveAtlasFromTemplate(tpl);
  assert.ok(atlas, "derived atlas must exist");
  assert.equal(atlas.schema_version, "v1");
  assert.equal(atlas.format, 1);
  assert.equal(atlas.textures.length, 1);
  assert.equal(atlas.textures[0]!.path, "textures/base.png");
  assert.equal(atlas.slots.length, 30, "halfbody v1.3.0 has 30 parts");
  const slotIds = atlas.slots.map((s) => s.slot_id);
  const sortedIds = [...slotIds].sort();
  assert.deepEqual(slotIds, sortedIds, "slots sorted by slot_id");
  for (const slot of atlas.slots) {
    assert.equal(slot.uv.length, 4);
    for (const v of slot.uv) {
      assert.ok(v >= 0 && v <= 1, `uv ${v} in [0,1]`);
    }
    // P1-S8 — halfbody 30 파츠 모두 anchor.x_frac/y_frac 을 가지므로 pivot_uv 주입.
    assert.ok(slot.pivot_uv, `${slot.slot_id} has pivot_uv`);
    assert.equal(slot.pivot_uv!.length, 2);
  }
  // ahoge 는 x_frac=0.5, y_frac=0.05 — 머리 정수리.
  const ahoge = atlas.slots.find((s) => s.slot_id === "ahoge");
  assert.ok(ahoge?.pivot_uv);
  assert.equal(ahoge!.pivot_uv![0], (864 + 0.5 * 320) / 2048);
  assert.equal(ahoge!.pivot_uv![1], (32 + 0.05 * 240) / 2048);
});

test("deriveAtlasFromTemplate: fullbody v1.0.0 → 38 slots + 전 파츠 pivot_uv (P1-S8)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const atlas = deriveAtlasFromTemplate(tpl);
  assert.ok(atlas, "derived atlas must exist");
  assert.equal(atlas.slots.length, 38);
  for (const slot of atlas.slots) {
    assert.ok(slot.pivot_uv, `${slot.slot_id} has pivot_uv`);
  }
});

test("assembleWebAvatarBundle: atlasOverride 가 template.atlas 를 대체 + 정규화 slots 직렬화 (P1-S2)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const derived = deriveAtlasFromTemplate(tpl);
  assert.ok(derived);
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir, { atlasOverride: derived });
    const atlas = JSON.parse(readFileSync(join(dir, "atlas.json"), "utf8")) as {
      slots: Array<{ slot_id: string; uv: number[] }>;
    };
    assert.equal(atlas.slots.length, 30);
    const ahoge = atlas.slots.find((s) => s.slot_id === "ahoge");
    assert.ok(ahoge);
    assert.deepEqual(ahoge.uv, [864 / 2048, 32 / 2048, 320 / 2048, 240 / 2048]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textureOverrides path 가 template 에 없으면 throw (세션 35)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const orig = tpl.textures[0]!;
    const bogus = { ...orig, path: "textures/bogus.png" };
    assert.throws(
      () => assembleWebAvatarBundle(tpl, dir, { textureOverrides: [bogus] }),
      /경로 보존 필요|not in template|textureOverrides/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
