# packages/_deprecated/

2026-04-24 P0.2 스코프 리셋에서 OFF-GOAL 로 판정되어 격리된 패키지들.

`pnpm-workspace.yaml` 의 `!**/_deprecated/**` 패턴으로 **워크스페이스 밖**이다 — `pnpm install` / 빌드 / 테스트에서 제외된다. 코드는 git 기록 보존을 위해 남겨두되, 모든 의존 관계는 끊어진 상태.

## 격리 대상 & 이유

| 패키지 | 이유 | 복귀 조건 |
|---|---|---|
| `migrator` | 프리셋은 Cubism Editor 수동 저작. 코드 레벨 마이그레이션 불필요 | "프리셋 스키마 버전이 바뀌고 기존 프리셋 자동 patch 가 필요" 할 때 |
| `job-queue-bullmq` | 웹 UI 초기 단계는 synchronous API 로 충분 | Phase 6+ 배포 시 생성 큐 필요 시 |
| `exporter-pipeline` | "파츠 AI 생성 + 후처리 + 번들" 전제. 현 스코프(텍스처→번들)는 `exporter-core` 단일 호출로 충분 | 슬롯별 생성 + 후처리 체인이 단일 파이프라인으로 묶여야 할 때 (Phase 4+ 재평가) |
| `ai-adapters-fallback` | 단일 어댑터 + 수동 재시도로 시작. 자동 폴백 체인 재설계 후 복귀 | Phase 6 배포 시 AI 벤더 다중화 필요할 때 |

## 복귀 절차 (필요 시)

1. 해당 하위 디렉토리를 `packages/<name>/` 로 복구
2. 현 스코프에 맞게 capability·API 재설계 (그대로 복귀 금지)
3. `docs/04-ROADMAP.md` · `docs/05-EXECUTION-PLAN.md` 에 복귀 사유·Phase 명시
4. `scripts/test-golden.mjs` 에 테스트 단계 추가
5. `docs/03-ARCHITECTURE.md §3.3/3.4` 표 이동

## 참고

- 이전 스코프 (β Platform) 의 설계 문서: `archive/docs/`
- 이전 세션 로그: `archive/progress_old/sessions/`
