# Session 125 — rig-templates/README 5 템플릿 실측 카탈로그

- **Date**: 2026-04-21
- **Workstreams**: Rig & Parts / Platform (문서 축)
- **Linked docs**: `docs/03 §2.2·§3·§4·§6.2·§7.3·§11·§13.1` · `docs/04 §3` · `docs/08 §3` · `docs/11 §3.2.1·§3.2.2` · `docs/14 §9.1`
- **Linked ADRs**: `progress/adr/0003-rig-template-versioning.md` · `progress/adr/0004-avatar-as-data.md` · `progress/adr/0005-rig-authoring-gate.md`

---

## 1. 목표 (Goals)

- [x] `rig-templates/README.md` 를 **5 공식 베이스 템플릿 실측 카탈로그** 로 재작성 — 기존 43 줄 스테일(v1.0.1 예시 · parts 24 개 가정 · v1.0.0 구조만 전제 · fullbody 미언급) 을 현재 저장소 실측(halfbody v1.0.0~v1.3.0 + fullbody v1.0.0) 으로 교체.
- [x] 세션 122 (golden step) + 세션 123 (schema/README) + 세션 124 (lint rules) 의 문서 축 패턴 재사용 — 이번엔 테이블 기반(8 컬럼 × 5 행) 으로 변형 적용.
- [x] 인접 드리프트 1 건 해소: INDEX §2 Rig & Parts "49+10 parameters" (세션 107 narrative 기준) → "50+10 (JSON 실측)" + parts 분모 명시(halfbody 19/30 · fullbody 27/38).

## 2. 사전 맥락 (Context)

- 세션 124 PLAN §7 에서 "남은 자율 후보 거의 소진" 판단. 재평가 과정에 `rig-templates/` 디렉터리 자체의 README 를 점검 — 43 줄 스테일 문서 발견 (마지막 major 손질 흔적이 v1.0.0 시점, 세션 01~02 근처로 추정).
- 실측 근거:
  - `rig-templates/base/halfbody/v*.*.*/parameters.json` 4 버전 + `rig-templates/base/fullbody/v1.0.0/parameters.json` 1 버전 = 5 JSON 실측 기준.
  - JSON 실측과 각 `v*.*.*/README.md` narrative 가 -1 차이 (halfbody v1.3.0: JSON 50 / narrative 49, fullbody v1.0.0: JSON 60 / narrative 59). 원인: 버전 README 가 author 관점에서 `overall_*` 구조 파라미터(overall_scale / overall_warp 등) 를 제외하고 세는 관습.
  - 세션 123/124 에서 확립한 원칙 — **JSON/코드가 실측 권위**, author narrative (버전 README) 는 당시 설계 의도 보존용.
  - fullbody 60 = halfbody v1.3.0 50 공유 + fullbody 전용 10 — `len(set(halfbody ids) ∩ set(fullbody ids)) == 50` Python set intersection 실측.
- 차단 요소: 없음. 자기완결적.
- 가정: 세션별 도입 정보(v1.0.0→01~02 / v1.1.0→06 / v1.2.0→32~35 / v1.3.0→45~50 / fullbody v1.0.0→55~71) 는 git log + `progress/sessions/` slug + `v*.*.*/README.md` 실측으로 권위 확보.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| rig-templates 루트 README 재작성 | `rig-templates/README.md` | 5 템플릿 × 8 실측 컬럼 카탈로그 + 네임스페이스/버전 디렉터리 규약/검증 게이트/마이그레이션 체인 재구성 | ✅ 완료 (~100 줄) |
| INDEX §2 Rig & Parts 인접 드리프트 해소 | `progress_0420/INDEX.md` | "49+10 파라미터" → "50+10 (JSON 실측)" + narrative 설명 + parts 분모 명시 | ✅ 완료 |
| INDEX §1 헤더 / §4 갱신 | `progress_0420/INDEX.md` | "124 직후" → "125 직후" + 단계 cell 에 rig-templates 카탈로그 추가 + §4 "125 후보" → "126 후보 (소진)" | ✅ 완료 |
| PLAN 헤더 / §3 / §7 갱신 | `progress_0420/PLAN.md` | "125+" → "126+" + 세션 125 완료 entry + §7 재작성 (소진 선언) | ✅ 완료 |
| SUMMARY 헤더 / §13 | `progress_0420/SUMMARY.md` | "1~124" → "1~125" + §13 row append | ✅ 완료 |

## 4. 결정 (Decisions)

### D1. In-place 재작성 (vs. 이어 쓰기)

세션 123 의 `schema/README.md` 처리와 동일 원칙. 기존 43 줄에는 (1) v1.0.1 예시 — 존재하지 않는 버전, (2) parts 24 개 가정 — halfbody v1.0.0 실측은 27, (3) v1.0.0 단일 구조 전제 — v1.1.0+ pose.json · v1.2.0+ expressions/textures/ 진화 반영 부재, (4) fullbody 완전 미언급 등 4 축 동시 스테일. 이어 쓰는 접근은 독자에게 "어느 줄이 최신인가" 탐색 부담을 전가 — **전체 대체** 가 유일한 정직한 선택.

version 별 `v*.*.*/README.md` 는 **당시 저자 관점의 narrative** 로 보존(손대지 않음). 루트 README 는 **실측 카탈로그** 로 포지션 분리.

### D2. JSON 실측 vs. narrative 불일치 처리

halfbody v1.3.0 `parameters.json` 은 50 개, 같은 버전 README 는 "49 parameters" 표기. 원인: `parameters.json` 은 `overall_scale` / `overall_warp` 등 구조적 overall 파라미터를 포함하지만, 버전 README 는 author 관점에서 이를 제외하고 "생성 파라미터" 만 셈. fullbody v1.0.0 도 동일 컨벤션(JSON 60 / narrative 59).

**해결**: 루트 README 카탈로그는 JSON len() 을 그대로 사용(세션 123/124 와 동일 "측정이 권위" 원칙), 각주 블록으로 "narrative 는 -1 표기, 이는 `overall_*` 제외 관습" 명시. 버전 README 는 수정하지 않음 (당시 설계 의도 보존 — 세션 로그 축 보존 정책의 연장선).

INDEX §2 는 세션 107 doc 의 "49+10 파라미터" 표현이 memory 로 전파된 것이므로 이번에 보정 — "50+10 (JSON 실측)" + 설명문 삽입.

### D3. 인접 드리프트 처리 범위

세션 121/122 D4 의 "adjacent drift 는 primary work 세션 내에서 해소" 정책 적용. 본 세션에서 검증한 드리프트:
- **drift 해소**: INDEX §2 "49+10" → "50+10" (JSON 실측 반영).
- **drift 확인 후 no-op**: 세션 107 이후의 memory/doc 텍스트 "19 파츠 / 27 파츠" 는 `parameter_ids` opt-in **파츠 수** 지표 — `python3` 로 확인 결과 halfbody 19/30 · fullbody 27/38 정확. 단 분모가 암묵적이라 독자가 "halfbody parts total 과 동일한가" 오해할 여지 — 분모 명시 보강(단순 표기 보완, drift 아님).
- **손대지 않음**: 버전 READMEs 의 -1 표기 (D2 결정대로 역사 narrative 보존).

### D4. 테이블 기반 구조 (vs. 4-라인 블록 반복)

세션 122/124 는 20~30 항목을 각 4-라인으로 나열. 본 세션은 5 항목 × 8 컬럼 — 전체가 한 테이블에 들어감. 4-라인 반복보다 **단일 테이블 + 진화 축 주석** 이 시인성 우위. 세션 123 의 7-그룹 구조도 그룹 간 이질성이 컸기에 그룹화가 유효했던 반면, 리그 템플릿은 family + version 2 축만 존재 — 테이블이 자연스러움.

### D5. 자율 후보 완전 소진 선언

6 세션 연속(120→121→122→123→124→125) 의 문서·색인 축 작업이 끝나면서 자기완결적 자율 후보 거의 소멸. PLAN §7 에 명시적으로 "세션 126 자율 iteration 발동 시 **소진 선언 minimal 세션 + commit + push + 사용자 지시 대기**" 기록 — 미래 loop 에게 신호.

## 5. 실행 (Execution)

1. `rig-templates/` 전수 검사 — base/halfbody/{v1.0.0,v1.1.0,v1.2.0,v1.3.0} + base/fullbody/v1.0.0 존재 확인.
2. 5 JSON 측정 (parameters/deformers/parts/physics/motions/expressions/test_poses 카운트).
3. `python3` set intersection 으로 fullbody 60 = halfbody 50 공유 + 전용 10 확인.
4. `rig-templates/README.md` 교체 작성.
5. `progress_0420/INDEX.md` — §1 헤더 "124→125", §1 단계 cell 추가, §1 누적 세션 "124→125", §2 Rig & Parts 드리프트 해소("49+10→50+10" + parts 분모 명시), §4 "125→126 후보 (소진)".
6. `progress_0420/PLAN.md` — 헤더 "125+→126+", §3 세션 125 entry, §7 재작성(세션 126 = 소진 선언).
7. `progress_0420/SUMMARY.md` — 헤더 "1~124→1~125", §13 row append.
8. `memory/project_foundation_state.md` 업데이트.
9. commit + push.

## 6. 검증 (Verification)

- 카탈로그 테이블 값 재확인:
  - halfbody v1.0.0: parts=27 params=38 deformers=14 physics=3 expressions=0 motions=7 test_poses=1
  - halfbody v1.1.0: 29 / 41 / 16 / 3 / 0 / 7 / 1 (pose.json 신규)
  - halfbody v1.2.0: 29 / 46 / 18 / 9 / 3 / 7 / 1 (expressions/ · textures/ 신규, Fuwa 5 포함)
  - halfbody v1.3.0: 30 / 50 / 21 / 12 / 3 / 9 / 1 (ahoge 추가, PhysicsSetting 12/12 달성)
  - fullbody v1.0.0: 38 / 60 / 29 / 17 / 3 / 9 / 1 (halfbody 50 공유 + 전용 10)
- `node scripts/validate-schemas.mjs` → `checked=244 failed=0` (변경 없음).
- 링크 존재 확인 (runbook 03 · ADR 0003/0005 · docs/03·04 · schema/README).
- runbook 03 · schema/README · SUMMARY · INDEX 서로 참조 링크 유효성 확인.

## 7. 리스크 / 다음 이터레이션 힌트

- **자율 후보 완전 소진**: 문서·색인 축 6 연속. 남은 self-contained 가능 후보: (1) progress/notes 축 — ADR 0007 diff 노트 외에 새로 쓸 근거 부족, (2) lint test coverage 스냅샷 — 세션 124 에 이미 포함됨, (3) 각 패키지 dist 크기 스냅샷 — 바이트 측정 가능하나 변동 주기 불명. 모두 중복 위험 또는 ROI 낮음.
- **세션 126 권장 대응**: 자율 loop 발동 시 "소진 선언" minimal 세션 + 사용자 prompt 대기. 또는 사용자 지시(ADR 0007 Decision 확정 / BL-STAGING 해제 / Runtime 착수) 에 의해 경로 전환.
- **버전 README narrative vs. JSON**: 미래 저자가 버전 README 의 "49" / "59" 를 보고 50 / 60 으로 수정하려 들 수 있음 — 루트 README 의 각주 블록이 방어.

## 8. Follow-up

- ADR 0007 Decision 확정(사용자 입력) → Option 에 따라 렌더러 패키지 확장 재개.
- BL-STAGING / BL-VENDOR-KEY / BL-DEPRECATION-POLICY 해제 시 각 blocked candidate 재개(PLAN §1.1 참고).
- 자율 모드 지속 시 "소진 선언" minimal 세션 패턴 적용.

## 9. 업데이트된 파일

- `rig-templates/README.md` — 전면 재작성 (43 줄 → ~100 줄, 5 템플릿 실측 카탈로그).
- `progress_0420/INDEX.md` — §1 헤더 / §1 단계 cell / §1 누적 세션 / §2 Rig & Parts / §4.
- `progress_0420/PLAN.md` — 헤더 / §3 / §7.
- `progress_0420/SUMMARY.md` — 헤더 / §13.
- `memory/project_foundation_state.md` — name / description / summary.
- `progress/sessions/2026-04-21-session-125-rig-templates-catalog.md` (이 파일).
