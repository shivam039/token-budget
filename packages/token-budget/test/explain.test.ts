import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';
import { slidingWindow } from '../src/strategies/slidingWindow.js';
import { priority } from '../src/strategies/priority.js';
import { summarizeOldest } from '../src/strategies/summarizeOldest.js';
import { chain } from '../src/strategies/chain.js';

describe('explain()', () => {
  it('returns undefined before getContext()/getContextSync() has ever run', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(budget.explain()).toBeUndefined();
  });

  it('reports a single step with tokens before/after for a plain strategy', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'a'.repeat(20) });
    budget.getContextSync();

    const report = budget.explain();
    expect(report).toBeTruthy();
    expect(report!.steps).toHaveLength(1);
    expect(report!.steps[0]!.strategyName).toBe('drop-oldest');
    expect(report!.steps[0]!.tokensBefore).toBeGreaterThan(report!.steps[0]!.tokensAfter);
    expect(report!.tokensAfter).toBeLessThanOrEqual(10);
    expect(report!.strategyApplied).toBe('drop-oldest');
  });

  it('gives a human-readable reason per evicted message', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    const a = budget.addMessage({ role: 'user', content: 'a'.repeat(20) });
    budget.getContextSync();
    const report = budget.explain()!;
    const decision = report.steps[0]!.evicted.find((e) => e.id === a.id);
    expect(decision).toBeTruthy();
    expect(decision!.reason).toContain('oldest non-pinned message');
  });

  it('is JSON-serializable (no functions, no circular refs)', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'a'.repeat(20) });
    budget.getContextSync();
    expect(() => JSON.stringify(budget.explain())).not.toThrow();
  });

  it('shows priority-specific reasons (priority value, tie-break note)', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: priority() });
    const low = budget.addMessage({ role: 'user', content: 'a'.repeat(10), priority: 1 });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10), priority: 10 });
    budget.getContextSync();
    const decision = budget.explain()!.steps[0]!.evicted.find((e) => e.id === low.id);
    expect(decision!.reason).toContain('priority=1');
  });

  it('shows sliding-window-specific reasons distinguishing window cutoff from enforceBudget trim', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: slidingWindow({ turns: 1, enforceBudget: true }) });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaaaaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'b' });
    budget.getContextSync();
    const [decision] = budget.explain()!.steps[0]!.evicted;
    expect(decision!.reason).toContain('outside the last 1 turns');
  });

  it('reports every link of a chain in order (FR2-4.3), not just the net result', () => {
    const budget = new TokenBudget({
      maxTokens: 100000,
      strategy: chain([slidingWindow({ turns: 1 }), dropOldest()]),
    });
    budget.addMessage({ role: 'user', content: 'one' });
    budget.addMessage({ role: 'user', content: 'two' });
    budget.getContextSync();
    const report = budget.explain()!;
    expect(report.steps.map((s) => s.strategyName)).toEqual(['sliding-window', 'drop-oldest']);
  });

  it('reports a synthesized summary message with its source ids', async () => {
    const budget = new TokenBudget({
      maxTokens: 10,
      charsPerToken: 1,
      strategy: summarizeOldest({ summarize: async () => 'summary' }),
    });
    const a = budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    await budget.getContext();
    const step = budget.explain()!.steps[0]!;
    expect(step.synthesized).toHaveLength(1);
    expect(step.synthesized[0]!.sourceIds).toContain(a.id);
  });

  it('is updated by both getContext() and getContextSync()', async () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'hi' });
    await budget.getContext();
    const first = budget.explain();
    budget.addMessage({ role: 'user', content: 'again' });
    budget.getContextSync();
    const second = budget.explain();
    expect(second!.timestamp).toBeGreaterThanOrEqual(first!.timestamp);
  });
});

describe('decision event', () => {
  it('fires every time a strategy runs, mirroring explain()', () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: dropOldest() });
    const handler = vi.fn();
    budget.on('decision', handler);
    budget.addMessage({ role: 'user', content: 'hi' });
    budget.getContextSync();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toEqual(budget.explain());
  });
});

describe('devMode', () => {
  it('defaults to false and never logs', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const budget = new TokenBudget({ maxTokens: 1000 });
      budget.addMessage({ role: 'user', content: 'hi' });
      budget.getContextSync();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('when true, console.debug-logs every ExplainReport', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      const budget = new TokenBudget({ maxTokens: 1000, devMode: true });
      budget.addMessage({ role: 'user', content: 'hi' });
      budget.getContextSync();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
