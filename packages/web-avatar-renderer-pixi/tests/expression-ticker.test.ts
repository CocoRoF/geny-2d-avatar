import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { RendererExpression } from "@geny/web-avatar-renderer";

import {
  EXPRESSION_ACTIVE_ALPHA,
  EXPRESSION_MIN_DURATION_MS,
  EXPRESSION_NEUTRAL_ALPHA,
  EXPRESSION_NEUTRAL_FADE_SEC,
  advanceExpressionFrame,
  initialExpressionState,
  setExpressionTarget,
  type ExpressionState,
} from "../src/expression-ticker.js";

/**
 * β P1-S11 — expression blink alpha ramp 회귀 고정.
 *
 * 이전 `defaultCreateApp.setExpression` closure 는 매 호출마다 blinkCallback 을
 * ticker 에 add 해 경합/jump-cut 가능성이 있었고, 공식 자체의 단위 테스트도
 * 없었다. 본 파일은 선형 알파 램프의 `t=0..1` 진행 · duration 클램프 · mid-ramp
 * 재타겟 시 현재 alpha 에서 인수인계 · ended 일회성 등 시각 invariant 를 스냅샷.
 */

const SMILE: RendererExpression = Object.freeze({
  expression_id: "smile",
  name_en: "smile",
  fade_in_sec: 0.3,
  fade_out_sec: 0.2,
});

const FROWN: RendererExpression = Object.freeze({
  expression_id: "frown",
  name_en: "frown",
  fade_in_sec: 0.2,
  fade_out_sec: 0.2,
});

const INSTANT: RendererExpression = Object.freeze({
  expression_id: "instant",
  name_en: "instant",
  fade_in_sec: 0,
  fade_out_sec: 0,
});

describe("initialExpressionState — 초기 상태", () => {
  test("expression=null, alpha=1 활성, durationMs=0 settled (렌더러 기본)", () => {
    const s = initialExpressionState();
    assert.equal(s.expression, null);
    assert.equal(s.alpha, EXPRESSION_ACTIVE_ALPHA);
    assert.equal(s.startAlpha, EXPRESSION_ACTIVE_ALPHA);
    assert.equal(s.targetAlpha, EXPRESSION_ACTIVE_ALPHA);
    assert.equal(s.rampMs, 0);
    assert.equal(s.durationMs, 0);
  });

  test("settled 상태에서 advance → state 불변, alpha=1, ended=false", () => {
    const s = initialExpressionState();
    const frame = advanceExpressionFrame(s, 16.67);
    assert.equal(frame.state, s);
    assert.equal(frame.alpha, 1);
    assert.equal(frame.ended, false);
  });
});

describe("setExpressionTarget — 새 target 램프 설정", () => {
  test("expression 제공 → targetAlpha=1, duration=fade_in_sec*1000", () => {
    const s = setExpressionTarget(initialExpressionState(), SMILE);
    assert.equal(s.expression, SMILE);
    assert.equal(s.targetAlpha, EXPRESSION_ACTIVE_ALPHA);
    assert.equal(s.durationMs, 300);
    assert.equal(s.rampMs, 0);
    assert.equal(s.startAlpha, 1, "현재 alpha=1 에서 출발");
    assert.equal(s.alpha, 1);
  });

  test("expression=null → targetAlpha=0.95, duration=기본 neutral fade (150ms)", () => {
    const s = setExpressionTarget(initialExpressionState(), null);
    assert.equal(s.expression, null);
    assert.equal(s.targetAlpha, EXPRESSION_NEUTRAL_ALPHA);
    assert.equal(s.durationMs, EXPRESSION_NEUTRAL_FADE_SEC * 1000);
  });

  test("fade_in_sec=0 → duration 이 EXPRESSION_MIN_DURATION_MS (60ms) 로 클램프 — 번쩍 방지", () => {
    const s = setExpressionTarget(initialExpressionState(), INSTANT);
    assert.equal(s.durationMs, EXPRESSION_MIN_DURATION_MS);
  });

  test("음수 fade_in_sec 도 60ms 로 클램프 (방어적)", () => {
    const negative: RendererExpression = { ...SMILE, fade_in_sec: -0.5 };
    const s = setExpressionTarget(initialExpressionState(), negative);
    assert.equal(s.durationMs, EXPRESSION_MIN_DURATION_MS);
  });
});

describe("advanceExpressionFrame — 선형 ramp 진행", () => {
  test("t=0.5 (rampMs=150ms / duration=300ms) → alpha 가 start/target 중간", () => {
    // 중립(0.95) 에서 활성(1.0) 으로 smile 램프
    let s = setExpressionTarget(initialExpressionState(), null); // 1 → 0.95
    s = advanceExpressionFrame(s, 150).state; // duration=150 이므로 완료
    assert.equal(s.alpha, EXPRESSION_NEUTRAL_ALPHA);
    // 이제 0.95 에서 smile 램프
    s = setExpressionTarget(s, SMILE); // 0.95 → 1.0, duration=300
    const mid = advanceExpressionFrame(s, 150);
    const expected = 0.95 + (1 - 0.95) * 0.5;
    assert.ok(Math.abs(mid.alpha - expected) < 1e-9, `alpha ${mid.alpha} ≈ ${expected}`);
    assert.equal(mid.ended, false);
  });

  test("단계적 dt 누적 — 최종 alpha 는 startAlpha + (target - start) * 1", () => {
    let s = setExpressionTarget(initialExpressionState(), null); // → 0.95 over 150ms
    s = advanceExpressionFrame(s, 30).state;
    s = advanceExpressionFrame(s, 30).state;
    s = advanceExpressionFrame(s, 30).state;
    s = advanceExpressionFrame(s, 30).state;
    assert.ok(Math.abs(s.alpha - (1 + (0.95 - 1) * (120 / 150))) < 1e-9);
  });
});

describe("advanceExpressionFrame — ramp 완료 + ended 신호", () => {
  test("rampMs ≥ duration → ended=true, alpha=target, state settled", () => {
    let s = setExpressionTarget(initialExpressionState(), SMILE); // 1 → 1, d=300
    s = advanceExpressionFrame(s, 100).state;
    const last = advanceExpressionFrame(s, 300); // 총 400 > 300
    assert.equal(last.ended, true);
    assert.equal(last.alpha, EXPRESSION_ACTIVE_ALPHA);
    assert.equal(last.state.durationMs, 0, "settled — ticker 해제 가능");
    assert.equal(last.state.rampMs, 0);
    assert.equal(last.state.startAlpha, last.state.targetAlpha);
  });

  test("ended=true 이후 advance → ended=false + alpha 유지 (한 번만 신호)", () => {
    let s = setExpressionTarget(initialExpressionState(), null); // 1 → 0.95
    s = advanceExpressionFrame(s, 200).state; // ended 경유 후 settled
    const again = advanceExpressionFrame(s, 16);
    assert.equal(again.ended, false);
    assert.equal(again.alpha, EXPRESSION_NEUTRAL_ALPHA);
    assert.equal(again.state, s, "settled 상태는 state 객체 그대로 반환");
  });

  test("dt 오버슛 (duration 150 에 dt=1000) → 한 번에 ended 처리", () => {
    const s = setExpressionTarget(initialExpressionState(), null);
    const frame = advanceExpressionFrame(s, 1000);
    assert.equal(frame.ended, true);
    assert.equal(frame.alpha, EXPRESSION_NEUTRAL_ALPHA);
  });
});

describe("setExpressionTarget — 중간 재타겟 (jump-cut 방지)", () => {
  test("ramp 중간 (t=0.5) 에 재타겟 → startAlpha = 현재 alpha (점프 없음)", () => {
    let s = setExpressionTarget(initialExpressionState(), null); // 1 → 0.95 / 150ms
    s = advanceExpressionFrame(s, 75).state; // t=0.5 → alpha=0.975
    const mid = s.alpha;
    assert.ok(Math.abs(mid - 0.975) < 1e-9);
    // 중간에 smile 로 바꿈 — 0.975 에서 1 로 새 램프
    s = setExpressionTarget(s, SMILE);
    assert.equal(s.startAlpha, mid, "새 램프의 출발은 직전 frame 의 alpha 값");
    assert.equal(s.alpha, mid, "즉시 표시 alpha 도 유지 — 한 프레임 점프 없음");
    assert.equal(s.targetAlpha, 1);
    assert.equal(s.rampMs, 0);
  });

  test("동일 target 으로 재호출해도 rampMs 리셋 + duration 재진행", () => {
    let s = setExpressionTarget(initialExpressionState(), SMILE);
    s = advanceExpressionFrame(s, 100).state;
    assert.ok(s.rampMs > 0);
    s = setExpressionTarget(s, SMILE);
    assert.equal(s.rampMs, 0);
    assert.equal(s.durationMs, 300);
  });
});

describe("advanceExpressionFrame — dt 방어", () => {
  test("dt=NaN → dt=0 취급 (rampMs 변화 없음, ended 안 남)", () => {
    const s = setExpressionTarget(initialExpressionState(), SMILE);
    const f = advanceExpressionFrame(s, Number.NaN);
    assert.equal(f.state.rampMs, 0);
    assert.equal(f.ended, false);
    assert.equal(f.alpha, s.alpha);
  });

  test("dt<0 → dt=0 취급 (역주행 방지)", () => {
    let s = setExpressionTarget(initialExpressionState(), SMILE);
    s = advanceExpressionFrame(s, 100).state;
    const before = s.rampMs;
    const f = advanceExpressionFrame(s, -50);
    assert.equal(f.state.rampMs, before);
  });

  test("dt=0 → state 불변 (완전 pause)", () => {
    let s = setExpressionTarget(initialExpressionState(), SMILE);
    s = advanceExpressionFrame(s, 100).state;
    const snap = { ...s };
    const f = advanceExpressionFrame(s, 0);
    assert.equal(f.state.rampMs, snap.rampMs);
    assert.equal(f.alpha, snap.alpha);
  });
});

describe("expression-ticker 통합 — 연속 전환 lifecycle", () => {
  test("중립(1) → smile(1, fade_in 0.3) → frown(1, fade_in 0.2) → null(0.95)", () => {
    let s: ExpressionState = initialExpressionState();
    assert.equal(s.alpha, 1);

    // neutral → smile (alpha 1 → 1, duration 300)
    s = setExpressionTarget(s, SMILE);
    for (let i = 0; i < 30; i += 1) s = advanceExpressionFrame(s, 10).state;
    assert.equal(s.durationMs, 0, "smile 램프 settled");
    assert.equal(s.alpha, 1);

    // smile → frown (alpha 1 → 1, duration 200)
    s = setExpressionTarget(s, FROWN);
    for (let i = 0; i < 20; i += 1) s = advanceExpressionFrame(s, 10).state;
    assert.equal(s.durationMs, 0);
    assert.equal(s.expression, FROWN);

    // frown → null (alpha 1 → 0.95, duration 150)
    s = setExpressionTarget(s, null);
    const frames: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const f = advanceExpressionFrame(s, 10);
      frames.push(f.alpha);
      s = f.state;
    }
    // 단조 감소 (중간에 튐 없음) 확인
    for (let i = 1; i < frames.length; i += 1) {
      const prev = frames[i - 1] ?? 0;
      const curr = frames[i] ?? 0;
      assert.ok(curr <= prev + 1e-9, `frame ${i} alpha ${curr} ≤ ${prev}`);
    }
    assert.equal(s.alpha, EXPRESSION_NEUTRAL_ALPHA);
    assert.equal(s.durationMs, 0);
  });
});
