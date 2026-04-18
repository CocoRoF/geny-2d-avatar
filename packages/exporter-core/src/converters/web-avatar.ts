/**
 * Rig Template → `web-avatar.json` 변환기 (세션 15 stage 1).
 *
 * `@geny/web-avatar` 런타임이 소비하는 경량 JSON 메타. Cubism `.moc3` 를 직접
 * 파싱하지 않고 우리 런타임 전용 구조로 요약한다 (docs/11 §4.5). 결정론(canonical
 * JSON) 을 위해 배열은 모두 안정적 키로 정렬된다.
 */

import type { Template } from "../loader.js";

export interface WebAvatarParameterGroup {
  id: string;
  display_name_en: string;
}

export interface WebAvatarParameter {
  id: string;
  range: [number, number];
  default: number;
  group: string;
  channel: string | null;
}

export interface WebAvatarPart {
  slot_id: string;
  role: string;
}

export interface WebAvatarMotion {
  pack_id: string;
  duration_sec: number;
  fade_in_sec: number;
  fade_out_sec: number;
  loop: boolean;
}

export interface WebAvatarExpression {
  expression_id: string;
  name_en: string;
  fade_in_sec: number;
  fade_out_sec: number;
}

export interface WebAvatarTexture {
  path: string;
  purpose: "albedo";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface WebAvatarAtlasRef {
  path: "atlas.json";
  sha256: string;
}

export interface WebAvatarPhysicsSummary {
  setting_count: number;
  total_output_count: number;
}

export interface WebAvatarJson {
  schema_version: "v1";
  format: 1;
  template_id: string | null;
  template_version: string | null;
  avatar_id: string | null;
  parameter_groups: WebAvatarParameterGroup[];
  parameters: WebAvatarParameter[];
  parts: WebAvatarPart[];
  motions: WebAvatarMotion[];
  expressions: WebAvatarExpression[];
  textures: WebAvatarTexture[];
  atlas: WebAvatarAtlasRef | null;
  physics_summary: WebAvatarPhysicsSummary | null;
}

export interface ConvertWebAvatarOptions {
  /** avatar-export 경유라면 avatar_id. 없으면 null. */
  avatarId?: string;
  /**
   * 번들에 포함될 텍스처 참조 목록. stage 1 에서는 호출자가 직접 주입했지만,
   * stage 2 부터는 `assembleWebAvatarBundle` 가 template.textures 를 읽어 자동 계산.
   * 여전히 override 용도로 직접 전달 가능 (예: AI 생성 텍스처 주입).
   */
  textures?: WebAvatarTexture[];
  /** atlas.json 참조. textures 가 있으면 필수, 없으면 null. */
  atlas?: WebAvatarAtlasRef | null;
}

/**
 * rig template 을 web-avatar.json 형태로 변환.
 *
 * 설계 결정:
 *  - 파라미터는 id 알파벳 정렬. physics_output=true 라도 제외하지 않음 (런타임이
 *    물리 엔진을 붙일 때 id 를 참조할 수 있어야 함).
 *  - parts 는 slot_id 정렬. role 만 노출 (mesh/그래픽 메타는 stage 2+ 책임).
 *  - motions 는 pack_id 정렬. 런타임이 제어용 UI 를 만들 때 사용.
 *  - expressions 는 expression_id 정렬. name_en 은 반드시 존재 (템플릿이 ko/ja 만
 *    있을 경우 expression_id 로 fallback).
 *  - physics_summary 는 physics.json 이 없으면 null.
 *  - textures 는 opts.textures 가 있으면 그대로, 없으면 `[]`. Stage 1 에서는 PNG
 *    파일을 번들에 동봉하지 않으므로 기본 빈 배열이 자연스럽다.
 */
export function convertWebAvatar(
  tpl: Template,
  opts: ConvertWebAvatarOptions = {},
): WebAvatarJson {
  const parameters = tpl.parameters;

  const parameterGroups: WebAvatarParameterGroup[] = parameters
    ? parameters.groups
        .map<WebAvatarParameterGroup>((g) => ({
          id: g.id,
          display_name_en: g.display_name.en,
        }))
        .sort(byKey<WebAvatarParameterGroup>("id"))
    : [];

  const parametersList: WebAvatarParameter[] = parameters
    ? parameters.parameters
        .map<WebAvatarParameter>((p) => ({
          id: p.id,
          range: p.range,
          default: p.default,
          group: p.group,
          channel: p.channel ?? null,
        }))
        .sort(byKey<WebAvatarParameter>("id"))
    : [];

  const parts: WebAvatarPart[] = Object.values(tpl.partsById)
    .map<WebAvatarPart>((p) => ({
      slot_id: p.slot_id,
      role: p.role,
    }))
    .sort(byKey<WebAvatarPart>("slot_id"));

  const motions: WebAvatarMotion[] = Object.values(tpl.motions)
    .map<WebAvatarMotion>((m) => ({
      pack_id: m.pack_id,
      duration_sec: m.meta.duration_sec,
      fade_in_sec: m.meta.fade_in_sec,
      fade_out_sec: m.meta.fade_out_sec,
      loop: m.meta.loop,
    }))
    .sort(byKey<WebAvatarMotion>("pack_id"));

  const expressions: WebAvatarExpression[] = Object.values(tpl.expressions)
    .map<WebAvatarExpression>((e) => ({
      expression_id: e.expression_id,
      name_en: e.name?.en ?? e.expression_id,
      fade_in_sec: e.fade_in_sec ?? 0.5,
      fade_out_sec: e.fade_out_sec ?? 0.5,
    }))
    .sort(byKey<WebAvatarExpression>("expression_id"));

  const textures: WebAvatarTexture[] = (opts.textures ?? [])
    .slice()
    .sort(byKey<WebAvatarTexture>("path"));

  const atlas: WebAvatarAtlasRef | null = opts.atlas ?? null;

  const physicsSummary: WebAvatarPhysicsSummary | null = tpl.physics
    ? {
        setting_count: tpl.physics.meta.physics_setting_count,
        total_output_count: tpl.physics.meta.total_output_count,
      }
    : null;

  return {
    schema_version: "v1",
    format: 1,
    template_id: tpl.manifest.id ?? null,
    template_version: tpl.manifest.version ?? null,
    avatar_id: opts.avatarId ?? null,
    parameter_groups: parameterGroups,
    parameters: parametersList,
    parts,
    motions,
    expressions,
    textures,
    atlas,
    physics_summary: physicsSummary,
  };
}

function byKey<T>(key: keyof T): (a: T, b: T) => number {
  return (a, b) => {
    const av = a[key] as unknown as string;
    const bv = b[key] as unknown as string;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  };
}
