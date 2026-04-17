# samples/

리포지토리 차원에서 **데이터 계약(스키마)** 이 실제로 채워진 예시를 보관한다. 아래 원칙을 따른다.

- **목적**: 스키마 일관성 회귀 · 에디터/SDK 테스트 픽스처 · 문서 인라인 예시의 단일 출처.
- **민감 정보 금지**: 샘플은 모두 공개 저장소에 커밋 가능해야 한다. 실제 이미지 key 가 필요한 경우 허구 ULID 와 공개 더미 key 만 사용.
- **경로 규약**:
  - `samples/avatars/sample-NN-{slug}.avatar.json` — `schema/v1/avatar-metadata.schema.json` 인스턴스.
  - 향후: `samples/part_instances/`, `samples/style_profiles/` 등.
- **검증**: `scripts/validate-schemas.mjs` 가 `samples/avatars/` 를 walk 하여 스키마·템플릿 참조 정합을 체크한다. 실패 시 CI red.
- **번호 규약**: `sample-01`, `sample-02` … 단순 증가. 슬러그는 모델 이름 또는 시나리오를 식별하는 짧은 단어.

현재 번들:

| # | 파일 | 의도 | 스키마 |
|---|---|---|---|
| 01 | `avatars/sample-01-aria.avatar.json` | draft 상태 최소 필드 avatar — Foundation 회귀 픽스처. | `avatar-metadata.schema.json` |
