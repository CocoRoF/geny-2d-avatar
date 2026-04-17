# apps/

실행 가능한 최상위 앱이 위치한다. `docs/13 §13` 기준.

| 디렉터리 | 언어 | 역할 | 관련 docs |
|---|---|---|---|
| `web/` | Next.js 15 (App Router) + React 19 + TypeScript | 에디터·프리뷰·계정 UI | 09, 10, 11 |
| `api/` | TypeScript (Fastify or Nest) + FastAPI (core) | Edge API + Core Pipeline API | 02, 12 |
| `worker-cpu/` | Python 3.12 | Stage 1/3/6 후처리, 세그·키포인트 | 06, 07 |
| `worker-gpu/` | Python 3.12 | Stage 4 relighting 등 GPU 작업 | 06 §7 |
| `worker-ai/` | Python 3.12 | AI Adapter 호출 전담 | 05 |

각 앱은 자체 `README.md` 와 `package.json` / `pyproject.toml` 을 가진다.
공통 유틸은 `packages/` 를 import 한다.

## 실행 (예정)

```bash
task dev            # 전체 로컬 개발
task web            # web 만
task worker-cpu     # cpu 워커 만
```

Foundation 단계에서는 각 앱의 스켈레톤만 준비하고, 구현은 이후 세션에서 추가된다.
