# @geny/web-editor-logic

`geny-2d-avatar` Foundation 에디터의 **공용 UX 로직** — 파츠 카테고리 분류 + 파츠↔파라미터
필터 규칙의 단일 진실 공급원. `apps/web-editor` 의 `index.html` 인라인 스크립트와
`scripts/e2e-check.mjs` 가 **같은 dist 를 공유** 하여 drift 를 구조적으로 제거한다.

## 현재 상태 (세션 89 → 세션 107)

- ✅ **`categoryOf(role)`** — role prefix 규칙 기반 Face/Hair/Body/Accessory 4 카테고리
  분류 (세션 89). `docs/09 §4.3` UX 카테고리 정의의 유일한 구현체.
- ✅ **`categorize(parts)`** — role 기반으로 파츠 배열을 카테고리 Map 으로 묶고
  `slot_id` 오름차순 정렬 (deterministic). 사이드바 그룹 빌더.
- ✅ **`parametersForPart(part, parameters)`** — 선택된 파츠 기준 파라미터 서브셋 필터
  (세션 95, 계약 확정 세션 98, opt-in 세션 100~107). `parameter_ids` 명시 ≻ substring
  매칭 ≻ 카테고리별 group whitelist 3-단 우선순위.
- ✅ **`CATEGORY_ORDER` / `GROUPS_FOR_CATEGORY` / `OVERALL_GROUP`** — 사이드바 정렬
  순서 / 카테고리별 파라미터 그룹 / overall group id 상수.

## 사용 예

```ts
import {
  categoryOf,
  categorize,
  parametersForPart,
  CATEGORY_ORDER,
  type PartLike,
  type ParameterLike,
} from "@geny/web-editor-logic";

// 파츠 카테고리 분류
const groups = categorize(meta.parts);
for (const cat of CATEGORY_ORDER) {
  const items = groups.get(cat) ?? [];
  // <ul>: Face · 16 / Hair · 5 / Body · 7 / Accessory · 2 ...
}

// 파츠 선택 시 파라미터 서브셋
const subset = parametersForPart(selectedPart, meta.parameters);
// parameter_ids 가 명시됐으면 그것, 아니면 role substring, 아니면 group whitelist.
```

## API

### `categoryOf(role: string): Category`

Role prefix 를 검사해 `"Face" | "Hair" | "Body" | "Accessory" | "Other"` 반환. `Other`
는 **빈 카테고리 불변식 (세션 89 D1)** — 공식 템플릿에서 role 이 `Other` 로 떨어지면
e2e-check.mjs 가 assertion 실패.

| 카테고리 | 매칭 규칙 |
|---|---|
| **Face** | `eye_` / `brow_` / `mouth_` / `face_` prefix, 또는 `nose`, `cheek_blush`. |
| **Hair** | `hair_` prefix, 또는 `ahoge` (세션 104 halfbody v1.3.0 추가). |
| **Body** | `arm_` / `cloth_` prefix, 또는 `torso` / `neck` / `body` / `limb` / `clothing`. |
| **Accessory** | `accessory_` prefix, 또는 `accessory`. |
| **Other** | 위에 매칭되지 않는 role — **공식 템플릿에는 없어야 함**. |

### `categorize<P extends PartLike>(parts: readonly P[]): Map<Category, P[]>`

`categoryOf` 로 파츠를 묶고, 각 그룹을 `slot_id` 오름차순으로 정렬. 반환 Map 은
insertion order 보존 (ES2015+). 사이드바는 `CATEGORY_ORDER` 순회 후 미포함 키를
추가하는 패턴으로 decoration.

### `parametersForPart<P extends ParameterLike>(part: PartLike | null, parameters: readonly P[]): P[]`

선택된 파츠 기준 파라미터 서브셋 반환. **3-단 우선순위** (세션 98 계약 확정):

1. **`part.parameter_ids` 명시** (세션 100~107 opt-in) — 해당 id 매칭 + `overall` group
   파라미터를 항상 append. `parameter_ids: []` 은 **"overall-only 명시"** 시맨틱 —
   명시적으로 파츠 전용 파라미터가 없다는 선언 (세션 95 D2 / 98 D2).
2. **role substring 매칭** (legacy) — parameter `id` 가 `role` 을 포함하면 매치.
   `eye_left` role → `eye_left_blink_open` 등. overall 파라미터 append.
3. **카테고리별 group whitelist** (폴백) — `GROUPS_FOR_CATEGORY[categoryOf(role)]`
   + `OVERALL_GROUP`. Face → `face/eyes/brows/mouth`, Hair → `hair` 등.

`part === null` 이면 전체 파라미터 반환 (선택 해제).

### 타입

```ts
type Category = "Face" | "Hair" | "Body" | "Accessory" | "Other";

interface PartLike {
  readonly role: string;
  readonly slot_id: string;
  readonly parameter_ids?: readonly string[];  // 세션 98 opt-in
}

interface ParameterLike {
  readonly id: string;
  readonly group: string;
}
```

### 상수

- `CATEGORY_ORDER` — `["Face", "Hair", "Body", "Accessory"]` (Other 제외, UX 표시 순서).
- `GROUPS_FOR_CATEGORY` — 카테고리별 파라미터 group id 배열. 폴백 3단계에서 사용.
- `OVERALL_GROUP` — `"overall"` — 파츠 선택 상관 없이 항상 포함되는 group id.

## 소비자

- **`apps/web-editor/index.html`** — 사이드바 그룹 빌더 + 파츠 선택 → Inspector 파라미터
  패널 재빌드 (세션 89/90/95).
- **`apps/web-editor/scripts/e2e-check.mjs`** — `runCategorize` + `parametersForPart`
  서브셋 카디널리티 어서션 (세션 87/95).
- **향후 `@geny/web-editor-renderer` 확장** — 파츠 선택 시 파라미터 슬라이더를 Preview
  오버레이로 띄우려면 동일 필터 규칙을 재사용.

## 빌드 / 테스트

```bash
pnpm -F @geny/web-editor-logic build      # tsconfig.build.json → dist/
pnpm -F @geny/web-editor-logic test       # dist-test/ + node --test
```

테스트: `categoryOf` 공식 5 템플릿 role 전수 / `categorize` 정렬 / `parametersForPart` 3-단
우선순위 각 브랜치. 공식 템플릿 role → Other 0 개 불변식이 e2e-check.mjs 와 패키지
테스트 양쪽에서 고정.

## 참고 문서

- [docs/09 §4.3](../../docs/09-ui-flow.md) — Face/Hair/Body/Accessory UX 카테고리 정의.
- [progress/sessions/2026-04-20-session-89-web-editor-logic.md](../../progress/sessions/2026-04-20-session-89-web-editor-logic.md) — 패키지 분리 배경.
- [progress/sessions/2026-04-20-session-95-parameter-view-filter.md](../../progress/sessions/2026-04-20-session-95-parameter-view-filter.md) — `parametersForPart` 도입.
- [progress/sessions/2026-04-20-session-98-parameter-bindings-explicit.md](../../progress/sessions/2026-04-20-session-98-parameter-bindings-explicit.md) — `parameter_ids` 명시 계약 확정.
