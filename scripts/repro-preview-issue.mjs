#!/usr/bin/env node
/**
 * 사용자 시나리오 재현:
 *   1. 페이지 로드 (default Setup 탭)
 *   2. mao_pro 선택
 *   3. Preview 탭으로 전환
 *   4. 캡처 + DOM/PIXI 상태 확인
 */
import { chromium } from "playwright";

// 일반적인 노트북 viewport — 사용자 환경 추정.
const VIEW = { width: 1366, height: 768 };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEW });
const page = await ctx.newPage();

// 콘솔 + 에러 캡처.
const logs = [];
page.on("console", (m) => logs.push({ t: m.type(), text: m.text() }));
page.on("pageerror", (e) => logs.push({ t: "pageerror", text: String(e) }));

await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });

// 1) 사용자가 mao_pro 선택.
await page.evaluate(() => {
  const sel = document.getElementById("preset-select");
  const opt = Array.from(sel.options).find((o) => o.value.includes("mao_pro"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
});

// drawables 추출 대기.
await page.waitForFunction(() => window.__genyDrawables?.length > 0, { timeout: 30000 });
await page.waitForTimeout(2000);

// 2) Preview 탭으로 전환.
await page.evaluate(() => {
  document.querySelector('#app-tabs button[data-app-tab="preview"]')?.click();
});
await page.waitForTimeout(3500); // status box auto-hide 1200ms + 여유.

// 3) Preview 탭 전체 스크린샷.
await page.screenshot({ path: "/tmp/repro-preview-full.png", fullPage: true });
await page.screenshot({ path: "/tmp/repro-preview-viewport.png", fullPage: false });

// DOM / canvas 상태 진단.
const diag = await page.evaluate(() => {
  const tabPreview = document.querySelector('.app-tab-pane[data-app-tab="preview"]');
  const livePanel = document.getElementById("live-preview-panel");
  const stage = document.getElementById("preview-stage");
  const canvas = stage?.querySelector("canvas");
  const layerSidebar = document.querySelector(".layer-sidebar");
  return {
    tabPreviewActive: tabPreview?.classList.contains("active"),
    tabPreviewDisplay: getComputedStyle(tabPreview).display,
    livePanelDisplay: getComputedStyle(livePanel).display,
    livePanelInlineDisplay: livePanel?.style.display,
    stageRect: stage ? {
      w: stage.clientWidth, h: stage.clientHeight,
      offsetTop: stage.offsetTop,
      bbox: stage.getBoundingClientRect().toJSON ? stage.getBoundingClientRect() : null,
    } : null,
    canvasInfo: canvas ? {
      w: canvas.width, h: canvas.height,
      cssW: canvas.clientWidth, cssH: canvas.clientHeight,
      visible: getComputedStyle(canvas).display !== "none",
    } : "no canvas",
    drawablesCount: window.__genyDrawables?.length ?? 0,
    layerRows: document.querySelectorAll("#layer-list [data-idx]").length,
    sidebarH: layerSidebar?.clientHeight,
    documentH: document.documentElement.scrollHeight,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log(JSON.stringify(diag, null, 2));
console.log("\n=== console errors ===");
for (const l of logs.filter((x) => x.t === "error" || x.t === "pageerror")) {
  console.log(`[${l.t}]`, l.text);
}
await browser.close();
