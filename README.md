# geny-2d-avatar

표준화된 2D 리그 위에 AI가 재설계한 파츠를 얹어 캐릭터를 찍어내는 반자동 생산·커스터마이징·배포 플랫폼.

- **기획 문서**: [`docs/`](./docs/index.md) — 무엇을/왜.
- **진행 로그**: [`progress/INDEX.md`](./progress/INDEX.md) — 언제/어떻게/어디까지.
- **계약(스키마)**: [`schema/v1/`](./schema/) — 앱·서비스·SDK 가 신뢰하는 단일 진실 공급원.
- **공식 리그 템플릿**: [`rig-templates/base/halfbody/v1.2.0/`](./rig-templates/) — `tpl.base.v1.halfbody` 참조 구현.

현재 단계: **Foundation** (2026 Q2). 단일 아바타를 API 호출 → 프리뷰 → Cubism export 까지 end-to-end 구축. 자세한 상태는 [`progress/INDEX.md §2`](./progress/INDEX.md#2-현재-단계) 참조.

---

## 1. Prerequisites

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | **22.11.0** (LTS) | `.nvmrc` 기준. Node 20 은 `node --test` positional glob 미지원으로 CI 가 깨진다 (세션 13b). |
| pnpm | **9.12.0** | `package.json.packageManager` 로 고정. |
| Python | 3.12+ | SDK-py/파이프라인용 (현재 Foundation 에서는 선택). |
| git | 2.40+ | LFS 미사용. |

macOS / Linux 우선. Windows 는 WSL2 권장.

```bash
# nvm 사용 시
nvm install 22.11.0 && nvm use

# corepack 으로 pnpm 고정
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

## 2. Quickstart (5분)

새 개발 머신에서 green 상태까지:

```bash
git clone https://github.com/CocoRoF/geny-2d-avatar.git
cd geny-2d-avatar

pnpm install --frozen-lockfile
pnpm run test:golden          # 5-step 회귀: 스키마 + exporter 테스트 + 3 번들 골든
```

전부 `[golden] ✅ all steps pass` 가 나와야 한다. 한 스텝이라도 빨간색이면 [Troubleshooting](#7-troubleshooting) 참조.

개별 스텝:

```bash
pnpm run validate:schemas     # JSON Schema + rig template + 샘플 (checked 131)
pnpm -F @geny/exporter-core test   # 단위 + golden byte-equal (88 tests)
```

## 3. Repository Layout

```
geny-2d-avatar/
├── docs/                 # 기획·설계·정책 (18 문서 + index)
├── progress/             # 세션 로그 · ADR · INDEX
├── schema/v1/            # JSON Schema 16종 (단일 진실 공급원)
├── rig-templates/        # 공식 리그 템플릿 (base/halfbody/v1.x)
├── samples/              # 스키마 인스턴스 픽스처 (avatar/license/provenance)
├── packages/
│   ├── exporter-core/    # @geny/exporter-core — 결정론적 Cubism/Web 번들 변환 (실구현)
│   └── web-avatar/       # @geny/web-avatar — 런타임 (스캐폴드; 세션 15 stage 1)
├── scripts/              # validate-schemas / test-golden / sign-fixture / rig-template
├── apps/ services/ infra/  # 폴더·README 만 (Foundation 단계에서 구현 없음)
└── Taskfile.yml          # go-task 전역 진입점 (pnpm 스크립트의 얇은 래퍼)
```

디렉터리 책임 표는 [`progress/INDEX.md §5`](./progress/INDEX.md#5-누적-산출물-맵).

## 4. Common Workflows

### 4.1 스키마를 검증한다

`schema/v1/*.schema.json` 의 형식, rig-templates 의 내용, samples 의 서명·sha 교차확인을 Ajv + Node 내장 crypto 로 검증한다.

```bash
pnpm run validate:schemas
# 마지막 줄: [validate] checked=131 failed=0
```

### 4.2 번들 조립기를 직접 쓴다 (`@geny/exporter-core` CLI)

`pnpm -F @geny/exporter-core build` 이후 `node packages/exporter-core/bin/exporter-core.mjs <command>` 형태. 총 **9개 subcommand**:

| subcommand | 목적 | 대표 사용 |
|---|---|---|
| `pose` | `pose.json` → `pose3.json` | `--template <dir> --out pose3.json` |
| `physics` | `physics/physics.json` → `physics3.json` | `--template <dir> --out physics3.json` |
| `motion` | 1개 모션 팩 → `motion3.json` | `--template <dir> --pack idle.default --out motion3.json` |
| `cdi` | parameters + parts → `cdi3.json` | `--template <dir> --out cdi3.json` |
| `expression` | 1개 표정 팩 → `exp3.json` | `--template <dir> --expression expression.smile --out exp3.json` |
| `model` | 전체 파일 참조 매니페스트 `model3.json` | `--template <dir> --out model3.json [--moc … --texture … --lipsync simple\|precise]` |
| `bundle` | Cubism 번들 **전체** (15 파일) | `--template <dir> --out-dir ./out` |
| `avatar` | avatar-export spec 에서 번들 조립 | `--spec samples/avatars/sample-01-aria.export.json --rig-templates-root rig-templates --out-dir ./out` |
| `web-avatar` | Web Avatar 런타임 번들 (`web-avatar.json` + `bundle.json`) | `--template <dir> --out-dir ./out [--avatar-id avt.demo]` |

**예시 — halfbody 를 Cubism + Web 두 번들로 동시 export**:

```bash
pnpm -F @geny/exporter-core build
cd packages/exporter-core
node bin/exporter-core.mjs bundle \
  --template ../../rig-templates/base/halfbody/v1.2.0 \
  --out-dir /tmp/halfbody-cubism
node bin/exporter-core.mjs web-avatar \
  --template ../../rig-templates/base/halfbody/v1.2.0 \
  --out-dir /tmp/halfbody-web
```

양쪽 모두 `bundle.json` 을 emit — `kind` 가 각각 `cubism-bundle` / `web-avatar-bundle` 로 다르다. 모든 JSON 은 canonical (2-space, LF, trailing `\n`, ASCII 키 정렬) → 동일 입력에 대해 **바이트 동일** (골든 회귀의 기반, [세션 08 D5](./progress/sessions/2026-04-18-session-08-exporter-core.md) · [세션 13 D1](./progress/sessions/2026-04-18-session-13-bundle-manifest.md)).

### 4.3 라이선스/증명서에 서명한다 (픽스처 키)

테스트/개발용 라이선스·증명서는 RFC 8032 §7.1 Test 1 Ed25519 공개 벡터로 서명한다. 프로덕션 키는 `geny.platform.YYYY-MM` 네임스페이스로 분리 (현재 미구현). 자세한 내용은 [세션 14 로그](./progress/sessions/2026-04-18-session-14-license-provenance.md).

```bash
# 샘플 license.json 의 서명을 검증
node -e "
import('./scripts/sign-fixture.mjs').then(async m => {
  const fs = await import('node:fs');
  const doc = JSON.parse(fs.readFileSync('samples/avatars/sample-01-aria.license.json', 'utf8'));
  console.log('verify:', m.verifyDocument(doc));
});
"
```

`validate-schemas.mjs` 가 CI 에서 이 검증을 자동으로 돈다 (`[validate] checked=131`).

### 4.4 새 rig 템플릿 버전을 만든다

이전 버전에서 마이그레이션:

```bash
node scripts/rig-template/migrate.mjs \
  --from rig-templates/base/halfbody/v1.1.0 \
  --to rig-templates/base/halfbody/v1.2.0
```

(세션 10 의 마이그레이션 경로. ADR 0003 SemVer 규칙 준수.)

### 4.5 새 기획 문서·세션을 기록한다

- 기획 변경 → `docs/` 갱신 + `progress/adr/NNNN-*.md` ADR 추가.
- 구현 세션 → `progress/sessions/YYYY-MM-DD-session-NN-slug.md` + `progress/INDEX.md` 갱신.

세션 규율:

1. 한 세션 = 하나의 coherent commit + push.
2. 테스트는 커밋 직전 green.
3. 세션 로그 형식은 기존 로그(예: [세션 15](./progress/sessions/2026-04-18-session-15-web-avatar.md)) 참고.

## 5. CI

GitHub Actions 워크플로 2종 (`.github/workflows/`):

- `ci.yml` — 모든 PR/push. `pnpm install` → `pnpm run test:golden` (5 step).
- `validate-schemas.yml` — 스키마 전용 고속 체크.

둘 다 Node 22.11 + pnpm 9.12 pin. 로컬에서 `pnpm run test:golden` green 이면 CI 도 green 이다 (라이브러리 이슈는 드물다).

## 6. 현재 구현 상태 (간추림)

Foundation Exit 체크리스트 (`docs/14 §3.3`):

- [ ] 단일 아바타 생성 → 프리뷰 → Cubism export 수동 테스트
- [x] CI 에서 골든 회귀 자동 (세션 10)
- [ ] 관측 대시보드 3종
- [x] 개발자 온보딩 1일 (**본 README — 세션 16**)

상세는 [`progress/INDEX.md`](./progress/INDEX.md). 워크스트림별 상태 표는 [§3](./progress/INDEX.md#3-워크스트림-상태).

## 7. Troubleshooting

| 증상 | 원인 | 해결 |
|---|---|---|
| `Could not find '.../dist-test/tests/**/*.test.js'` | Node 20 에서 `node --test` positional glob 미지원. | Node 22.11 로 업그레이드 (`.nvmrc`). 세션 13b 기록. |
| `[validate] INVALID bundle_manifest_sha256 ≠ bundle.json sha` | samples/avatars 의 license/provenance 를 수정했지만 번들을 재생성하지 않음. | `node packages/exporter-core/bin/exporter-core.mjs avatar --spec … --out-dir samples/avatars/<name>` 으로 번들 재생성 후 `sign-fixture.mjs` 로 license 재서명. |
| `bundle snapshot differs from golden` | 변환기 로직이 바뀌었거나, 입력 템플릿이 바뀌어 번들 바이트가 변경. | 의도한 변경이면 골든 갱신 후 PR 에 "골든 갱신" 명시. 의도하지 않았으면 변환기 diff 조사. 힌트는 `tmpDir/diff.txt` 에 inline diff. |
| `Schema missing $id` | `schema/v1/**` 아래 새 JSON 파일을 스키마 아닌데 넣음. | `schema/v1/` 는 `.schema.json` 만. 예제는 `schema/examples/`, 픽스처는 `samples/`. |
| `ERR_MODULE_NOT_FOUND: ajv` | `pnpm install` 미실행 / frozen-lockfile 불일치. | `pnpm install --frozen-lockfile` 재실행. node_modules 삭제 후 재시도. |
| exporter-core `ENOENT template.manifest.json` | `--template` 경로가 템플릿 루트가 아님. | `rig-templates/base/<family>/v<major>.<minor>.<patch>/` 수준으로 지정. |
| CLI `unknown command 'web-avatar'` | 오래된 build 캐시. | `pnpm -F @geny/exporter-core clean && pnpm -F @geny/exporter-core build`. |

더 추가해야 할 함정을 발견했다면 본 섹션에 append.

## 8. 도움이 되는 링크

- [`docs/index.md`](./docs/index.md) — 기획 문서 18종 목차.
- [`docs/11-export-and-deployment.md`](./docs/11-export-and-deployment.md) — 번들·라이선스·Web Avatar.
- [`docs/14-roadmap-and-milestones.md`](./docs/14-roadmap-and-milestones.md) — 단계·게이트.
- [`progress/adr/`](./progress/adr/) — 확정된 아키텍처 결정 4건.
- [`schema/README.md`](./schema/README.md) — 스키마 목록.
- GitHub: [CocoRoF/geny-2d-avatar](https://github.com/CocoRoF/geny-2d-avatar)

## 9. License

TBD — 리포지토리 코드 자체의 라이선스 정책은 세션 17+ 에서 결정. 아바타 자산의 라이선스는 [`docs/16-monetization-licensing-ip.md`](./docs/16-monetization-licensing-ip.md) 참조.
