# 세션 103 — `parameter_ids` 번들 전파 (wire-through 복구)

**날짜**: 2026-04-20
**커밋**: (이 세션)
**스트림**: Rig & Parts + Data + Pipeline + Frontend (4 축 교차)

## 1. 문제 — 세션 100/101/102 UX narrow 가 에디터에 닿지 않는다

세션 98 이 `part-spec.schema.json` 에 optional `parameter_ids: string[]` 을 도입했고, 세션 100/101/102 에서 29 파츠(halfbody v1.3.0 18 + fullbody v1.0.0 25, 중복 포함) 에 opt-in 을 선언했다. 세션 95 `@geny/web-editor-logic/parametersForPart` 는 Rule 0 (explicit `parameter_ids`) 우선 소비 로직을 갖추고 있다 (세션 98 추가). 세션 99 C11 은 CI 에서 id drift 를 차단한다.

그런데 실 에디터에서 "부츠를 선택하면 `foot_l_angle` 슬라이더가 나온다" 같은 narrow 효과가 실제로 적용되는지 최종 검증하는 과정에서 근본적 wire-through 누락을 발견했다:

- `schema/v1/web-avatar.schema.json` `parts[].properties` 가 `slot_id`/`role` 만 선언, `additionalProperties: false` → **번들 스키마가 구조적으로 `parameter_ids` 거부**
- `packages/exporter-core/src/converters/web-avatar.ts` `WebAvatarPart` 인터페이스가 `{ slot_id, role }` 만, 변환 로직도 `parameter_ids` 미복사
- `packages/web-avatar/src/types.ts` 도 동일
- 결과: exporter 가 template.parts 의 `parameter_ids` 를 **읽지도 복사하지도 않음** → 번들 `meta.parts[]` 에 필드 부재 → 에디터가 `bundle.meta.parts` 에서 `part.parameter_ids` 를 조회하지만 항상 `undefined` → `parametersForPart` 의 Rule 0 가 타지 못하고 Rule 1 (substring) / Rule 2 (category-group fallback) 만 작동

실질적으로 **세션 100/101/102 의 opt-in 선언은 physics-lint C11 + 테스트 경로 외에서는 데드 코드**였다. `sample-02-zoe-fullbody.bundle.snapshot.json` 같은 기존 golden 에도 `parameter_ids` 문자열 0회 출현 — 전파가 없음을 간접 증명.

세션 100/101/102 에서 자랑스럽게 "L4 골든 sha256 0 바이트 변화 3차 실증" 이라고 적어둔 불변식은 **의도된 디커플링이 아니라 wire-through 누락의 부작용**이었다. ADR 0005 L4 는 "exporter-core 는 `parameter_ids` 를 미소비" 라고 쓸 게 아니라 "exporter 가 template 의 UI 메타를 번들로 복사하지 않는다" 였다면 맞는 말이지만, UX 계약이 번들을 통해 전달되려면 이 가정 자체가 틀렸다.

## 2. 수정 — 4 지점 wire-through

(1) **스키마** `schema/v1/web-avatar.schema.json` `parts[].items` 에 optional `parameter_ids` 추가 (uniqueItems, string minLength 1). `required` 는 유지 — missing 이 허용(backward-compat, Rule 0 미선언 = substring/category-group fallback).

(2) **exporter-core 타입** `packages/exporter-core/src/loader.ts` `PartSpec` 에 `parameter_ids?: readonly string[]` 추가 (기존 `[key: string]: unknown` index signature 위에 타입 안전성 확보). `packages/exporter-core/src/converters/web-avatar.ts` `WebAvatarPart` 에 동일 필드 추가.

(3) **exporter-core 변환 로직** `convertWebAvatar` 의 parts map 에서 `Array.isArray(p.parameter_ids)` 가드 후 `[...p.parameter_ids]` 로 복사 (미선언 파츠는 필드 자체 생략 — `additionalProperties: false` 충돌 회피 + "undefined = 명시 없음" 의미 보존).

(4) **web-avatar 타입** `packages/web-avatar/src/types.ts` 의 `WebAvatarPart` 도 미러.

## 3. 검증

- exporter-core tests 96→**98 pass** (+2 회귀):
    - fullbody v1.0.0 → 25 파츠 `parameter_ids` 전파 (leg_l=`["leg_l_angle","leg_sway_l"]`, foot_l=`["foot_l_angle"]` 샘플 명시 검증)
    - halfbody v1.2.0 → 모든 파츠에서 `parameter_ids` 필드 생략 (v1.2.0 은 opt-in 없음)
- web-avatar tests 20/20 불변 (타입만 확장)
- web-editor-logic tests 57/57 불변 (로직 0 변경)
- physics-lint tests 17/17 불변
- halfbody v1.2.0 web-avatar-bundle golden **0 바이트 변화** (v1.2.0 spec 에 `parameter_ids` 부재 → 번들도 부재, 정확히 예상대로 동작)
- `golden` 29/29 pass
- `git diff --stat samples/` 빈 결과 — 기존 Cubism 번들 (zoe 포함) 도 `parameter_ids` 영향 없음 (Cubism 파이프라인은 web-avatar 변환기와 별개)

**실측 wire-through 확인** (fullbody v1.0.0 assembleWebAvatarBundle 출력):

```
parts total: 38 with parameter_ids: 25
leg_l: {"parameter_ids":["leg_l_angle","leg_sway_l"],"role":"limb","slot_id":"leg_l"}
foot_l: {"parameter_ids":["foot_l_angle"],"role":"limb","slot_id":"foot_l"}
neck: {"parameter_ids":["head_angle_x","head_angle_y","head_angle_z","body_breath","body_breath_phys"],"role":"neck","slot_id":"neck"}
```

세션 102 에서 주장했던 "leg_l_angle/foot_l_angle 신규 노출" 이 이제 **실 에디터 번들에 반영**된다 — fullbody 에 한해. halfbody 는 editor prepare.mjs 가 여전히 v1.2.0 을 사용(세션 104 후보) 이라 UX 변화 없음, 그러나 v1.3.0 를 명시 호출하면 18 파츠 opt-in 이 즉시 작동한다.

## 4. 주요 결정축

**D1 — 사후 pivot 정당화**: 세션 103 원래 후보였던 "legacy v1.0.0~v1.2.0 opt-in 복제 vs migrator 확장" 은 wire-through 부재 상황에선 선후 관계가 잘못됐다. 파이프라인 중간이 끊어진 상태에서 입력 데이터를 복제/이식해도 출력에 반영되지 않는다. wire-through 를 먼저 닫는 것이 논리적 선행 조건.

**D2 — 번들 스키마 vs 저작 스키마 분리 원칙 유지**: `part-spec.schema.json` (저자) 과 `web-avatar.schema.json` (번들 소비자) 는 별개 계약이다. 저자가 선언한 `parameter_ids` 를 번들에 그대로 복사하는 것은 스키마 결합이 아니라, **저자의 UI 의도(에디터가 해석할 메타데이터) 가 소비자 계약에 포함되어야 함** 을 명시. 이는 `motion_packs`/`expression_packs`/`parameter_groups` 가 이미 번들로 전파되는 패턴과 동형.

**D3 — 미선언 파츠는 필드 자체 생략**: `parameter_ids: []` 과 `parameter_ids` 미존재는 시맨틱이 다르다 (세션 98 D2). 전자 = "overall-only 명시 선언", 후자 = "명시 없음 → Rule 1/2 fallback". `additionalProperties: false` + optional field 조합으로 이 구분이 번들 스키마까지 보존된다.

**D4 — readonly array → spread copy**: TypeScript `readonly string[]` 입력을 `[...p.parameter_ids]` 로 가변 배열 복사 후 저장. 입력 템플릿 객체를 공유하지 않음으로써 assemble 후 저자 쪽 mutation 이 이미 생성된 번들에 leak 되지 않음 (기존 `motions`/`expressions` 복사 패턴과 일치).

**D5 — L4 "불변식" 재해석**: 세션 100/101/102 에서 주장했던 "L4 sha256 0 바이트 변화" 는 wire-through 가 닫힌 시점부터 **변경**된다 — exporter-core 는 이제 `parameter_ids` 를 소비(복사)한다. ADR 0005 L4 의 "번들 재현성" 은 여전히 유지되지만(같은 입력 → 같은 번들), "parameter_ids 는 번들에 영향 0" 주장은 폐기. 세션 103 이후 새 avatars golden 을 재생성해야 한다면 **의도된 변경** 으로 커밋 메시지에 명시.

실제로는 기존 golden 은 halfbody v1.2.0 + Cubism avatars 만 있고 둘 다 v1.2.0 파트 spec (parameter_ids 미사용) 기반이라 **금번 커밋도 sha256 drift 0** 이다. L4 drift 는 halfbody v1.3.0 또는 fullbody v1.0.0 golden 이 추가될 때 처음 발생할 것. 기존 claims 은 세션 104+ 에서 재해석 필요.

**D6 — legacy v1.0.0~v1.2.0 opt-in 복제 연기**: wire-through 가 닫혀도 legacy halfbody 버전은 editor 기본값이 v1.2.0 이기 때문에 UX narrow 를 누리려면 (a) legacy 에 opt-in 복제 또는 (b) editor prepare.mjs 를 v1.3.0 으로 bump 가 필요. 세션 104 에서 별도 판단 — (b) 가 더 좋아 보이지만 e2e 카디널리티 고정값(29→30) / ahoge 처리 확인 필요.

## 5. 결과 요약

| 축 | 변화 |
|---|---|
| web-avatar.schema.json | parts items 에 optional `parameter_ids` 허용 (+11 줄) |
| exporter-core PartSpec | `parameter_ids?: readonly string[]` 필드 추가 (+1 줄) |
| exporter-core WebAvatarPart | 동일 필드 추가 + 변환 로직 spread copy (+6 줄) |
| web-avatar types | 동일 필드 추가 (+1 줄) |
| exporter-core tests | 96→98 pass (+2 회귀) |
| 모든 기존 tests / golden | 불변 (halfbody v1.2.0 spec 에 parameter_ids 부재) |
| 실 효과 | fullbody v1.0.0 번들에서 25 파츠 `parameter_ids` 전파 확인 (세션 101/102 opt-in 이 비로소 에디터 도달 가능) |

## 6. 다음 세션 후보

- **세션 104 후보**: editor prepare.mjs halfbody v1.2.0 → v1.3.0 bump. 선행: e2e-check.mjs 카디널리티 업데이트(halfbody Face=16/Hair=**5**(+ahoge)/Body=7/Accessory=2 = 30 parts). ahoge 파츠가 `categoryOf("hair_front")` 로 정확히 Hair 로 분류되는지 확인. halfbody v1.3.0 의 18 파츠 opt-in (세션 100+102) 이 실 에디터에 도달.
- **세션 105 후보**: legacy halfbody v1.0.0~v1.2.0 opt-in 복제 vs migrator 확장 — 원래 세션 103 후보였던 이슈. editor bump 후 v1.2.0 이 쓰이지 않게 되면 이 문제는 자연 해소될 수도 있음(v1.0.0~v1.1.0 는 어차피 editor 연결 없음). 단 exporter 소비자가 legacy 를 직접 쓰는 경로(외부 SDK 통합 등)가 생기면 재부상. docs/03 §12.1 freeze 정책 재검토.
- **C12 후보**: `deformers.json` warp/rotation 노드 ↔ `parameters.json` 교차 검증. Runtime 전환(세션 97 후보) 착수 전 방어망 1단계 승격.
