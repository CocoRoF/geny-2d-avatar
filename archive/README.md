# Archive

2026-04-24 스코프 리셋 이전의 자료. 현 스코프 (프리셋 카탈로그 + 텍스처 생성 + Web UI) 에 직접 해당하지 않지만, 설계 판단·데이터 계약·역사적 맥락을 보려면 여기를 참고.

**현 유효 문서**: 리포 루트의 [`docs/`](../docs/) — `docs/00-GOAL.md` 부터 `05-EXECUTION-PLAN.md` 까지가 권위. 이 아카이브는 참고 자료일 뿐.

**스코프 차이 요약**:

| 항목 | 이전 스코프 | 현 스코프 |
|---|---|---|
| 뼈대 | AI 가 파츠를 그리고 자동 피팅 | 프리셋으로 제공 (고정). mao_pro 포함 여러 개 |
| 생성 단위 | 파츠별 (hair_front, eye_iris, ...) | 텍스처 (아틀라스 PNG) |
| 제품 형태 | 플랫폼 / 서비스 | Web UI |
| 핵심 등식 | 프롬프트 → 파츠들 → 자동 조립 → 아바타 | 텍스처 + 프리셋 = Live2D 모델 |

---

## `docs/` — 이전 플랫폼 스코프 설계 문서 (18건)

| 파일 | 주제 | 현 스코프에서의 가치 |
|---|---|---|
| `02-system-architecture.md` | 전체 플랫폼 아키텍처 | 레이어 분할·결정론 규약 참고 |
| `03-rig-template-spec.md` | rig-template 디렉토리 스펙 | 여전히 유효 — `docs/01` 에서 요약 |
| `04-parts-specification.md` | 파츠 분해 규약 | 슬롯 설계 참고 |
| `05-ai-generation-pipeline.md` | AI 파츠 생성 파이프라인 | **텍스처 생성에 벤더 라우팅·폴백 설계 그대로 재활용** |
| `06-post-processing-pipeline.md` | 파츠 후처리 | 텍스처 슬롯 간 블렌딩에 참고 (Phase 3) |
| `07-auto-fitting-system.md` | 파츠 자동 피팅 | 대부분 OFF-GOAL — 프리셋 고정이므로 피팅 불필요 |
| `08-validation-and-rendering.md` | 검증·렌더 규약 | test_poses·golden 회귀 여전히 유효 |
| `10-customization-workflow.md` | 사용자 커스터마이징 UX | Phase 5 UI 설계에 참고 |
| `11-export-and-deployment.md` | Cubism / Web 번들 export | **그대로 유효** — `@geny/exporter-core` 동작 근거 |
| `12-data-schema-and-api.md` | 데이터 스키마·API | 여전히 유효 — `schema/v1/` 이 권위 |
| `13-tech-stack.md` | 기술 스택 | 여전히 유효 |
| `15-quality-assurance.md` | QA 전략 | 회귀·스모크 테스트 접근 참고 |
| `01` / `09` / `14` / `16` / `17` / `18` | 비전·UX·로드맵·수익화·리스크·용어 | 이전 스코프 전제라 구식. 역사적 레퍼런스용 |

## `progress_old/` — 세션 로그 · ADR · 런북

| 디렉토리 | 내용 |
|---|---|
| `adr/` | 0001 monorepo-layout · 0002 schema-first · 0003 rig-template-versioning · 0004 avatar-as-data · 0005 rig-authoring-gate · 0006 queue-persistence · 0007 renderer-technology |
| `sessions/` | 2026-04-17 ~ 2026-04-24 의 구현 세션 로그 (150+ 건). Foundation/β Platform 단계 기록 |
| `runbooks/` | CI·스키마 검증·Rig template lint 절차 |
| `plans/` | 사전 계획 (fullbody authoring, bullmq driver prework) |
| `notes/` | ADR 0007 옵션 비교, β pending decisions |
| `exit-gates/` | Foundation single-avatar E2E 게이트 |
| `INDEX.md` | 세션 마스터 인덱스 + 누적 산출물 맵 |
| `snapshot-0420/SUMMARY.md` | 2026-04-20 시점 프로젝트 상태 스냅샷 |

## 현 스코프에서 여전히 참고할 만한 것 (요약)

- **ADR 0001–0002, 0004**: 모노레포 / 스키마-퍼스트 / 아바타-as-데이터 원칙 — 그대로 유효
- **ADR 0005**: 리그 authoring gate L1~L4 — 프리셋 저작 검증 절차 재활용
- **ADR 0007**: 렌더러 기술 선정 (PixiJS) — 그대로 유효
- **docs/05 AI 생성 파이프라인**: 어댑터 라우팅·폴백·캐시·provenance — **텍스처 생성기 설계에 재활용**
- **docs/11 Export**: Cubism / Web 번들 포맷 — `exporter-core` 의 기준
- **docs/12 Schema**: 스키마 목록과 의도

---

## 삭제된 파일 (참고)

리셋 시 "확실한 노이즈"로 판단되어 삭제:

- `docs/index.md` — 단순 목차
- `docs/PRODUCT-BETA.md`, `ROADMAP-BETA.md`, `UX-BETA-WIREFRAME.md` — β Platform 제품 기획 (전혀 다른 스코프)
- `progress/SESSION_TEMPLATE.md` — 빈 템플릿
- `progress_0420/INDEX.md`, `PLAN.md` — 구식 인덱스·계획
