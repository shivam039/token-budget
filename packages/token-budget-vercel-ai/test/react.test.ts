import { describe, expect, it } from 'vitest';
import { computeBudgetSnapshot } from '../src/react.js';

/**
 * FR2-1.3.2: tests the pure computation `useTokenBudget` wraps in
 * `useMemo`, independent of any React renderer — the hook itself is a
 * two-line `useMemo` shim around this function (see src/react.ts).
 */
describe('computeBudgetSnapshot', () => {
  it('sums token usage across a useChat()-shaped message list', () => {
    const result = computeBudgetSnapshot(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'hi' },
      ],
      { maxTokens: 1000, charsPerToken: 1 },
    );
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.tokensRemaining).toBe(1000 - result.tokensUsed);
  });

  it('ignores non-standard roles (e.g. useChat()\'s "data" messages)', () => {
    const withData = computeBudgetSnapshot([{ role: 'data', content: 'ignored' }, { role: 'user', content: 'hi' }], { maxTokens: 1000 });
    const withoutData = computeBudgetSnapshot([{ role: 'user', content: 'hi' }], { maxTokens: 1000 });
    expect(withData.tokensUsed).toBe(withoutData.tokensUsed);
  });

  it('flags isNearLimit once usage crosses warningThreshold', () => {
    const below = computeBudgetSnapshot([{ role: 'user', content: 'a'.repeat(10) }], { maxTokens: 1000, charsPerToken: 1, warningThreshold: 0.5 });
    const above = computeBudgetSnapshot([{ role: 'user', content: 'a'.repeat(600) }], { maxTokens: 1000, charsPerToken: 1, warningThreshold: 0.5 });
    expect(below.isNearLimit).toBe(false);
    expect(above.isNearLimit).toBe(true);
  });

  it('respects a configured reserve when computing isNearLimit', () => {
    const result = computeBudgetSnapshot([{ role: 'user', content: 'a'.repeat(85) }], { maxTokens: 100, reserve: 10, charsPerToken: 1, warningThreshold: 0.8 });
    // effectiveBudget = 90; ~89 tokens used (85 + 4 overhead) crosses 80% of 90
    expect(result.isNearLimit).toBe(true);
  });

  it('derives the budget from model when maxTokens is omitted', () => {
    const result = computeBudgetSnapshot([{ role: 'user', content: 'hi' }], { model: 'gpt-4o', charsPerToken: 1 });
    // gpt-4o's known context window (128,000) minus what's actually used
    expect(result.tokensRemaining).toBe(128_000 - result.tokensUsed);
  });
});
