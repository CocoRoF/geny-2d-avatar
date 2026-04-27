#!/usr/bin/env node
/**
 * RX.1 ~ RX.5 브라우저 검증 — Playwright 로 builder.html 을 헤드리스 Chromium 에서 로드해
 * 1) Cubism Core CDN 로드 확인
 * 2) mao_pro 프리셋 선택 → 모델 로드
 * 3) extractDrawables 가 drawable list 추출
 * 4) Layer Panel 에 행 + thumbnail 채워짐
 * 5) visibility 토글이 모델 multiplyColor 를 실제로 변경
 * 6) localStorage 영속화 동작
 *
 * 사용:
 *   pnpm exec node scripts/verify-rx-browser.mjs
 *
 * 사전조건: API (포트 3000) + web-preview (4173) 실행 중.
 */

import { chromium } from "playwright";

const API = process.env.GENY_API_URL ?? "http://localhost:3000";
const WEB = process.env.GENY_WEB_URL ?? "http://localhost:4173";

function log(label, msg, extra) {
  const e = extra ? " " + JSON.stringify(extra) : "";
  console.log(`[${label}] ${msg}${e}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 콘솔 로그 캡처.
  const consoleLogs = [];
  page.on("console", (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (err) => {
    consoleLogs.push({ type: "pageerror", text: String(err) });
  });
  // 네트워크 실패 캡처.
  page.on("requestfailed", (req) => {
    consoleLogs.push({ type: "reqfail", text: req.url() + " — " + req.failure()?.errorText });
  });

  const url = `${WEB}/builder.html?api=${encodeURIComponent(API)}`;
  log("nav", url);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

  // Cubism Core CDN 로드 대기.
  await page.waitForFunction(
    () => typeof window.Live2DCubismCore !== "undefined" || window.__coreLoadFailed,
    { timeout: 15000 },
  ).catch(() => null);
  const coreLoaded = await page.evaluate(() => typeof window.Live2DCubismCore !== "undefined");
  const coreFailed = await page.evaluate(() => !!window.__coreLoadFailed);
  log("cubism-core", `loaded=${coreLoaded} failed=${coreFailed}`);
  if (!coreLoaded) {
    console.error("Cubism Core CDN 로드 실패 — 이후 단계는 skip");
    return dump(consoleLogs, browser, 1);
  }

  // GenyPixi 번들 + helper 노출 확인.
  const bundle = await page.evaluate(() => {
    const G = globalThis.GenyPixi;
    if (!G) return { ok: false, reason: "GenyPixi not defined" };
    return {
      ok: true,
      hasPIXI: typeof G.PIXI !== "undefined",
      hasLive2DModel: typeof G.Live2DModel !== "undefined",
      hasExtractDrawables: typeof G.extractDrawables === "function",
      hasSetDrawableVisible: typeof G.setDrawableVisible === "function",
      hasSetDrawableMultiplyRgb: typeof G.setDrawableMultiplyRgb === "function",
      hasUvBbox: typeof G.uvBbox === "function",
    };
  });
  log("bundle", "GenyPixi exposure", bundle);
  if (!bundle.ok || !bundle.hasExtractDrawables) {
    return dump(consoleLogs, browser, 1);
  }

  // preset 카탈로그 로드 대기 — presetSelect 의 option 이 채워질 때까지.
  try {
    await page.waitForFunction(
      () => {
        const sel = document.getElementById("preset-select");
        return sel && sel.options.length > 1;
      },
      { timeout: 15000 },
    );
  } catch (e) {
    const snap = await page.evaluate(() => {
      const sel = document.getElementById("preset-select");
      return {
        exists: !!sel,
        options: sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: o.text })) : [],
        bootLog: typeof window.log !== "undefined" ? "log helper present" : "no log helper",
      };
    });
    console.error("⚠️ preset 카탈로그 로드 timeout. 현재 옵션:", snap);
    return dump(consoleLogs, browser, 1);
  }
  const presets = await page.evaluate(() => {
    const sel = document.getElementById("preset-select");
    return Array.from(sel.options).map((o) => o.value).filter(Boolean);
  });
  log("presets", `count=${presets.length}`, presets);

  // mao_pro 선택.
  const maoOption = presets.find((v) => v.includes("mao_pro"));
  if (!maoOption) {
    console.error("mao_pro 프리셋 미존재 — /api/presets 응답 확인 필요");
    return dump(consoleLogs, browser, 1);
  }
  log("select", "mao_pro 선택", { value: maoOption });
  await page.evaluate((value) => {
    const sel = document.getElementById("preset-select");
    sel.value = value;
    sel.dispatchEvent(new Event("change"));
  }, maoOption);

  // Live2D 모델 로드 대기 — currentModel 이 set 될 때까지. 진행 상황 polling.
  for (let i = 0; i < 30; i++) {
    const snap = await page.evaluate(() => ({
      drawables: typeof window.__genyDrawables,
      model: typeof window.__genyCurrentModel,
      panelDisplay: document.getElementById("live-preview-panel")?.style.display,
      previewStatus: document.getElementById("preview-status")?.textContent?.slice(0, 200),
    }));
    log("poll", `t=${i}s`, snap);
    if (snap.drawables === "object") break;
    await page.waitForTimeout(1000);
  }
  const ready = await page.evaluate(() => typeof window.__genyDrawables);
  if (ready !== "object") {
    console.error("⚠️ window.__genyDrawables 미설정 — 모델 로드 실패");
    return dump(consoleLogs, browser, 1);
  }
  const drawables = await page.evaluate(() => {
    const arr = window.__genyDrawables ?? [];
    return {
      count: arr.length,
      first10: arr.slice(0, 10).map((d) => ({
        idx: d.index,
        id: d.id,
        partId: d.partId,
        renderOrder: d.renderOrder,
        blend: d.blendMode,
        bbox: `${d.uvBbox.x},${d.uvBbox.y} ${d.uvBbox.w}x${d.uvBbox.h}`,
        textureIndex: d.textureIndex,
      })),
      uniqueParts: new Set(arr.map((d) => d.partId).filter(Boolean)).size,
    };
  });
  log("rx1", `drawables.count=${drawables.count} parts=${drawables.uniqueParts}`);
  for (const d of drawables.first10) log("  drawable", JSON.stringify(d));

  if (drawables.count === 0) {
    console.error("⚠️  drawable 0 개 — extractDrawables 가 실 모델에서 실패. RX.1 검증 실패.");
    // coreModel 의 실제 API surface 진단.
    const probe = await page.evaluate(() => {
      const m = window.__genyCurrentModel;
      if (!m?.internalModel) return { ok: false };
      const im = m.internalModel;
      const cm = im.coreModel;
      const cmKeys = cm ? Object.keys(cm) : [];
      const cmProto = cm ? Object.getPrototypeOf(cm) : null;
      const cmProtoKeys = cmProto ? Object.getOwnPropertyNames(cmProto) : [];
      // raw struct 시도.
      let rawDrawables = null;
      try {
        const raw = typeof cm?.getModel === "function" ? cm.getModel() : null;
        if (raw?.drawables) {
          rawDrawables = {
            count: raw.drawables.count,
            firstId: raw.drawables.ids?.[0],
            idsType: typeof raw.drawables.ids,
            keys: Object.keys(raw.drawables),
          };
        }
      } catch (e) { rawDrawables = "throw: " + String(e); }
      return {
        ok: true,
        internalKeys: Object.keys(im).slice(0, 30),
        coreModelKeys: cmKeys.slice(0, 30),
        coreModelProtoKeys: cmProtoKeys.slice(0, 50),
        hasGetDrawableCount: typeof cm?.getDrawableCount === "function",
        hasGetModel: typeof cm?.getModel === "function",
        rawDrawables,
        textureFlipY: im.textureFlipY,
        textures: Array.isArray(im.textures) ? im.textures.length : "not-array",
      };
    });
    log("probe", "coreModel API surface", probe);
    // 더 깊이 — wrapper 메서드들의 실제 반환값 확인.
    const live = await page.evaluate(() => {
      const cm = window.__genyCurrentModel?.internalModel?.coreModel;
      if (!cm) return { err: "no cm" };
      const out = {};
      try { out.getDrawableCount = cm.getDrawableCount?.(); } catch (e) { out.getDrawableCount_err = String(e); }
      try { out.getDrawableId_0 = cm.getDrawableId?.(0); } catch (e) { out.getDrawableId_err = String(e); }
      try {
        const v = cm.getDrawableVertexUvs?.(0);
        out.getDrawableVertexUvs_0_len = v?.length;
        out.getDrawableVertexUvs_0_sample = v ? Array.from(v.slice(0, 6)) : null;
      } catch (e) { out.getDrawableVertexUvs_err = String(e); }
      try { out.getDrawableTextureIndex_0 = cm.getDrawableTextureIndex?.(0); } catch (e) { out.getDrawableTextureIndex_err = String(e); }
      try { out.getDrawableParentPartIndex_0 = cm.getDrawableParentPartIndex?.(0); } catch (e) { out.getDrawableParentPartIndex_err = String(e); }
      try { out.getDrawableRenderOrder_0 = cm.getDrawableRenderOrder?.(0); } catch (e) {}
      try { out.getDrawableBlendMode_0 = cm.getDrawableBlendMode?.(0); } catch (e) {}
      try { out.getDrawableOpacity_0 = cm.getDrawableOpacity?.(0); } catch (e) {}
      try { out.getPartCount = cm.getPartCount?.(); } catch (e) {}
      try { out.getPartId_0 = cm.getPartId?.(0); } catch (e) {}
      // raw struct 에서 직접:
      const raw = cm.getModel?.();
      if (raw?.drawables) {
        out.raw_count = raw.drawables.count;
        out.raw_first5_ids = Array.from(raw.drawables.ids).slice(0, 5);
        out.raw_first_uvs_len = raw.drawables.vertexUvs?.[0]?.length;
        out.raw_first_uvs_sample = raw.drawables.vertexUvs?.[0]
          ? Array.from(raw.drawables.vertexUvs[0].slice(0, 6))
          : null;
      }
      return out;
    });
    log("probe-live", "wrapper 메서드 반환값", live);
    // extractDrawables 를 실 모델에 직접 호출해 어디서 0 되는지 확인.
    const directCall = await page.evaluate(() => {
      const m = window.__genyCurrentModel;
      const G = window.GenyPixi;
      if (!m || !G?.extractDrawables) return { err: "no model or helper" };
      const result = G.extractDrawables(m, { atlasSize: { w: 4096, h: 4096 } });
      return {
        length: result.length,
        first3: result.slice(0, 3),
      };
    });
    log("probe-direct", "extractDrawables 직접 호출", directCall);
    return dump(consoleLogs, browser, 1);
  }

  // Layer Panel UI 활성 확인.
  const layerPanel = await page.evaluate(() => {
    const list = document.getElementById("layer-list");
    const rows = list?.querySelectorAll("[data-idx]") ?? [];
    const countEl = document.getElementById("layer-count");
    return {
      rowCount: rows.length,
      countText: countEl?.textContent,
      searchEnabled: !document.getElementById("layer-search").disabled,
      firstRowId: rows[0]?.querySelector(".name")?.textContent ?? null,
    };
  });
  log("rx2", "Layer Panel state", layerPanel);
  if (layerPanel.rowCount === 0) {
    console.error("⚠️  Layer Panel 행 0 — RX.2 렌더 실패");
    return dump(consoleLogs, browser, 1);
  }

  // visibility 토글 검증 — 첫 row 의 eye 클릭 후 multiplyColor[3]=0 확인.
  const visToggleResult = await page.evaluate(() => {
    const list = document.getElementById("layer-list");
    const firstRow = list.querySelector("[data-idx]");
    const eye = firstRow.querySelector(".visibility");
    eye.click();
    // RX.1 helper 가 실제로 multiplyColor 를 set 했는지 확인.
    const idx = Number(firstRow.dataset.idx);
    const drawableIndex = window.__genyDrawables[idx].index;
    const cm = window.__genyCurrentModel?.internalModel?.coreModel;
    if (!cm?.getDrawableMultiplyColor) return { tested: false, reason: "getDrawableMultiplyColor 미지원" };
    const mc = cm.getDrawableMultiplyColor(drawableIndex);
    return {
      tested: true,
      drawableIndex,
      multiplyColor: { R: mc.R, G: mc.G, B: mc.B, A: mc.A },
      isHidden: mc.A === 0,
      hasHiddenClass: firstRow.classList.contains("hidden"),
    };
  });
  log("rx2-toggle", "visibility 클릭 후 multiplyColor", visToggleResult);

  // RGB shift 검증.
  const rgbResult = await page.evaluate(() => {
    // 첫 5개 drawable 선택.
    const list = document.getElementById("layer-list");
    const rows = Array.from(list.querySelectorAll("[data-idx]")).slice(0, 5);
    for (const r of rows) {
      const cb = r.querySelector('input[type="checkbox"]');
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    }
    // R 슬라이더를 50% 로.
    const r = document.getElementById("rgb-r");
    r.value = "50";
    r.dispatchEvent(new Event("input"));
    // Apply.
    document.getElementById("rgb-apply").click();
    // 첫 drawable 의 R 값 확인.
    const firstIdx = window.__genyDrawables[0].index;
    const cm = window.__genyCurrentModel?.internalModel?.coreModel;
    if (!cm?.getDrawableMultiplyColor) return { tested: false };
    const mc = cm.getDrawableMultiplyColor(firstIdx);
    return { tested: true, R: mc.R, G: mc.G, B: mc.B, A: mc.A };
  });
  log("rx3-rgb", "RGB Apply 후", rgbResult);

  // localStorage 영속화 확인.
  const persistResult = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("geny:layer-state:"));
    return {
      keyCount: keys.length,
      keys,
      first: keys[0] ? JSON.parse(localStorage.getItem(keys[0])) : null,
    };
  });
  log("rx5-persist", "localStorage", persistResult);

  return dump(consoleLogs, browser, 0);
}

async function dump(consoleLogs, browser, exitCode) {
  // console.log 중 RX/layer/drawables 관련만 추림.
  const relevant = consoleLogs.filter((l) =>
    /RX\.|layer|drawable|geny|Cubism|inpaint|live2d/i.test(l.text) ||
    l.type === "error" || l.type === "pageerror",
  );
  console.log("\n===== relevant console (last 30) =====");
  for (const l of relevant.slice(-30)) {
    console.log(`[${l.type}] ${l.text.slice(0, 300)}`);
  }
  await browser.close();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("verify failed:", err);
  process.exit(1);
});
