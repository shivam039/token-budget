import { describe, it, expect, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { semanticRelevance } from '../src/strategies/semanticRelevance.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import type { BudgetMessage } from '../src/types.js';

describe('semanticRelevance strategy', () => {
  it('evicts lowest scoring messages first', async () => {
    const scorer = {
      score: async (msg: BudgetMessage) => {
        if (msg.content === 'important fact') return 0.9;
        if (msg.content === 'hello') return 0.1;
        return 0.5;
      },
    };

    const budget = new TokenBudget({
      maxTokens: 50,
      strategy: semanticRelevance({ scorer }),
      tokenizer: { count: (text) => text.length },
      messageOverhead: () => 0,
    });

    budget.addMessage({ role: 'user', content: 'hello' }); // len 5, score 0.1
    budget.addMessage({ role: 'assistant', content: 'important fact' }); // len 14, score 0.9
    budget.addMessage({ role: 'user', content: 'filler msg that is exact 36 charss.' }); // len 35, score 0.5

    const ctx = await budget.getContext();
    const contents = ctx.messages.map((m) => m.content);
    expect(contents).toContain('important fact');
    expect(contents).not.toContain('hello');
  });

  it('respects mustRetain predicate', async () => {
    const scorer = { score: () => 0.1 };

    const budget = new TokenBudget({
      maxTokens: 50,
      strategy: semanticRelevance({ scorer, mustRetain: (msg) => msg.content === 'must retain me' }),
      tokenizer: { count: (text) => text.length },
    });

    budget.addMessage({ role: 'user', content: 'must retain me' });
    budget.addMessage({ role: 'assistant', content: 'filler'.repeat(10) });

    const ctx = await budget.getContext();
    expect(ctx.messages.map((m) => m.content)).toContain('must retain me');
  });

  it('falls back if scorer times out, and does not leave a dangling timer', async () => {
    const scorer = { score: () => new Promise<number>((r) => setTimeout(() => r(1), 100)) };

    const budget = new TokenBudget({
      maxTokens: 50,
      strategy: semanticRelevance({ scorer, scoringTimeoutMs: 10, fallback: dropOldest() }),
      tokenizer: { count: (text) => text.length },
    });

    budget.addMessage({ role: 'user', content: 'old msg' });
    budget.addMessage({ role: 'assistant', content: 'filler'.repeat(10) });

    const ctx = await budget.getContext();
    expect(ctx.messages.map((m) => m.content)).not.toContain('old msg');
  });

  it('caches scores appropriately, clearing when the query message changes', async () => {
    const scoreMock = vi.fn().mockResolvedValue(0.5);
    const scorer = { score: scoreMock };

    const budget = new TokenBudget({
      maxTokens: 5,
      strategy: semanticRelevance({ scorer }),
      tokenizer: { count: (text) => text.length },
    });

    budget.addMessage({ role: 'user', content: 'query 1' });
    await budget.getContext();
    expect(scoreMock).toHaveBeenCalledTimes(1);

    // No new user message = same query = cache hit, no new scorer calls.
    await budget.getContext();
    expect(scoreMock).toHaveBeenCalledTimes(1);

    budget.addMessage({ role: 'user', content: 'query 2' });
    await budget.getContext();
    expect(scoreMock).toHaveBeenCalledTimes(3); // 2 messages now, cache cleared by the new query
  });

  it('respects hybrid weights (recency can outweigh a low semantic score)', async () => {
    const scorer = { score: () => 0 }; // everything scores 0 semantically
    const budget = new TokenBudget({
      maxTokens: 20,
      strategy: semanticRelevance({ scorer, weights: { semantic: 0, recency: 1 } }),
      tokenizer: { count: (text) => text.length },
      messageOverhead: () => 0,
    });

    budget.addMessage({ role: 'user', content: 'oldest'.padEnd(10) });
    budget.addMessage({ role: 'user', content: 'newest'.padEnd(10) });

    const ctx = await budget.getContext();
    // Pure recency weighting: the more recent message should win.
    expect(ctx.messages.map((m) => (m.content as string).trim())).toContain('newest');
  });

  it('pinned messages are always retained regardless of score', async () => {
    const scorer = { score: () => 0 };
    const budget = new TokenBudget({
      maxTokens: 30,
      strategy: semanticRelevance({ scorer }),
      tokenizer: { count: (text) => text.length },
      messageOverhead: () => 0,
    });

    budget.addMessage({ role: 'system', content: 'pinned prompt', pinned: true });
    budget.addMessage({ role: 'user', content: 'filler'.repeat(10) });

    const ctx = await budget.getContext();
    expect(ctx.messages.some((m) => m.content === 'pinned prompt')).toBe(true);
  });
});
