# 12. 데이터 스키마 & API (Data Schema & API)

> **한 줄 요약**: 모든 오브젝트의 **이름/식별자/관계** 를 여기서 한 번에 정의한다. 프런트·백엔드·SDK 가 이 문서를 **"법"** 처럼 참조한다. 스키마가 흔들리면 모든 계층이 흔들린다.

---

## 1. 원칙

1. **Stable IDs, versioned data.** 식별자는 영원히 안 바뀐다. 내용은 버전으로 추적.
2. **Content-addressable + human-readable.** 해시 기반 ID 와 짧은 prefix(`av_`, `stp_`, `tpl_`).
3. **Single source of truth.** 스키마는 `schema/` 디렉터리에 JSON Schema + protobuf.
4. **Backwards compatibility by default.** 이미 publish 된 필드는 삭제 금지, deprecated 마킹.
5. **Idempotency everywhere.** 모든 쓰기 API는 `Idempotency-Key` 헤더 지원.
6. **Pagination & filters are standard.** 리스트 엔드포인트는 커서 기반 페이징.

---

## 2. 주요 엔터티 맵 (Entities)

```
 Organization ──▶ Workspace ──▶ Project ──▶ Avatar ──▶ PartInstance
                       │            │           │
                       ├──▶ StyleProfile        └──▶ Version
                       │
                       ├──▶ Template (ref)
                       │
                       └──▶ LicenseAgreement

 User ──▶ Membership ──▶ Organization
      └──▶ ApiKey
 Job ◀── triggered by Avatar / Export / Batch
```

---

## 3. ID 규약 (ID Conventions)

| prefix | 엔터티 |
|---|---|
| `usr_` | User |
| `org_` | Organization |
| `ws_` | Workspace |
| `prj_` | Project |
| `av_` | Avatar |
| `ver_` | Version |
| `prt_` | PartInstance |
| `stp_` | StyleProfile |
| `tpl_` | Template (ref id if custom) |
| `mot_` | MotionPack |
| `exp_` | ExportJob |
| `job_` | Job (generic) |
| `key_` | ApiKey |
| `lic_` | LicenseAgreement |
| `evt_` | Event |

- 포맷: `{prefix}_{ULID}` (예: `av_01HXYZABC123...`).
- 시간 정렬성 확보(ULID), 충돌 없음, URL 안전.

---

## 4. 엔터티 스키마 (요약 + 주요 필드)

> 상세 JSON Schema 는 `schema/*.json`. 아래는 서사적 설명 + 필수 필드.

### 4.1 User

```json
{
  "id": "usr_...",
  "email": "a@b.com",
  "name": "Nari",
  "locale": "ko-KR",
  "created_at": "...",
  "status": "active",
  "primary_org_id": "org_...",
  "profile": { ... }
}
```

- **Unique**: email.
- 인증은 외부 IdP(OIDC). 비밀번호는 우리 DB에 저장 안 함.

### 4.2 Organization

```json
{
  "id": "org_...",
  "name": "Acme Studios",
  "slug": "acme",
  "plan": "enterprise",
  "created_at": "...",
  "billing_email": "...",
  "feature_flags": { "style_lock": true, ... }
}
```

### 4.3 Workspace

- Organization 하위 논리적 공간. 권한·빌링 경계.

```json
{
  "id": "ws_...",
  "org_id": "org_...",
  "name": "Season 3",
  "default_template_id": "tpl.base.v1.halfbody",
  "default_style_profile_id": "stp_..."
}
```

### 4.4 Project

```json
{
  "id": "prj_...",
  "ws_id": "ws_...",
  "name": "Visual Novel Alpha",
  "description": "...",
  "cover_image_url": "...",
  "member_roles": [
    {"user_id": "usr_...", "role": "editor"},
    ...
  ]
}
```

### 4.5 Avatar

```json
{
  "id": "av_...",
  "prj_id": "prj_...",
  "name": "Alice",
  "template_id": "tpl.base.v1.halfbody",
  "template_version": "1.3.2",
  "style_profile_id": "stp_...",
  "status": "draft" | "generating" | "review" | "published",
  "current_version_id": "ver_...",
  "created_by": "usr_...",
  "created_at": "...",
  "tags": ["vtuber","alpha"],
  "validation": {
    "score": 81,
    "passed": true,
    "issues_count": 2
  },
  "provenance_summary_hash": "sha256:..."
}
```

### 4.6 Version (Avatar)

```json
{
  "id": "ver_...",
  "avatar_id": "av_...",
  "parent_version_id": "ver_...",  // null for root
  "branch": "main" | "costume_b" | ...,
  "note": "made bangs softer",
  "parts": [
    {"slot_id": "face_base", "part_instance_id": "prt_..."},
    {"slot_id": "hair_front", "part_instance_id": "prt_..."},
    ...
  ],
  "style_profile_id_at_time": "stp_...",
  "template_version_at_time": "1.3.2",
  "created_at": "..."
}
```

### 4.7 PartInstance

[04-parts-specification.md §10](./04-parts-specification.md) 에 상세. 여기선 DB 필드 요약.

```json
{
  "id": "prt_...",
  "avatar_id": "av_...",
  "slot_id": "hair_front",
  "raw_image_key": "s3://...",
  "processed_image_key": "s3://...",
  "alpha_key": "s3://...",
  "thumbnail_key": "s3://...",
  "source": { "type": "ai_generated", "adapter": "...", "seed": 73210, "prompt_hash": "...", "references": ["..."] },
  "lineage_parent_id": "prt_...",
  "geometry": { ... },
  "color_stats": { ... },
  "quality": { "auto_score": 82, "issues": [...] },
  "state": "approved"
}
```

### 4.8 StyleProfile

```json
{
  "id": "stp_...",
  "owner": { "type": "user", "id": "usr_..." } | { "type": "org", "id": "org_..." },
  "name": "Soft Pastel Shoujo",
  "visibility": "private" | "org" | "public",
  "tokens": { ... },
  "palette": ["#...", "#..."],
  "reference_images": ["s3://..."],
  "embedding_id": "emb_...",
  "version": 3,
  "locked": false
}
```

### 4.9 Template (Reference)

- 공식 템플릿은 git 저장소 기반. DB 에는 **참조(ID + version)** 만 둔다.
- 커스텀 템플릿은 저장(Template record + files).

### 4.10 MotionPack / ExpressionPack

```json
{
  "id": "mot_...",
  "compat_template": "tpl.base.v1.halfbody@^1",
  "name": "Warm Greetings",
  "motions": ["greet.wave", "nod.yes", ...],
  "files": { ... }
}
```

### 4.11 ExportJob

```json
{
  "id": "exp_...",
  "avatar_id": "av_...",
  "target": "vtube_studio",
  "options": { ... },
  "status": "queued" | "running" | "ready" | "failed",
  "bundle_url": "...",
  "expires_at": "...",
  "license_id": "lic_...",
  "costs": { "cpu_seconds": ..., "bytes_out": ... }
}
```

### 4.12 Job (Pipeline)

```json
{
  "id": "job_...",
  "kind": "avatar_create" | "part_regenerate" | "export" | "validation" | "batch",
  "avatar_id": "av_...?",
  "nodes": [
    {"node_id": "ai_redesign_hair", "status": "completed", "duration_ms": 4120, "cost_usd": 0.023},
    ...
  ],
  "status": "..."
}
```

### 4.13 Event (Audit)

- 모든 상태 전이·사용자 액션은 이벤트로 기록.
- 스트리밍은 Event Broker, 영구 보존은 감사 테이블.

---

## 5. 오브젝트 스토리지 키 규약 (Object Storage)

```
s3://geny-prod/
├── org/{org_id}/
│   ├── avatars/{av_id}/
│   │   ├── raw/{slot}/{prt_id}.png
│   │   ├── processed/{slot}/{prt_id}.png
│   │   ├── thumb/{slot}/{prt_id}.webp
│   │   └── exports/{exp_id}/bundle.zip
│   ├── style_profiles/{stp_id}/
│   ├── references/{uploaded_hash}.ext
│   └── motions/{mot_id}/
├── templates/{tpl_id}/v{ver}/...
└── cache/{content_hash}
```

- 내용 주소(Content-Addressable): `cache/{sha256}` 로 파츠·프롬프트 결과 캐시.
- 업로드는 presigned URL 경유. 서버는 URL 서명만 담당.

---

## 6. API 개요 (Public API v1)

### 6.1 인증

- **사용자 세션**: 쿠키/Bearer (웹).
- **API Key**: Bearer `sk_live_...`, 스콥 지정.
- 모든 쓰기는 `Idempotency-Key` 지원.

### 6.2 REST 엔드포인트 (요약)

```
GET    /api/v1/orgs/{org_id}
GET    /api/v1/workspaces?org_id=...
POST   /api/v1/projects
GET    /api/v1/projects/{prj_id}

POST   /api/v1/avatars
GET    /api/v1/avatars/{av_id}
PATCH  /api/v1/avatars/{av_id}
DELETE /api/v1/avatars/{av_id}

POST   /api/v1/avatars/{av_id}/parts/{slot_id}:regenerate
POST   /api/v1/avatars/{av_id}/parts/{slot_id}:upload   # 사용자 수동
PATCH  /api/v1/avatars/{av_id}/parts/{slot_id}/anchor
POST   /api/v1/avatars/{av_id}/validation:run

POST   /api/v1/exports
GET    /api/v1/exports/{exp_id}

GET    /api/v1/style_profiles
POST   /api/v1/style_profiles
PATCH  /api/v1/style_profiles/{stp_id}

GET    /api/v1/templates
GET    /api/v1/templates/{tpl_id}

GET    /api/v1/jobs/{job_id}                # status
WS     /api/v1/jobs/{job_id}/events         # streaming
```

### 6.3 Batch API

```
POST   /api/v1/batches
{ "project_id": "prj_...", "rows": [{...},{...}] }
GET    /api/v1/batches/{batch_id}
```

### 6.4 에러 포맷

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "hair_front 생성 결과가 스펙을 벗어났습니다.",
    "details": [...],
    "request_id": "req_...",
    "retryable": false
  }
}
```

- HTTP 상태 + 우리 `code` 매핑표. 클라이언트는 `code` 로 분기.
- 4xx 와 5xx 구분 확실. 5xx 는 재시도 가능.

### 6.5 레이트 리밋

- 사용자 티어별 토큰 버킷. 헤더: `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- 초과 시 429 + `Retry-After`.

---

## 7. 이벤트 스키마 (Event Broker)

### 7.1 토픽

```
avatars.created
avatars.updated
avatars.deleted
jobs.updated
parts.regenerated
exports.ready
billing.event
```

### 7.2 공통 envelope

```json
{
  "event_id": "evt_...",
  "type": "avatars.updated",
  "occurred_at": "...",
  "actor": { "type": "user", "id": "usr_..." },
  "org_id": "org_...",
  "resource": { "type": "avatar", "id": "av_..." },
  "payload": { ... },
  "version": 1
}
```

### 7.3 Webhooks

- Enterprise 사용자에게 제공. HMAC 서명, 재시도 백오프.
- 구독 API: `POST /api/v1/webhooks`.

---

## 8. GraphQL (선택적 공개)

- 클라이언트 편의용. β 검토.
- 스키마 자동 생성(REST → GraphQL) vs 직접 작성 중 직접 작성 선호(모델 왜곡 최소).

---

## 9. 실시간(WebSocket / SSE)

- 기본: WebSocket (`/ws?token=...`).
- 채널 구독: `job:{job_id}`, `avatar:{av_id}`, `org:{org_id}`.
- 모든 이벤트는 JSON line.

---

## 10. 파일 스키마 (Avatar Package Internal)

### 10.1 `avatar.json` (내부 표준)

```json
{
  "id": "av_...",
  "name": "Alice",
  "template": "tpl.base.v1.halfbody@1.3.2",
  "style_profile": "stp_...",
  "parts": [
    {"slot": "face_base", "asset": "parts/face_base.png", "meta": "parts/face_base.meta.json"},
    ...
  ],
  "anchors": "anchors.json",
  "physics": "physics.json",
  "motions": ["motions/idle_default.json", ...],
  "license": "license.json",
  "provenance": "provenance.json"
}
```

### 10.2 `provenance.json`

```json
{
  "avatar_id": "av_...",
  "generated": "2026-05-02T...",
  "steps": [
    { "node": "normalize_input", "version": "1.4.0", "duration_ms": 320 },
    { "node": "ai_redesign_face", "adapter": "nano-banana@2025-09", "seed": 12345, "prompt_hash": "..." },
    ...
  ]
}
```

---

## 11. 데이터 무결성 (Integrity)

### 11.1 외래 키

- Avatar → Project → Workspace → Org.
- PartInstance → Avatar → StyleProfile → Org.

### 11.2 Soft delete

- 기본 soft delete. `deleted_at`.
- 30일 후 영구 삭제 job.

### 11.3 계보 무결성

- PartInstance 는 **부모 ID 를 영구 보존**. 부모 삭제 후에도 기록은 유지.

---

## 12. 스키마 변경 관리 (Schema Evolution)

### 12.1 규칙

- **필드 추가**: OK (옵셔널 시작).
- **필드 이름 변경**: 금지. 대신 새 필드 + 마이그레이션.
- **타입 변경**: 금지. 대신 새 필드.
- **삭제**: deprecated 마킹 → 6개월 이상 뒤 실제 제거.

### 12.2 API 버전

- URL path 에 `/v1/`. 하위 호환 깨지는 변경은 `/v2/`.
- 지원 기간: 신규 메이저 공개 후 이전 메이저 **18개월** 유지.

### 12.3 DB 마이그레이션

- 무중단. **expand → migrate → contract** 3단계.

---

## 13. 권한 모델 (RBAC)

### 13.1 기본 롤

| Role | Org | Workspace | Project | Avatar |
|---|---|---|---|---|
| Owner | 모두 | 모두 | 모두 | 모두 |
| Admin | 관리 | 모두 | 모두 | 모두 |
| Editor | 보기 | 참여 | 편집 | 편집 |
| Reviewer | 보기 | 참여 | 보기+댓글+승인 | 보기+댓글+승인 |
| Viewer | 보기 | 보기 | 보기 | 보기 |

### 13.2 리소스 수준

- Avatar 단위 ACL 오버라이드.
- "공유 링크" 는 별도 scope.

### 13.3 조직 간 공유

- Cross-org 공유는 초대 + 합의.

---

## 14. 개인정보 & 규제

- 원본 레퍼런스 이미지: 개인 데이터 가능 → 엄격 암호화.
- 최소 수집 원칙. 서비스 제공 목적 외 사용 금지.
- GDPR/한국 개인정보보호법 준수.
- 데이터 포터빌리티: 사용자는 자기 데이터 전량 export 가능.

---

## 15. SDK (클라이언트)

- 공식 SDK: TypeScript/JavaScript(Node + Browser), Python.
- 자동 생성 + 직접 다듬은 부분 병행.
- 버전: API v1 과 싱크.

### 15.1 예시 (TypeScript)

```ts
import { Geny } from "@geny/sdk";

const geny = new Geny({ apiKey: "sk_live_..." });

const avatar = await geny.avatars.create({
  project_id: "prj_...",
  template_id: "tpl.base.v1.halfbody",
  style_profile_id: "stp_...",
  reference_image_url: "...",
  parts_prompts: { face_base: "...", hair_front: "..." }
});

geny.jobs.subscribe(avatar.job_id, (event) => {
  console.log(event.phase, event.progress);
});
```

---

## 16. 테스트 데이터 & 시드(Seed)

- 개발/CI 용 seed 스크립트: 2–3 조직, 10 프로젝트, 50 아바타.
- 합성 데이터 only. 실사용자 데이터는 금지.

---

## 17. 관찰성 (Data Observability)

- 스키마 린트: 새 PR 에서 schema 변경 자동 검사.
- DB 쿼리 top-N, 느린 쿼리 자동 알람.
- 데이터 품질 지표: 필수 필드 결측률, outlier.

---

## 18. 열린 질문

- GraphQL 공개 여부(운영 부담 vs DX).
- 이벤트 브로커 공개 범위: 내부만? 고객 Webhook 만? 아니면 Kafka 컨슈머도?
- 대형 바이너리의 **로컬 캐시 SDK 지원**(Unity/Unreal) — 네트워크 없이 재생.

---

**다음 문서 →** [13. 기술 스택](./13-tech-stack.md)
