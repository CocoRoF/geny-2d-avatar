# scripts/

개발·CI 보조 스크립트. 실행 환경은 **Node 22.11+** 또는 Python 3.12+. (Node 20 은
`node --test` positional glob 미지원 — 세션 13b.)

| 파일 | 목적 |
|---|---|
| `validate-schemas.mjs` | `schema/v1/*.schema.json` 로드(Ajv 2020) + rig-templates 전수검증 + samples/avatars 의 license/provenance 서명 + bundle.json sha 교차확인. `checked=131 failed=0`. |
| `test-golden.mjs` | 5-step 골든 회귀 러너. (1) 스키마, (2) exporter-core 단위테스트(88), (3) Cubism 번들 CLI diff, (4) avatar 번들 CLI diff, (5) web-avatar 번들 CLI diff. 루트 `pnpm run test:golden` 으로 호출. CI 진입점. |
| `sign-fixture.mjs` | Ed25519 서명/검증 헬퍼. RFC 8032 §7.1 Test 1 공개 테스트 벡터로 signer_key_id=`geny.fixture.rfc8032-test1`. 라이선스·증명서 샘플 서명에 사용 (세션 14). |
| `rig-template/migrate.mjs` | rig 템플릿 버전 마이그레이션 (`v1.0.0 → v1.1.0 → v1.2.0`). ADR 0003. |

루트 `package.json` 의 scripts 에서 호출 가능:

```bash
pnpm run validate:schemas       # = node scripts/validate-schemas.mjs
pnpm run test:golden            # = node scripts/test-golden.mjs
```

`Taskfile.yml` (go-task) 도 얇은 래퍼로 제공한다 (`task validate:schemas`).
