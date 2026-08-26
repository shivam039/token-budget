import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import { slidingWindow } from '../src/strategies/slidingWindow.js';
import { priority } from '../src/strategies/priority.js';

function randomContent(rng: () => number): string {
  const len = 1 + Math.floor(rng() * 40);
  return 'x'.repeat(len);
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const strategyFactories: Array<[string, () => any]> = [
  ['drop-oldest', () => dropOldest()],
  ['sliding-window', () => slidingWindow({ turns: 3, enforceBudget: true })],
  ['priority', () => priority()],
];

describe('pinned message safety (fuzz)', () => {
  for (const [name, factory] of strategyFactories) {
    it(`${name}: pinned messages always survive getContext, regardless of buffer size`, () => {
      const rng = mulberry32(42 + name.length);
      for (let trial = 0; trial < 20; trial++) {
        const budget = new TokenBudget({ maxTokens: 50, charsPerToken: 1, strategy: factory() });
        const pinnedIds: string[] = [];
        const messageCount = 5 + Math.floor(rng() * 30);
        for (let i = 0; i < messageCount; i++) {
          const pinned = rng() < 0.15;
          const msg = budget.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: randomContent(rng),
            pinned,
            priority: Math.floor(rng() * 10),
          });
          if (pinned) pinnedIds.push(msg.id);
        }
        const ctx = budget.getContextSync();
        const survivingIds = new Set(ctx.messages.map((m) => m.id));
        for (const id of pinnedIds) {
          expect(survivingIds.has(id)).toBe(true);
        }
      }
    });
  }
});
