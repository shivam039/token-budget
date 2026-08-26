// Companion example for the README's "Write your own strategy" guide.
import type { Strategy } from '../src/index.js';
import { groupIntoUnits, filterByUnits } from '../src/index.js';

/**
 * A minimal custom strategy: once over budget, keeps only the single most
 * recent non-pinned atomic unit (plus everything pinned), dropping all
 * other non-pinned messages at once.
 *
 * Uses `groupIntoUnits`/`filterByUnits` so a tool-call and its tool-result
 * are always kept or dropped together, exactly like the built-in
 * strategies (FR-4.9) — any custom strategy that evicts messages should do
 * the same rather than filtering the raw message array directly.
 */
export function keepLatestOnly(): Strategy {
  return {
    name: 'keep-latest-only',
    sync: true,
    apply(messages, ctx) {
      if (ctx.countTokens(messages) <= ctx.effectiveBudget) return messages;

      const units = groupIntoUnits(messages);
      const pinned = units.filter((u) => u.pinned);
      const nonPinned = units.filter((u) => !u.pinned);
      const latest = nonPinned.at(-1);

      const survivors = latest ? [...pinned, latest] : pinned;
      return filterByUnits(messages, survivors);
    },
  };
}
