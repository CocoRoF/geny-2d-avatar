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
await page.evaluate(() => document.querySelector('#app-tabs button[data-app-tab="preview"]')?.click());
await page.waitForTimeout(1500);
// Expand log.
await page.evaluate(() => document.getElementById("log-toggle").click());
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/log-expanded.png", fullPage: false });
const m = await page.evaluate(() => {
  const lp = document.getElementById("log-panel");
  return { className: lp.className, height: lp.clientHeight };
});
console.log(JSON.stringify(m));
await browser.close();
