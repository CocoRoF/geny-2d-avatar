#!/usr/bin/env node
/**
 * 모델 로드 후 PIXI render 상태 진단 — model bounds, ticker 상태, canvas pixel sample.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
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
await page.evaluate(() => {
  const sel = document.getElementById("preset-select");
  const opt = Array.from(sel.options).find((o) => o.value.includes("mao_pro"));
  sel.value = opt.value;
  sel.dispatchEvent(new Event("change"));
});
await page.waitForFunction(() => window.__genyDrawables?.length > 0, { timeout: 30000 });
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="preview"]')?.click());
await page.waitForTimeout(2500);

const probe = await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  if (!m) return { err: "no model" };
  const c = window.pixiApp?.canvas || document.querySelector("#preview-stage canvas");
  let glPx = null;
  if (c) {
    try {
      // WebGL canvas — readPixels.
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (gl) {
        const arr = new Uint8Array(4);
        gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, arr);
        glPx = { r: arr[0], g: arr[1], b: arr[2], a: arr[3] };
      }
    } catch (e) { glPx = "readPixels fail: " + String(e); }
  }
  let bounds = null;
  try {
    const b = m.getBounds?.();
    bounds = { x: b?.x, y: b?.y, w: b?.width, h: b?.height };
  } catch {}
  return {
    canvasW: c?.width, canvasH: c?.height,
    canvasCssW: c?.clientWidth, canvasCssH: c?.clientHeight,
    canvasInDOM: !!c?.parentElement,
    modelVisible: m.visible !== false,
    modelAlpha: m.alpha,
    modelScale: m.scale ? `${m.scale.x},${m.scale.y}` : "?",
    modelPos: `${m.x},${m.y}`,
    bounds,
    centerPixel: glPx,
  };
});
console.log("[probe]", JSON.stringify(probe, null, 2));
console.log("\n=== logs (last 20 with model/render/ticker) ===");
for (const l of logs.filter((x) => /model|render|ticker|live2d|RX|preview/i.test(x.text)).slice(-20)) {
  console.log(`[${l.t}] ${l.text.slice(0, 250)}`);
}
await browser.close();
