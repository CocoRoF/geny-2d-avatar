#!/usr/bin/env node
/**
 * 가설: 이전 세션의 localStorage state 가 모든 drawable 을 alpha=0 으로 hide.
 * 페이지 reload 시 layer state 복원되어 모델이 invisible 로 보일 수 있음.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// 시나리오 1: stale state 로 모델 숨김.
await ctx.addInitScript(() => {
  // 모든 ArtMesh 의 multiply alpha=0 을 시뮬레이션.
  const mockHidden = [];
  for (let i = 121; i < 380; i++) mockHidden.push("ArtMesh" + i);
  localStorage.setItem("geny:layer-state:tpl.base.v1.mao_pro@1.0.0", JSON.stringify({
    hidden: mockHidden,
    multiply: {},
    ts: Date.now(),
  }));
  localStorage.setItem("geny:app-tab", "preview");
});

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
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="preview"]')?.click());
await page.waitForTimeout(2500);

const m = await page.evaluate(() => {
  const ls = localStorage.getItem("geny:layer-state:tpl.base.v1.mao_pro@1.0.0");
  const parsed = ls ? JSON.parse(ls) : null;
  return {
    hiddenCount: parsed?.hidden?.length ?? 0,
    drawablesCount: window.__genyDrawables?.length ?? 0,
    layerStateHiddenCount: window.__genyDrawables?.length ?? 0, // can't read internal layerState directly
  };
});
console.log("[stale state]", m);
await page.screenshot({ path: "/tmp/probe-stale.png", fullPage: false });
console.log("[snap] /tmp/probe-stale.png");

await browser.close();
