# 세션 70 — CI 3-lane 복구 + BullMQ `:` 제약 반영 스키마 narrow

**일자**: 2026-04-19
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3.2 (idempotency_key → jobId passthrough 계약)
**선행 세션**: 64~69 (6 연속 red — 본 세션에서 일괄 복구)

---

## 1. 문제

**증상**: 세션 64 merge 이후 Foundation CI 의 3 lane 이 연속 red.

- **golden regression** — 세션 64 이래 red. 아무도 알아채지 못한 채 7 세션(64~69) 통과.
- **secret scan (gitleaks)** — 세션 64 이래 red. 오탐 누적.
- **bullmq-integration** — 세션 69 신설 lane, 첫 런부터 red (체인 1회도 녹색 없음).

**왜 알아채기 어려웠나**:

1. 로컬은 dist 캐시가 남아 있어 `pnpm run test:golden` 이 pass — CI lean runner 와 상태 분리.
2. 세션 64~69 commits 은 각각 자기 workstream (queue metrics / Helm / concurrency / duration / CI lane) 에 집중, 전체 CI status 확인을 놓침.
3. `gitleaks` 오탐은 사람 눈으로는 false-positive 라 인지했지만 CI 적색 해소는 별건으로 밀렸음.

세션 69 가 bullmq-integration lane 을 신설하면서 red 가 3 → 1 이 아니라 **3 lane 전부 red** 가 되자 본 세션에서 포괄 조사.

---

## 2. 원인 분석

### 2.1 golden lane — dist 누락 cascade

1. `scripts/test-golden.mjs` step 19 `runWorkerGenerateTests` 가 `@geny/orchestrator-service` 만 빌드한 뒤 `@geny/worker-generate` 를 tsc 로 돌림. **세션 63** 에서 worker-generate 가 `@geny/job-queue-bullmq` 를 deps 로 추가했으나 golden 스크립트가 그 dist 빌드를 추가하지 않음 → `TS2307 Cannot find module '@geny/job-queue-bullmq'`.
2. step 20 `runPerfHarnessSmoke` 는 `apps/worker-generate/dist/index.js` 를 직접 import. `test` 스크립트는 `dist-test/` 만 만들어 `ERR_MODULE_NOT_FOUND`.

로컬은 앞선 세션의 `dist/` 캐시가 남아 있어 문제없이 돌아감.

### 2.2 golden lane — `job-store.test.ts` drain `.unref()` flake

`packages/job-queue-bullmq/tests/job-store.test.ts` drain 테스트의 orchestrate 콜백:

```ts
orchestrate: async (task) => {
  await new Promise((ok) => setTimeout(ok, 20).unref?.());
  return sampleOutcome(task);
},
```

`.unref?.()` 로 unref 된 timer 가 이 테스트의 **유일한 pending work**. CI lean runner 는 이 timer 가 혼자 남은 순간 프로세스 조기 종료 → 이후 5 테스트가 `Promise resolution is still pending but the event loop has already resolved` 로 연쇄 실패 (총 6 fail).

로컬은 stdio 버퍼 등 다른 work 가 event loop 를 살려놔 재현 안 됨. runtime 차이에 의존하는 게 원인.

### 2.3 secret-scan (gitleaks) — fixture key 오탐

RFC 8032 Test 1 공개 벡터로 서명된 샘플 문서가 `signature: "ed25519:<b64url>"` 형식이라 `generic-api-key` 룰이 엔트로피 오탐. 문서 경로 3종이 allowlist 누락 상태:

- `packages/license-verifier/README.md` — CLI 예제 출력.
- `scripts/README.md` — `sign-fixture.mjs` 사용례.
- `progress/sessions/*.md` — `trust=fixture` 세션 로그.

실키는 소스/설정 파일 allowlist 로 이미 걸러지므로 문서 경로만 안전.

### 2.4 bullmq-integration — `redis-cli` 미설치

세션 69 "Enforce noeviction policy" pre-step 이 호스트 `redis-cli config get maxmemory-policy` 를 호출. GitHub Actions ubuntu runner 에 기본 미설치 → exit 127.

### 2.5 bullmq-integration — ai-adapter-core dist 누락

`pnpm -F @geny/job-queue-bullmq test` 가 `build:test` (tsc) 를 돌리는데 `src/job-store.ts` + `tests/*.test.ts` 가 `@geny/ai-adapter-core` 타입 선언을 import. 이 lane 은 독립 job 이라 golden step 8 의 core 빌드 혜택 없음 → `TS2307`.

### 2.6 bullmq-integration — BullMQ custom jobId `:` 제약 (**contract 결함**)

가장 큰 발견. 앞의 4개 이슈를 순차 수정한 뒤 lane 이 올라오자 real-Redis 런이 `Error: Custom Id cannot contain :` 를 던짐.

BullMQ 5.x 는 custom jobId 에 `:` 불허 (Redis key `bull:<queue>:<id>` 구분자와 충돌). 그런데 `schema/v1/ai-adapter-task.schema.json` 의 `idempotency_key.pattern` 은 `^[A-Za-z0-9._:-]{8,128}$` 로 `:` 허용. ADR 0006 §D3.2 는 **`idempotency_key → jobId` 원문 passthrough** 를 design 원칙으로 못 박았으므로, `:` 가 포함된 키가 들어오면 passthrough 가 깨진다.

세션 60/62 는 fake in-process driver 로만 테스트 → 이 제약 노출 못 함. 세션 69 가 real Redis 를 CI 에 붙이면서 드러났다.

**설계 선택지**:

- (A) schema 는 그대로 두고 드라이버에서 해시/치환 → passthrough 깨짐, ADR 0006 §D3.2 위반.
- (B) schema regex 를 narrow 해 `:` 제거 → passthrough 보존, contract-first.

→ **B 선택**.

### 2.7 gitleaks 회귀 — 스키마 narrow 부작용

스키마 narrow 후 fixture 를 `abc:123.def_456-789` → `abc.123.def_456-789` 로 교체. 이 문자열은 **entropy 임계 초과** + `generic-api-key` pattern 매치 → gitleaks 또 red.

→ `packages/job-queue-bullmq/tests/.*\.test\.ts$` 를 allowlist 에 추가 (license-verifier/ai-adapter-nano-banana tests 와 동일 패턴).

---

## 3. 변경 — 4 commit 체인

### 3.1 `c5a78ba` — 1차 hotfix (golden + secret-scan + bullmq 부분)

- `scripts/test-golden.mjs`:
  - step 19 `runWorkerGenerateTests` 에 `pnpm -F @geny/job-queue-bullmq build` 추가.
  - step 20 `runPerfHarnessSmoke` 에 `pnpm -F @geny/worker-generate build` 추가.
- `packages/job-queue-bullmq/tests/job-store.test.ts` drain 콜백의 `.unref?.()` 제거 + 주석.
- `.gitleaks.toml` allowlist 에 3 경로 추가:
  - `packages/license-verifier/README\.md$`
  - `scripts/README\.md$`
  - `progress/sessions/.*\.md$`
- `.github/workflows/ci.yml` bullmq-integration lane 에 `apt-get install redis-tools` step 추가.

### 3.2 `cd5c6a4` — 2차 hotfix (bullmq-integration dist 선행)

- `.github/workflows/ci.yml` bullmq-integration lane 의 `Install dependencies` 와 테스트 사이에 `Build dependencies` step 추가 — `pnpm -F @geny/ai-adapter-core build`.

### 3.3 `30de6a1` — schema narrow (contract 교정)

- `schema/v1/ai-adapter-task.schema.json` `idempotency_key.pattern` `^[A-Za-z0-9._:-]{8,128}$` → `^[A-Za-z0-9._-]{8,128}$`. description 에 "BullMQ 는 custom job id 에 `:` 를 허용하지 않으므로(Redis key 구분자) 정규식에서 제외 — ADR 0006 §D3.2 passthrough 를 깨지 않기 위한 narrow" 명시.
- `packages/job-queue-bullmq/src/job-store.ts` 헤더 docstring 의 regex 참조 갱신.
- `packages/job-queue-bullmq/tests/redis-integration.test.ts` fixture `abc:123.def_456-789` → `abc.123.def_456-789` + 주석.
- `apps/worker-generate/src/router.ts` URL path regex `[A-Za-z0-9_.:-]+` → `[A-Za-z0-9_.-]+` (세션 63 에서 넓혔던 path regex 도 스키마와 정합, 세션 63 이래 `:` 는 실제로 legal 인 적 없었음).

### 3.4 `0037bc5` — gitleaks 회귀 복구

- `.gitleaks.toml` allowlist 에 `packages/job-queue-bullmq/tests/.*\.test\.ts$` 추가.

---

## 4. 주요 결정축

- **D1** — **schema narrow vs driver 변환**: passthrough 깨지는 방향을 거부. ADR 0006 §D3.2 는 세션 60 에서 "해시/UUID 변환 없음(traceability)" 를 design 원칙으로 못 박았고, Runtime driver 교체가 HTTP 응답 관점에서 투명해야 한다는 세션 61 계약도 이를 전제. 스키마 narrow 가 규칙 정합.
- **D2** — **golden step 에 누락된 dist build 추가**: CI lean runner 는 캐시 없음을 전제로 해야 한다. 로컬 반복 실행이 통과한다는 이유로 미루는 건 취약 — 본 세션에서 재현된 6 세션 silent red 가 증거.
- **D3** — **drain 테스트의 `.unref()` 제거**: `.unref()` 는 "other work 가 있을 것" 이라는 암묵 전제에 의존. CI lean runner 는 그 전제가 깨지는 환경 → explicit 하게 timer 를 event loop 에 참여시키는 게 정답 (테스트 자체가 20ms 지연을 요구하므로 orphan timer 가 프로세스 수명을 늘리는 게 의도된 동작).
- **D4** — **gitleaks 오탐 대응은 "실키 차단 경로" 를 훼손하지 않는 최소 단위**: README/sessions/테스트 파일의 문서/테스트 상수만 allowlist. 소스/설정 파일은 제외 — 실수 주입 시 여전히 detect.
- **D5** — **BullMQ 제약을 fake driver 로는 못 잡는다**: 세션 60/62 의 fake in-process driver 는 `add({ jobId: "abc:123" })` 을 무심코 통과시켰다. real-Redis CI lane (세션 69) 없이는 이 결함이 Foundation 내내 잠재. 세션 69 lane 투자가 세션 70 에서 이 발견으로 정당성 회수.

---

## 5. 검증

로컬:

```
rm -rf {apps,packages}/**/dist* && pnpm run test:golden   # 21/21 pass
```

CI (commit `0037bc5` 기준):

- `golden regression (schemas + exporter-core + bundle)` → **success**
- `bullmq integration (redis 7.2-alpine)` → **success**
- `secret scan (gitleaks)` → **success**

3-lane 전부 녹색. 세션 64 이래 누적 red 해소.

---

## 6. 회귀 영향

- **schema `ai-adapter-task.idempotency_key` narrow** — `:` 포함 키는 스키마 validation 에서 거부. Foundation 어디에도 `:` 포함 fixture 는 존재하지 않아 실제 영향 0. ADR 0006 §D3.2 passthrough 계약은 그대로.
- **router path regex narrow** — 세션 63 에서 넓혔던 `[A-Za-z0-9_.:-]+` 를 스키마와 정합하게 `[A-Za-z0-9_.-]+` 로 줄임. 기존 스키마가 이미 `:` 만 추가 허용했었기 때문에 path regex 축소는 신규 차단이 아님.
- **job-store 테스트** — `.unref()` 제거로 drain 테스트가 약 20ms 더 event loop 에 머뭄. 전체 suite 시간 영향 무의미 (25 pass + 4 skip 불변).
- **golden step 19/20** — 이제 `@geny/job-queue-bullmq` + `@geny/worker-generate` 를 명시적으로 build. CI wall-clock +수초 수준.

validate-schemas `checked=244` 불변, golden 21 step pass 불변, 테스트 카운트 불변.

---

## 7. 남긴 숙제

- **Foundation CI status 를 세션 종료 체크리스트에 포함**: 본 세션의 6-세션 silent red 재발 방지. 세션 로그 커밋 후 `gh run list -L 3` 정도의 가벼운 확인이 필요.
- **ADR 0006 §2.4 포인트 4** — `removeOnComplete` TTL 경과 후 동일 jobId 재제출 → 새 잡 검증. 세션 69 lane 이 가용해졌으므로 다음 세션 후보.
- **`scripts/perf-harness.mjs --driver bullmq` p95 regression** — 세션 68 wait+process 정밀화 기반으로 `docs/02 §12.4` SLO 표 확장 (세션 69 defer 항목).

---

## 8. 산출 (커밋 4개)

- `c5a78ba` fix(ci): 세션 64 이래 red 였던 golden/secret-scan/bullmq-integration 3 lane 복구 (세션 70 hotfix)
- `cd5c6a4` fix(ci): bullmq-integration lane 에 ai-adapter-core dist 선행 빌드 (세션 70 hotfix 후속)
- `30de6a1` fix(schema): idempotency_key regex 에서 `:` 제거 — BullMQ custom jobId 제약 (세션 70)
- `0037bc5` fix(ci): gitleaks allowlist 에 job-queue-bullmq tests 추가 (세션 70 hotfix 3차)
