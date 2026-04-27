#!/usr/bin/env node
/**
 * 사용자 정확 시나리오:
 *   1. localStorage 에 last tab = "preview" 저장 (이전 reload 시 그 탭에 있었음)
 *   2. 페이지 로드 → Preview 탭 active 로 시작
 *   3. Setup 탭으로 이동 → preset 선택 (mao_pro)
 *   4. Preview 탭으로 돌아옴
 *   5. Stage canvas 가 빈 화면인지 확인
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
// FHD viewport.
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push({ t: m.type(), text: m.text() }));
page.on("pageerror", (e) => logs.push({ t: "pageerror", text: String(e) }));

// 1) 사용자가 이전에 Preview 탭에 있던 상태 시뮬레이션 — localStorage 미리 set.
// (페이지 로드 전 set 하려면 addInitScript 사용.)
await ctx.addInitScript(() => {
  localStorage.setItem("geny:app-tab", "preview");
});

await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });

// 2) 페이지 로드 직후 어느 탭이 active 인지 확인.
const initialTab = await page.evaluate(() => {
  const active = document.querySelector("#app-tabs button.active");
  return active?.dataset.appTab;
});
console.log("[init] active tab:", initialTab);

// 3) Setup 탭으로 이동.
await page.evaluate(() => {
  document.querySelector('#app-tabs button[data-app-tab="setup"]').click();
});
await page.waitForTimeout(500);

// 4) preset card 클릭 (실 사용자처럼) — change event 가 아닌 click 으로.
await page.evaluate(() => {
  // mao_pro 카드 클릭. preset-cards 내 카드 중 mao_pro 텍스트 찾기.
  const cards = document.querySelectorAll(".preset-card");
  for (const c of cards) {
    if (c.textContent.toLowerCase().includes("mao")) {
      c.click();
      return "clicked";
    }
  }
  return "no card";
});

// 5) drawables 추출 대기.
await page.waitForFunction(() => window.__genyDrawables?.length > 0, { timeout: 30000 });
console.log("[setup] drawables loaded");
await page.waitForTimeout(800);

// 6) Preview 탭으로 이동.
await page.evaluate(() => {
  document.querySelector('#app-tabs button[data-app-tab="preview"]').click();
});
await page.waitForTimeout(2000);

// 7) Stage 상태 확인.
const stageState = await page.evaluate(() => {
  const stage = document.getElementById("preview-stage");
  const canvas = stage?.querySelector("canvas");
  const text = stage?.textContent?.trim();
  let pixelSample = null;
  if (canvas) {
    try {
      // canvas 의 중앙 픽셀이 비어있는지 (배경색만) 체크 — 모델 렌더 여부.
      const ctx = canvas.getContext("2d");
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const data = ctx.getImageData(cx, cy, 1, 1).data;
      pixelSample = { r: data[0], g: data[1], b: data[2], a: data[3] };
    } catch (e) {
      pixelSample = "getImageData blocked: " + String(e);
    }
  }
  return {
    stageExists: !!stage,
    canvasInDom: !!canvas,
    canvasW: canvas?.width,
    canvasH: canvas?.height,
    stageDisplay: stage ? getComputedStyle(stage).display : null,
    stageRect: stage ? stage.getBoundingClientRect().toJSON ? stage.getBoundingClientRect() : null : null,
    text,
    centerPixel: pixelSample,
  };
});
console.log("[preview] stage state:", JSON.stringify(stageState, null, 2));

await page.screenshot({ path: "/tmp/repro-tab-switch.png", fullPage: false });
console.log("[snap] /tmp/repro-tab-switch.png");

console.log("\n=== relevant logs ===");
for (const l of logs.filter((x) => /live2d|render|drawable|RX|preview|model/i.test(x.text))) {
  console.log(`[${l.t}] ${l.text.slice(0, 200)}`);
}

await browser.close();
