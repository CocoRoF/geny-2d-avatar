import type { PartSpec, PoseDoc, Template } from "../loader.js";

export interface Pose3Group {
  Id: string;
  Link: string[];
}

export interface Pose3Json {
  Type: "Live2D Pose";
  FadeInTime: number;
  Groups: Pose3Group[][];
}

export interface ConvertPoseInput {
  pose: PoseDoc;
  /** slot_id → part spec (for cubism_part_id lookup). */
  partsById: Record<string, PartSpec>;
}

const DEFAULT_FADE_IN_TIME = 0.5;

/**
 * 내부 pose.json + parts/*.spec.json → Cubism `pose3.json`.
 *
 * 규약:
 * - `Id` 는 `parts[slot].cubism_part_id`. 누락 시 throw (session 08 D4).
 * - `Link` 는 링크된 slot_id 의 `cubism_part_id` 로 매핑. 빈 배열은 `[]` 보존 (D7).
 * - `FadeInTime` 은 pose.json 이 생략한 경우 0.5 (D5).
 * - Groups 의 배열 순서는 **원본 보존** — mutex 첫 원소가 default visible (D6).
 */
export function convertPose({ pose, partsById }: ConvertPoseInput): Pose3Json {
  if (pose.type !== "live2d_pose") {
    throw new Error(`convertPose: expected pose.type='live2d_pose', got '${pose.type}'`);
  }

  const Groups: Pose3Group[][] = pose.groups.map((group, gi) =>
    group.map((slot, si) => {
      const spec = partsById[slot.slot_id];
      if (!spec) {
        throw new Error(
          `convertPose: pose.groups[${gi}][${si}].slot_id='${slot.slot_id}' not found in parts/`,
        );
      }
      if (!spec.cubism_part_id) {
        throw new Error(
          `convertPose: parts/${slot.slot_id} is missing 'cubism_part_id'`,
        );
      }
      const Link = (slot.link ?? []).map((linkSlotId) => {
        const linked = partsById[linkSlotId];
        if (!linked) {
          throw new Error(
            `convertPose: pose.groups[${gi}][${si}].link contains unknown slot_id '${linkSlotId}'`,
          );
        }
        if (!linked.cubism_part_id) {
          throw new Error(
            `convertPose: link target parts/${linkSlotId} is missing 'cubism_part_id'`,
          );
        }
        return linked.cubism_part_id;
      });
      return { Id: spec.cubism_part_id, Link };
    }),
  );

  return {
    Type: "Live2D Pose",
    FadeInTime: pose.fade_in_time ?? DEFAULT_FADE_IN_TIME,
    Groups,
  };
}

/**
 * 템플릿 객체로부터 직접 변환. pose 가 없으면 throw.
 */
export function convertPoseFromTemplate(tpl: Template): Pose3Json {
  if (!tpl.pose) {
    throw new Error(
      `convertPoseFromTemplate: template at ${tpl.dir} has no pose.json`,
    );
  }
  return convertPose({ pose: tpl.pose, partsById: tpl.partsById });
}
