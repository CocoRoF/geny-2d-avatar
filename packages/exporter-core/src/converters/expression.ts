import type {
  ExpressionPackDoc,
  ParametersDoc,
  Template,
  TemplateManifest,
} from "../loader.js";

export interface Expression3Parameter {
  Id: string;
  Value: number;
  Blend: "Add" | "Multiply" | "Overwrite";
}

export interface Expression3Json {
  Type: "Live2D Expression";
  FadeInTime: number;
  FadeOutTime: number;
  Parameters: Expression3Parameter[];
}

export interface ConvertExpressionInput {
  pack: ExpressionPackDoc;
  manifest: TemplateManifest;
  parameters: ParametersDoc | null;
}

/**
 * 내부 expression pack → Cubism exp3.json (세션 12).
 *
 * 규약:
 * - D2: target_id 는 snake_case 파라미터 ID. inline `cubism` → manifest.cubism_mapping → throw.
 * - D4: fade 기본값 0.5s.
 * - D5: Blend 리터럴은 그대로 유지(Add/Multiply/Overwrite).
 * - D6: Parameter 타겟만. Part opacity 는 별도 세션으로 유예.
 *
 * 결정론: blends 배열 순서를 그대로 Parameters 에 보존. 호출자가 결정적인 순서(예: JSON 저작 순서)를 책임진다.
 */
export function convertExpression({
  pack,
  manifest,
  parameters,
}: ConvertExpressionInput): Expression3Json {
  const mapping = manifest.cubism_mapping ?? {};
  const resolve = (internal: string): string => {
    if (parameters) {
      const p = parameters.parameters.find((x) => x.id === internal);
      if (p?.cubism) return p.cubism;
    }
    const m = mapping[internal];
    if (m) return m;
    throw new Error(
      `convertExpression: no Cubism mapping for parameter '${internal}' (expression=${pack.expression_id})`,
    );
  };

  const seen = new Set<string>();
  const Parameters: Expression3Parameter[] = pack.blends.map((b) => {
    if (seen.has(b.target_id)) {
      throw new Error(
        `convertExpression: duplicate target_id '${b.target_id}' in expression '${pack.expression_id}'`,
      );
    }
    seen.add(b.target_id);
    return {
      Id: resolve(b.target_id),
      Value: b.value,
      Blend: b.blend,
    };
  });

  return {
    Type: "Live2D Expression",
    FadeInTime: pack.fade_in_sec ?? 0.5,
    FadeOutTime: pack.fade_out_sec ?? 0.5,
    Parameters,
  };
}

export function convertExpressionFromTemplate(
  tpl: Template,
  expressionId: string,
): Expression3Json {
  const pack = tpl.expressions[expressionId];
  if (!pack) {
    throw new Error(
      `convertExpressionFromTemplate: expression '${expressionId}' not in template (have: ${Object.keys(tpl.expressions).sort().join(", ") || "<none>"})`,
    );
  }
  return convertExpression({ pack, manifest: tpl.manifest, parameters: tpl.parameters });
}

/**
 * `expression.smile` → `smile`. 파일시스템/URL 안전.
 * 중첩 표현(`expression.big.smile`)은 `big_smile` — 내부 `.` 는 `_` 로 평탄화.
 */
export function expressionSlug(expressionId: string): string {
  const tail = expressionId.split(".").slice(1);
  if (tail.length === 0) {
    throw new Error(`expressionSlug: malformed expression_id '${expressionId}'`);
  }
  return tail.join("_").toLowerCase();
}
