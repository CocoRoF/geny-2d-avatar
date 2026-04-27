#!/usr/bin/env node
/**
 * 사용자 정확 시나리오:
 *   1. 페이지 로드 (last tab = preview)
 *   2. Setup 으로 이동 → mao_pro 선택
 *   3. Preview 로 이동 → 모델 보임 ✅ (이번엔)
 *   4. Setup 으로 다시 이동
 *   5. Preview 로 다시 이동 → 모델이 사라짐 ❌
 *   6. 여러 번 왕복 (Inpaint, History 등) → 모델 유지되어야 함
 *
 * 각 사이클마다 canvas 상태 진단.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => localStorage.setItem("geny:app-tab", "preview"));

const logs = [];
page.on("console", (m) => logs.push({ t: m.type(), text: m.text() }));

await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });

// Setup 으로 이동.
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="setup"]').click());
await page.waitForTimeout(300);

// mao_pro 카드 클릭.
await page.evaluate(() => {
  const cards = document.querySelectorAll(".preset-card");
  for (const c of cards) if (c.textContent.toLowerCase().includes("mao")) { c.click(); break; }
});
await page.waitForTimeout(800);

async function probeCanvas(label) {
  await page.waitForTimeout(1500); // RAF + force-render kick 들 완료 대기.
  const m = await page.evaluate(() => {
    const c = document.querySelector("#preview-stage canvas");
    if (!c) return { err: "no canvas" };
    let pixels = null;
    try {
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (gl) {
        // 4 군데 sample (중앙, 모서리). 모델 영역 + 배경.
        const samples = {};
        const points = [
          ["center", c.width/2, c.height/2],
          ["topLeft", 50, 50],
          ["modelArea", c.width/2, c.height*0.4],
        ];
        for (const [name, x, y] of points) {
          const arr = new Uint8Array(4);
          try {
            gl.readPixels(x, c.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, arr);
            samples[name] = `(${arr[0]},${arr[1]},${arr[2]},${arr[3]})`;
          } catch { samples[name] = "read fail"; }
        }
        pixels = samples;
      }
    } catch {}
    const tabPane = document.querySelector('.app-tab-pane[data-app-tab="preview"]');
    return {
      canvas: { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight },
      paneActive: tabPane?.classList.contains("active"),
      paneDisplay: tabPane ? getComputedStyle(tabPane).display : null,
      pixels,
    };
  });
  console.log(`[${label}]`, JSON.stringify(m));
}

async function activateTab(name) {
  await page.evaluate((n) => document.querySelector(`#app-tabs button[data-app-tab="${n}"]`).click(), name);
}

// 첫 Preview 진입.
await activateTab("preview");
await probeCanvas("preview-1");
await page.screenshot({ path: "/tmp/cycle-preview-1.png", fullPage: false });

// Setup 으로.
await activateTab("setup");
await page.waitForTimeout(500);

// Preview 다시.
await activateTab("preview");
await probeCanvas("preview-2");
await page.screenshot({ path: "/tmp/cycle-preview-2.png", fullPage: false });

// 여러 탭 왕복.
await activateTab("inpaint");
await page.waitForTimeout(500);
await activateTab("history");
await page.waitForTimeout(500);
await activateTab("preview");
await probeCanvas("preview-3");
await page.screenshot({ path: "/tmp/cycle-preview-3.png", fullPage: false });

// 마지막 사이클.
await activateTab("setup");
await page.waitForTimeout(500);
await activateTab("preview");
await probeCanvas("preview-4");
await page.screenshot({ path: "/tmp/cycle-preview-4.png", fullPage: false });

console.log("\n=== app-tab events + force render ===");
for (const l of logs.filter((x) => /preview|app-tab|render|live2d/i.test(x.text)).slice(-15)) {
  console.log(`[${l.t}] ${l.text.slice(0, 200)}`);
}
await browser.close();
