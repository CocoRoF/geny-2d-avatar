#!/usr/bin/env node
/**
 * Cubism Core wrapper 의 전체 method 목록 + part opacity 시도.
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

const probe = await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  const cm = m.internalModel.coreModel;
  // 깊은 prototype chain 도 모두 listing.
  const allMethods = new Set();
  let p = cm;
  while (p && p !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(p)) {
      const v = cm[name];
      if (typeof v === "function") allMethods.add(name);
    }
    p = Object.getPrototypeOf(p);
  }
  const methods = Array.from(allMethods).sort();
  // opacity / part / drawable 관련 메서드만 grep.
  const relevant = methods.filter((n) =>
    /opacity|part|draw|multiply|alpha|visib|cull|render|color/i.test(n));

  // 실제로 part opacity 적용 시도. 인덱스 기반.
  const drawables = window.__genyDrawables;
  const hoodieDrawables = drawables.filter((d) => d.partId === "PartHoodie");
  const partIndex = hoodieDrawables[0]?.partIndex;
  let partResults = {};
  // setPartOpacity(idx, val) 시도.
  try {
    if (cm.setPartOpacity) {
      cm.setPartOpacity(partIndex, 0);
      partResults.setPartOpacity = "called idx=" + partIndex;
    } else partResults.setPartOpacity = "missing";
  } catch (e) { partResults.setPartOpacity = "throw: " + String(e); }
  // raw struct 의 parts.opacities 직접.
  try {
    const raw = cm.getModel?.();
    if (raw?.parts?.opacities) {
      raw.parts.opacities[partIndex] = 0;
      partResults.rawPartOpacity = "set parts.opacities[" + partIndex + "]=0";
    } else partResults.rawPartOpacity = "no raw parts";
  } catch (e) { partResults.rawPartOpacity = "throw: " + String(e); }

  // 모든 PartHoodie drawable 의 다이나믹 visibility 시도.
  let dynamicVis = null;
  try {
    const raw = cm.getModel?.();
    if (raw?.drawables?.dynamicFlags) {
      const before = raw.drawables.dynamicFlags[hoodieDrawables[0].index];
      // bit 0 = visible (per Cubism 정의)
      raw.drawables.dynamicFlags[hoodieDrawables[0].index] = 0;
      const after = raw.drawables.dynamicFlags[hoodieDrawables[0].index];
      dynamicVis = { before, after };
    }
  } catch (e) { dynamicVis = "throw: " + String(e); }
  partResults.dynamicVis = dynamicVis;

  return {
    methodCount: methods.length,
    relevantMethods: relevant,
    partIndex,
    partId: "PartHoodie",
    partResults,
  };
});
console.log(JSON.stringify(probe, null, 2));

await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/probe-cm-api.png", fullPage: false });
await browser.close();
