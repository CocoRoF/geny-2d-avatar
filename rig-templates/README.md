# rig-templates/

`docs/03` 에서 정의한 **베이스 리그 템플릿** 의 구현.
각 템플릿은 파라미터·디포머·파츠 슬롯·물리·모션 을 **모두 선언**한다.

## 네임스페이스

- `base/*` — 공식 템플릿 (릴리스 단계별 공급, `docs/14 §9.1`).
- `community/*` — 커뮤니티 공개 템플릿 (GA 이후, `docs/03 §2.2`).
- `custom/*` — 엔터프라이즈 파생 (`docs/03 §11`). 이 저장소에는 포함하지 않는다.

## 버전 디렉터리

템플릿 루트 아래 **SemVer 풀 버전** 으로 디렉터리를 둔다 (ADR 0003):

```
rig-templates/base/halfbody/
├── v1.0.0/         ← 현재 작업 중
├── v1.0.1/         ← 패치
└── v1.1.0/         ← 마이너
```

## 디렉터리 구조 (단일 버전)

```
v1.0.0/
├── template.manifest.json    # 템플릿 메타
├── parameters.json           # 표준 파라미터 세트
├── deformers.json            # 디포머 트리 (세션 02)
├── parts/                    # 파츠 스펙 (24개)
│   └── *.spec.json
├── mesh/                     # 메쉬 (이진 + 메타)
├── physics/
│   └── physics.json
├── motions/
│   └── *.json
├── test_poses/
│   └── validation_set.json
└── README.md
```

모든 JSON 은 `schema/v1/*.schema.json` 에 대해 검증된다.
