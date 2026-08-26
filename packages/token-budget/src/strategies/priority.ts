import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits, filterByUnits } from '../internal/units.js';
import { unitTokens } from '../internal/trim.js';

/**
 * Evicts the lowest-priority non-pinned atomic units first; ties are
 * broken by age, oldest first (FR-4.4). Pinned messages are never evicted.
 */
export function priority(): Strategy {
  return {
    name: 'priority',
    sync: true,
    apply(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
      const units = groupIntoUnits(messages);
      let tokens = ctx.countTokens(messages);
      if (tokens <= ctx.effectiveBudget) return messages;

      const evictionOrder = units
        .filter((u) => !u.pinned)
        .sort((a, b) => a.priority - b.priority || a.order - b.order);

      const evicted = new Set<(typeof evictionOrder)[number]>();
      for (const unit of evictionOrder) {
        if (tokens <= ctx.effectiveBudget) break;
        evicted.add(unit);
        tokens -= unitTokens(unit, ctx);
      }

      const survivors = units.filter((u) => !evicted.has(u));
      return filterByUnits(messages, survivors);
    },
  };
}
