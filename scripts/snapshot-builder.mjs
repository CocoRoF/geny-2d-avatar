#!/usr/bin/env node
/**
 * Builder UI 헤드리스 캡처 — 1440x900 viewport. mao_pro 선택 후 Layer Panel 활성된 상태.
 * 사용: node scripts/snapshot-builder.mjs [outPath]
 */
import { chromium } from "playwright";
import { resolve } from "node:path";

const OUT = resolve(process.argv[2] ?? "/tmp/builder-snapshot.png");
const API = "http://localhost:3000";
const WEB = "http://localhost:4173";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const url = `${WEB}/builder.html?api=${encodeURIComponent(API)}`;
console.log("[nav]", url);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

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
await page.waitForTimeout(2500); // 모션 + thumbnail 렌더 시간.

await page.screenshot({ path: OUT, fullPage: true });
console.log("[snap]", OUT);

const layout = await page.evaluate(() => {
  const main = document.querySelector(".app-grid");
  const aside = document.querySelector(".layer-sidebar");
  const stage = document.getElementById("preview-stage");
  return {
    bodyWidth: document.body.clientWidth,
    appGrid: main ? { w: main.clientWidth, h: main.clientHeight, computed: getComputedStyle(main).gridTemplateColumns } : null,
    sidebar: aside ? { w: aside.clientWidth, h: aside.clientHeight, sticky: getComputedStyle(aside).position } : null,
    stage: stage ? { w: stage.clientWidth, h: stage.clientHeight } : null,
    layerRowCount: document.querySelectorAll("#layer-list [data-idx]").length,
  };
});
console.log("[layout]", JSON.stringify(layout, null, 2));

await browser.close();
