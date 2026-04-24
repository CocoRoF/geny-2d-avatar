# apps/_deprecated/

2026-04-24 P0.2 스코프 리셋에서 OFF-GOAL 로 판정되어 격리된 앱들.

`pnpm-workspace.yaml` 의 `!**/_deprecated/**` 패턴으로 워크스페이스 밖.

## 격리 대상 & 이유

| 앱 | 이유 | 복귀 조건 |
|---|---|---|
| `worker-generate` | BullMQ 기반 비동기 생성 워커. 웹 UI 초기 단계는 synchronous `apps/api` 로 충분 | Phase 6+ 배포 시 긴 생성 작업(슬롯별) 이 분 단위일 때 |

## 현 스코프의 대체 경로

- `apps/api` (Phase 2 신설) — synchronous HTTP 엔드포인트로 AI 생성·빌드·다운로드 처리
- 생성 작업이 수십 초 내면 API 에서 직접 처리, 오래 걸리면 SSE 로 진행률만 전달

## 참고

- `docs/03-ARCHITECTURE.md §3.2` — Backend 엔드포인트 설계
- 이전 worker-generate 세션 로그: `archive/progress_old/sessions/*worker-generate*`
