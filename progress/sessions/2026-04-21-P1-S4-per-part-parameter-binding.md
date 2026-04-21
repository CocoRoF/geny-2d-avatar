# P1-S4 — parts 별 파라미터 바인딩 (2026-04-21)

## 1. 트리거

P1-S3 (motion/expression pixi 바인딩) commit 직후 자율 iteration. 세션 doc
`2026-04-21-P1-S3-motion-expression-binding.md §7` 이 꼽은 다음 후보 중 상단:
**parameter id → sprite 단위 바인딩**. 현재 pixi 는 `rotationParameter`(기본
`head_angle_x`) 하나를 root 컨테이너 전체 회전에 적용 — 30 파츠 전부가 같이
돌아간다. rig 스펙상 `head_angle_x` 는 5 개 파츠(head/eyes/mouth/brows/ahoge)
에만 바인드돼야 하지만, 렌더러 레이어는 그 매핑을 모른다.

외부 블로커 없음. `WebAvatarPart.parameter_ids` 는 이미 세션 118 이후 번들에
실려 있고 (`web-avatar/src/bundle.ts`), 단지 렌더러 contract 가 이 축을 아직
expose 하지 않았을 뿐.

## 2. 산출물

### 2.1 `@geny/web-avatar-renderer` contract 확장

- `src/contracts.ts#RendererPart` 에 optional `parameter_ids?: readonly string[]`
  필드 추가. 주석으로 β P1-S4 도입 + `WebAvatarPart.parameter_ids` 동일성 + 빈
  배열/undef 의미("어떤 parameter 변화에도 반응 안 함") 기록.
- `isRendererBundleMeta` 타입 가드는 **변경 없음** — 새 필드가 optional 이므로
  기존 가드 로직이 그대로 통과. guard 는 "존재성 + 타입" 만 검사하고 range
  순서 등 값 범위는 schema validator 에 귀속 (ADR 0002).
- Null/Logging renderer 는 parameter_ids 축을 읽지 않음 (기존 대로 id/value
  쌍만 로깅) — scope 밖.

### 2.2 `@geny/web-avatar-renderer-pixi` per-part binding

- `src/pixi-renderer.ts` — 5 축 확장:
  - `PixiPartTransform` 인터페이스 신설 — `{rotation?, offsetX?, offsetY?}`.
    모든 필드 optional, 축 미제공 필드는 이전 값 유지 (실 Cubism warp/rotation
    디포머의 최소 Mock 대응).
  - `PixiAppHandle.setPartTransform(slot_id, transform)` 메서드 추가.
  - `paramToSlots: Map<string, string[]>` 역색인 — `captureBundle` 시 meta 를
    순회해 재구성. 같은 parameter 를 여러 파츠가 공유하면 모두 색인.
  - `onParameterChange` 리라우팅 로직:
    - `paramToSlots.get(detail.id)` 로 바인드된 슬롯 조회.
    - 있으면 `transformFromParameter(id, value)` 로 변환 축 계산 후 각 슬롯에
      `app.setPartTransform(slot, transform)` 호출 (root setRotation 은 skip).
    - 없으면 기존 `rotationParameter` fallback 으로 root `setRotation` (demo
      편의 유지).
  - `transformFromParameter` — 이름 기반 휴리스틱:
    - `*angle*` → `rotation: degToRad(value)`.
    - `*sway*` / `*shake*` → `offsetY: value * 12`.
    - `*offset_x*` / `*position_x*` → `offsetX: value * 12`.
    - 그 외 → `null` (setPartTransform 미호출).
    실 Cubism 은 parameter_id → deformer_id → 축이 데이터 기반 매핑이지만, β
    단계에선 번들에 deformer 메타가 없어 이름 기반으로 대체. 실 asset 합류
    (β P3+) 에 데이터 기반 매핑으로 교체 예정.

### 2.3 `defaultCreateApp` Mock 실 구현

- `partEntries: Map<slot_id, {obj, baseX, baseY}>` — rebuild 마다 재생성.
  `obj` 는 sprite 또는 Graphics, `baseX/baseY` 는 baseline 좌표 (rotation=0,
  offset=0 기준).
- `buildSpriteScene` 에서 sprite 생성 직후 `partEntries.set(slot_id, {obj:
  sprite, baseX, baseY})` 등록. `buildFallbackScene` 도 Graphics 대상으로 동일.
- `rebuild()` 시작에 `partEntries.clear()` — 재-rebuild 시 stale entry 누적
  방지.
- return 블록에 `setPartTransform(slot_id, transform)` 구현: entry 조회 →
  `transform.rotation` 있으면 `entry.obj.rotation` 갱신, `offsetX/Y` 는
  `entry.obj.position.set(baseX + dx, baseY + dy)` 로 baseline 대비 델타 적용.

### 2.4 회귀 테스트 5 건 추가

`tests/pixi-renderer.test.ts`:

1. **per-part 바인딩 만 호출 + root rotation skip** — `head_slot` 이 `head_angle_x`
   에 바인드된 meta 로 parameterchange=30deg → `setPartTransformCalls[0] = {slot_id:
   "head_slot", transform: {rotation: π/6}}` 확인 + `rotationCalls.length = 0`.
2. **sway → offsetY 매핑** — `ahoge_slot` 이 `ahoge_sway` 에 바인드됐을 때 value=0.5
   → offsetY=6 (0.5 * 12).
3. **바인드된 파츠 없으면 root rotation fallback** — 기존 sampleMeta (parameter_ids
   없음) 는 head_angle_x 에 root setRotation 으로 fallback 유지.
4. **다수 파츠 공유** — 같은 파라미터에 2 파츠가 바인드되면 setPartTransform 이
   2 번 호출 (순서 보존).
5. **매칭 안 되는 파라미터 (body_breath)** → setPartTransform 미호출 + count 는
   증가 (paramToSlots 엔트리 없어서 전체 if 블록 skip 되지만 parameterChangeCount
   는 그 앞에서 이미 증가).

MockApp 에 `setPartTransformCalls: Array<{slot_id, transform}>` 추가로 검증 지점
확보. 기존 27 테스트 전부 리그레션 없음.

## 3. 판단 근거

- **왜 parameter_ids 를 optional 로 추가?** RendererPart 는 Null/Logging/Structure
  renderer 가 쓰는 최소 duck-typed 계약. 필수 필드로 올리면 모든 구현체가 bundle
  생성 시 parameter_ids 를 요구하게 돼 호환성 깨진다. optional + 빈 배열/undef
  의미 명시로 기존 소비자 영향 0.
- **왜 이름 기반 휴리스틱?** 번들 wire format 은 `unit` 필드가 이미 strip 돼 있고
  (schema validator 계약), deformer 메타는 β 단계에 없다. schema 를 늘리면 golden
  regeneration + migrator 영향까지 번져 scope 이탈. 이름 휴리스틱은 실 asset 없는
  P1~P2 구간 Mock 으로 충분하고, P3+ 실 asset 합류 시점에 데이터 기반 매핑으로
  치환할 것임을 주석에 박아둠.
- **왜 root rotation fallback 을 유지?** 기존 demo (`head_angle_x` slider 로
  전체 회전) 가 sampleMeta (parameter_ids 없음) 번들에서 계속 동작해야 web-editor
  의 기존 슬라이더 테스트가 깨지지 않는다. 바인드된 파츠가 있으면 per-part 로
  진입하고 fallback 은 skip, 없으면 root 회전 — 두 경로 공존.
- **왜 offsetX/Y 스케일을 12px 로?** sway/shake 파라미터는 정규화 [-1, 1] 이고,
  β preview canvas 는 ~320px 고정. 12px ≈ 3.75% 는 subtle 하면서 육안 관찰 가능.
  실 값은 P3+ 실 curve 가 오면 대체.
- **root 컨테이너 회전 중첩 문제?** sprite 는 이미 root 의 자식이고 root 에
  `setRotation` 이 걸리면 모든 자식이 돌아간다. 현재 per-part rotation 은
  sprite 의 local rotation 으로만 설정돼, root 회전은 여전히 coarse 하게 전체에
  걸린다. "head_angle_x 가 binding 된 파츠" 에 한해선 root rotation fallback 이
  skip 되므로 중첩은 없다. 다만 parameter_ids 미지정 + rotationParameter 인
  케이스는 여전히 root 전체 회전 — 이는 demo 용 경로로 의도적으로 남겨둠.

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer build` → OK.
- `pnpm --filter @geny/web-avatar-renderer-pixi build` → OK (dependency 재빌드
  필요했음 — contracts 새 필드를 참조하므로).
- `pnpm --filter @geny/web-avatar-renderer-pixi test` → 30 pass / 0 fail.
- `pnpm -r test` → 17 패키지 632 tests, 0 fail (job-queue-bullmq 는 31 중 26 만
  실행 — redis 없는 환경에서 5 건 skip, 이전 세션과 동일).

## 5. 알려진 한계

- **web-editor 에 parameter_ids 주입 경로 없음**. `<geny-avatar>` 는 bundle 을
  `web-avatar/src/bundle.ts` 에서 로드하면서 이미 parameter_ids 를 meta 에 포함
  시키지만, web-editor 샘플 번들 (`rig-templates/halfbody-v1.3.0`) 의 manifest
  에 parameter_ids 가 박혀 있는지는 이번 세션 범위 밖. 만일 비어있다면
  per-part binding 은 **실행은 되지만 실 효과는 fallback 경로로만 보인다**.
  P1-S5 후보: 샘플 manifest 에 parameter_ids 삽입 (Head 파츠에 head_angle_x 등).
- **휴리스틱 한계**: `body_breath` 같은 정규화된 non-axial 파라미터는 축 매핑이
  null 이라 per-part binding 이 무시된다. 본 세션 테스트 4 에서 명시 검증. 실
  curve 합류 (β P3+) 에 해결.
- **root rotation 중첩**: parameter_ids 미지정 + rotationParameter 히트 파라미터
  는 여전히 root 전체 회전. demo 편의 우선.
- **offsetX/Y 단위**: 12px 는 preview canvas 가 ~320px 라는 가정. 다른 스크린
  사이즈에선 작아/커 보일 수 있음. P1-S5 에서 stage width 기반 상대화 후보.

## 6. 다음 후보 (β P1-S5+)

1. **web-editor 샘플 manifest parameter_ids 주입** — per-part binding 을 실제로
   볼 수 있게. parts 별 rig 스펙(`progress/notes/rig-parameter-binding.md` 등)
   과 크로스체크 필요.
2. **atlas.slots 실 UV 채우기** — 현재 atlas.slots 가 빈 배열이라 fallback
   grid 만 보인다. Mock atlas 라도 4~5 슬롯 UV 를 깔아야 per-part rotation 이
   "얼굴이 기울어짐" 으로 시각화됨.
3. **parameter_ids 에 데이터 기반 axis 추가** (RendererPart 에 `axis:
   "rotation"|"offsetX"|"offsetY"` optional) — 이름 휴리스틱 졸업.
4. **P2-S2 Mock 품질 개선** — prompt→preview live swap 의 얼굴 구성요소 단계
   (기존 PLAN §0 에 언급).
5. **P2-S3 pill timing 측정** — prompt submit → canvas swap latency 숫자화.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P1-S3-motion-expression-binding.md`
- ADR 0007 Option E Decision: `progress/adr/0007-renderer-technology.md#decision`
- RendererPart 원본 계약: `packages/web-avatar-renderer/src/contracts.ts`
- WebAvatarPart.parameter_ids wire: `packages/web-avatar/src/bundle.ts`
