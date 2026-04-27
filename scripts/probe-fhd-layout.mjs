#!/usr/bin/env node
/**
 * FHD (1920×1080) 에서 페이지 전체가 viewport 안에 fit 하는지 측정.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });
await page.evaluate(() => {
  const sel = document.getElementById("preset-select");
  const opt = Array.from(sel.options).find((o) => o.value.includes("mao_pro"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
});
await page.waitForFunction(() => window.__genyDrawables?.length > 0, { timeout: 30000 });

for (const tab of ["setup", "preview", "inpaint"]) {
  await page.evaluate((t) => document.querySelector(`#app-tabs button[data-app-tab="${t}"]`)?.click(), tab);
  await page.waitForTimeout(2000);
  const m = await page.evaluate(() => ({
    docH: document.documentElement.scrollHeight,
    vh: window.innerHeight,
    vw: window.innerWidth,
    sidebarH: document.querySelector(".layer-sidebar")?.scrollHeight,
    sidebarVisH: document.querySelector(".layer-sidebar")?.clientHeight,
    sidebarHasScroll: (() => {
      const s = document.querySelector(".layer-sidebar");
      return s ? s.scrollHeight > s.clientHeight : null;
    })(),
    stageRect: document.getElementById("preview-stage")?.getBoundingClientRect(),
    inpaintBgRect: document.getElementById("inpaint-bg")?.getBoundingClientRect(),
    rgbApplyRect: document.getElementById("rgb-apply")?.getBoundingClientRect(),
    layerResetRect: document.getElementById("layer-reset-all")?.getBoundingClientRect(),
  }));
  console.log(`[${tab}] vh=${m.vh} docH=${m.docH} 페이지가 viewport 안에 fit? ${m.docH <= m.vh}`);
  console.log(`  stage:`, m.stageRect ? `${Math.round(m.stageRect.width)}×${Math.round(m.stageRect.height)} top=${Math.round(m.stageRect.top)} bottom=${Math.round(m.stageRect.bottom)}` : "N/A");
  console.log(`  sidebar: scrollH=${m.sidebarH} visH=${m.sidebarVisH} hasInternalScroll=${m.sidebarHasScroll}`);
  console.log(`  RGB Apply btn bottom=${Math.round(m.rgbApplyRect?.bottom ?? 0)} (visible? ${(m.rgbApplyRect?.bottom ?? 9999) <= m.vh})`);
  console.log(`  Reset all btn bottom=${Math.round(m.layerResetRect?.bottom ?? 0)} (visible? ${(m.layerResetRect?.bottom ?? 9999) <= m.vh})`);
  await page.screenshot({ path: `/tmp/fhd-${tab}.png`, fullPage: false });
}
await browser.close();
