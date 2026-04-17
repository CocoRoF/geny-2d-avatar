import type {
  MotionCurve,
  MotionPackDoc,
  MotionUserDataEntry,
  Template,
  TemplateManifest,
} from "../loader.js";

export interface Motion3Curve {
  Target: "Parameter" | "PartOpacity";
  Id: string;
  FadeInTime: number;
  FadeOutTime: number;
  Segments: number[];
}

export interface Motion3UserDataEntry {
  Time: number;
  Value: string;
}

export interface Motion3Json {
  Version: 3;
  Meta: {
    Duration: number;
    Fps: number;
    Loop: boolean;
    AreBeziersRestricted: boolean;
    CurveCount: number;
    TotalSegmentCount: number;
    TotalPointCount: number;
    UserDataCount: number;
    TotalUserDataSize: number;
    FadeInTime: number;
    FadeOutTime: number;
  };
  Curves: Motion3Curve[];
  UserData: Motion3UserDataEntry[];
}

export interface ConvertMotionInput {
  motion: MotionPackDoc;
  manifest: TemplateManifest;
}

/**
 * 내부 motion pack → Cubism motion3.json (per pack, 세션 08b D6).
 *
 * 규약:
 * - `target: "parameter"` → Cubism `Target: "Parameter"`, target_id 는 cubism_mapping 으로 매핑 (D2).
 * - `target: "part_opacity"` → Cubism `Target: "PartOpacity"`, id 는 slot 의 `cubism_part_id` (세션 09 통합).
 *   v0.1.0 에선 파츠 opacity 타겟 motion 이 없으므로 매핑은 throw 로 가드 (D8).
 * - Segments 배열은 그대로 복제 — 내부 인코딩이 Cubism 과 1:1 (세션 04 D3, 세션 08b D5).
 * - `AreBeziersRestricted` 는 안전하게 false 고정 (D7).
 * - Curve 의 `FadeInTime`/`FadeOutTime` 은 개별 커브 지정값 우선, 없으면 -1 (Cubism convention: 모션 전체 값 상속).
 */
export function convertMotion({ motion, manifest }: ConvertMotionInput): Motion3Json {
  const mapping = manifest.cubism_mapping ?? {};
  const userData = motion.user_data ?? [];

  const Curves: Motion3Curve[] = motion.curves.map((c, ci) => convertCurve(c, ci, mapping));

  const UserData: Motion3UserDataEntry[] = userData.map((u: MotionUserDataEntry) => ({
    Time: u.time_sec,
    Value: u.value,
  }));

  return {
    Version: 3,
    Meta: {
      Duration: motion.meta.duration_sec,
      Fps: motion.meta.fps,
      Loop: motion.meta.loop,
      AreBeziersRestricted: false,
      CurveCount: motion.meta.curve_count,
      TotalSegmentCount: motion.meta.total_segment_count,
      TotalPointCount: motion.meta.total_point_count,
      UserDataCount: UserData.length,
      TotalUserDataSize: UserData.reduce((acc, u) => acc + u.Value.length, 0),
      FadeInTime: motion.meta.fade_in_sec,
      FadeOutTime: motion.meta.fade_out_sec,
    },
    Curves,
    UserData,
  };
}

function convertCurve(
  c: MotionCurve,
  ci: number,
  mapping: Record<string, string>,
): Motion3Curve {
  let Target: "Parameter" | "PartOpacity";
  let Id: string;
  if (c.target === "parameter") {
    Target = "Parameter";
    const mapped = mapping[c.target_id];
    if (!mapped) {
      throw new Error(
        `convertMotion: cubism_mapping missing entry for parameter '${c.target_id}' (curves[${ci}])`,
      );
    }
    Id = mapped;
  } else if (c.target === "part_opacity") {
    throw new Error(
      `convertMotion: curves[${ci}].target='part_opacity' not yet supported (session 09 — needs part cubism_part_id lookup)`,
    );
  } else {
    throw new Error(
      `convertMotion: curves[${ci}].target='${c.target as string}' is not a recognized target`,
    );
  }
  return {
    Target,
    Id,
    FadeInTime: c.fade_in_sec ?? -1,
    FadeOutTime: c.fade_out_sec ?? -1,
    Segments: c.segments.slice(),
  };
}

export function convertMotionFromTemplate(tpl: Template, packId: string): Motion3Json {
  const pack = tpl.motions[packId];
  if (!pack) {
    const known = Object.keys(tpl.motions).sort().join(", ") || "(none)";
    throw new Error(
      `convertMotionFromTemplate: pack '${packId}' not found (available: ${known})`,
    );
  }
  return convertMotion({ motion: pack, manifest: tpl.manifest });
}
