import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { priority } from '../../src/strategies/priority.js';

describe('priority strategy', () => {
  it('is a no-op when under budget', () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: priority() });
    budget.addMessage({ role: 'user', content: 'hi', priority: 1 });
    const ctx = budget.getContextSync();
    expect(ctx.evicted).toHaveLength(0);
  });

  it('evicts the lowest-priority non-pinned messages first', () => {
    const budget = new TokenBudget({ maxTokens: 20, charsPerToken: 1, strategy: priority() });
    const low = budget.addMessage({ role: 'user', content: 'aaaaaaaaaa', priority: 1 });
    const high = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb', priority: 10 });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([high.id]);
    expect(ctx.evicted.map((m) => m.id)).toEqual([low.id]);
  });

  it('breaks priority ties by age, oldest first', () => {
    const budget = new TokenBudget({ maxTokens: 20, charsPerToken: 1, strategy: priority() });
    const older = budget.addMessage({ role: 'user', content: 'aaaaaaaaaa', priority: 5 });
    const newer = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb', priority: 5 });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([newer.id]);
    expect(ctx.evicted.map((m) => m.id)).toEqual([older.id]);
  });

  it('defaults priority to 0 and never evicts pinned messages', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: priority() });
    const sys = budget.addMessage({ role: 'system', content: 'aaaaaaaaaa', pinned: true, priority: 0 });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb', priority: 100 });
    const ctx = budget.getContextSync();
    expect(ctx.messages.some((m) => m.id === sys.id)).toBe(true);
  });
});
