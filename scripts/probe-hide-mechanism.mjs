#!/usr/bin/env node
/**
 * Cubism Core 의 어떤 API 가 실제로 drawable 을 hide 하는지 실 모델에서 검증.
 * 1) multiplyColor alpha=0 (현재 방식)
 * 2) setPartOpacityById 0
 * 3) setDrawableCulling true
 * 4) drawableOpacities[i] = 0 (raw struct)
 *
 * 각 방식 후 시각적 결과 + dynamicFlags 를 캡처.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="setup"]').click());
await page.waitForTimeout(300);
await page.evaluate(() => {
  const cards = document.querySelectorAll(".preset-card");
  for (const c of cards) if (c.textContent.toLowerCase().includes("mao")) { c.click(); break; }
});
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="preview"]').click());
await page.waitForFunction(() => window.__genyDrawables?.length > 0, { timeout: 30000 });
await page.waitForTimeout(2000);

// 각 메서드 시도. PartHoodie 의 모든 drawable (PartHoodie 가 hood 파츠) 을 대상으로.
const probeMethods = await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  if (!m) return { err: "no model" };
  const cm = m.internalModel.coreModel;
  // PartHoodie 인덱스 찾기.
  const drawables = window.__genyDrawables;
  const hoodieDrawables = drawables.filter((d) => d.partId === "PartHoodie");
  const results = { hoodieCount: hoodieDrawables.length, methods: {} };

  // Method 1: multiplyColor alpha=0 with Override flag (이전 방식)
  for (const d of hoodieDrawables.slice(0, 5)) {
    try {
      cm.setOverrideFlagForDrawableMultiplyColors?.(d.index, true);
      cm.setMultiplyColorByRGBA?.(d.index, 1, 1, 1, 0);
    } catch (e) { results.methods.multiplyAlpha_err = String(e); }
  }
  results.methods.multiplyAlpha_Override = "applied to first 5";

  // Method 1b: 동일하지만 OverWRITE flag (write/ride 차이!)
  for (const d of hoodieDrawables.slice(0, 5)) {
    try {
      cm.setOverwriteFlagForDrawableMultiplyColors?.(d.index, true);
      cm.setMultiplyColorByRGBA?.(d.index, 1, 1, 1, 0);
    } catch (e) { results.methods.multiplyAlpha_Overwrite_err = String(e); }
  }
  results.methods.multiplyAlpha_Overwrite = "applied to first 5";

  // Method 1c: setPartOpacityByIndex(partIdx, 0)
  try {
    if (cm.setPartOpacityByIndex) {
      // first 5 hoodie drawables 의 unique parts.
      const partIndices = [...new Set(hoodieDrawables.slice(0, 5).map((d) => d.partIndex))];
      for (const pi of partIndices) cm.setPartOpacityByIndex(pi, 0);
      results.methods.partOpacityByIndex = "applied to parts " + partIndices.join(",");
    } else results.methods.partOpacityByIndex = "missing";
  } catch (e) { results.methods.partOpacityByIndex = "throw: " + String(e); }

  // Method 2: setPartOpacity (Cubism Framework wrapper).
  // 먼저 Hoodie 의 part index 찾기.
  const partIndex = hoodieDrawables[0]?.partIndex;
  let partOpacityResult = null;
  try {
    if (cm.setPartOpacityById) {
      const partId = "PartHoodie";
      cm.setPartOpacityById(partId, 0);
      partOpacityResult = "called";
    } else {
      partOpacityResult = "method missing";
    }
  } catch (e) { partOpacityResult = "throw: " + String(e); }
  results.methods.partOpacity = partOpacityResult;

  // Method 3: setDrawableCulling
  let cullingResult = null;
  try {
    if (cm.setDrawableCulling) {
      for (const d of hoodieDrawables.slice(5, 10)) {
        cm.setDrawableCulling(d.index, true);
      }
      cullingResult = "applied";
    } else cullingResult = "method missing";
  } catch (e) { cullingResult = "throw: " + String(e); }
  results.methods.culling = cullingResult;

  // Method 4: raw drawables.opacities = 0
  let rawOpacityResult = null;
  try {
    const raw = cm.getModel?.();
    if (raw?.drawables?.opacities) {
      for (const d of hoodieDrawables.slice(10, 15)) {
        raw.drawables.opacities[d.index] = 0;
      }
      rawOpacityResult = "applied";
    } else rawOpacityResult = "raw struct missing";
  } catch (e) { rawOpacityResult = "throw: " + String(e); }
  results.methods.rawOpacity = rawOpacityResult;

  // 모든 methods 적용 후 다시 render trigger.
  try { window.pixiApp?.renderer?.render(window.pixiApp.stage); } catch {}

  return results;
});
console.log(JSON.stringify(probeMethods, null, 2));

await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/hide-methods.png", fullPage: false });
await browser.close();
