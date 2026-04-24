# Session 13b — CI Node 20.11 → 22.11 pin bump

- **Date**: 2026-04-18
- **Workstreams**: Platform / Infra
- **Type**: Hotfix (세션 12/13 commits push 후 CI 실패 발견)
- **Previous**: 세션 13 — bundle.json 매니페스트 (commit `50d2a42`)
- **Commit**: `f331022`

---

## 1. 증상

세션 12 (`048384e`) 와 세션 13 (`50d2a42`) push 후 `ci` 워크플로우 (ubuntu-latest) 의 "Golden regression" 단계 실패:

```
Could not find '/home/runner/work/geny-2d-avatar/geny-2d-avatar/packages/exporter-core/dist-test/tests/**/*.test.js'
```

`test:golden` 4 단계 중 2단계 (`exporter-core tests`) 에서만 실패. 1·3·4 단계는 정상.

## 2. 원인

`packages/exporter-core/package.json` 의 test 스크립트:

```json
"test": "pnpm build:test && node --test --test-reporter=spec 'dist-test/tests/**/*.test.js'"
```

- 쿼트된 glob 패턴을 쉘이 전개하지 못하므로 node 가 직접 glob 해석 필요.
- **Node 20 의 `node --test` 는 positional glob 을 지원하지 않는다.** `**/*.test.js` 가 리터럴 경로로 해석 → 매칭 파일 0 개 → "Could not find" 에러.
- Node `--test` 의 glob 지원은 Node 21 에서 추가, Node 22 LTS 에서 안정화.

로컬은 Node 25.9.0 이라 glob 전개 정상, CI 에서만 재현.

세션 10/11 당시엔 dist-test 경로 구조가 달랐거나 테스트 수가 적어 우연히 다른 방식으로 동작했을 가능성. 본질적으로 이미 취약했던 설정이 세션 12/13 에서 노출.

## 3. 수정

| 파일 | 변경 |
|---|---|
| `.github/workflows/ci.yml` | `node-version: 20.11.0` → `22.11.0` |
| `.github/workflows/validate-schemas.yml` | `node-version: 20.11.0` → `22.11.0` |
| `.nvmrc` | `20.11.0` → `22.11.0` |
| `package.json` (root) | `engines.node: ">=20.11.0"` → `">=22.11.0"` |
| `packages/exporter-core/package.json` | 동일 |

Node 22.x 는 현재 active LTS, 2027-04 까지 maintenance. Node 24 시 재평가.

## 4. 검증

- Push 후 GitHub Actions 재실행: `ci` 워크플로우 19초 green, `validate-schemas` 20초 green.
- 로컬 `pnpm run test:golden` — 4단계 76 tests pass (변경 없음).

## 5. 후속

- **GitHub Actions 자체의 Node.js 20 deprecation 경고**: `actions/checkout@v4` 등 내부에서 Node 20 런타임 사용 중. 2026-09-16 이후 Node 24 로 자동 이전. 지금 대응 불필요, but 세션 18+ 에서 `actions/*` 최신 버전 확인 권장.

## 6. 교훈

- CI 와 로컬 Node 버전 drift 는 silent 실패 → `.nvmrc` + `engines.node` 를 정렬해서 최소한 `nvm use` 하는 개발자는 일관된 버전.
- `node --test` 는 Node 메이저 간 피쳐 격차가 큼. 쿼트된 glob 대신 명시 파일 열거(`find ... -exec`) 로도 회피 가능 (세션 13b 에서는 선택하지 않음 — Node 22 LTS bump 가 단일 config 변경으로 끝나므로).
