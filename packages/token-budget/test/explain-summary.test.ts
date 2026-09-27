import { describe, expect, it } from 'vitest';
import { formatExplain, summarizeExplain, type ExplainReport } from '../src/index.js';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';

const report: ExplainReport = {
  strategyApplied: 'chain(summarize-oldest -> priority)',
  timestamp: 123,
  tokensBefore: 120,
  tokensAfter: 70,
  tokensRemaining: 30,
  steps: [
    {
      strategyName: 'summarize-oldest',
      tokensBefore: 120,
      tokensAfter: 90,
      messagesConsidered: 6,
      evicted: [{ id: 'old-1', reason: 'summarized into synthetic message summary-1' }],
      synthesized: [{ id: 'summary-1', sourceIds: ['old-1'], reason: 'first-pass summary' }],
    },
    {
      strategyName: 'priority',
      tokensBefore: 90,
      tokensAfter: 70,
      messagesConsidered: 5,
      evicted: [{ id: 'low-2', reason: 'priority=0 (rank 1 of 1 evicted)' }],
      synthesized: [],
    },
  ],
};

describe('explain summary helpers', () => {
  it('does not add summary-only fields to the raw ExplainReport', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'long enough to evict' });
    budget.getContextSync();
    expect(Object.keys(budget.explain()!)).toEqual(['steps', 'tokensBefore', 'tokensAfter', 'tokensRemaining', 'strategyApplied', 'timestamp']);
  });

  it('returns compact machine-readable counts while preserving per-step token data', () => {
    const summary = summarizeExplain(report);
    expect(summary.totals).toEqual({ steps: 2, evicted: 2, synthesized: 1 });
    expect(summary.steps[0]).toMatchObject({ strategyName: 'summarize-oldest', tokensBefore: 120, tokensAfter: 90, evictedCount: 1, synthesizedCount: 1 });
    expect(summary.steps[0]).not.toHaveProperty('evicted');
  });

  it('includes source ids and reasons in verbose mode', () => {
    const summary = summarizeExplain(report, 'verbose');
    expect(summary.steps[0]?.evicted?.[0]?.reason).toContain('summarized');
    expect(summary.steps[0]?.synthesized?.[0]?.sourceIds).toEqual(['old-1']);
  });

  it('formats compact and verbose human-readable summaries', () => {
    expect(formatExplain(report)).toContain('eviction decisions: 2');
    expect(formatExplain(report, 'compact')).not.toContain('old-1:');
    expect(formatExplain(report, 'verbose')).toContain('evicted old-1: summarized into synthetic message summary-1');
  });
});
