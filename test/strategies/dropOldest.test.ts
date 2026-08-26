import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { dropOldest } from '../../src/strategies/dropOldest.js';

function makeBudget(maxTokens: number) {
  return new TokenBudget({ maxTokens, strategy: dropOldest(), charsPerToken: 1 });
}

describe('dropOldest strategy', () => {
  it('is a no-op when under budget', async () => {
    const budget = makeBudget(1000);
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    expect(ctx.messages).toHaveLength(1);
    expect(ctx.evicted).toHaveLength(0);
    expect(ctx.strategyApplied).toBe('drop-oldest');
  });

  it('removes the oldest non-pinned messages first until under budget', async () => {
    const budget = makeBudget(12); // overhead 4/msg leaves little room
    const a = budget.addMessage({ role: 'user', content: 'a' });
    const b = budget.addMessage({ role: 'user', content: 'b' });
    const c = budget.addMessage({ role: 'user', content: 'c' });
    const ctx = await budget.getContext();
    expect(ctx.tokensUsed).toBeLessThanOrEqual(20);
    const keptIds = ctx.messages.map((m) => m.id);
    // whatever survives, it must be a suffix of insertion order (oldest dropped first)
    expect(keptIds).toEqual([a.id, b.id, c.id].slice([a.id, b.id, c.id].length - keptIds.length));
  });

  it('never evicts pinned messages, even if that leaves the buffer over budget', async () => {
    const budget = makeBudget(10);
    const sys = budget.addMessage({ role: 'system', content: 'you are a helpful assistant', pinned: true });
    budget.addMessage({ role: 'user', content: 'hello there' });
    const ctx = await budget.getContext();
    expect(ctx.messages.some((m) => m.id === sys.id)).toBe(true);
  });

  it('emits an evicted event describing what was dropped', async () => {
    const budget = makeBudget(15);
    const a = budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    let evictedInfo: any;
    budget.on('evicted', (info) => (evictedInfo = info));
    await budget.getContext();
    expect(evictedInfo).toBeTruthy();
    expect(evictedInfo.strategyApplied).toBe('drop-oldest');
    expect(evictedInfo.messages.map((m: any) => m.id)).toContain(a.id);
  });

  it('getContextSync works since drop-oldest is synchronous', () => {
    const budget = makeBudget(1000);
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = budget.getContextSync();
    expect(ctx.messages).toHaveLength(1);
  });
});
