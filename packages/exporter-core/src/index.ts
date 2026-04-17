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
  ParametersDoc,
  ParameterDoc,
  ParameterGroupDoc,
  ExpressionPackDoc,
  ExpressionBlend,
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
export { convertCdi, convertCdiFromTemplate } from "./converters/cdi.js";
export type {
  Cdi3Json,
  Cdi3Parameter,
  Cdi3ParameterGroup,
  Cdi3Part,
  Cdi3CombinedParameter,
  ConvertCdiInput,
} from "./converters/cdi.js";
export {
  convertModel,
  convertModelFromTemplate,
  packSlug,
  DEFAULT_BUNDLE_FILE_NAMES,
  DEFAULT_MOC_PATH,
  DEFAULT_TEXTURE_PATHS,
} from "./converters/model.js";
export {
  convertExpression,
  convertExpressionFromTemplate,
  expressionSlug,
} from "./converters/expression.js";
export type {
  Expression3Json,
  Expression3Parameter,
  ConvertExpressionInput,
} from "./converters/expression.js";
export { assembleBundle, snapshotBundle } from "./bundle.js";
export type {
  BundleFileEntry,
  BundleResult,
  AssembleBundleOptions,
  BundleManifestJson,
} from "./bundle.js";
export {
  assembleAvatarBundle,
  specToBundleOptions,
  resolveTemplateDir,
  readAvatarExportSpec,
} from "./avatar-bundle.js";
export type { AvatarExportSpec } from "./avatar-bundle.js";
export type {
  Model3Json,
  Model3FileReferences,
  Model3Group,
  Model3HitArea,
  Model3MotionEntry,
  Model3ExpressionEntry,
  BundleFileNames,
  ConvertModelInput,
  ConvertModelOptions,
} from "./converters/model.js";
