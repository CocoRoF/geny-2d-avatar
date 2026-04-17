# packages/

재사용 라이브러리. 여러 앱/서비스에서 공유되는 코드.

| 디렉터리 | 언어 | 역할 | 관련 docs |
|---|---|---|---|
| `exporter-core/` | TypeScript | 결정론적 Cubism 번들 변환 (`@geny/exporter-core`) | 11 §3 |
| `sdk-ts/` | TypeScript | 공식 TS SDK — API 클라이언트, 타입(from `schema/`) | 12 |
| `sdk-py/` | Python | 공식 Py SDK — 파이프라인/내부 통신 | 05, 12 |
| `web-avatar/` | TypeScript (Web Components) | `@geny/web-avatar` 런타임 | 11 §4 |
| `unity-sdk/` | C# | Unity 통합 패키지(`geny-unity`) | 11 §5 |
| `schema-codegen/` | TypeScript | `schema/` JSON Schema 에서 Zod/Pydantic 생성 | 13 §3.3 |
| `rig-core/` | TypeScript + Python 포트 | 파츠 조립·앵커 정합·검수 렌더 공통 로직 | 06, 07, 08 |

Foundation 단계에서는 폴더와 README 만 존재. 실제 패키지는 각 세션에서 필요 시 생성.
현재 실제 구현이 있는 패키지: `exporter-core/` (세션 08).
