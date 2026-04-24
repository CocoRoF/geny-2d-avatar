export {
  categoryOf,
  categorize,
  CATEGORY_ORDER,
  GROUPS_FOR_CATEGORY,
  OVERALL_GROUP,
  parametersForPart,
} from "./category.js";
export type { Category, PartLike, ParameterLike } from "./category.js";

export {
  buildGenerateMetricEvents,
  METRIC_PHASE_LABELS,
  summarizeMetricHistory,
} from "./metrics.js";
export type {
  BuildGenerateMetricsInput,
  GenerateCategoryMetric,
  GenerateMetricEvent,
  GenerateMetricKind,
  MetricHistorySnapshot,
  MetricRunSummary,
} from "./metrics.js";

export {
  hasRenderableResult,
  summarizeCategoryOutcomes,
} from "./category-outcome.js";
export type {
  CategoryOutcome,
  CategoryOutcomeSummary,
  CategoryRunStatus,
} from "./category-outcome.js";

export {
  mergeCategoryOutcomes,
  selectPlansForRetry,
} from "./partial-retry.js";

export {
  attemptOutcomeLabels,
  classifyGenerateFailure,
  nextAttemptBackoffMs,
  planGenerateAttempts,
  shouldRetry,
} from "./generate-retry.js";
export type {
  GenerateAttemptOutcome,
  GenerateAttemptPlan,
  GenerateAttemptPlanInput,
  GenerateFailure,
  GenerateFailureInput,
  GenerateFailureKind,
  ShouldRetryDecision,
  ShouldRetryInput,
  ShouldRetryReason,
} from "./generate-retry.js";

export {
  CATEGORY_BASE_PROMPTS,
  PROMPT_CATEGORY_ORDER,
  buildSlotPrompt,
  extractPromptHints,
  mapRoleToCategory,
  planSlotGenerations,
} from "./prompt-slot-planner.js";
export type {
  PromptHints,
  SlotCategory,
  SlotGenerationPlan,
  SlotInput,
} from "./prompt-slot-planner.js";

export {
  cancelCheckpoint,
  cancelReasonPriority,
  cancelStopReason,
  initialCancelState,
  isAbortError,
  isCancelRequested,
  markAborted,
  requestCancel,
} from "./generate-cancel.js";
export type {
  CancelReason,
  CancelSnapshot,
  CancelStatus,
} from "./generate-cancel.js";
