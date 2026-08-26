import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import { slidingWindow } from '../src/strategies/slidingWindow.js';
import { priority } from '../src/strategies/priority.js';

/**
 * NFR-7: adding a message must be O(1) amortized; applying drop-oldest /
 * sliding-window / priority must be O(n), not O(n^2). We assert a generous
 * wall-clock ceiling (rather than the spec's illustrative <200ms reference
 * figure) to keep this stable across arbitrary CI hardware, while still
 * catching an accidental quadratic regression, which would blow well past it.
 */
const CEILING_MS = 3000;

const strategyFactories: Array<[string, () => any]> = [
  ['drop-oldest', () => dropOldest()],
  ['sliding-window', () => slidingWindow({ turns: 500, enforceBudget: true })],
  ['priority', () => priority()],
];

describe('performance: 10,000 messages', () => {
  for (const [name, factory] of strategyFactories) {
    it(`${name}: add + getContextSync completes within ${CEILING_MS}ms`, () => {
      const budget = new TokenBudget({ maxTokens: 5000, charsPerToken: 1, strategy: factory() });
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: `message ${i}`, priority: i % 10 });
      }
      const ctx = budget.getContextSync();
      const elapsed = performance.now() - start;
      expect(ctx.tokensUsed).toBeLessThanOrEqual(budget.effectiveBudget);
      expect(elapsed).toBeLessThan(CEILING_MS);
    });
  }
});
