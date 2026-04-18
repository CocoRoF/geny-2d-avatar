# schema/

모든 내부 계약(Contract) 의 단일 진실 공급원.
앱·워커·SDK 는 여기 정의된 JSON Schema 만을 신뢰한다.

## 방침 (ADR 0002)

- 작성 포맷: **JSON Schema 2020-12**.
- 언어 바인딩(Python Pydantic, TS Zod) 은 **생성물**. 사람이 직접 편집하지 않는다.
- 스키마 변경은 **SemVer**. 호환 깨짐은 major bump + 마이그레이션 노트.
- `schema/v{N}/` 로 major 를 나눈다. 동일 major 내 minor/patch 는 `$schema` + `x-version` 메타로 표기.

## 구조

```
schema/
├── README.md
├── v1/
│   ├── rig-template.schema.json        # docs/03 전체
│   ├── part-spec.schema.json           # docs/04 §3
│   ├── avatar-metadata.schema.json     # docs/12 §4.5
│   ├── avatar-export.schema.json       # docs/11 §3.5 — 번들 조립 입력 (세션 11)
│   ├── expression-pack.schema.json     # docs/11 §3.2.2 — 표정 팩 (세션 12)
│   ├── bundle-manifest.schema.json     # docs/11 §4.5 — 번들 루트 bundle.json (세션 13; kind=cubism-bundle|web-avatar-bundle)
│   ├── license.schema.json             # docs/11 §9.1 — 라이선스 (Ed25519 서명, 세션 14)
│   ├── provenance.schema.json          # docs/11 §9.2 — 파츠 계보 + 후처리 이력 (세션 14)
│   ├── web-avatar.schema.json          # docs/11 §4.5 — `@geny/web-avatar` 런타임 전용 경량 번들 메타 (세션 15; 세션 18 stage 2 — textures[].{width,height,bytes,sha256} + atlas 필드 확정)
│   ├── atlas.schema.json               # docs/11 §4.5 — 텍스처 UV/치수 매핑 (세션 18 stage 2)
│   ├── signer-registry.schema.json     # docs/11 §9.3 — 발급자 공개키 레지스트리 (세션 21, `@geny/license-verifier` 소비)
│   ├── ai-adapter-task.schema.json     # docs/05 §2.2 — AI 어댑터 입력 계약 (세션 22, `@geny/ai-adapter-core` 소비)
│   ├── ai-adapter-result.schema.json   # docs/05 §2.2 — AI 어댑터 출력 계약 (세션 22, provenance ai_generated 엔트리 직결)
│   ├── style-profile.schema.json       # docs/10 §3 (미작성)
│   ├── export-job.schema.json          # docs/12 §4.9 (미작성)
│   └── common/
│       └── ids.json                    # ID 접두사·정규식 공용 정의 (미작성)
└── examples/                            # 각 스키마의 valid/invalid 예제
```

## 검증

```bash
node scripts/validate-schemas.mjs
```

Ajv 로 예제 파일까지 검증한다. CI 에서 PR 마다 실행 예정(세션 02).
