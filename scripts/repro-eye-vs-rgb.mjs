#!/usr/bin/env node
/**
 * Eye click 와 RGB Apply A=0 비교 — 같은 setMultiplyColorByRGBA 호출인데 결과가 다른지.
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

// Test 1: eye click on first 5 drawables.
console.log("[test 1] eye click on first 5");
for (let i = 0; i < 5; i++) {
  await page.evaluate((idx) => {
    const row = document.querySelectorAll("#layer-list [data-idx]")[idx];
    row.querySelector(".visibility").click();
  }, i);
  await page.waitForTimeout(50);
}
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/eye-hide.png", fullPage: false });

// Reset by clicking Show all.
await page.evaluate(() => document.getElementById("layer-show-all").click());
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/show-all.png", fullPage: false });

// Test 2: select first 5 + RGB Apply A=0 OR R=0 (test which works).
console.log("[test 2] RGB Apply with R=0 on first 5 (test if RGB works at all)");
await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll("#layer-list [data-idx]")).slice(0, 5);
  for (const row of rows) {
    const cb = row.querySelector('input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  // R 0% (black-out red) — alpha 100%.
  const r = document.getElementById("rgb-r"); r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() => document.getElementById("rgb-apply").click());
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/rgb-apply-r0.png", fullPage: false });

// Test 3: now A=0
console.log("[test 3] RGB Apply with A=0 on first 5");
await page.evaluate(() => {
  // Reset R to 100, set A to 0.
  const r = document.getElementById("rgb-r"); r.value = "100"; r.dispatchEvent(new Event("input", { bubbles: true }));
  const a = document.getElementById("rgb-a"); a.value = "0"; a.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.evaluate(() => document.getElementById("rgb-apply").click());
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/rgb-apply-a0.png", fullPage: false });

// Test 4: setPartOpacityByIndex per frame in JS — direct opaque approach.
console.log("[test 4] direct setPartOpacity 매 frame");
await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  const cm = m.internalModel.coreModel;
  const drawables = window.__genyDrawables;
  // PartHoodie 의 partIndex 찾기.
  const hoodie = drawables.find((d) => d.partId === "PartHoodie");
  const partIdx = hoodie?.partIndex;
  if (partIdx === undefined) return;
  // ticker 로 매 frame setPartOpacityByIndex 강제.
  const app = window.pixiApp;
  app.ticker.add(() => {
    try { cm.setPartOpacityByIndex(partIdx, 0); } catch {}
    try {
      const raw = cm.getModel?.();
      if (raw?.parts?.opacities) raw.parts.opacities[partIdx] = 0;
    } catch {}
  }, null, -100);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/rgb-apply-partopacity.png", fullPage: false });

const tickerCount = await page.evaluate(() => ({
  reapplyCount: window.__reapplyCount,
}));
console.log("[ticker]", tickerCount);

await browser.close();
