/**
 * β P1-S11 — expression blink 의 alpha fade ramp 를 순수 함수로 분리.
 *
 * P1-S3 에서 `defaultCreateApp.setExpression` closure 안에 있던
 * "root.alpha 를 fade_in_sec 동안 선형 램프" 로직을 DOM/pixi 의존성 없이 node:test
 * 로 회귀 고정. P1-S10 (motion-ticker) 의 twin — 동일 패턴.
 *
 * **왜 분리?** 기존 closure 구현은
 *   1) 매 `setExpression` 호출마다 새 blinkCallback 을 ticker 에 add.
 *      → 빠르게 연속 호출 시 여러 callback 이 쌓여 root.alpha 쟁탈전이 발생 (경합).
 *   2) 각 callback 의 `startAlpha = root.alpha` 가 다른 callback 의 중간값을
 *      집어 올려 jump-cut 같은 시각 glitch 로 이어질 수 있다.
 *   3) 램프 공식(`startAlpha + (target-startAlpha) * t`) 자체를 단위 테스트로
 *      고정하지 못해, 누군가 선형을 ease-out 으로 바꿔버리면 "표정 전환이 딱딱
 *      끊긴다" 는 β 감성 회귀를 사전에 잡을 수 없다.
 *
 * 순수 함수로 분리하면 렌더러는 **단일 state** 를 들고 `advanceExpressionFrame`
 * 만 호출. `setExpressionTarget` 은 현재 alpha 에서 새 target 으로 부드럽게
 * 인계 — 중간 전환에서도 jump-cut 없음. 각 단계는 node:test 로 회귀 고정.
 */

import type { RendererExpression } from "@geny/web-avatar-renderer";

/**
 * expression 램프 진행 상태. 렌더러가 프레임마다 보관하고 `advanceExpressionFrame`
 * 으로 교체. pure function 이므로 입력 state 는 불변.
 */
export interface ExpressionState {
  /** 현재 target expression. null = 중립 (resting alpha). */
  readonly expression: RendererExpression | null;
  /** 현재 표시 alpha (0..1). 렌더러가 `root.alpha` 에 바로 쓰는 값. */
  readonly alpha: number;
  /** 현재 램프의 출발 alpha. rampMs=0 시점의 alpha 와 동일. */
  readonly startAlpha: number;
  /** 현재 램프의 목표 alpha. */
  readonly targetAlpha: number;
  /** 현재 램프 경과 ms. */
  readonly rampMs: number;
  /** 현재 램프 총 길이 ms. 0 이면 settled (램프 없음). */
  readonly durationMs: number;
}

export interface ExpressionFrame {
  /** 다음 프레임에 사용할 상태. 입력 state 를 mutate 하지 않음. */
  readonly state: ExpressionState;
  /** root.alpha 로 바로 쓸 값. settled 상태면 state.alpha 와 동일. */
  readonly alpha: number;
  /**
   * 이번 프레임에 램프가 방금 settled 됐음. 렌더러는 이 플래그로 ticker.remove.
   * ended=true 인 프레임의 state 는 durationMs=0 (재진입 방지).
   */
  readonly ended: boolean;
}

/** 램프 최소 길이 ms. fade_in_sec=0 이 들어와도 이 아래로 내려가지 않아 "번쩍" 방지. */
export const EXPRESSION_MIN_DURATION_MS = 60;
/** 표정 활성 시 목표 alpha. β 는 1 (완전 불투명). */
export const EXPRESSION_ACTIVE_ALPHA = 1;
/** 중립(resting, expression=null) 의 목표 alpha. 미세 dim 으로 "표정 해제" 를 시각화. */
export const EXPRESSION_NEUTRAL_ALPHA = 0.95;
/** expression=null 전환 시 기본 fade 시간 (sec). `RendererExpression` 자체가 없으므로 상수. */
export const EXPRESSION_NEUTRAL_FADE_SEC = 0.15;

/**
 * 초기 상태 — expression=null, alpha=1 (활성), durationMs=0 (settled).
 * 렌더러가 `defaultCreateApp` 초기화 직후에 사용.
 */
export function initialExpressionState(): ExpressionState {
  return {
    expression: null,
    alpha: EXPRESSION_ACTIVE_ALPHA,
    startAlpha: EXPRESSION_ACTIVE_ALPHA,
    targetAlpha: EXPRESSION_ACTIVE_ALPHA,
    rampMs: 0,
    durationMs: 0,
  };
}

/**
 * 새 target expression 설정. 현재 alpha 에서 target alpha 로 선형 램프 시작.
 *
 * - expression 제공 → targetAlpha=1, duration=expression.fade_in_sec (min 60ms).
 * - expression=null → targetAlpha=0.95, duration=EXPRESSION_NEUTRAL_FADE_SEC (150ms).
 *
 * 중간 램프에서 재호출돼도 현재 alpha 에서 다시 출발 — jump-cut 없음. 동일
 * target 으로 재호출되면 램프가 리셋돼 duration 만큼 재진행 (시각 변화는
 * 미미하지만 일관성 유지).
 */
export function setExpressionTarget(
  prev: ExpressionState,
  expression: RendererExpression | null,
): ExpressionState {
  const fadeInSec = expression ? expression.fade_in_sec : EXPRESSION_NEUTRAL_FADE_SEC;
  const durationMs = Math.max(EXPRESSION_MIN_DURATION_MS, (fadeInSec || 0) * 1000);
  const targetAlpha = expression ? EXPRESSION_ACTIVE_ALPHA : EXPRESSION_NEUTRAL_ALPHA;
  return {
    expression,
    alpha: prev.alpha,
    startAlpha: prev.alpha,
    targetAlpha,
    rampMs: 0,
    durationMs,
  };
}

/**
 * dt ms 만큼 램프 진행. settled (durationMs<=0) 면 state 그대로 반환 + ended=false.
 * 램프 완료 시 ended=true 를 한 번 신호하고, 상태를 settled 로 수렴 (다음 호출부터
 * ended=false).
 */
export function advanceExpressionFrame(
  prev: ExpressionState,
  dtMs: number,
): ExpressionFrame {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;

  if (prev.durationMs <= 0) {
    return { state: prev, alpha: prev.alpha, ended: false };
  }

  const rampMs = prev.rampMs + dt;
  const t = Math.min(1, rampMs / prev.durationMs);
  const alpha = prev.startAlpha + (prev.targetAlpha - prev.startAlpha) * t;

  if (t >= 1) {
    return {
      state: {
        expression: prev.expression,
        alpha: prev.targetAlpha,
        startAlpha: prev.targetAlpha,
        targetAlpha: prev.targetAlpha,
        rampMs: 0,
        durationMs: 0,
      },
      alpha: prev.targetAlpha,
      ended: true,
    };
  }

  return {
    state: {
      expression: prev.expression,
      alpha,
      startAlpha: prev.startAlpha,
      targetAlpha: prev.targetAlpha,
      rampMs,
      durationMs: prev.durationMs,
    },
    alpha,
    ended: false,
  };
}
