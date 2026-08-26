import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import { slidingWindow } from '../src/strategies/slidingWindow.js';
import { priority } from '../src/strategies/priority.js';
import { summarizeOldest } from '../src/strategies/summarizeOldest.js';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomContent(rng: () => number): string {
  return 'x'.repeat(1 + Math.floor(rng() * 200));
}

/**
 * FR-3.3 + FR-2.3: as long as pinned content alone fits inside the
 * effective budget, a strategy that keeps evicting non-pinned units until
 * under budget can *always* reach that goal — so these three built-ins
 * give a hard "never overflow" guarantee. summarize-oldest, being
 * hook-based and heuristic in v1, does not (see its own tests/docs) and is
 * covered separately below with a softer assertion.
 */
const hardGuaranteeStrategies: Array<[string, () => any]> = [
  ['drop-oldest', () => dropOldest()],
  ['sliding-window', () => slidingWindow({ turns: 1_000_000, enforceBudget: true })],
  ['priority', () => priority()],
];

describe('integration: no context overflow across 500+ messages', () => {
  for (const [name, factory] of hardGuaranteeStrategies) {
    it(`${name}: tokensUsed never exceeds maxTokens - reserve`, () => {
      const budget = new TokenBudget({ maxTokens: 500, reserve: 50, charsPerToken: 1, strategy: factory() });
      // A handful of small pinned messages, well within budget on their own.
      for (let i = 0; i < 5; i++) {
        budget.addMessage({ role: 'system', content: 'p'.repeat(3 + i), pinned: true });
      }
      const rng = mulberry32(1234);
      for (let i = 0; i < 550; i++) {
        budget.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: randomContent(rng),
          priority: Math.floor(rng() * 10),
        });
      }
      const ctx = budget.getContextSync();
      expect(ctx.tokensUsed).toBeLessThanOrEqual(budget.effectiveBudget);
    });
  }

  it('summarize-oldest substantially reduces usage on a large overflowing buffer', async () => {
    const budget = new TokenBudget({
      maxTokens: 500,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize: async (msgs) => `(${msgs.length} messages summarized)` }),
    });
    const rng = mulberry32(99);
    for (let i = 0; i < 550; i++) {
      budget.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: randomContent(rng) });
    }
    const before = budget.stats().tokensUsed;
    const ctx = await budget.getContext();
    expect(ctx.tokensUsed).toBeLessThan(before);
    expect(ctx.evicted.length).toBeGreaterThan(0);
  });
});
