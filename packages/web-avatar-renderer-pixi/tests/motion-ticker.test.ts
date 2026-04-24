import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import type { RendererMotion } from "@geny/web-avatar-renderer";

import {
  BREATH_AMPLITUDE,
  BREATH_MIN_PERIOD_MS,
  advanceBreathFrame,
  initialBreathState,
  startBreath,
  stopBreath,
  type BreathState,
} from "../src/motion-ticker.js";

/**
 * β P1-S10 — breath fade ramp + sine amplitude 공식 회귀 고정.
 *
 * 이전까지 `defaultCreateApp` closure 안에서 mutable 변수로 구현돼 있어 DOM/pixi
 * 의존성 없이 테스트 불가였다. 본 파일은 공식 자체가 바뀌면 "아바타가 살아있다"
 * 는 β 시각 인상이 깨지므로 수학적 invariant (fade 선형성 · amplitude 범위 ·
 * ended 플래그 · period floor) 를 스냅샷.
 */

const LOOP_BREATH: RendererMotion = Object.freeze({
  pack_id: "breath.idle",
  duration_sec: 4,
  fade_in_sec: 1,
  fade_out_sec: 1,
  loop: true,
});

const LOOP_FAST_BREATH: RendererMotion = Object.freeze({
  pack_id: "breath.fast",
  duration_sec: 2,
  fade_in_sec: 0.5,
  fade_out_sec: 0.5,
  loop: true,
});

const ONE_SHOT: RendererMotion = Object.freeze({
  pack_id: "greet",
  duration_sec: 2,
  fade_in_sec: 0,
  fade_out_sec: 0,
  loop: false,
});

describe("initialBreathState — 초기 상태", () => {
  test("motion=null + rampFactor=0 + rampDurationMs=0 (ticker 비장착 기본값)", () => {
    const s = initialBreathState();
    assert.equal(s.motion, null);
    assert.equal(s.rampFactor, 0);
    assert.equal(s.rampDurationMs, 0);
    assert.equal(s.elapsedMs, 0);
    assert.equal(s.rampMs, 0);
    assert.equal(s.rampDirection, "in");
  });

  test("advanceBreathFrame(initial, dt) → scaleY=1, ended=false, state 불변", () => {
    const s = initialBreathState();
    const frame = advanceBreathFrame(s, 16.67);
    assert.equal(frame.scaleY, 1);
    assert.equal(frame.ended, false);
    assert.equal(frame.state, s, "motion=null 상태는 입력 state 그대로 반환");
  });
});

describe("startBreath — fade_in 램프", () => {
  test("loop=true motion → motion/elapsed/ramp 초기화, rampDirection='in'", () => {
    const s = startBreath(initialBreathState(), LOOP_BREATH);
    assert.equal(s.motion, LOOP_BREATH);
    assert.equal(s.elapsedMs, 0);
    assert.equal(s.rampMs, 0);
    assert.equal(s.rampDurationMs, 1000);
    assert.equal(s.rampDirection, "in");
    assert.equal(s.rampFactor, 0, "fade_in 시작은 amplitude 0 — tangential scale 없음");
  });

  test("loop=false motion → state 불변 (breath 로 잡지 않음)", () => {
    const initial = initialBreathState();
    const s = startBreath(initial, ONE_SHOT);
    assert.equal(s, initial);
  });

  test("fade_in_sec=0 motion → rampFactor=1 즉시 (ramp 없음)", () => {
    const instant: RendererMotion = { ...LOOP_BREATH, fade_in_sec: 0 };
    const s = startBreath(initialBreathState(), instant);
    assert.equal(s.rampFactor, 1);
    assert.equal(s.rampDurationMs, 0);
  });

  test("기존 breath 위에 재-startBreath 하면 elapsedMs/rampMs 리셋", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 500).state;
    assert.ok(s.elapsedMs > 0);
    s = startBreath(s, LOOP_BREATH);
    assert.equal(s.elapsedMs, 0);
    assert.equal(s.rampMs, 0);
  });
});

describe("advanceBreathFrame — fade_in 진행 중", () => {
  test("rampMs/rampDurationMs 비율이 rampFactor 에 선형 반영 (t=0.5)", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    const frame = advanceBreathFrame(s, 500); // 1000ms fade_in 의 절반
    assert.ok(Math.abs(frame.state.rampFactor - 0.5) < 1e-9);
    assert.equal(frame.ended, false);
    s = frame.state;
  });

  test("rampMs ≥ rampDurationMs → rampFactor=1 고정 + rampDurationMs=0 으로 ramp 종료", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 999).state;
    s = advanceBreathFrame(s, 2).state; // 1001 > 1000
    assert.equal(s.rampFactor, 1);
    assert.equal(s.rampDurationMs, 0);
  });

  test("rampFactor=0 동안 scaleY=1 (sin * 0 = 0, 1+0=1)", () => {
    const s = startBreath(initialBreathState(), LOOP_BREATH);
    const frame = advanceBreathFrame(s, 16.67);
    // rampFactor 는 16.67/1000 ≈ 0.01667 — 매우 작음 → scaleY ≈ 1
    assert.ok(frame.scaleY > 1 - BREATH_AMPLITUDE);
    assert.ok(frame.scaleY < 1 + BREATH_AMPLITUDE);
  });
});

describe("advanceBreathFrame — sine amplitude", () => {
  test("fade_in 완료 후 scaleY 는 [1-AMP, 1+AMP] 범위 내", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    // fade_in 완료 (rampFactor=1)
    s = advanceBreathFrame(s, 1000).state;
    assert.equal(s.rampFactor, 1);
    let minS = Infinity;
    let maxS = -Infinity;
    // 풀 사이클 관측 (duration 4s → 4000ms 스윕, 40ms 단위).
    for (let i = 0; i < 100; i += 1) {
      const f = advanceBreathFrame(s, 40);
      s = f.state;
      if (f.scaleY < minS) minS = f.scaleY;
      if (f.scaleY > maxS) maxS = f.scaleY;
    }
    assert.ok(minS >= 1 - BREATH_AMPLITUDE - 1e-9, `min ${minS} ≥ ${1 - BREATH_AMPLITUDE}`);
    assert.ok(maxS <= 1 + BREATH_AMPLITUDE + 1e-9, `max ${maxS} ≤ ${1 + BREATH_AMPLITUDE}`);
    // 충분한 진폭 스윕이 있었는지 (단조증가만 아닌)
    assert.ok(maxS - minS > BREATH_AMPLITUDE, "풀 스윕이 관측돼야 함");
  });

  test("duration_sec < 0.5 도 period 는 500ms 미만으로 내려가지 않음", () => {
    const tiny: RendererMotion = { ...LOOP_BREATH, duration_sec: 0.1, fade_in_sec: 0 };
    let s = startBreath(initialBreathState(), tiny);
    // 500ms 사이클 기준 4/1 주기면 phase 2π, scaleY ≈ 1
    let f = advanceBreathFrame(s, BREATH_MIN_PERIOD_MS);
    assert.ok(Math.abs(f.scaleY - 1) < 1e-6, "period floor 가 적용돼 1 cycle 후 scaleY ≈ 1");
    s = f.state;
    // period/4 에서는 sin=1 → scaleY 최댓값 근사
    s = initialBreathState();
    s = startBreath(s, tiny);
    f = advanceBreathFrame(s, BREATH_MIN_PERIOD_MS / 4);
    assert.ok(Math.abs(f.scaleY - (1 + BREATH_AMPLITUDE)) < 1e-6);
  });
});

describe("stopBreath — fade_out 램프", () => {
  test("prev.motion=null → no-op (상태 불변)", () => {
    const initial = initialBreathState();
    const s = stopBreath(initial);
    assert.equal(s, initial);
  });

  test("fade_out_sec>0 → rampDirection='out' + rampMs=0 + rampFactor 보존", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state; // fade_in 완료
    assert.equal(s.rampFactor, 1);
    s = stopBreath(s);
    assert.equal(s.motion, LOOP_BREATH);
    assert.equal(s.rampDirection, "out");
    assert.equal(s.rampDurationMs, 1000);
    assert.equal(s.rampMs, 0);
    assert.equal(s.rampFactor, 1, "stop 직후 rampFactor 는 프리 스톱 값 유지 (jump-cut 방지)");
  });

  test("fade_out_sec=0 → motion 즉시 null, rampFactor=0, 다음 advance 에서 ended=false (이미 종료)", () => {
    const instant: RendererMotion = { ...LOOP_BREATH, fade_out_sec: 0 };
    let s = startBreath(initialBreathState(), instant);
    s = advanceBreathFrame(s, 1000).state;
    s = stopBreath(s);
    assert.equal(s.motion, null);
    assert.equal(s.rampFactor, 0);
    const frame = advanceBreathFrame(s, 16);
    assert.equal(frame.scaleY, 1);
    assert.equal(frame.ended, false, "이미 motion=null 이므로 ended 재신호 없음");
  });
});

describe("advanceBreathFrame — fade_out 진행 + 완료", () => {
  test("fade_out 중간 t=0.5 → rampFactor=0.5 (선형 감소)", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state; // fade_in 완료
    s = stopBreath(s);
    const f = advanceBreathFrame(s, 500);
    assert.ok(Math.abs(f.state.rampFactor - 0.5) < 1e-9);
    assert.equal(f.ended, false);
  });

  test("fade_out 완료 시 ended=true + state.motion=null + scaleY=1", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state;
    s = stopBreath(s);
    // 1000ms 진행 → rampMs=1000, t=1.0 → ended
    const f = advanceBreathFrame(s, 1000);
    assert.equal(f.ended, true);
    assert.equal(f.state.motion, null);
    assert.equal(f.scaleY, 1);
  });

  test("ended=true 이후 advance 는 scale=1 + ended=false (한 번만 신호)", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state;
    s = stopBreath(s);
    s = advanceBreathFrame(s, 1000).state; // ended=true, state.motion=null
    const f = advanceBreathFrame(s, 16);
    assert.equal(f.ended, false);
    assert.equal(f.scaleY, 1);
  });

  test("dt 누적 오버슛 (fade_out 1000ms 인데 dt=1500) → 한 번에 ended 처리", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state;
    s = stopBreath(s);
    const f = advanceBreathFrame(s, 1500);
    assert.equal(f.ended, true);
    assert.equal(f.state.motion, null);
  });
});

describe("advanceBreathFrame — dt 방어", () => {
  test("dt=NaN → dt=0 취급 (상태 elapsedMs 변화 없음, scale 유지)", () => {
    const motion = LOOP_BREATH;
    let s = startBreath(initialBreathState(), motion);
    s = advanceBreathFrame(s, 1000).state;
    const beforeElapsed = s.elapsedMs;
    const f = advanceBreathFrame(s, Number.NaN);
    assert.equal(f.state.elapsedMs, beforeElapsed);
    assert.equal(f.ended, false);
  });

  test("dt<0 → dt=0 취급 (역주행 방지)", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 500).state;
    const before = s.rampFactor;
    s = advanceBreathFrame(s, -200).state;
    assert.equal(s.rampFactor, before, "음수 dt 는 ramp 역진 못함");
  });
});

describe("motion-ticker 통합 — start → sustain → stop 라이프사이클", () => {
  test("fade_in 1s, 4s sustain, fade_out 1s — 끝나면 motion=null", () => {
    let s: BreathState = initialBreathState();
    s = startBreath(s, LOOP_BREATH);
    // fade_in 1s (10 * 100ms)
    for (let i = 0; i < 10; i += 1) s = advanceBreathFrame(s, 100).state;
    assert.equal(s.rampFactor, 1);
    // sustain 4s
    for (let i = 0; i < 40; i += 1) s = advanceBreathFrame(s, 100).state;
    assert.equal(s.rampFactor, 1);
    // stop → fade_out
    s = stopBreath(s);
    for (let i = 0; i < 9; i += 1) s = advanceBreathFrame(s, 100).state;
    assert.ok(s.motion !== null, "9/10 진행이면 아직 ended 아님");
    const last = advanceBreathFrame(s, 100);
    assert.equal(last.ended, true);
    assert.equal(last.state.motion, null);
  });

  test("빠른 motion 전환 — 기존 breath sustain 중에 새 breath 시작하면 fade_in 재시작", () => {
    let s = startBreath(initialBreathState(), LOOP_BREATH);
    s = advanceBreathFrame(s, 1000).state; // fade_in 완료
    assert.equal(s.rampFactor, 1);
    s = startBreath(s, LOOP_FAST_BREATH);
    assert.equal(s.motion, LOOP_FAST_BREATH);
    assert.equal(s.rampFactor, 0, "새 motion 의 fade_in 은 0 에서 재시작");
    assert.equal(s.rampDurationMs, 500, "새 motion 의 fade_in_sec 반영");
  });
});
