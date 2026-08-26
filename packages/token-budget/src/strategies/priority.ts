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
      const tokensBefore = ctx.countTokens(messages);
      const units = groupIntoUnits(messages);
      let tokens = tokensBefore;
      if (tokens <= ctx.effectiveBudget) {
        ctx.trace?.({ strategyName: 'priority', tokensBefore, tokensAfter: tokensBefore, messagesConsidered: messages.length, evicted: [], synthesized: [] });
        return messages;
      }

      const evictionOrder = units
        .filter((u) => !u.pinned)
        .sort((a, b) => a.priority - b.priority || a.order - b.order);

      const evicted = new Map<(typeof evictionOrder)[number], number>();
      for (const unit of evictionOrder) {
        if (tokens <= ctx.effectiveBudget) break;
        evicted.set(unit, unit.priority);
        tokens -= unitTokens(unit, ctx);
      }

      const survivors = units.filter((u) => !evicted.has(u));
      const result = filterByUnits(messages, survivors);

      if (ctx.trace) {
        const reasonById = new Map<string, string>();
        let rank = 0;
        for (const [unit, unitPriority] of evicted) {
          rank += 1;
          for (const message of unit.messages) {
            reasonById.set(message.id, `priority=${unitPriority} (rank ${rank} of ${evicted.size} evicted, tie-broken by age)`);
          }
        }
        ctx.trace({
          strategyName: 'priority',
          tokensBefore,
          tokensAfter: ctx.countTokens(result),
          messagesConsidered: messages.length,
          evicted: messages.filter((m) => reasonById.has(m.id)).map((m) => ({ id: m.id, reason: reasonById.get(m.id)! })),
          synthesized: [],
        });
      }
      return result;
    },
  };
}
