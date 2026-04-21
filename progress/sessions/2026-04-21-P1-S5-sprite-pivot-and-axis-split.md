# P1-S5 — sprite pivot + Cubism 축 분리 (2026-04-21)

## 1. 트리거

P1-S4 commit (`3829ffd`) 직후, 사용자 재확인 "특히 실제 비즈니스적 측면이 전부
제대로 반영되어야 해" 를 받고 P1-S4 의 산출물을 **실 데모 경로** 관점에서 재검토.

Explore agent 로 parameter_ids 엔드투엔드 배선을 추적한 결과 **데이터 배선은 이미
완결** 이었다:

- `packages/web-avatar/src/types.ts#WebAvatarPart.parameter_ids` 존재
- `rig-templates/halfbody-v1.3.0/parts/*.spec.json` 에 parameter_ids 실제 기입
  (face_base: `head_angle_x/y/z`, ahoge: `ahoge_sway`, hair_side_l: `hair_side_sway_l/fuwa_l`,
  neck: `head_angle_x/y/z + body_breath*`)
- `apps/web-editor/public/sample/halfbody/bundle.json` atlas.slots = 30 실 UV
- `web-editor-logic/src/category.ts#parametersForPart` 가 part.parameter_ids 있으면
  그 id 들만 필터링 — Inspector 가 바인드된 슬라이더만 노출하는 계약

하지만 **시각 정확성** 에 두 축 버그가 남아있어 Mock 데모 체감이 깨졌다:

1. **Sprite pivot 버그** — `sprite.anchor` 기본값 (0, 0) = top-left. rotation 이
   sprite 좌상단 꼭지점을 축으로 돌아 "코너 orbit" 처럼 보임. head_angle_z 슬라이더
   움직이면 face_base 가 귀엽게 tilt 되는 게 아니라 엉뚱한 호를 그림.
2. **Cubism 3 축 collapse** — `transformFromParameter` 가 모든 `*angle*` 을 Z rotation
   으로 매핑. 실 Cubism 규칙은 x=pitch / y=yaw / z=roll 인데 세 슬라이더가 시각적으로
   똑같이 "회전" 만 해서 사용자가 축 구분을 못 함.

두 축 모두 β 제품 데모에서 "슬라이더 움직이면 자연스럽게 파츠가 반응" 계약을
직접 깨는 문제. 자율 범위 내 (외부 블로커 없음) 이므로 즉시 해소.

## 2. 산출물

### 2.1 Sprite anchor → 중심 피벗 (pixi-renderer.ts#buildSpriteScene)

- `sprite.anchor.set(0.5, 0.5)` 추가.
- `sprite.position` 을 sprite 중심점으로 재계산:
  - before: `(originX + frame.x * fit, originY + frame.y * fit)` = top-left.
  - after: `(originX + (frame.x + frame.width/2) * fit, originY + (frame.y + frame.height/2) * fit)` = center.
- `partEntries.set(slot_id, { obj: sprite, baseX: centerX, baseY: centerY })`
  도 center 기준으로 저장 — setPartTransform 의 offsetX/Y delta 가 baseline
  중심에서 가산되므로 의미가 자연스럽다.
- Fallback Graphics 경로는 변경 없음 — Graphics 의 local 원점이 이미 (0,0) 이고
  `g.position.set(cx, cy)` 로 셀 중심에 배치되므로 rotation 이 셀 중심 피벗으로
  이미 정상 작동.

### 2.2 Cubism 3 축 분리 (pixi-renderer.ts#transformFromParameter)

- 체크 순서를 **specific 먼저** 로 재배치:
  - `*angle_x*` → `{ offsetY: value * 0.4 }` (pitch/끄덕임 → 수직 이동 Mock).
  - `*angle_y*` → `{ offsetX: value * 0.4 }` (yaw/좌우 돌림 → 수평 이동 Mock).
  - `*angle_z*` 또는 x/y suffix 없는 generic `*angle*` → `{ rotation: degToRad(value) }`
    (roll/기울임 — 실 2D 회전).
  - `*sway*` / `*shake*` → `{ offsetY: value * 12 }` (정규화 -1..1).
  - `*offset_x*` / `*position_x*` → `{ offsetX: value * 12 }`.
  - 그 외 → null.
- 스케일 근거: angle range [-30, 30] deg, 0.4 px/deg → 최대 ±12px.
  sway/shake range [-1, 1], 12 px/unit → 최대 ±12px. preview canvas ≈ 320px
  기준 3.75% 로 subtle 하면서도 명확 관찰 가능.
- 주석에 Cubism 실 규칙 (x=pitch, y=yaw, z=roll) + 2D sprite 공간에 Z 회전밖에
  없는 이유 + β P3+ 실 asset 합류 시점에 데이터 기반 매핑으로 치환할 TODO 명시.

### 2.3 테스트 갱신 + 추가

`tests/pixi-renderer.test.ts`:

- **기존 P1-S4 테스트 1 (`parameter_ids 를 가진 파츠만 per-part`)** — head_angle_x
  는 이제 rotation 이 아니라 offsetY 로 매핑되므로 slot binding 을 `head_angle_z`
  로 변경. rotation = π/6 검증 유지. 의도는 같음 (per-part binding 이 root 를
  skip 하는지).
- **기존 P1-S4 테스트 5** — slot 이 rotationParameter 와 같은 id (head_angle_x)
  에 바인드됐을 때 root 는 여전히 skip 되는지 검증. assertion 을 offsetY=6 (15deg
  × 0.4) 로 갱신 + 테스트 타이틀을 "rotationParameter 와 동일해도 root fallback
  은 skip" 으로 리네이밍해 의도를 명확화.
- **신규 P1-S5 테스트 (Cubism 3 축 분리)** — 한 meta 에 `head_angle_x/y/z` 3
  파라미터 + 같은 slot 바인드. 3 번 parameterchange 발사 후 각각의 transform
  이 offsetY / offsetX / rotation 로 **서로 다른 축** 을 가졌는지 명시 검증.

31/31 pass (기존 30 + 신규 1).

## 3. 판단 근거

- **왜 angle_x 를 offsetY 로?** 3D pitch 는 2D 에선 표현 불가. 사람이 고개를
  앞으로 숙이면 시각적으로 얼굴이 약간 아래로 내려온 것처럼 보인다 (원근 축소).
  Mock 단계에서 offsetY 가 가장 직관적. "얼굴이 시야에서 아래로" = 끄덕임.
- **왜 angle_y 를 offsetX 로?** 같은 논리. yaw 는 좌우 돌림. Mock 으로 offsetX
  가 자연스럽다.
- **왜 angle_z 를 rotation 으로?** roll 은 실 Z 회전. 2D sprite 에 1:1 매핑 가능.
- **왜 scale 0.4 (=12/30)?** angle range 의 절대값 최대 (30) 에서 offset 이 12px
  이 되도록. 스케일이 작으면 시각 반응이 미미해 "반응 안 하는 것 같다" 는 느낌,
  크면 부자연스러움. 12px 은 P1-S4 의 sway 스케일과 동일해 축 간 일관성.
- **왜 anchor 0.5?** rotation 은 거의 항상 중심 피벗이 자연스럽다. 상단 파츠
  (hair, ahoge) 의 경우 머리 위 어딘가가 진짜 피벗이어야 하지만 그 정보 (pivot
  x/y) 는 현재 atlas UV 에 없다. 중심 피벗은 최소 "회전하는 것처럼 보이는"
  기본값. 실 pivot 필드는 β P3+ 에 atlas 확장으로 추가 예정.
- **왜 test 1 을 head_angle_z 로 옮겼나?** 테스트의 원 의도는 "per-part transform
  이 호출되고 rotation 축이 정확히 매핑됨" 이었다. 새 heuristic 에선 head_angle_x
  가 더이상 rotation 을 만들지 않으므로 assertion 을 유지하려면 id 를 바꿔야.
  test 5 는 의도가 "root fallback skip" 이었으므로 heuristic 변경과 무관 — id
  유지하고 assertion 만 갱신.

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer-pixi build` → OK.
- `pnpm --filter @geny/web-avatar-renderer-pixi test` → 31 pass / 0 fail.
- `pnpm -r test` → 17 패키지 633 tests (P1-S4 대비 +1 축 분리 테스트), 0 fail.

## 5. 알려진 한계

- **실 pivot 정보 없음**: hair/ahoge 같은 상단 파츠는 머리 위 어딘가가 진짜 회전
  피벗인데 현재 atlas 에는 pivot 좌표가 없다. 모든 파츠가 sprite 중심을 피벗으로
  써서, head tilt 시 hair 가 살짝 어긋나 보일 수 있음. β P3+ 에 atlas 에
  `pivot_uv` 필드 추가 후보.
- **angle_x/y 의 offset Mock 은 원근감 없음**: 실 Cubism 은 pitch 시 얼굴이 찌그러지기도
  하는데 (텍스처 distortion), 현재는 단순 translation 뿐. deformer 기반 warp 는
  β P3+ 실 Cubism mini-engine 합류 시점.
- **offset 누적 없음**: 같은 parameter 에 두 번 parameterchange 가 오면 나중 값만
  반영. 여러 파라미터가 같은 축을 건드리면 서로 덮어쓴다 (예: angle_x 와 sway
  둘 다 offsetY 를 건드림). 실 Cubism 은 delta 합성이지만 Mock 단계는 latest-wins.
  실제 사용 패턴에선 한 번에 한 슬라이더만 움직이므로 체감은 괜찮다.

## 6. 다음 후보 (β P1-S6+ / P2-S2+)

1. **Mock Generate 가 실 per-slot 색상을 담은 atlas 텍스처를 만드는지 검증**
   (P1-S2+P2-S1 에서 구현했지만 P1-S5 관점에서 재확인 필요).
2. **sample manifest atlas.textures[0] 실 PNG 교체** — 현재 4×4 placeholder 로는
   per-part 시각 효과가 안 보임. Mock Generate 없이도 데모가 시각적으로 의미 있게.
3. **P2-S2 Mock 품질 개선** — 얼굴 구성요소별 그라데이션 색 규칙 + 아바타처럼 보이는
   배치.
4. **P2-S3 pill timing 측정** — prompt submit → canvas swap latency 숫자화.
5. **sprite pivot atlas 확장** — atlas.slots 에 pivot_uv 추가 후 sprite.anchor 를
   UV 기반으로 설정.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P1-S4-per-part-parameter-binding.md`
- 소스: `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`
- 테스트: `packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts`
- 샘플 번들: `apps/web-editor/public/sample/halfbody/bundle.json` (atlas 30 슬롯)
- rig 스펙: `rig-templates/halfbody-v1.3.0/parts/*.spec.json`
