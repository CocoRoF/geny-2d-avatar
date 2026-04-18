/**
 * `@geny/web-avatar` 런타임이 소비하는 번들 스키마 TS 투영.
 *
 * 권위 정의는 `schema/v1/{web-avatar,atlas,bundle-manifest}.schema.json`. 이 파일은
 * 런타임 소비자(=브라우저) 관점의 최소 형태만 선언한다 — `exporter-core` 는 독립된
 * 별도의 TS 정의를 가지고 있어 두 패키지가 번들 출력 <-> 런타임 입력 계약을 공유한다.
 */

export interface WebAvatarParameterGroup {
  id: string;
  display_name_en: string;
}

export interface WebAvatarParameter {
  id: string;
  range: [number, number];
  default: number;
  group: string;
  channel?: string | null;
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

export interface AtlasTexture {
  path: string;
  width: number;
  height: number;
  format: "png" | "webp";
  premultiplied_alpha: boolean;
}

export interface AtlasSlot {
  slot_id: string;
  texture_path: string;
  uv: [number, number, number, number];
}

export interface AtlasJson {
  schema_version: "v1";
  format: 1;
  textures: AtlasTexture[];
  slots: AtlasSlot[];
}

export interface BundleFileEntry {
  path: string;
  sha256: string;
  bytes: number;
}

export interface WebAvatarBundleManifestJson {
  schema_version: "v1";
  kind: "web-avatar-bundle";
  format: 1;
  template_id: string | null;
  template_version: string | null;
  avatar_id: string | null;
  files: BundleFileEntry[];
}
