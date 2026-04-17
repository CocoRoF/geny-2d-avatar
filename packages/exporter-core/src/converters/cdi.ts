import type {
  ParameterDoc,
  ParametersDoc,
  PartSpec,
  Template,
  TemplateManifest,
} from "../loader.js";

export interface Cdi3Parameter {
  Id: string;
  GroupId: string;
  Name: string;
}

export interface Cdi3ParameterGroup {
  Id: string;
  GroupId: string;
  Name: string;
}

export interface Cdi3Part {
  Id: string;
  Name: string;
}

export interface Cdi3CombinedParameter {
  ParameterIdH: string;
  ParameterIdV: string;
}

export interface Cdi3Json {
  Version: number;
  Parameters: Cdi3Parameter[];
  ParameterGroups: Cdi3ParameterGroup[];
  Parts: Cdi3Part[];
  CombinedParameters: Cdi3CombinedParameter[];
}

export interface ConvertCdiInput {
  parameters: ParametersDoc;
  partsById: Record<string, PartSpec>;
  manifest: TemplateManifest;
}

/**
 * 내부 parameters.json + parts/*.spec.json + manifest → Cubism cdi3.json.
 *
 * 규약 (세션 09 결정):
 * - D1: Parameters.Name 은 `display_name.en` 고정. 로케일 분기는 별도 레이어.
 * - D2: GroupId 는 내부 group id 의 PascalCase (`eyes` → `Eyes`).
 * - D3: CombinedParameters 는 parameters.json `combined_axes` 에서 직접 매핑.
 *        각 파라미터의 Cubism ID 는 인라인 `cubism` 필드 우선, 없으면 `manifest.cubism_mapping[snake]`.
 * - D4: Parts.Name 은 slot_id 의 `_` → 공백·각 토큰 대문자화 (e.g., `arm_l_a` → `Arm L A`).
 *        파츠의 cubism_part_id 는 그대로 Id 로 사용.
 * - 모든 배열은 입력 순서 유지. Parts 는 slot_id 알파벳 정렬로 결정론 확보.
 */
export function convertCdi({ parameters, partsById, manifest }: ConvertCdiInput): Cdi3Json {
  const mapping = manifest.cubism_mapping ?? {};
  const paramCubismId = (p: ParameterDoc): string => {
    const id = p.cubism ?? mapping[p.id];
    if (!id) {
      throw new Error(
        `convertCdi: no Cubism mapping for parameter '${p.id}' (neither inline 'cubism' nor manifest.cubism_mapping)`,
      );
    }
    return id;
  };

  const groupByInternalId = new Map<string, string>();
  for (const g of parameters.groups) {
    groupByInternalId.set(g.id, toPascalCase(g.id));
  }

  const Parameters: Cdi3Parameter[] = parameters.parameters.map((p) => ({
    Id: paramCubismId(p),
    GroupId: groupByInternalId.get(p.group) ?? toPascalCase(p.group),
    Name: p.display_name.en,
  }));

  const ParameterGroups: Cdi3ParameterGroup[] = parameters.groups.map((g) => ({
    Id: toPascalCase(g.id),
    GroupId: "",
    Name: g.display_name.en,
  }));

  const slotIds = Object.keys(partsById).sort();
  const Parts: Cdi3Part[] = slotIds.map((slotId) => {
    const spec = partsById[slotId]!;
    if (!spec.cubism_part_id) {
      throw new Error(`convertCdi: part '${slotId}' is missing cubism_part_id`);
    }
    return {
      Id: spec.cubism_part_id,
      Name: synthesizePartName(spec.slot_id),
    };
  });

  const paramIdByInternal = new Map<string, string>();
  for (const p of parameters.parameters) paramIdByInternal.set(p.id, paramCubismId(p));

  const CombinedParameters: Cdi3CombinedParameter[] = parameters.combined_axes.map((axis, i) => {
    if (axis.length !== 2) {
      throw new Error(
        `convertCdi: combined_axes[${i}] must have exactly 2 entries, got ${axis.length}`,
      );
    }
    const h = axis[0]!;
    const v = axis[1]!;
    const idH = paramIdByInternal.get(h) ?? mapping[h];
    const idV = paramIdByInternal.get(v) ?? mapping[v];
    if (!idH) {
      throw new Error(
        `convertCdi: combined_axes[${i}] references unknown parameter '${h}'`,
      );
    }
    if (!idV) {
      throw new Error(
        `convertCdi: combined_axes[${i}] references unknown parameter '${v}'`,
      );
    }
    return { ParameterIdH: idH, ParameterIdV: idV };
  });

  return {
    Version: 3,
    Parameters,
    ParameterGroups,
    Parts,
    CombinedParameters,
  };
}

/**
 * `eyes` → `Eyes`, `face_base` → `FaceBase`.
 */
function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .filter((t) => t.length > 0)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join("");
}

/**
 * `arm_l_a` → `Arm L A`, `face_base` → `Face Base`.
 * slot_id 는 snake_case, 각 토큰을 공백으로 연결하고 첫 글자 대문자.
 */
function synthesizePartName(slotId: string): string {
  return slotId
    .split("_")
    .filter((t) => t.length > 0)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(" ");
}

export function convertCdiFromTemplate(tpl: Template): Cdi3Json {
  if (!tpl.parameters) {
    throw new Error(
      `convertCdiFromTemplate: template at ${tpl.dir} has no parameters.json`,
    );
  }
  return convertCdi({
    parameters: tpl.parameters,
    partsById: tpl.partsById,
    manifest: tpl.manifest,
  });
}
