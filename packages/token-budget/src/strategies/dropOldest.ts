import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits, filterByUnits } from '../internal/units.js';
import { evictOldestUnitsToBudget } from '../internal/trim.js';
import { survivorIdSet, evictedEntries } from '../internal/trace.js';

/**
 * Removes the oldest non-pinned messages, one atomic unit at a time, until
 * the buffer is back under the effective budget (FR-4.1). Tool-call/
 * tool-result pairs are evicted together (FR-4.9); pinned messages are
 * never touched (FR-3.3).
 */
export function dropOldest(): Strategy {
  return {
    name: 'drop-oldest',
    sync: true,
    apply(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
      const tokensBefore = ctx.countTokens(messages);
      const units = groupIntoUnits(messages);
      const survivors = evictOldestUnitsToBudget(units, ctx);
      const result = filterByUnits(messages, survivors);

      if (ctx.trace) {
        const keptIds = survivorIdSet(survivors);
        ctx.trace({
          strategyName: 'drop-oldest',
          tokensBefore,
          tokensAfter: ctx.countTokens(result),
          messagesConsidered: messages.length,
          evicted: evictedEntries(messages, keptIds, (_m, i) => `oldest non-pinned message (position ${i} of ${messages.length})`),
          synthesized: [],
        });
      }
      return result;
    },
  };
}
