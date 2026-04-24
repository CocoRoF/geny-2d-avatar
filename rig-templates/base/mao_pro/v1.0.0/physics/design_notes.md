# Mao Pro (Nijiiro) Physics Design Notes

이 프리셋은 3rd-party wrapper 이므로 physics 구조는 원본 Live2D Inc./Nijiiro Mao Pro 의
`physics3.json` 을 그대로 보존하며, snake_case 정규화만 수행한다.

- parameter_id: Cubism 표준 ID → snake_case 변환 (상위 template.manifest.cubism_mapping 참조)
- PhysicsSetting 수: 원본 그대로
- normalization / vertices / input / output 구조: schema 변환 없이 1:1

derived preset (halfbody/v1.3.0 등) 의 `mao_pro_mapping.md` 와는 성격이 다르다 —
여기는 "원본 그대로", 거기는 "원본을 참고해서 재구성한 매핑".
