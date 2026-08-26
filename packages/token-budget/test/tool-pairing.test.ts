import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import { slidingWindow } from '../src/strategies/slidingWindow.js';
import { priority } from '../src/strategies/priority.js';
import { summarizeOldest } from '../src/strategies/summarizeOldest.js';

/**
 * FR-4.9: a tool-call and its tool-result must never be split across an
 * eviction boundary — either both survive or both are dropped/summarized.
 */
function buildToolConversation(budget: TokenBudget) {
  const call = budget.addMessage({
    role: 'assistant',
    content: [{ type: 'tool_call', arguments: { q: 'weather' } }],
  });
  const result = budget.addMessage({
    role: 'tool',
    content: [{ type: 'tool_result', result: 'sunny' }],
    toolCallId: call.id,
  });
  return { call, result };
}

describe('tool-call/tool-result atomicity', () => {
  it('drop-oldest never evicts one half of a pair', async () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: dropOldest() });
    const { call, result } = buildToolConversation(budget);
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    const ctx = await budget.getContext();
    const ids = new Set(ctx.messages.map((m) => m.id));
    expect(ids.has(call.id)).toBe(ids.has(result.id));
  });

  it('sliding-window counts a tool-call/tool-result pair as a single turn', () => {
    const budget = new TokenBudget({ maxTokens: 100000, strategy: slidingWindow({ turns: 1 }) });
    const { call, result } = buildToolConversation(budget);
    budget.addMessage({ role: 'user', content: 'newer message' });
    const ctx = budget.getContextSync();
    const ids = new Set(ctx.messages.map((m) => m.id));
    expect(ids.has(call.id)).toBe(false);
    expect(ids.has(result.id)).toBe(false);
  });

  it('priority strategy evicts a pair together', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: priority() });
    const call = budget.addMessage({
      role: 'assistant',
      content: [{ type: 'tool_call', arguments: { q: 'x'.repeat(10) } }],
      priority: 1,
    });
    const result = budget.addMessage({
      role: 'tool',
      content: [{ type: 'tool_result', result: 'y'.repeat(10) }],
      toolCallId: call.id,
      priority: 1,
    });
    budget.addMessage({ role: 'user', content: 'z'.repeat(10), priority: 10 });
    const ctx = budget.getContextSync();
    const ids = new Set(ctx.messages.map((m) => m.id));
    expect(ids.has(call.id)).toBe(ids.has(result.id));
  });

  it('summarize-oldest summarizes a pair together, never splitting it', async () => {
    const summarize = vi.fn(async (msgs: any[]) => `summarized ${msgs.length}`);
    const budget = new TokenBudget({
      maxTokens: 12,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize }),
    });
    const { call, result } = buildToolConversation(budget);
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    const ctx = await budget.getContext();
    const ids = new Set(ctx.messages.map((m) => m.id));
    expect(ids.has(call.id)).toBe(ids.has(result.id));
    if (!ids.has(call.id)) {
      const synthetic = ctx.messages.find((m) => m.metadata?.synthetic);
      const sourceIds = synthetic!.metadata!.sourceIds as string[];
      expect(sourceIds).toEqual(expect.arrayContaining([call.id, result.id]));
    }
  });

  it('preserves original relative order for a pair whose result is grouped non-adjacently in units', () => {
    const budget = new TokenBudget({ maxTokens: 100000, strategy: dropOldest() });
    const call = budget.addMessage({ role: 'assistant', content: [{ type: 'tool_call', arguments: {} }] });
    const unrelated = budget.addMessage({ role: 'user', content: 'unrelated' });
    const result = budget.addMessage({ role: 'tool', content: [{ type: 'tool_result', result: 'ok' }], toolCallId: call.id });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([call.id, unrelated.id, result.id]);
  });
});
