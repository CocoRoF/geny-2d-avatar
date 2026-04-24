# 18. 용어집 (Glossary)

> **한 줄 요약**: 같은 단어를 팀원마다 다르게 쓰면 제품은 흔들린다. 이 문서는 **"우리 프로젝트에서의 공식 정의"** 다. 외부 일반 용법과 다를 수 있다. 다를 때는 항상 이 문서가 이긴다.

---

## A

- **Adapter (AI Adapter)** — 외부/내부 이미지 생성 모델을 우리 파이프라인과 연결하는 얇은 어댑터 레이어. 모든 AI 호출은 어댑터를 통해 이루어진다. [05](./05-ai-generation-pipeline.md) §2.
- **ADR (Architecture Decision Record)** — 중요한 아키텍처 결정의 근거를 기록한 문서. `adr/NNNN-*.md` 형식.
- **Alpha (α)** — 제품 단계: 30명 외부 크리에이터 대상 비공개. [14](./14-roadmap-and-milestones.md) §5.
- **Anchor** — 파츠 정렬의 기준점. 예: `eye_pupil_center_l`, `head_top_center`. [04](./04-parts-specification.md) §4.
- **Auto-Fit** — 후처리된 파츠를 리그 템플릿에 자동으로 얹는 공정. [07](./07-auto-fitting-system.md).
- **Avatar** — 이 플랫폼에서 한 개의 리깅된 2D 캐릭터 인스턴스. ID 접두사 `av_`.
- **AutoPass** — 검수 렌더러가 자동 통과시킨 상태. [08](./08-validation-and-rendering.md) §7.

## B

- **Base Rig Template** — 재사용 가능한 표준 리그(파라미터/디포머/파츠 슬롯). [03](./03-rig-template-spec.md).
- **Batch** — 다량의 아바타를 한 번에 생성/export 하는 작업. [10](./10-customization-workflow.md) §10.
- **Branch** — 하나의 아바타에서 파생된 다른 버전(예: 의상 B 버전). [10](./10-customization-workflow.md) §6.4.
- **β (Open Beta)** — 공개 가입 + 결제 런칭 단계. [14](./14-roadmap-and-milestones.md) §6.
- **Break Detection** — 자동 적합 후, 포즈 세트를 돌려 깨짐을 탐지. [07](./07-auto-fitting-system.md) §7.

## C

- **Canary** — 새 버전을 소수 트래픽에 먼저 노출하는 배포 방식.
- **Canvas** — 파츠/아바타의 작업 해상도 (예: 2048×2048).
- **C2PA** — 콘텐츠 출처/변경 이력을 증명하는 개방 표준. 프로비넌스에 활용.
- **Cascade (모델 캐스케이드)** — 저비용 모델로 초안 → 실패 시 고비용 모델로 재시도. [05](./05-ai-generation-pipeline.md) §10.2.
- **CDI3 (`.cdi3.json`)** — Cubism Display Info. 파라미터/파츠의 UI 메타(그룹핑, 표시명) 를 담는 설명 파일. [11](./11-export-and-deployment.md) §3.2.
- **Checkpoint** — 사용자가 의미 있는 상태로 이름 붙여 저장한 버전. [10](./10-customization-workflow.md) §6.3.
- **CombinedParameters** — Cubism 에서 두 파라미터를 2D 조이스틱처럼 짝지어 편집기에 노출하는 쌍 선언. 예: `(AngleX, AngleY)`. [03](./03-rig-template-spec.md) §12.1.
- **Color Context** — 같은 컬러 톤/광원/채도로 묶이는 파츠 그룹. [04](./04-parts-specification.md) §5.
- **Consistency Pass** — 색/선/광원/알파 를 통일하는 후처리 전체. [06](./06-post-processing-pipeline.md).
- **Credit** — 플랫폼의 사용량 단위(파츠 1호출 ≈ 1 크레딧). [16](./16-monetization-licensing-ip.md) §2.2.
- **Cubism** — Live2D Inc. 의 2D 리깅 SDK. 주요 export 타겟. [11](./11-export-and-deployment.md) §3.

## D

- **DAG (Directed Acyclic Graph)** — 파이프라인 실행 구조. 노드·엣지·부분 재실행 가능. [02](./02-system-architecture.md) §4.
- **Deformer** — 파츠의 변형(회전/왜곡) 을 표현하는 구조. Rotation/Warp/Glue 타입. [03](./03-rig-template-spec.md) §4.
- **Dependency (Part)** — 어떤 파츠가 다른 파츠 없이는 무의미한 관계(예: `eye_iris_l → eye_white_l`).
- **Draw Order** — 파츠 간 Z-순서. [03](./03-rig-template-spec.md) §5.3.
- **ΔE** — CIE Lab/OKLab 기반 색 차이 지표. 후처리 Stage 3 에서 사용. [06](./06-post-processing-pipeline.md) §6.

## E

- **Editor** — 사용자용 아바타 편집 UI. [09](./09-user-interface-ux.md) §4.3.
- **Event Broker** — NATS/Kafka 같은 이벤트 전송 시스템. [02](./02-system-architecture.md) §3.
- **Expression (`.exp3.json`)** — Cubism 표정 파일. 파라미터 목록 + Blend 모드(Add / Multiply / Overwrite) 로 표정 차이를 적용. [11](./11-export-and-deployment.md) §3.2.2.
- **Export** — 아바타를 Cubism/Web/Unity 등 외부 타겟 포맷으로 내보내기. [11](./11-export-and-deployment.md).
- **EyeBlink Group** — Cubism `model3.json` 의 표준 그룹. `ParamEyeLOpen` / `ParamEyeROpen` 을 선언해 자동 깜빡임 파이프라인이 인식. [11](./11-export-and-deployment.md) §3.2.

## F

- **Face Mesh / Face Landmark** — 얼굴 이목구비 키포인트를 찾는 모델 (예: MediaPipe).
- **Fuwa (볼륨 파라미터)** — Cubism 공식 샘플에서 쓰는 관용어. 머리/옷을 동적으로 부풀리는 차분 파라미터(예: `ParamHairFrontFuwa`). 본 프로젝트에선 `*_volume` 로 명명. [03](./03-rig-template-spec.md) §12.1.
- **FX Channel** — 아바타 본체와 분리된 마법/빛/연기/소환물 등 연출 효과 계열 슬롯·파라미터 채널. [04](./04-parts-specification.md) §2.3.
- **FaceID Similarity** — 원본 얼굴과 결과 얼굴 간 정체성 유사도. [08](./08-validation-and-rendering.md) §5.4.
- **Fallback Adapter** — 1차 벤더 실패 시 호출하는 대체 벤더. [05](./05-ai-generation-pipeline.md) §8.
- **Feather (알파 페더)** — 파츠 외곽의 반투명 이행 구간. [04](./04-parts-specification.md) §3.1, [06](./06-post-processing-pipeline.md) §4.
- **Flux-Fill** — 이미지 편집/인페인팅 계열 모델 (벤더).
- **Foundation (stage)** — 제품 로드맵의 초기 인프라/뼈대 구축 단계. [14](./14-roadmap-and-milestones.md) §3.

## G

- **GA (General Availability)** — 정식 출시 단계. [14](./14-roadmap-and-milestones.md) §7.
- **Gate (Quality Gate)** — 검수 점수 기반 자동 통과/리뷰/거절 분기. [08](./08-validation-and-rendering.md) §7.
- **Golden Set** — 회귀 테스트용 고정 아바타/파츠 세트. [15](./15-quality-assurance.md) §4.

## H

- **Half Body Template** — VTuber 기본. 머리·상반신 중심. [03](./03-rig-template-spec.md) §2.1.
- **Headless Renderer** — UI 없이 서버에서 프레임을 렌더하는 렌더러. 검수/썸네일. [08](./08-validation-and-rendering.md) §4.
- **HitArea** — Cubism 에서 클릭/탭 감지 영역으로 선언하는 메타(예: `HitAreaHead`). 인터랙션 이벤트에 사용. [11](./11-export-and-deployment.md) §3.2.
- **Human Review** — 자동 게이트 이후 사람이 확인/수정하는 단계. [08](./08-validation-and-rendering.md) §9, [10](./10-customization-workflow.md) §9.

## I

- **Idempotency Key** — 같은 요청을 두 번 받아도 결과 재사용하기 위한 키. [02](./02-system-architecture.md) §10.3.
- **IP (Intellectual Property)** — 지적 재산권. 스타일/캐릭터/상표. [16](./16-monetization-licensing-ip.md) §3–4.
- **Inpaint / Edit** — 마스크와 프롬프트로 기존 이미지를 수정하는 AI 방식. [05](./05-ai-generation-pipeline.md) §2.
- **IP-Adapter** — 이미지 참조 일관성을 위한 모델(아키텍처) 계열.

## J

- **Job** — 파이프라인 실행 단위. Interactive/Batch/Shadow 등 모드. [02](./02-system-architecture.md) §4.3.

## K

- **Keypoint / Landmark** — 눈/입/코/어깨 등 특정 기준점. 자동 적합의 기초. [07](./07-auto-fitting-system.md) §2.

## L

- **Lab / OKLab** — 색 차이 계산용 색공간. 후처리 Stage 3. [06](./06-post-processing-pipeline.md) §6.
- **Landmark** — 참고: Keypoint 와 동일하게 사용. 얼굴 랜드마크 = face keypoints.
- **License Agreement** — 아바타·파츠·템플릿의 사용 허가 계약. ID 접두사 `lic_`.
- **Lineage** — 파츠가 파생된 계보(부모 PartInstance → 자식). [04](./04-parts-specification.md) §10, [12](./12-data-schema-and-api.md) §4.7.
- **Lipsync** — 입술 싱크. 음성/텍스트 → 모음 파라미터 매핑. [03](./03-rig-template-spec.md) §6.3.
- **LipSync Group** — Cubism `model3.json` 의 표준 그룹. 최소 `[ParamA]`, 정밀 모드는 5 모음. [11](./11-export-and-deployment.md) §3.2.
- **Live2D** — 대표적 2D 리깅 시스템/회사. Cubism 의 모회사.
- **LoRA (Low-Rank Adaptation)** — 모델 미세조정 기술. 스타일 LoRA. [13](./13-tech-stack.md) §6.
- **LPIPS** — 지각 기반 이미지 유사도 지표. 시각 회귀 검증에 사용. [08](./08-validation-and-rendering.md) §10.

## M

- **mao_pro (니지이로 마오)** — Live2D Inc. 공식 샘플 모델. 본 프로젝트의 `halfbody` 템플릿 **벤치마크 레퍼런스**. 저장소 비포함. [index §6.1](./index.md), [03](./03-rig-template-spec.md) §12.1.
- **Marketplace** — 사용자/작가가 템플릿/프리셋/모션팩 을 거래하는 스토어. [16](./16-monetization-licensing-ip.md) §7.
- **Mesh** — 파츠 렌더링/변형에 쓰이는 정점 격자. [03](./03-rig-template-spec.md) §5.
- **moc3 (`.moc3`)** — Cubism 의 바이너리 모델 본체 포맷(메쉬/디포머/파라미터를 포함). [11](./11-export-and-deployment.md) §3.
- **Motion Pack** — 호환 가능한 모션(`idle.default`, `blink.auto` 등) 묶음. ID 접두사 `mot_`.
- **MVP (Internal)** — 내부 5명이 end-to-end 를 성공시키는 최소 제품. [14](./14-roadmap-and-milestones.md) §4.

## N

- **nano-banana** — Google Gemini 2.5 Flash Image (편집/참조 일관성 강점). 1차 어댑터. [05](./05-ai-generation-pipeline.md) §3.
- **NATS** — 경량 이벤트 브로커. 초기 선택. [02](./02-system-architecture.md) §3.
- **NSM (North Star Metric)** — 북극성 지표. WSAC. [01](./01-vision-and-goals.md) §5.1.

## O

- **Observability** — 로그·메트릭·트레이스로 시스템 상태를 추적하는 능력. [02](./02-system-architecture.md) §9.
- **Override (User Override)** — 사용자가 경고를 감수하고 강제 통과. [08](./08-validation-and-rendering.md) §7.3.

## P

- **Palette Lock** — 특정 컬러 팔레트 내로 결과를 강제. [06](./06-post-processing-pipeline.md) §6.4.
- **Parameter Group** — Cubism 편집기/`cdi3.json` 에서 파라미터를 묶는 UI 분류(예: `얼굴`, `눈`, `입`). [03](./03-rig-template-spec.md) §12.1.
- **Part Instance** — 특정 아바타의 특정 슬롯에 배치된 실제 이미지 인스턴스. ID 접두사 `prt_`.
- **Part Slot** — 템플릿이 정의한 "파츠가 들어갈 자리" (예: `hair_front`). [04](./04-parts-specification.md) §2.
- **Part Spec** — 슬롯의 계약서. UV 박스, 앵커, 프롬프트 scope 등. [04](./04-parts-specification.md) §3.
- **Physics** — 머리카락/옷자락의 흔들림을 표현하는 파일(`physics3.json`). [03](./03-rig-template-spec.md) §6.2.
- **Pivot** — 파츠의 회전/스케일 기준점. 좌표 정규화에서 핵심. [06](./06-post-processing-pipeline.md) §9.
- **Pose3 (`.pose3.json`)** — Cubism 파츠 mutex(상호 배타) 그룹 선언 파일. A/B 대체 포즈(팔 세트 등) 에 사용. [11](./11-export-and-deployment.md) §3.2.1.
- **Pose Picker** — 프리뷰 플레이어에서 특정 포즈로 바로 이동. [09](./09-user-interface-ux.md) §4.3.
- **Post-Processing (Pipeline)** — 색/선/광원/알파/이음매 보정. [06](./06-post-processing-pipeline.md).
- **Preset** — 템플릿 + 스타일 프로파일 + 프롬프트 조합의 시작점. [10](./10-customization-workflow.md) §4.
- **Prompt Builder** — 슬롯·스타일·사용자 입력을 합쳐 프롬프트를 조립. [05](./05-ai-generation-pipeline.md) §5.
- **Prompt Scope** — 슬롯이 허용하는 프롬프트 필드 화이트리스트. [04](./04-parts-specification.md) §3.
- **Provenance** — 생성 계보·입력·벤더 기록. [11](./11-export-and-deployment.md) §9.

## Q

- **QA (Quality Assurance)** — 품질 보증 시스템 전반. [15](./15-quality-assurance.md).
- **Quota** — 사용자/조직 단위의 사용 한도. [16](./16-monetization-licensing-ip.md) §2.2.

## R

- **Regeneration (Variation/Refine/Rebuild)** — 재생성 3모드. [10](./10-customization-workflow.md) §8.
- **Reference Image** — AI 생성을 가이드하는 입력 이미지. [05](./05-ai-generation-pipeline.md) §5.2.
- **Relighting** — 광원 방향을 재설정하는 후처리. [06](./06-post-processing-pipeline.md) §7.
- **Rig** — 캐릭터의 변형 시스템(디포머·파라미터·물리 포함).
- **ROI / UV Box** — 파츠가 차지해야 하는 캔버스 영역. [04](./04-parts-specification.md) §3.

## S

- **SAM2** — Meta 의 세그멘테이션 모델. [13](./13-tech-stack.md) §6.3.
- **SDXL** — Stable Diffusion XL. 오픈/자가 호스팅 가능. [05](./05-ai-generation-pipeline.md) §2.
- **Seed** — 비결정적 모델에서의 재현성 파라미터. [05](./05-ai-generation-pipeline.md) §3.3.
- **Seam** — 파츠 간 경계. 이음매 보정. [06](./06-post-processing-pipeline.md) §8.
- **Shadow Deploy** — 새 어댑터/모델을 사용자에게 노출하지 않고 병행 실행해 비교. [05](./05-ai-generation-pipeline.md) §13.2.
- **Slot** — Part Slot 의 동의. [04](./04-parts-specification.md).
- **Stale (Part)** — 의존 상위 파츠가 변경되어 무효화된 하위 파츠.
- **Style Lock** — 스타일 프로파일의 편집 금지. 브랜드/IP 통일. [10](./10-customization-workflow.md) §3.3.
- **Style Profile** — 팔레트·선·톤·레퍼런스의 묶음. 아바타의 룩. ID `stp_`.
- **Symmetry (Part)** — 좌우 대칭 여부. [04](./04-parts-specification.md) §3.

## T

- **Template** — Base Rig Template 의 약칭. ID `tpl_` / `tpl.base.vN.*`.
- **Test Pose Set** — 검수에서 표준으로 돌리는 포즈 집합. [08](./08-validation-and-rendering.md) §3.
- **Temporal** — 워크플로우 엔진. 오케스트레이터 유력 후보. [13](./13-tech-stack.md) §4.
- **TTFE (Time-To-First-Export)** — 신규 사용자가 첫 export 까지 걸린 시간. [01](./01-vision-and-goals.md) §5.2.
- **TTFV (Time-To-First-Value)** — 첫 프리뷰 재생까지의 시간. [09](./09-user-interface-ux.md) §15.

## U

- **UV Box** — 파츠가 차지해야 하는 캔버스 내 사각 영역. [04](./04-parts-specification.md) §3.
- **Unity SDK** — 유니티 통합 패키지(`geny-unity`). [11](./11-export-and-deployment.md) §5.

## V

- **Validation Render** — 표준 포즈로 렌더해 점수를 매기는 검수. [08](./08-validation-and-rendering.md).
- **Vendor Fallback** — 1차 벤더 실패 시 다른 벤더 호출. [02](./02-system-architecture.md) §10.1.
- **Version (Avatar)** — 아바타 상태의 스냅샷. ID `ver_`. [10](./10-customization-workflow.md) §6.
- **VTube Studio** — VTuber 앱. 중요한 첫 export 타겟. [11](./11-export-and-deployment.md) §3.6.

## W

- **Warp Deformer** — 자유 변형 디포머. 얼굴 각도·립싱크 혼합 등. [03](./03-rig-template-spec.md) §4.3.
- **Web SDK (`@geny/web-avatar`)** — 자체 웹 런타임 + 번들 + 컴포넌트. [11](./11-export-and-deployment.md) §4.
- **Webhooks** — 엔터프라이즈에 제공하는 이벤트 콜백. [12](./12-data-schema-and-api.md) §7.3.
- **Workspace** — 조직 하위의 권한/빌링 경계. ID `ws_`. [12](./12-data-schema-and-api.md) §4.3.
- **WSAC (Weekly Successful Avatar Completions)** — 북극성 지표. [01](./01-vision-and-goals.md) §5.1.

## Z

- **Z-order (Draw Order)** — 파츠 렌더링 순서. [03](./03-rig-template-spec.md) §5.3.

---

## 단축 약어 일람

| 약어 | 풀이 |
|---|---|
| NSM | North Star Metric |
| WSAC | Weekly Successful Avatar Completions |
| TTFE | Time-To-First-Export |
| TTFV | Time-To-First-Value |
| DAG | Directed Acyclic Graph |
| ADR | Architecture Decision Record |
| SLO | Service Level Objective |
| SSR | Server-Side Rendering |
| RBAC | Role-Based Access Control |
| OIDC | OpenID Connect |
| C2PA | Content Credentials |
| PII | Personally Identifiable Information |
| NSFW | Not Safe For Work |
| ETA | Estimated Time of Arrival |
| UV | 2D 텍스처 좌표 |
| MoC | Cubism Model Component |
| SDK | Software Development Kit |
| PRO | PRO 플랜 / PRO 품질 |
| Enterprise | 대규모 법인 플랜 |
| T&S | Trust & Safety |
| CS | Customer Support |
| CSM | Customer Success Manager |

---

## 용어 기여 규칙

- 새 용어는 PR 로. **정의 + 최초 출현 문서 링크** 필수.
- 일반 용법과 다르면 **우리 정의가 이긴다** 고 명시.
- 중복/모호 용어는 통합 후 기존 링크를 유지.

---

**끝. 전체 문서 인덱스로 돌아가기 →** [index.md](./index.md)
