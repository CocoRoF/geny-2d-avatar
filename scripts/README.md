# scripts/

개발·CI 보조 스크립트. 실행 환경은 **Node 22.11+**.

2026-04-24 P0.3.1 — OFF-GOAL 스크립트 10 여종 `archive/scripts/` 로 이동 (구 β 관측 스택 + 마이그레이터 + mock-vendor). 현 스코프에 필요한 것만 유지.

| 파일 | 목적 |
|---|---|
| `validate-schemas.mjs` | `schema/v1/*.schema.json` 로드(Ajv 2020) + rig-templates 전수검증 + samples/avatars 의 license/provenance 서명 + bundle.json sha 교차확인. `checked=244 failed=0`. |
| `test-golden.mjs` | **17 단계** 골든 회귀 러너 (스키마 1 + CLI 번들 골든 3 + 패키지 테스트 13). 루트 `pnpm run test:golden` 진입. P0.2 에서 30+ 단계 → 17 단계로 축소. |
| `sign-fixture.mjs` | Ed25519 서명/검증 헬퍼. RFC 8032 §7.1 Test 1 공개 테스트 벡터로 signer_key_id=`geny.fixture.rfc8032-test1`. 라이선스·증명서 샘플 서명에 사용. |
| `rig-template/rig-template-lint.mjs` | rig 템플릿 무결성 lint (C1~C14 rule). 프리셋 추가 검증 필수. |
| `rig-template/rig-template-lint.test.mjs` | lint 규칙 회귀. 공식 프리셋 clean + 변조 네거티브. |

루트 `package.json` 의 scripts 에서 호출:

```bash
pnpm run validate:schemas       # = node scripts/validate-schemas.mjs
pnpm run test:golden            # = node scripts/test-golden.mjs
```

`Taskfile.yml` (go-task) 도 얇은 래퍼로 제공 (`task validate:schemas`).

## Phase 1 이후 신설 예정

- `scripts/rig-template/extract-atlas.mjs` — `.moc3` 파싱 → atlas slots 자동 추출 (P1.1)
- `scripts/rig-template/extract-from-moc3.mjs` — parameters/deformers/parts/physics/pose 일괄 추출 (P1.1)
