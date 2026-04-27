#!/usr/bin/env node
/**
 * pixi-live2d-display-advanced 의 internalModel 이 어떤 event/hook 을 expose 하는지.
 * Hint 는 EventEmitter (_events).
 */
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/builder.html?api=http%3A%2F%2Flocalhost%3A3000",
  { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.Live2DCubismCore !== "undefined", { timeout: 15000 });
await page.waitForFunction(() => {
  const sel = document.getElementById("preset-select");
  return sel && sel.options.length > 1;
}, { timeout: 10000 });
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

const probe = await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  const im = m.internalModel;
  // EventEmitter 확인.
  const events = im._events ? Object.keys(im._events) : null;
  // prototype methods.
  const methods = [];
  let p = im;
  while (p && p !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(p)) {
      if (typeof im[n] === "function" || n.startsWith("_") === false) methods.push(n);
    }
    p = Object.getPrototypeOf(p);
  }
  // sift to update/render/event-related.
  const relevant = methods.filter((n) =>
    /update|render|hit|event|emit|on$|once|off|listener|tick/i.test(n));
  return {
    eventNames: events,
    eventEmitter: !!im.emit,
    onMethod: typeof im.on === "function",
    relevantMethods: [...new Set(relevant)].sort(),
    motionManagerKeys: im.motionManager ? Object.keys(im.motionManager).slice(0, 30) : null,
    hasMotionFinishHook: typeof im.motionManager?.on === "function",
  };
});
console.log(JSON.stringify(probe, null, 2));

// 실험: model.on("afterMotionUpdate", ...) 방식.
const hookResult = await page.evaluate(() => {
  const m = window.__genyCurrentModel;
  const im = m.internalModel;
  // 실험적으로 afterMotionUpdate 이벤트 발생 확인.
  const drawable0_index = window.__genyDrawables[0].index;
  let captured = 0;
  let methodTriedNames = [];
  for (const evName of ["afterMotionUpdate", "afterUpdate", "beforeUpdate", "update"]) {
    if (typeof im.on === "function") {
      try {
        im.on(evName, () => { captured++; });
        methodTriedNames.push(evName);
      } catch {}
    }
  }
  return { captured, methodTriedNames, hasOn: typeof im.on === "function" };
});
console.log("[hook attempt]", JSON.stringify(hookResult));

await page.waitForTimeout(2000);

// 2 초 후 captured 카운트 확인 (RAF 60fps → 120 frame 정도 capture 예상).
const final = await page.evaluate(() => ({
  captured: window._evCaptured ?? "no var",
}));
console.log("[after 2s]", final);

await browser.close();
