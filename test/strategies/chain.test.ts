import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { chain } from '../../src/strategies/chain.js';
import { slidingWindow } from '../../src/strategies/slidingWindow.js';
import { dropOldest } from '../../src/strategies/dropOldest.js';
import { summarizeOldest } from '../../src/strategies/summarizeOldest.js';

describe('chain', () => {
  it('is sync when every member strategy is sync', () => {
    const s = chain([slidingWindow({ turns: 5 }), dropOldest()]);
    expect(s.sync).toBe(true);
  });

  it('is async when any member strategy is async', () => {
    const s = chain([dropOldest(), summarizeOldest({ summarize: async () => 'x' })]);
    expect(s.sync).toBe(false);
  });

  it('applies strategies in order, each seeing the previous output', () => {
    const budget = new TokenBudget({
      maxTokens: 100000,
      strategy: chain([slidingWindow({ turns: 2 }), dropOldest()]),
    });
    const a = budget.addMessage({ role: 'user', content: 'one' });
    const b = budget.addMessage({ role: 'user', content: 'two' });
    const c = budget.addMessage({ role: 'user', content: 'three' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([b.id, c.id]);
    expect(ctx.strategyApplied).toContain('sliding-window');
    expect(ctx.strategyApplied).toContain('drop-oldest');
  });

  it('falls through to a later strategy when the first leaves it over budget', async () => {
    const summarize = vi.fn(async () => 'summary');
    const budget = new TokenBudget({
      maxTokens: 12,
      charsPerToken: 1,
      strategy: chain([slidingWindow({ turns: 10 }), summarizeOldest({ summarize })]),
    });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    const ctx = await budget.getContext();
    expect(summarize).toHaveBeenCalled();
    expect(ctx.tokensUsed).toBeLessThanOrEqual(12);
  });
});
