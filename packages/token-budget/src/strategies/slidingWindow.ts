import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits, filterByUnits } from '../internal/units.js';
import { evictOldestUnitsToBudget } from '../internal/trim.js';
import { survivorIdSet, evictedEntries } from '../internal/trace.js';

export interface SlidingWindowOptions {
  /** Number of most recent non-pinned turns (atomic units) to keep. */
  turns: number;
  /** Also trim the kept window down to the token budget, oldest-first. Default false. */
  enforceBudget?: boolean;
}

/**
 * Keeps only the last `turns` non-pinned atomic units, plus all pinned
 * messages, regardless of token count (FR-4.2). A "turn" is one atomic
 * unit: a single message, or a tool-call and its tool-result kept together.
 */
export function slidingWindow(options: SlidingWindowOptions): Strategy {
  const turns = Math.max(0, Math.floor(options.turns));
  return {
    name: 'sliding-window',
    sync: true,
    apply(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
      const tokensBefore = ctx.countTokens(messages);
      const units = groupIntoUnits(messages);
      const nonPinned = units.filter((u) => !u.pinned);
      const keep = new Set(nonPinned.slice(Math.max(0, nonPinned.length - turns)));

      const windowed = units.filter((u) => u.pinned || keep.has(u));
      const survivors = options.enforceBudget ? evictOldestUnitsToBudget(windowed, ctx) : windowed;
      const result = filterByUnits(messages, survivors);

      if (ctx.trace) {
        const windowedIds = survivorIdSet(windowed);
        const survivorIds = survivorIdSet(survivors);
        const evicted = [
          ...evictedEntries(messages, windowedIds, (_m, i) => `outside the last ${turns} turns (position ${i} of ${messages.length})`),
          ...evictedEntries(
            messages.filter((m) => windowedIds.has(m.id)),
            survivorIds,
            () => `enforceBudget: window still over budget, dropped oldest-first`,
          ),
        ];
        ctx.trace({
          strategyName: 'sliding-window',
          tokensBefore,
          tokensAfter: ctx.countTokens(result),
          messagesConsidered: messages.length,
          evicted,
          synthesized: [],
        });
      }
      return result;
    },
  };
}
