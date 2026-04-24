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
  GenerateMetricEvent,
  GenerateMetricKind,
  MetricHistorySnapshot,
  MetricRunSummary,
} from "./metrics.js";

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
