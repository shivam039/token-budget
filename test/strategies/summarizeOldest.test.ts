import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { summarizeOldest } from '../../src/strategies/summarizeOldest.js';

describe('summarizeOldest strategy', () => {
  it('is a no-op when under the trigger threshold', async () => {
    const summarize = vi.fn(async () => 'summary');
    const budget = new TokenBudget({ maxTokens: 1000, strategy: summarizeOldest({ summarize }) });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = await budget.getContext();
    expect(summarize).not.toHaveBeenCalled();
    expect(ctx.messages).toHaveLength(1);
  });

  it('replaces the oldest block with a single synthetic summary message', async () => {
    const summarize = vi.fn(async (msgs) => `summary of ${msgs.length} messages`);
    const budget = new TokenBudget({
      maxTokens: 10,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize }),
    });
    const a = budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    const b = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    const last = budget.addMessage({ role: 'user', content: 'c' });

    const ctx = await budget.getContext();
    expect(summarize).toHaveBeenCalled();
    const synthetic = ctx.messages.find((m) => m.metadata?.synthetic);
    expect(synthetic).toBeTruthy();
    expect(synthetic!.metadata!.sourceIds).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(ctx.messages.at(-1)!.id).toBe(last.id);
    expect(ctx.evicted.map((m) => m.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('never summarizes pinned messages', async () => {
    const summarize = vi.fn(async () => 'summary');
    const budget = new TokenBudget({
      maxTokens: 15,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize }),
    });
    const sys = budget.addMessage({ role: 'system', content: 'aaaaaaaaaa', pinned: true });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    const ctx = await budget.getContext();
    expect(ctx.messages.some((m) => m.id === sys.id)).toBe(true);
  });

  it('retries the summarizer up to `retries` times before giving up', async () => {
    let calls = 0;
    const summarize = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    });
    const budget = new TokenBudget({
      maxTokens: 15,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize, retries: 2 }),
    });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    const ctx = await budget.getContext();
    expect(calls).toBe(3);
    expect(ctx.messages.some((m) => m.metadata?.synthetic)).toBe(true);
  });

  it('throws by default once retries are exhausted', async () => {
    const summarize = vi.fn(async () => {
      throw new Error('boom');
    });
    const budget = new TokenBudget({
      maxTokens: 15,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize }),
    });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });

    let errorInfo: any;
    budget.on('strategy-error', (info) => (errorInfo = info));
    await expect(budget.getContext()).rejects.toThrow('boom');
    expect(errorInfo).toBeTruthy();
    expect(errorInfo.strategyName).toBe('summarize-oldest');
  });

  it('falls back to drop-oldest when onError is fallback-drop-oldest', async () => {
    const summarize = vi.fn(async () => {
      throw new Error('boom');
    });
    const budget = new TokenBudget({
      maxTokens: 15,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize, onError: 'fallback-drop-oldest' }),
    });
    const a = budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' });
    const last = budget.addMessage({ role: 'user', content: 'b' });

    const ctx = await budget.getContext();
    expect(ctx.messages.some((m) => m.metadata?.synthetic)).toBe(false);
    expect(ctx.evicted.map((m) => m.id)).toContain(a.id);
    expect(ctx.messages.map((m) => m.id)).toContain(last.id);
  });

  it('reports sync: false and rejects getContextSync', () => {
    const budget = new TokenBudget({
      maxTokens: 1000,
      strategy: summarizeOldest({ summarize: async () => 'x' }),
    });
    expect(() => budget.getContextSync()).toThrow();
  });

  it('honors a fixed blockSize instead of the dynamic growth heuristic', async () => {
    const summarize = vi.fn(async (msgs: any[]) => `summarized ${msgs.length}`);
    const budget = new TokenBudget({
      maxTokens: 1000,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize, blockSize: 1, preThreshold: 0 }),
    });
    budget.addMessage({ role: 'user', content: 'a' });
    budget.addMessage({ role: 'user', content: 'b' });
    await budget.getContext();
    expect(summarize).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ content: 'a' })]));
    expect(summarize.mock.calls[0]![0]).toHaveLength(1);
  });
});
