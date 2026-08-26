import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { keepLatestOnly } from '../examples/customStrategy.js';

describe('custom strategy guide example (keepLatestOnly)', () => {
  it('implements the Strategy interface and plugs into TokenBudget', () => {
    const strategy = keepLatestOnly();
    expect(strategy.name).toBe('keep-latest-only');
    expect(strategy.sync).toBe(true);
  });

  it('is a no-op under budget', () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: keepLatestOnly() });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = budget.getContextSync();
    expect(ctx.messages).toHaveLength(1);
  });

  it('keeps only pinned + the latest non-pinned message once over budget', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: keepLatestOnly() });
    const sys = budget.addMessage({ role: 'system', content: 'sys', pinned: true });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    const last = budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([sys.id, last.id]);
  });

  it('keeps a tool-call/tool-result pair together as the "latest" unit', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: keepLatestOnly() });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    const call = budget.addMessage({ role: 'assistant', content: [{ type: 'tool_call', arguments: {} }] });
    const result = budget.addMessage({ role: 'tool', content: [{ type: 'tool_result', result: 'ok' }], toolCallId: call.id });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([call.id, result.id]);
  });
});
