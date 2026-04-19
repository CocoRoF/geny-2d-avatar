# Session 40 — `physics-lint.mjs`: 리그 물리 저작 authoring gate

- 날짜: 2026-04-19
- 스트림: Rig & Parts · Platform/Infra
- 선행: 세션 27 (v1.3.0 migrator skeleton) · 31 (v1.3.0 authored physics.json 9→12) · 37 (migrator auto-patch 확장, `physics.json` 만 저자 TODO 로 남김)
- 후속: 세션 41 (post-processing Stage 1 e2e) · 43 (ADR 명문화)

## 1. 왜 이번 세션을 열었는가

세션 27 이후 v1.0.0→v1.3.0 migrator 는 `physics.json` 재구성을 **"저자 개입 필요"** 로 남겨 둔다. 세션 37 에서 다른 3 개 TODO (ahoge 파트 / accessory parent / mao_pro mapping) 를 자동화했지만, `physics.json` 은 "weight/mobility/delay 튜닝은 물리 판단" 이라 손댈 수 없었다.

→ 자동화 불가능한 저작물이라 해도, **"이 저작물이 내부 정합성을 지켰는가"** 는 기계적으로 가능하다. 예:
- meta.physics_setting_count 가 settings.length 와 다르면 → 작성자가 카운트 업데이트를 잊은 것.
- output.destination_param 이 parameters.json 에 없으면 → 파라미터 추가 없이 설정만 넣은 것.
- output.destination_param 이 cubism_mapping 에 없으면 → Cubism export 때 이름 바인딩이 끊기는 것.
- output naming 이 `_(sway|phys|fuwa)(_[lr])?$` 를 어기면 → docs/03 §6.2 규약 불일치.

이런 검증을 CI 에 고정하면 저자가 physics.json 을 만질 때 "무엇까지는 자동 보장" 인지 명확해진다.

## 2. 산출물

### 2.1 `scripts/rig-template/physics-lint.mjs`

- `lintPhysics(templateDir)`: `{ errors: string[], summary: { setting_count, total_input_count, total_output_count, vertex_count, ids } }` 반환.
- `diffPhysics(baselineDir, targetDir)`: `PhysicsSetting{id}` 단위 +/-/~ 라인 배열.
- CLI: `node scripts/rig-template/physics-lint.mjs <templateDir> [--baseline <dir>]`
- 의존성: Node 20.11+ built-in (`readFile`, `JSON`, `path`). 외부 패키지 0.

10 규칙 (C1~C10) 은 모두 **fatal** — 1 개라도 걸리면 exit 1:

| # | 규칙 |
|---|---|
| C1 | `meta.physics_setting_count === physics_settings.length` |
| C2 | `meta.total_input_count === Σ input.length` |
| C3 | `meta.total_output_count === Σ output.length` |
| C4 | `meta.vertex_count === Σ vertices.length` |
| C5 | `physics_dictionary` 와 `physics_settings` 의 id 집합이 정확히 동일 (양방향 · 중복 금지) |
| C6 | `input.source_param` ∈ `parameters.json` ∧ 해당 파라미터 `physics_input === true` |
| C7 | `output.destination_param` ∈ `parameters.json` ∧ `physics_output === true` |
| C8 | `output.vertex_index ∈ [0, vertices.length)` |
| C9 | `output.destination_param ∈ template.manifest.cubism_mapping` |
| C10 | 출력 네이밍 `_(sway\|phys\|fuwa)(_[lr])?$` — docs/03 §6.2 |

### 2.2 `scripts/rig-template/physics-lint.test.mjs`

표준 `node` 스크립트(golden runner step 18 로 호출). 9 assertion:

1. `halfbody v1.0.0..v1.3.0` 전부 errors==0 — 과거/현재 authored 템플릿의 회귀 보증.
2. C1 ~ C10 을 각각 negative 케이스로 유도해 해당 규칙만 타는지 확인:
   - meta count mismatch (C1, C2)
   - vertex_index 밖 (C8)
   - missing source_param (C6)
   - 네이밍 위반 + physics_output 없는 파라미터 연결 (C7 + C10 동시)
   - cubism_mapping 에서 삭제 (C9)
   - dictionary pop → settings 와 불일치 (C5)
3. `diffPhysics(v1.2.0, v1.3.0)` 가 `PhysicsSetting10/11/12` 를 신규로 잡는지.

### 2.3 `scripts/test-golden.mjs` step 18 추가

```js
{ name: "rig-template physics-lint", run: runPhysicsLintTests },

async function runPhysicsLintTests() {
  await run("node", ["scripts/rig-template/physics-lint.test.mjs"], { cwd: repoRoot });
}
```

17→**18 step**. 헤더 주석에 18 번 설명 추가.

### 2.4 `progress/INDEX.md`

- §3 Rig & Parts 행: 세션 40 추가 + physics-lint 10 규칙 요약.
- §3 Platform/Infra 행: `test:golden` 17→18 step.
- §4: 세션 40 row.
- §6: 골든셋 회귀 18 step.
- §8: 세션 40 제거, 41/42 유지, 43 (ADR 명문화) 신규.

## 3. 설계 결정

### D1. 새 패키지가 아니라 `scripts/rig-template/` 아래

physics-lint 는
- 리그 **저작** 단계에서만 동작한다 (런타임 아님).
- Node 22.11 built-in 만으로 충분하다 (파싱·Set 조작).
- npm 패키지로 배포할 구성 요소가 아니다.

기존 `scripts/rig-template/migrate.mjs` + `migrate.test.mjs` 와 동일한 저작 도구 패밀리 → `scripts/rig-template/physics-lint.{mjs,test.mjs}` 가 자연스러운 자리. 일관성 있는 ESM export 를 유지해, 다른 저자 도구 (e.g., 향후 `deformer-lint.mjs`) 에서도 `lintPhysics` 를 모듈로 import 할 수 있다.

### D2. 10 규칙 모두 fatal — warnings 등급 미도입

초기에는 "C10 naming 은 warning 으로 낮출까" 를 고려했으나, 저자가 `_sway` 대신 `_angle` 같은 이름을 붙이는 순간

- motion 팩 저자가 "이 파라미터가 물리 출력인지" 를 이름으로 판단 못 함 (docs/03 §6.2 규약이 곧 의미 체계).
- `exporter-core` 가 향후 이 네이밍으로 물리 전용 경로를 분리할 여지를 남긴다.

→ 규약 위반은 "돌아가긴 하는데 나중에 폭발" 하는 종류라 차라리 지금 fail 시킨다. warnings 등급은 모호한 경계를 남겨 규약을 천천히 부식시킨다.

### D3. `--baseline` 플래그 — 자동 규칙이 아니라 진단용

diffPhysics 는 lint 와 **별도 경로**. lint 가 pass 해도 diff 는 항상 리포트만 뱉는다. 사용 시점:

- 저자가 v1.3.0 을 저작하던 중 "v1.2.0 대비 내가 맞게 추가했는지" 확인.
- 리뷰어가 PR 에서 "이 세션이 실제로 몇 개 setting 을 건드렸는지" 빠르게 확인.

자동 규칙으로 만들지 않은 이유: baseline 이 없어도 lint 는 독립적으로 완결 — baseline 대비 변경 유무는 결함이 아니라 **디자인 선택**.

### D4. Signature 는 구조적 비교만 — weight/delay 값은 비교하지 않음

```js
function settingSignature(s) {
  const ins = (s.input ?? []).map((i) => `${i.source_param}:${i.weight}:${i.type}:${i.reflect}`).join(",");
  const outs = (s.output ?? []).map((o) => `${o.destination_param}:${o.weight}:${o.type}:${o.vertex_index}`).join(",");
  return `in=${ins}|out=${outs}|verts=${(s.vertices ?? []).length}`;
}
```

- weight/type/reflect/vertex_index 까지만 비교.
- `vertices[].mobility/delay/acceleration/radius` 는 **diff signature 에 포함하지 않음** (튜닝 레벨 변경은 일반적이고 "구조적 변화" 가 아님).
- 앞으로 physics 튜닝 전용 diff 가 필요해지면 별도 옵션(`--tuning-diff`) 으로 추가.

### D5. CLI positional/option 파서 — 수제

`--baseline` 뒤의 경로가 positional 로 잡히지 않도록 인덱스 기반 스킵셋으로 분리. Node built-in `util.parseArgs` 를 고려했으나 `--baseline <dir>` 단일 옵션에 한정되어 수제가 더 짧고 명확했다.

## 4. 검증

- `pnpm run test:golden` — **18 step 전부 pass**. physics-lint step ~150ms.
- halfbody v1.0.0~v1.3.0 4 버전 전부 clean (historical rig 도 지금 규약 맞춤).
- v1.2.0 → v1.3.0 diff = `+PhysicsSetting10`, `+PhysicsSetting11`, `+PhysicsSetting12` — 세션 31 에서 저자가 정확히 이 3 개를 추가했다는 기계적 증거.

## 5. 남은 항목

- 세션 37 migrator 는 v1.3.0 hop 에서 physics.json TODO 하나만 남긴다. 향후 v1.4.0+ 에서 "템플릿 인자 받아 physics.json stub 을 생성하는" 저작 도구를 생각해볼 수 있으나, 물리 튜닝은 결국 시뮬레이션을 보고 결정해야 하므로 완전 자동화는 목표가 아님.
- physics-lint 의 규칙 10 개는 현재 `halfbody` 계열에 맞춰 튜닝됐다. 다른 base (e.g., fullbody) 도입 시 C9 (`cubism_mapping` 누락 체크) 와 C10 (네이밍) 이 동일하게 적용되는지는 그때 재검증.
- 세션 43 에서 이 규칙을 ADR 0005 로 올려 "리그 저작 검증 규약" 을 문서화 예정.

## 6. 다음 단계

§8 roadmap:
- **세션 41**: `applyAlphaSanitation` 실 텍스처 e2e 골든 (pipeline 번들 sha256 고정).
- **세션 42**: orchestrator-service HTTP 팩토리 주입 실사용 또는 `apps/worker-*/` skeleton.
- **세션 43**: ADR 0005+ — 이번 세션의 10 규칙 + migrator auto-patch 경계 명문화.
