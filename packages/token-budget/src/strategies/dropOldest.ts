import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits, filterByUnits } from '../internal/units.js';
import { evictOldestUnitsToBudget } from '../internal/trim.js';

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
      const units = groupIntoUnits(messages);
      const survivors = evictOldestUnitsToBudget(units, ctx);
      return filterByUnits(messages, survivors);
    },
  };
}
