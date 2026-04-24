# geny-2d-avatar

**프리셋 뼈대 + 새 텍스처 = 완성된 Live2D 모델.**

웹 브라우저에서 프리셋 하나를 고르고, 텍스처를 AI 로 생성하거나 직접 업로드하면, 합쳐진 Live2D 번들을 즉시 프리뷰·다운로드할 수 있는 파이프라인.

- **모든 뼈대는 프리셋이다.** Live2D 공식 샘플 `mao_pro`, 우리가 저작한 `halfbody`, 미래의 사용자 업로드 — 전부 동등하게 카탈로그에 등재된다.
- **가변 자산은 텍스처뿐이다.** 프리셋은 고정, 텍스처만 생성·교체.
- **제품은 Web UI 다.** CLI 는 내부 도구. 사용자 진입점은 브라우저.

> 2026-04-24 — 이전 "파츠 AI 생성 + 풀 플랫폼" 스코프에서 현 스코프로 리셋. 이전 문서는 [`archive/`](./archive/) 로 이동.

---

## 문서

| 번호 | 문서 | 역할 |
|---|---|---|
| 00 | [`docs/00-GOAL.md`](./docs/00-GOAL.md) | 목표 · 핵심 등식 · 스코프 · 용어 |
| 01 | [`docs/01-RIG-PRESET.md`](./docs/01-RIG-PRESET.md) | 프리셋 정의 · 카탈로그 · mao_pro 편입 · 저작 절차 |
| 02 | [`docs/02-TEXTURE-PIPELINE.md`](./docs/02-TEXTURE-PIPELINE.md) | 입력 · 슬롯 계획 · 생성 전략 · 검증 · 출력 |
| 03 | [`docs/03-ARCHITECTURE.md`](./docs/03-ARCHITECTURE.md) | Web UI · Backend · 데이터 흐름 · 패키지 역할 |
| 04 | [`docs/04-ROADMAP.md`](./docs/04-ROADMAP.md) | Phase 0 ~ 6 마일스톤 (high-level) |
| 05 | [`docs/05-EXECUTION-PLAN.md`](./docs/05-EXECUTION-PLAN.md) | Phase 를 세션 단위로 분해한 실행 계획 |

**권위 계약**: [`schema/v1/`](./schema/)
**프리셋 카탈로그**: [`rig-templates/base/`](./rig-templates/)
**3rd-party 원본**: [`mao_pro_ko/`](./mao_pro_ko/) (Live2D Inc. 공식 샘플 — Phase 1 에서 프리셋 편입)

---

## Prerequisites

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | **22.11.0** (LTS) | `.nvmrc` 기준 |
| pnpm | **9.12.0** | `package.json.packageManager` 고정 |
| Live2D Cubism Editor | 5.x | 프리셋 저작 (외부 툴, 수동) |

```bash
nvm install 22.11.0 && nvm use
corepack enable && corepack prepare pnpm@9.12.0 --activate
```

## Quickstart

```bash
git clone https://github.com/CocoRoF/geny-2d-avatar.git
cd geny-2d-avatar
pnpm install --frozen-lockfile

# 스키마 + 기존 골든 회귀
pnpm run validate:schemas
pnpm run test:golden
```

Phase 1 이후 활성화:
```bash
# 로컬 웹 UI (Phase 2+)
pnpm -F apps/web-editor dev    # http://localhost:5173
pnpm -F apps/api dev            # http://localhost:3000
```

---

## Repository Layout

```
geny-2d-avatar/
├── docs/                       # 현 스코프 문서 6 종 (00~05)
├── archive/                    # 이전 스코프 docs · progress 기록
├── schema/v1/                  # JSON Schema (단일 진실 공급원)
├── rig-templates/base/         # 프리셋 카탈로그
│   ├── mao_pro/v1.0.0/         # Phase 1 에서 편입 예정 (Live2D 공식)
│   ├── halfbody/v1.3.0/        # 현재 유일한 활성 derived preset
│   └── (fullbody/chibi ...)    # 미래
├── mao_pro_ko/                 # Live2D 공식 샘플 원본 (수정 금지, 라이선스 준수)
├── samples/                    # 샘플 아바타 / 생성 결과 픽스처
├── packages/
│   ├── exporter-core/          # 프리셋 + avatar.json → Cubism/Web 번들 (성숙)
│   ├── web-avatar/             # <geny-avatar> Web Component
│   ├── web-avatar-renderer/    # 렌더러 계약
│   ├── web-avatar-renderer-pixi/ # PixiJS 2D 렌더 (Phase 1 활성 개발)
│   ├── ai-adapter-core/        # AI 벤더 라우팅·폴백·provenance
│   └── _deprecated/            # Phase 0.2 에서 격리된 OFF-GOAL
├── apps/
│   ├── web-editor/             # Phase 2+ — 제품 본체 (Web UI)
│   ├── web-preview/            # Phase 1 최소 프리뷰
│   ├── api/                    # Phase 2 신설 — 백엔드 서비스
│   └── _deprecated/            # Phase 0.2 에서 격리
├── services/                   # _deprecated (Phase 6+ 재평가)
├── scripts/                    # validate-schemas · test-golden · rig-template 유틸
└── infra/                      # 배포 (Phase 6)
```

---

## 현재 Phase 진행 상황

| Phase | 상태 | 설명 |
|---|---|---|
| **P0** Scope Reset | 🟡 진행 중 | 문서 리셋 완료 (이번 세션) · 코드 OFF-GOAL 격리 대기 |
| **P1** mao_pro 편입 + First Pixel | ⚪ 대기 | `.moc3` 파싱 · PixiJS 렌더 · 기본 프리뷰 |
| **P2** Web UI 기본 | ⚪ | `apps/api` + web-editor + 수동 업로드·다운로드 |
| **P3** AI 단일 생성 | ⚪ | 프롬프트 → atlas PNG → 프리뷰 |
| **P4** 슬롯별 생성 | ⚪ | 부분 재생성 + 스타일 일관성 |
| **P5** 다중 프리셋 | ⚪ | 두 번째 derived preset + 저작 가이드 |
| **P6** 배포 & Launch | ⚪ | 공개 URL + rate limit + 관측 |

상세는 [`docs/04-ROADMAP.md`](./docs/04-ROADMAP.md) · [`docs/05-EXECUTION-PLAN.md`](./docs/05-EXECUTION-PLAN.md).

---

## 기본 워크플로우 (현재)

### 스키마 검증
```bash
pnpm run validate:schemas
```

### exporter-core 로 번들 수동 조립
```bash
pnpm -F @geny/exporter-core build

node packages/exporter-core/bin/exporter-core.mjs bundle \
  --template ./rig-templates/base/halfbody/v1.3.0 \
  --out-dir /tmp/halfbody-bundle
```

Phase 2 이후에는 이 작업을 `apps/api` 가 수행하고, 사용자는 웹 UI 만 본다.

---

## 핵심 등식

```
   texture (생성 또는 업로드)
 + preset  (기존 프리셋 — mao_pro 포함, 여러 개 중 선택)
 ─────────────────────────────
 = 완성된 Live2D 모델
```

"뼈대는 프리셋으로 제공하고, 우리는 텍스처만 다룬다" — 이 원칙이 모든 설계를 지배한다.

---

## License

- **프로젝트 코드**: TBD (launch 전 결정)
- **`mao_pro_ko/`**: Live2D Inc. 무상 제공 소재 라이선스. `mao_pro_ko/ReadMe.txt` 참고. 상업 이용 시 Live2D 규약 동의 필요.
- **생성된 아바타**: 사용된 프리셋의 라이선스를 상속 (Phase 6 에서 UX 로 고지).

## 이전 스코프 자료

[`archive/README.md`](./archive/README.md) — 이전 "파츠 AI 생성 + 플랫폼" 스코프의 설계 문서·세션 로그·ADR. 현 스코프 외이지만 AI 라우팅·폴백·후처리·스키마 설계는 재활용 가능.
