export { canonicalJson } from "./util/canonical-json.js";
export { loadTemplate } from "./loader.js";
export type {
  Template,
  TemplateManifest,
  PartSpec,
  PoseDoc,
  PoseSlot,
  PhysicsDoc,
  PhysicsSettingDoc,
  PhysicsInput,
  PhysicsOutput,
  PhysicsVertex,
  PhysicsNormalizationRange,
  MotionPackDoc,
  MotionPackMeta,
  MotionCurve,
  MotionUserDataEntry,
} from "./loader.js";
export { convertPose, convertPoseFromTemplate } from "./converters/pose.js";
export type { Pose3Json, Pose3Group, ConvertPoseInput } from "./converters/pose.js";
export { convertPhysics, convertPhysicsFromTemplate } from "./converters/physics.js";
export type {
  Physics3Json,
  Physics3Setting,
  Physics3Input,
  Physics3Output,
  Physics3Vertex,
  Physics3NormalizationRange,
  ConvertPhysicsInput,
} from "./converters/physics.js";
export { convertMotion, convertMotionFromTemplate } from "./converters/motion.js";
export type {
  Motion3Json,
  Motion3Curve,
  Motion3UserDataEntry,
  ConvertMotionInput,
} from "./converters/motion.js";
