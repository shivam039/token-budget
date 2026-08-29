export { TokenBudget } from './budget.js';
export * as strategies from './strategies/index.js';
export { createEstimateTokenizer } from './tokenizer.js';

// Known context-window sizes, keyed by model name — set `TokenBudget`'s
// `model` and omit `maxTokens` to derive it from here automatically; see
// the "Model-aware maxTokens" section in the README.
export { MODEL_CONTEXT_WINDOWS, getModelContextWindow } from './modelContextWindows.js';

// Building blocks for authoring custom strategies (see the "write your own
// strategy" guide in the README): group messages into atomic eviction
// units (respecting tool-call/tool-result pairing and pinning), then
// project a chosen surviving subset back onto the original message order.
export { groupIntoUnits, filterByUnits } from './internal/units.js';
export type { Unit } from './internal/units.js';
export { unitTokens, evictOldestUnitsToBudget } from './internal/trim.js';

// Shrinks a single oversized tool result (a file dump, a verbose terminal
// log) to fit a token budget, before it ever becomes a message — see the
// "Tool output" section in the README and `COOKBOOK.md`.
export { truncateToolOutput } from './toolOutput.js';
export type { TruncateToolOutputOptions } from './toolOutput.js';

export type {
  AddMessageInput,
  BudgetMessage,
  ContentBlock,
  ContentCounter,
  ContextResult,
  EstimatorProfile,
  EvictedInfo,
  ExplainReport,
  OverflowInfo,
  Role,
  SerializedState,
  SerializedStream,
  Stats,
  Strategy,
  StrategyContext,
  StrategyErrorInfo,
  StreamingEstimate,
  StrategyStepTrace,
  TokenBudgetConfig,
  TokenBudgetEventName,
  TokenBudgetEvents,
  Tokenizer,
  TraceDecision,
  WarningInfo,
  Scorer,
  ScoringContext,
  CostModel,
  CostBreakdown,
  UsageReport,
  CostCeilingPolicy,
  CostCeilingPolicyCallback,
  CostWarningInfo,
  AuditEvent,
} from './types.js';
