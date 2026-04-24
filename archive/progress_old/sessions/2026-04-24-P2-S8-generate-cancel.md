# P2-S8 — Generate 취소 (AbortController) + cleanup

**날짜**: 2026-04-24
**Phase**: β P2 (프롬프트 UI + Mock e2e) — S8 (취소 + 정리)
**산출물**: `@geny/web-editor-logic/generate-cancel` 순수 모듈 + 36 node:test + index.html wire-through

---

## 왜 필요한가?

β §7 예산은 5000ms. Mock 만 쓰는 지금도, P3 (실 nano-banana) 합류하면 벤더 호출이 느려질 때 사용자가 **즉시 빠져나갈 수 있어야** 한다. "Cancel 누르고 새 프롬프트로 다시 Generate" 시나리오는 베타 UX 기본 — 지금 기반을 깔아야 P3 에서 "fetch 취소 어떻게?" 를 미루지 않는다.

- 기존 runGenerate 는 start→success/fail 두 경로만. 중간에 사용자가 못 멈춤.
- 브라우저 `AbortController` 는 네이티브로 쓰되, **주변 상태 기계** (언제 요청 → 언제 실제로 throw → 어느 reason) 는 pure function 으로 분리해 node:test 로 회귀.

## 모듈 계약 (`generate-cancel.ts`)

```ts
type CancelReason = "user" | "timeout_budget" | "navigation" | "internal";
type CancelStatus = "idle" | "requested" | "aborted";

interface CancelSnapshot {
  status: CancelStatus;
  reason: CancelReason | null;
  requestedAt: number | null;
}

initialCancelState(): CancelSnapshot
requestCancel(prev, reason, at): CancelSnapshot         // idle → requested, 중복 ignore
markAborted(prev): CancelSnapshot                        // requested → aborted
isCancelRequested(state): boolean                        // requested | aborted
cancelStopReason(state): string | null                   // "canceled_by_<reason>"
isAbortError(err): boolean                               // name/code/message 다중 감지
cancelCheckpoint(state): void                            // throw AbortError if requested
cancelReasonPriority(reason): number                     // user < timeout < navigation < internal
```

## 핵심 설계 결정

### 상태 기계 불변성

`CancelSnapshot` 은 전부 readonly, 전이는 새 객체. runGenerate 안에서 `currentCancelState = requestCancel(currentCancelState, ...)` 로 mutate 하는 것처럼 보이지만 내부적으로 이전 상태는 불변. 원본을 뮤테이트하지 않음을 테스트로 회귀 고정.

### 중복 cancel 은 첫 reason 유지

타이밍이 미세한 경합 상황을 가정:
- budget timer 가 4999ms 에 발화 → `requestCancel(s, "timeout_budget", 4999)`
- 사용자가 5001ms 에 버튼 클릭 → `requestCancel(s, "user", 5001)`

두 번째 호출은 이미 requested 상태이므로 **reason 을 덮어쓰지 않는다**. 첫 요청자가 metric label 에 남음. 이렇게 하지 않으면 "budget 초과라서 멈춘 건지, 사용자가 누른 건지" 가 race condition 으로 뒤섞인다.

### `cancelCheckpoint` throw 포맷

`DOMException("aborted:<reason>", "AbortError")` 우선, 없으면 `Error` 에 `name="AbortError"` 부여. 둘 다 `classifyGenerateFailure` 에 의해 `kind="canceled"` 으로 분류 — `shouldRetry` 가 `canceled_by_user` stopReason 으로 즉시 종료. 즉 **기존 retry 로직과 완전 호환**.

### AbortController 는 UI 층에서만

pure 모듈은 `CancelSnapshot` 만 다룸. 실제 `AbortController.abort()` 호출은 index.html 의 `requestCancelNow(reason)` 에서 — fetch/XHR 을 중단하는 네이티브 기능은 브라우저 전용이므로 pure 모듈이 래핑하지 않음. 이 경계가 테스트를 depth-독립적으로 만든다.

## index.html wire-through

```js
let currentCancelState = null;
let currentAbortController = null;

async function runGenerate() {
  // ... guards ...
  setGenerating(true);                                      // Generate btn hide, Cancel btn show
  currentCancelState = initialCancelState();
  currentAbortController = new AbortController();
  const getCancelState = () => currentCancelState;

  try {
    while (true) {
      try {
        await runGenerateAttempt(prompt, atlas, t0, phaseMs, getCancelState);
        break;
      } catch (err) {
        if (isCancelRequested(currentCancelState)) {
          currentCancelState = markAborted(currentCancelState);
        }
        const failure = classifyGenerateFailure(err);
        const decision = shouldRetry({ ... });
        if (!decision.retry) throw err;
        // backoff 대기도 cancel 가능 — AbortSignal abort 이벤트로 조기 깨움
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, decision.backoffMs);
          currentAbortController.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
    }
  } catch (err) {
    const wasCanceled = isCancelRequested(currentCancelState);
    if (wasCanceled) {
      genStatusEl.textContent = `✗ 취소됨 (${currentCancelState.reason})`;
      emit metrics { stopReason: "canceled_by_user", lastFailureKind: "canceled" };
    } else {
      // 기존 error 경로 유지
    }
  } finally {
    currentCancelState = null;
    currentAbortController = null;
    setGenerating(false);                                   // UI 복구
  }
}

cancelBtn.addEventListener("click", () => requestCancelNow("user"));
window.addEventListener("beforeunload", () => requestCancelNow("navigation"));
```

`runGenerateAttempt` 는 phase 경계마다 `cancelCheckpoint(getCancelState())` 를 호출 — phase 1 입장, phase 1 완료 후, phase 2 완료 후, phase 3 완료 후, phase 5 완료 후 총 5 지점에서 취소 상태 체크. 취소 시 즉시 AbortError throw.

## 테스트 회귀 (36)

```
▶ initialCancelState — 3: status/reason/null 초기값
▶ requestCancel — 6: idle→requested, 모든 reason, 중복 유지, 불변성
▶ markAborted — 3: requested→aborted, idle 무시, idempotent
▶ isCancelRequested — 3: idle/requested/aborted
▶ cancelStopReason — 4: idle=null, reason 별 label
▶ isAbortError — 7: name/code/message/primitive/null 방어
▶ cancelCheckpoint — 4: idle no-op, requested throw, reason 메시지 포함
▶ cancelReasonPriority — 2: user 최우선
▶ end-to-end 시나리오 — 4: phase 중간 cancel / race condition / 리셋 / AbortError 포맷 호환

Total: 191 (기존 155 + P2-S8 36). Pass 191/191.
```

또한:
- web-editor e2e 통과 (halfbody + fullbody, 기존 시나리오 회귀 없음).
- pixi 83/83 회귀 없음 (motion + expression ticker 무관).

## 다음 단계

- **P2 phase 종료 후보**: S1~S8 완료 시 Phase P2 검수 ("Mock 벤더로 프롬프트→프리뷰 5초 내 완결") 자동 충족 확인.
- **P4-S2** 후보: `planSlotGenerations` 결과를 runGenerate 에 wire — 카테고리별 N 개 Mock 호출 시뮬레이션 + 진행 UI.
- **P3** (BL-VENDOR-KEY 대기): AbortController.signal 을 fetch 에 그대로 전달.

## 커밋

`feat(P2-S8): Generate 취소 AbortController + cancel 상태 기계 + 36 회귀`.
