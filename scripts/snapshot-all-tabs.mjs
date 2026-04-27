#!/usr/bin/env node
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
await page.waitForTimeout(2000);

for (const tab of ["setup", "preview", "inpaint", "history", "slot"]) {
  await page.evaluate((t) => {
    document.querySelector(`#app-tabs button[data-app-tab="${t}"]`)?.click();
  }, tab);
  await page.waitForTimeout(500);
  const out = `/tmp/tab-${tab}.png`;
  await page.screenshot({ path: out, fullPage: true });
  const info = await page.evaluate(() => {
    const stage = document.getElementById("preview-stage");
    return { stage: { w: stage.clientWidth, h: stage.clientHeight } };
  });
  console.log(`[${tab}] ${out} stage=${info.stage.w}x${info.stage.h}`);
}
await browser.close();
