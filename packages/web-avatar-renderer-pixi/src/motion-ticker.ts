/**
 * β P1-S10 — breath motion 의 fade ramp + amplitude 계산을 순수 함수로 분리.
 *
 * P1-S3 에서 pixi-renderer `defaultCreateApp` 의 ticker callback closure 안에
 * 있던 breath (loop=true) 의 "sine scale.y × fade_in/out 램프" 로직을 DOM/pixi
 * 의존성 없이 node:test 로 회귀 고정하기 위해 추출. 실 ticker 는 이제 얇은
 * wrapper — 순수 함수로 `advanceBreathFrame` 을 호출하고 결과를 `root.scale`
 * 에 적용한다.
 *
 * **왜 분리?** 기존엔 "fade_in 시작 0, 끝 1" "fade_out 시작 1, 끝 0" 같은 claims
 * 을 브라우저 수동 관찰로만 확인. 이 공식이 바뀌면 breath 가 갑자기 끊기거나
 * 돌연 max 진폭으로 시작해 "아바타가 살아있다" 는 β 인상을 깨뜨릴 수 있다.
 * 순수 함수로 분리하면 dt 기반 램프 진행 / scale.y 의 sin 공식 / 0 fade 즉시
 * 전환 등 세부 동작을 9+ node:test 로 회귀 고정 가능.
 */

import type { RendererMotion } from "@geny/web-avatar-renderer";

/**
 * breath 의 진행 상태. 렌더러가 프레임마다 보관하고 `advanceBreathFrame` 에
 * 넘긴 후 반환된 상태로 교체한다. pure function 이므로 입력 state 는 불변.
 */
export interface BreathState {
  /** 현재 재생 중인 motion. null 이면 breath 없음 — `advance` 는 ended=true 반환. */
  readonly motion: RendererMotion | null;
  /** motion 시작 이후 누적 ms (sine phase 계산용). fade_out 중에도 계속 증가. */
  readonly elapsedMs: number;
  /** 현재 ramp (fade_in 또는 fade_out) 시작 이후 경과 ms. ramp 없으면 사용 안 함. */
  readonly rampMs: number;
  /** 현재 ramp 총 길이 ms. 0 이면 ramp 완료 (또는 fade 값이 0). */
  readonly rampDurationMs: number;
  /** ramp 방향. "in"=진폭 0→1, "out"=진폭 1→0. */
  readonly rampDirection: "in" | "out";
  /** 현재 진폭 배수 (0..1). sine scale 에 곱해짐. */
  readonly rampFactor: number;
}

export interface BreathFrame {
  /** 다음 프레임에 사용할 상태. 입력 state 를 mutate 하지 않음. */
  readonly state: BreathState;
  /** root.scale.y 로 바로 쓸 배수. motion=null 이거나 ended 직후면 1.0. */
  readonly scaleY: number;
  /**
   * ramp_out 이 방금 완료됐음. renderer 는 이 플래그로 ticker.remove / motion=null
   * 처리. ended=true 인 프레임의 state.motion 은 이미 null.
   */
  readonly ended: boolean;
}

/** sine scale.y 의 최대 진폭 (±4 %). β 는 subtle 하게 숨쉬듯 보이기만. */
export const BREATH_AMPLITUDE = 0.04;
/** duration_sec 바닥값. 0/음수로 설정돼도 500ms 미만으로 가지 않게 클램프. */
export const BREATH_MIN_PERIOD_MS = 500;

/**
 * 초기 `BreathState` — motion=null. renderer 의 breath ticker 미장착 상태.
 */
export function initialBreathState(): BreathState {
  return {
    motion: null,
    elapsedMs: 0,
    rampMs: 0,
    rampDurationMs: 0,
    rampDirection: "in",
    rampFactor: 0,
  };
}

/**
 * motion 이 starts/stops 될 때 호출. null 입력 → fade_out 시작. loop=true motion
 * 입력 → fade_in 시작. loop=false 는 "breath 로 잡지 않음" 으로 state 불변 반환
 * (실 curve 는 β P3+).
 *
 * fade 값이 0/음수면 ramp 즉시 완료 (rampFactor 최종값 설정 + rampDurationMs=0).
 * 기존 loop 이 이미 활성 중에 같은 motion 이 다시 오면 fade_in 램프 재시작
 * (누적 elapsedMs 는 리셋).
 */
export function startBreath(
  prev: BreathState,
  motion: RendererMotion,
): BreathState {
  if (!motion.loop) return prev;
  const rampDurationMs = Math.max(0, (motion.fade_in_sec || 0) * 1000);
  return {
    motion,
    elapsedMs: 0,
    rampMs: 0,
    rampDurationMs,
    rampDirection: "in",
    rampFactor: rampDurationMs === 0 ? 1 : 0,
  };
}

/**
 * motion=null 입력에 해당 — fade_out 시작. prev.motion 이 null 이면 no-op (이미
 * 꺼진 상태). fade_out_sec=0 인 motion 해제는 한 프레임에 완료 (`ended` 는
 * 다음 advanceBreathFrame 에서 감지).
 */
export function stopBreath(prev: BreathState): BreathState {
  const motion = prev.motion;
  if (!motion) return prev;
  const rampDurationMs = Math.max(0, (motion.fade_out_sec || 0) * 1000);
  if (rampDurationMs === 0) {
    return {
      motion: null,
      elapsedMs: 0,
      rampMs: 0,
      rampDurationMs: 0,
      rampDirection: "out",
      rampFactor: 0,
    };
  }
  return {
    motion,
    elapsedMs: prev.elapsedMs,
    rampMs: 0,
    rampDurationMs,
    rampDirection: "out",
    rampFactor: prev.rampFactor,
  };
}

/**
 * dt ms 만큼 breath 프레임 진행. state.motion=null 이면 scale=1 + ended=false
 * (static resting). ramp 가 진행중이면 rampMs/rampDurationMs 보간 → rampFactor.
 * ramp_out 완료 시 state.motion=null + ended=true. sine phase 는 elapsedMs 로
 * 계속 진행 (fade_out 중에도 호흡 주기 유지).
 */
export function advanceBreathFrame(prev: BreathState, dtMs: number): BreathFrame {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;

  // motion 없음 — ticker 가 바깥에서 꺼졌거나 초기 상태. scale 1, ended 안 알림.
  if (!prev.motion) {
    return { state: prev, scaleY: 1, ended: false };
  }

  let rampMs = prev.rampMs;
  let rampDurationMs = prev.rampDurationMs;
  let rampFactor = prev.rampFactor;
  const rampDirection = prev.rampDirection;

  if (rampDurationMs > 0) {
    rampMs = prev.rampMs + dt;
    const t = Math.min(1, rampMs / rampDurationMs);
    rampFactor = rampDirection === "in" ? t : 1 - t;
    if (t >= 1) {
      rampDurationMs = 0;
      rampFactor = rampDirection === "in" ? 1 : 0;
      if (rampDirection === "out") {
        // fade_out 완료 — ended 신호 + motion 제거.
        return {
          state: {
            motion: null,
            elapsedMs: 0,
            rampMs: 0,
            rampDurationMs: 0,
            rampDirection: "out",
            rampFactor: 0,
          },
          scaleY: 1,
          ended: true,
        };
      }
    }
  }

  const elapsedMs = prev.elapsedMs + dt;
  const periodMs = Math.max(BREATH_MIN_PERIOD_MS, prev.motion.duration_sec * 1000);
  const phase = (elapsedMs / periodMs) * Math.PI * 2;
  const amplitude = BREATH_AMPLITUDE * rampFactor;
  const scaleY = 1 + Math.sin(phase) * amplitude;

  return {
    state: {
      motion: prev.motion,
      elapsedMs,
      rampMs,
      rampDurationMs,
      rampDirection,
      rampFactor,
    },
    scaleY,
    ended: false,
  };
}
