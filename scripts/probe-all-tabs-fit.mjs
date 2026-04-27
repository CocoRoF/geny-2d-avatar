#!/usr/bin/env node
/**
 * 1366×768 viewport 에서 각 탭의 주요 캔버스/콘텐츠가 viewport 안에 fit 되는지 측정.
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
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

const tabs = [
  { name: "setup", probe: ["#preset-select", "#bundle-name", "#go-btn"] },
  { name: "preview", probe: ["#preview-stage", "#preview-stage canvas"] },
  { name: "inpaint", probe: ["#inpaint-bg", "#inpaint-go"] },
  { name: "history", probe: ["#history-list", "#undo-btn"] },
  { name: "slot", probe: ["#slot-canvas", "#slot-canvas-wrap"] },
];

for (const t of tabs) {
  await page.evaluate((n) => document.querySelector(`#app-tabs button[data-app-tab="${n}"]`)?.click(), t.name);
  await page.waitForTimeout(1500);
  const r = await page.evaluate((sels) => {
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) {
        const r = el.getBoundingClientRect();
        out[s] = {
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          h: Math.round(r.height), w: Math.round(r.width),
          aboveFold: r.top < window.innerHeight,
          fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight,
        };
      } else {
        out[s] = "not found";
      }
    }
    return { vh: window.innerHeight, docH: document.documentElement.scrollHeight, probes: out };
  }, t.probe);
  console.log(`[${t.name}] vh=${r.vh} docH=${r.docH}`);
  for (const [k, v] of Object.entries(r.probes)) {
    if (typeof v === "object") {
      console.log(`  ${k}: top=${v.top} bottom=${v.bottom} h=${v.h} w=${v.w} fullyVisible=${v.fullyVisible}`);
    } else {
      console.log(`  ${k}: ${v}`);
    }
  }
  await page.screenshot({ path: `/tmp/fit-${t.name}.png`, fullPage: false });
}

await browser.close();
