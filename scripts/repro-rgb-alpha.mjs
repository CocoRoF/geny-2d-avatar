#!/usr/bin/env node
/**
 * RGB shift 의 A 슬라이더 0% 동작 검증.
 * 1. mao_pro 로드 후 Preview 탭으로
 * 2. Layer Panel 의 첫 5 drawable 선택
 * 3. RGB A 슬라이더를 0 으로
 * 4. Apply 클릭
 * 5. 그 drawable 들의 multiplyColor.a 값을 SDK 에서 읽어 확인
 * 6. 시각적으로 사라졌는지 스크린샷.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const logs = [];
page.on("console", (m) => logs.push({ t: m.type(), text: m.text() }));

await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });

// Setup → mao_pro → Preview.
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

// Sidebar 의 drawable list 에서 첫 5 row 의 checkbox 체크.
const selectedIds = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll("#layer-list [data-idx]")).slice(0, 5);
  const ids = [];
  for (const row of rows) {
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      const idx = Number(row.dataset.idx);
      ids.push({ idx, drawableIndex: window.__genyDrawables[idx]?.index, id: window.__genyDrawables[idx]?.id });
    }
  }
  return ids;
});
console.log("[selected]", JSON.stringify(selectedIds));

// 선택 후 잠시 기다림 → RGB Apply 버튼 활성화 됐는지.
await page.waitForTimeout(300);
const applyEnabled = await page.evaluate(() => {
  const btn = document.getElementById("rgb-apply");
  return { disabled: btn?.disabled, text: btn?.textContent };
});
console.log("[apply btn]", applyEnabled);

// A 슬라이더 0 으로.
await page.evaluate(() => {
  const slider = document.getElementById("rgb-a");
  slider.value = "0";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
});
const sliderVals = await page.evaluate(() => ({
  r: document.getElementById("rgb-r").value,
  g: document.getElementById("rgb-g").value,
  b: document.getElementById("rgb-b").value,
  a: document.getElementById("rgb-a").value,
}));
console.log("[sliders]", sliderVals);

// Apply 클릭.
await page.evaluate(() => document.getElementById("rgb-apply").click());
await page.waitForTimeout(800);

// SDK 에서 multiplyColor 읽기.
const colors = await page.evaluate((selIds) => {
  const cm = window.__genyCurrentModel?.internalModel?.coreModel;
  if (!cm?.getDrawableMultiplyColor) return { err: "no getDrawableMultiplyColor" };
  const results = [];
  for (const s of selIds) {
    try {
      const c = cm.getDrawableMultiplyColor(s.drawableIndex);
      results.push({
        id: s.id,
        drawableIndex: s.drawableIndex,
        R: c?.R, G: c?.G, B: c?.B, A: c?.A,
      });
    } catch (e) {
      results.push({ id: s.id, err: String(e) });
    }
  }
  return results;
}, selectedIds);
console.log("[multiplyColors after Apply A=0]");
for (const c of colors) console.log(" ", JSON.stringify(c));

// 시각적 확인.
await page.screenshot({ path: "/tmp/repro-rgb-alpha.png", fullPage: false });
console.log("[snap] /tmp/repro-rgb-alpha.png");

console.log("\n=== rgb-shift logs ===");
for (const l of logs.filter((x) => /rgb-shift|layer/i.test(x.text)).slice(-10)) {
  console.log(`[${l.t}] ${l.text.slice(0, 200)}`);
}

await browser.close();
