# services/_deprecated/

2026-04-24 P0.2 스코프 리셋에서 OFF-GOAL 로 판정되어 격리된 서비스들.

`pnpm-workspace.yaml` 의 `!**/_deprecated/**` 패턴으로 워크스페이스 밖.

## 격리 대상 & 이유

| 서비스 | 이유 | 복귀 조건 |
|---|---|---|
| `orchestrator` | "파츠 AI 생성 → 후처리 → 번들" 파이프라인을 조율하는 서비스. 현 스코프(텍스처 단위 생성) 는 `apps/api` 가 `ai-adapter-core.orchestrate()` + `exporter-core` 를 직접 호출하므로 별도 서비스 불필요 | 슬롯별 생성 + 후처리 + 번들 체인이 분 단위 백그라운드 작업으로 확장될 때 (Phase 4+ 재평가) |

## 현 스코프의 대체 경로

- `apps/api` — 웹 UI 와 직결된 synchronous API
- AI 호출은 `@geny/ai-adapter-core.orchestrate()` 직접 호출 (벤더 라우팅·폴백·provenance 모두 포함)
- 번들 조립은 `@geny/exporter-core` CLI 또는 라이브러리 직접 호출

## 참고

- `docs/03-ARCHITECTURE.md §3.2` — Backend 엔드포인트 설계
- 이전 orchestrator 세션 로그: `archive/progress_old/sessions/*orchestrator*`
