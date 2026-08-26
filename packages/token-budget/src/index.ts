export { TokenBudget } from './budget.js';
export * as strategies from './strategies/index.js';
export { createEstimateTokenizer } from './tokenizer.js';

// Building blocks for authoring custom strategies (see the "write your own
// strategy" guide in the README): group messages into atomic eviction
// units (respecting tool-call/tool-result pairing and pinning), then
// project a chosen surviving subset back onto the original message order.
export { groupIntoUnits, filterByUnits } from './internal/units.js';
export type { Unit } from './internal/units.js';
export { unitTokens, evictOldestUnitsToBudget } from './internal/trim.js';

export type {
  AddMessageInput,
  BudgetMessage,
  ContentBlock,
  ContentCounter,
  ContextResult,
  EvictedInfo,
  OverflowInfo,
  Role,
  Stats,
  Strategy,
  StrategyContext,
  StrategyErrorInfo,
  TokenBudgetConfig,
  TokenBudgetEventName,
  TokenBudgetEvents,
  Tokenizer,
  WarningInfo,
} from './types.js';
