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

/**
 * FR2-8.2/.4: removeMessage/editMessage are backed by a Map keyed by id
 * (not an array), giving O(1) lookup and removal instead of an O(n)
 * findIndex + O(n) splice-shift. Removing every message from the front of
 * a large buffer, one at a time (the worst case for array-splice: maximal
 * element shifting on every call), used to be O(n²) — this regression
 * test locks in the fix by asserting the per-operation cost doesn't grow
 * with buffer size.
 */
describe('performance: removeMessage stays O(1) amortized, not O(n) or O(n^2)', () => {
  it('removing every message front-first costs roughly the same per-operation at 10k and 100k messages', () => {
    function msPerRemoval(n: number): number {
      const budget = new TokenBudget({ maxTokens: 100_000_000, charsPerToken: 1 });
      const ids = Array.from({ length: n }, (_, i) => budget.addMessage({ role: 'user', content: `msg ${i}` }).id);
      const start = performance.now();
      for (const id of ids) budget.removeMessage(id);
      return (performance.now() - start) / n;
    }

    msPerRemoval(2_000); // warm up the JIT before measuring
    const smallScale = msPerRemoval(10_000);
    const largeScale = msPerRemoval(100_000);

    // O(n²) would show roughly a 10x-per-operation slowdown for a 10x
    // larger buffer; a generous 5x tolerance (plus a floor for near-zero
    // timings) still catches that while absorbing CI noise.
    expect(largeScale).toBeLessThan(Math.max(smallScale * 5, 0.01));
  });
});
