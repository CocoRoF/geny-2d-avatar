# scripts/

개발·CI 보조 스크립트. 실행 환경은 Node 20+ 또는 Python 3.12 로 가정.

| 파일 | 목적 |
|---|---|
| `validate-schemas.mjs` | `schema/v1/*.schema.json` 및 예제의 형식/유효성 검증 (Ajv) |

스크립트는 `Taskfile.yml` 을 통해 호출되도록 한다 (`task validate` 등).
