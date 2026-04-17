import type {
  PhysicsDoc,
  PhysicsInput,
  PhysicsOutput,
  PhysicsSettingDoc,
  PhysicsVertex,
  Template,
  TemplateManifest,
} from "../loader.js";

export interface Physics3Input {
  Source: { Target: "Parameter"; Id: string };
  Weight: number;
  Type: string;
  Reflect: boolean;
}

export interface Physics3Output {
  Destination: { Target: "Parameter"; Id: string };
  VertexIndex: number;
  Scale: number;
  Weight: number;
  Type: string;
  Reflect: boolean;
}

export interface Physics3Vertex {
  Position: { X: number; Y: number };
  Mobility: number;
  Delay: number;
  Acceleration: number;
  Radius: number;
}

export interface Physics3NormalizationRange {
  Minimum: number;
  Default: number;
  Maximum: number;
}

export interface Physics3Setting {
  Id: string;
  Input: Physics3Input[];
  Output: Physics3Output[];
  Vertices: Physics3Vertex[];
  Normalization: {
    Position: Physics3NormalizationRange;
    Angle: Physics3NormalizationRange;
  };
}

export interface Physics3Json {
  Version: number;
  Meta: {
    PhysicsSettingCount: number;
    TotalInputCount: number;
    TotalOutputCount: number;
    VertexCount: number;
    EffectiveForces: {
      Gravity: { X: number; Y: number };
      Wind: { X: number; Y: number };
    };
    PhysicsDictionary: Array<{ Id: string; Name: string }>;
    Fps: number;
  };
  PhysicsSettings: Physics3Setting[];
}

export interface ConvertPhysicsInput {
  physics: PhysicsDoc;
  manifest: TemplateManifest;
}

/**
 * 내부 physics.json + manifest.cubism_mapping → Cubism physics3.json.
 *
 * 규약:
 * - 파라미터 ID 는 `manifest.cubism_mapping[snake]` 로 매핑. 누락 시 throw (세션 08b D2).
 * - PhysicsDictionary.Name 은 `name.en` 선택 (D3). 로케일 분기는 cdi3 (세션 09) 으로.
 * - `presets` 는 Cubism 에 없어 무시 (D4). `enabled_by_default`, `notes` 도 드롭.
 * - vertex count / input/output count 는 meta 를 그대로 사용 (입력 파일이 schema 검증을 통과했다는 전제).
 */
export function convertPhysics({ physics, manifest }: ConvertPhysicsInput): Physics3Json {
  const mapping = manifest.cubism_mapping ?? {};
  const mapParam = (snake: string, where: string): string => {
    const p = mapping[snake];
    if (!p) {
      throw new Error(
        `convertPhysics: cubism_mapping missing entry for '${snake}' (${where})`,
      );
    }
    return p;
  };

  const settings: Physics3Setting[] = physics.physics_settings.map((s, si) =>
    convertSetting(s, si, mapParam),
  );

  return {
    Version: physics.version,
    Meta: {
      PhysicsSettingCount: physics.meta.physics_setting_count,
      TotalInputCount: physics.meta.total_input_count,
      TotalOutputCount: physics.meta.total_output_count,
      VertexCount: physics.meta.vertex_count,
      EffectiveForces: {
        Gravity: {
          X: physics.meta.effective_forces.gravity.x,
          Y: physics.meta.effective_forces.gravity.y,
        },
        Wind: {
          X: physics.meta.effective_forces.wind.x,
          Y: physics.meta.effective_forces.wind.y,
        },
      },
      PhysicsDictionary: physics.physics_dictionary.map((d) => ({
        Id: d.id,
        Name: d.name.en,
      })),
      Fps: physics.meta.fps,
    },
    PhysicsSettings: settings,
  };
}

function convertSetting(
  s: PhysicsSettingDoc,
  si: number,
  mapParam: (snake: string, where: string) => string,
): Physics3Setting {
  const Input: Physics3Input[] = s.input.map((i: PhysicsInput, ii) => ({
    Source: { Target: "Parameter", Id: mapParam(i.source_param, `settings[${si}].input[${ii}]`) },
    Weight: i.weight,
    Type: i.type,
    Reflect: i.reflect,
  }));
  const Output: Physics3Output[] = s.output.map((o: PhysicsOutput, oi) => ({
    Destination: {
      Target: "Parameter",
      Id: mapParam(o.destination_param, `settings[${si}].output[${oi}]`),
    },
    VertexIndex: o.vertex_index,
    Scale: o.scale,
    Weight: o.weight,
    Type: o.type,
    Reflect: o.reflect,
  }));
  const Vertices: Physics3Vertex[] = s.vertices.map((v: PhysicsVertex) => ({
    Position: { X: v.position.x, Y: v.position.y },
    Mobility: v.mobility,
    Delay: v.delay,
    Acceleration: v.acceleration,
    Radius: v.radius,
  }));
  return {
    Id: s.id,
    Input,
    Output,
    Vertices,
    Normalization: {
      Position: {
        Minimum: s.normalization.position.minimum,
        Default: s.normalization.position.default,
        Maximum: s.normalization.position.maximum,
      },
      Angle: {
        Minimum: s.normalization.angle.minimum,
        Default: s.normalization.angle.default,
        Maximum: s.normalization.angle.maximum,
      },
    },
  };
}

export function convertPhysicsFromTemplate(tpl: Template): Physics3Json {
  if (!tpl.physics) {
    throw new Error(
      `convertPhysicsFromTemplate: template at ${tpl.dir} has no physics.json`,
    );
  }
  return convertPhysics({ physics: tpl.physics, manifest: tpl.manifest });
}
