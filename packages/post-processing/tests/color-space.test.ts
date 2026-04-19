/**
 * color-space.ts — sRGB ↔ L*a*b* (D65) + ΔE*ab 회귀.
 *
 * 레퍼런스 값은 Bruce Lindbloom 의 sRGB↔Lab 계산기 (D65, 2° observer) 와 일치해야 한다.
 * 소수점 한 자리 정밀도로 검증 (float 왕복 + int 반올림).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { rgbToLab, labToRgb, deltaE76 } from "../src/index.js";

function approx(actual: number, expected: number, eps = 0.1, label = "") {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `${label}: actual=${actual} expected=${expected} eps=${eps}`,
  );
}

test("rgbToLab: 백색(255,255,255) → L=100, a≈0, b≈0", () => {
  const lab = rgbToLab(255, 255, 255);
  approx(lab.L, 100, 0.01, "L");
  approx(lab.a, 0, 0.01, "a");
  approx(lab.b, 0, 0.01, "b");
});

test("rgbToLab: 흑색(0,0,0) → L=0, a=0, b=0", () => {
  const lab = rgbToLab(0, 0, 0);
  approx(lab.L, 0, 0.01, "L");
  approx(lab.a, 0, 0.01, "a");
  approx(lab.b, 0, 0.01, "b");
});

test("rgbToLab: 순적(255,0,0) 레퍼런스 — L≈53.24, a≈80.09, b≈67.20", () => {
  const lab = rgbToLab(255, 0, 0);
  approx(lab.L, 53.24, 0.05, "L");
  approx(lab.a, 80.09, 0.1, "a");
  approx(lab.b, 67.2, 0.1, "b");
});

test("rgbToLab: 회색(128,128,128) → a≈0 b≈0 (중성)", () => {
  const lab = rgbToLab(128, 128, 128);
  approx(lab.a, 0, 0.01, "a");
  approx(lab.b, 0, 0.01, "b");
});

test("labToRgb: L=100/a=0/b=0 → (255,255,255)", () => {
  const [r, g, b] = labToRgb(100, 0, 0);
  assert.equal(r, 255);
  assert.equal(g, 255);
  assert.equal(b, 255);
});

test("라운드트립: sRGB → Lab → sRGB 오차 ≤ 1 (off-by-one)", () => {
  const samples: Array<[number, number, number]> = [
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [100, 150, 200],
    [30, 200, 50],
    [200, 30, 150],
  ];
  for (const [r, g, b] of samples) {
    const lab = rgbToLab(r, g, b);
    const [r2, g2, b2] = labToRgb(lab.L, lab.a, lab.b);
    assert.ok(Math.abs(r - r2) <= 1, `R: ${r}→${r2}`);
    assert.ok(Math.abs(g - g2) <= 1, `G: ${g}→${g2}`);
    assert.ok(Math.abs(b - b2) <= 1, `B: ${b}→${b2}`);
  }
});

test("labToRgb: 범위 초과 → 0..255 clamp", () => {
  // 비정상적으로 큰 L — 255 로 clamp 되어야 함 (gamut out)
  const [r, g, b] = labToRgb(200, 0, 0);
  assert.equal(r, 255);
  assert.equal(g, 255);
  assert.equal(b, 255);
  // 음수 L — 0 으로 clamp
  const [r2, g2, b2] = labToRgb(-10, 0, 0);
  assert.equal(r2, 0);
  assert.equal(g2, 0);
  assert.equal(b2, 0);
});

test("deltaE76: 같은 색 → 0", () => {
  const lab = rgbToLab(100, 150, 200);
  assert.equal(deltaE76(lab, lab), 0);
});

test("deltaE76: 흑↔백 → ~100 (L 차이 지배)", () => {
  const black = rgbToLab(0, 0, 0);
  const white = rgbToLab(255, 255, 255);
  const d = deltaE76(black, white);
  approx(d, 100, 0.1, "deltaE");
});

test("deltaE76: 대칭 — ΔE(p,q) === ΔE(q,p)", () => {
  const p = rgbToLab(50, 80, 120);
  const q = rgbToLab(200, 80, 30);
  assert.equal(deltaE76(p, q), deltaE76(q, p));
});
