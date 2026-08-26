import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { slidingWindow } from '../../src/strategies/slidingWindow.js';

describe('slidingWindow strategy', () => {
  it('keeps only the last N non-pinned turns regardless of token count', () => {
    const budget = new TokenBudget({ maxTokens: 100000, strategy: slidingWindow({ turns: 2 }) });
    const a = budget.addMessage({ role: 'user', content: 'one' });
    const b = budget.addMessage({ role: 'assistant', content: 'two' });
    const c = budget.addMessage({ role: 'user', content: 'three' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([b.id, c.id]);
    expect(ctx.evicted.map((m) => m.id)).toEqual([a.id]);
  });

  it('always keeps pinned messages, on top of the last N turns', () => {
    const budget = new TokenBudget({ maxTokens: 100000, strategy: slidingWindow({ turns: 1 }) });
    const sys = budget.addMessage({ role: 'system', content: 'system prompt', pinned: true });
    budget.addMessage({ role: 'user', content: 'one' });
    const last = budget.addMessage({ role: 'user', content: 'two' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([sys.id, last.id]);
  });

  it('keeps the window even when it exceeds the token budget, unless enforceBudget is set', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: slidingWindow({ turns: 5 }) });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaaaaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbbbbbbbbbbbb' });
    const ctx = budget.getContextSync();
    expect(ctx.messages).toHaveLength(2);
    expect(ctx.tokensUsed).toBeGreaterThan(10);
  });

  it('enforceBudget additionally trims the kept window down to budget, oldest-first', () => {
    const budget = new TokenBudget({
      maxTokens: 10,
      charsPerToken: 1,
      strategy: slidingWindow({ turns: 5, enforceBudget: true }),
    });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaaaaaaaaaaaa' });
    const last = budget.addMessage({ role: 'user', content: 'b' });
    const ctx = budget.getContextSync();
    expect(ctx.tokensUsed).toBeLessThanOrEqual(10);
    expect(ctx.messages.map((m) => m.id)).toEqual([last.id]);
  });
});
