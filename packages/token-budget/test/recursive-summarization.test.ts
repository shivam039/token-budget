import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { summarizeOldest } from '../src/strategies/summarizeOldest.js';

function makeBudget(overrides: Partial<Parameters<typeof summarizeOldest>[0]> = {}) {
  const summarize = vi.fn(async (msgs: any[]) => `summary of ${msgs.length}`);
  const budget = new TokenBudget({
    maxTokens: 12,
    charsPerToken: 1,
    strategy: summarizeOldest({ summarize, preThreshold: 1, ...overrides }),
  });
  return { budget, summarize };
}

/**
 * `getContext()` never mutates the buffer — every call re-derives from the
 * full raw history (Phase 1 design: `getMessages()` always returns
 * everything). Re-summarization only makes sense across *separate* strategy
 * invocations, so these tests use `budget.commit(result.messages)` between
 * rounds — the documented pattern for making a strategized result "stick"
 * before the next turn (see README: summarize-oldest > recursive passes).
 */
describe('recursive summarization (FR2-5.1-5.4)', () => {
  it('re-summarizes a previous summary once it is the oldest eligible content again', async () => {
    const { budget } = makeBudget();
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const firstSynthetic = first.messages.find((m) => m.metadata?.synthetic);
    expect(firstSynthetic!.metadata!.summaryDepth).toBe(1);
    budget.commit(first.messages);

    // Push the buffer over budget again; the depth-1 summary is now the oldest thing.
    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    const second = await budget.getContext();
    const secondSynthetic = second.messages.find((m) => m.metadata?.synthetic);
    expect(secondSynthetic).toBeTruthy();
    expect(secondSynthetic!.metadata!.summaryDepth).toBe(2);
    // The depth-1 summary itself should no longer be present — it was folded in.
    expect(second.messages.some((m) => m.id === firstSynthetic!.id)).toBe(false);
  });

  it('accumulates sourceIds across passes rather than overwriting them (FR2-5.3)', async () => {
    const { budget } = makeBudget();
    const a = budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    const b = budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const firstSynthetic = first.messages.find((m) => m.metadata?.synthetic)!;
    expect(firstSynthetic.metadata!.sourceIds).toEqual(expect.arrayContaining([a.id, b.id]));
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    const second = await budget.getContext();
    const secondSynthetic = second.messages.find((m) => m.metadata?.synthetic)!;
    // Traces back to every original message, not just the immediately-prior summary.
    expect(secondSynthetic.metadata!.sourceIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('never re-summarizes a summary once it reaches maxSummaryDepth', async () => {
    const { budget, summarize } = makeBudget({ maxSummaryDepth: 1 });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const depth1 = first.messages.find((m) => m.metadata?.synthetic)!;
    expect(depth1.metadata!.summaryDepth).toBe(1);
    budget.commit(first.messages);

    summarize.mockClear();
    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    await budget.getContext();
    // With maxSummaryDepth: 1, the depth-1 summary is already maxed and must
    // never be folded into the summarize() call again.
    for (const call of summarize.mock.calls) {
      const messagesPassed = call[0] as any[];
      expect(messagesPassed.some((m) => m.id === depth1.id)).toBe(false);
    }
  });

  it('onMaxDepthReached "keep-forever" (default) never evicts a depth-maxed summary', async () => {
    const { budget } = makeBudget({ maxSummaryDepth: 1, onMaxDepthReached: 'keep-forever' });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const depth1 = first.messages.find((m) => m.metadata?.synthetic)!;
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    const second = await budget.getContext();
    expect(second.messages.some((m) => m.id === depth1.id)).toBe(true);
  });

  it('onMaxDepthReached "evict" drops a depth-maxed summary like drop-oldest would', async () => {
    const { budget } = makeBudget({ maxSummaryDepth: 1, onMaxDepthReached: 'evict' });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const depth1 = first.messages.find((m) => m.metadata?.synthetic)!;
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    const second = await budget.getContext();
    expect(second.messages.some((m) => m.id === depth1.id)).toBe(false);
    expect(second.evicted.some((m) => m.id === depth1.id)).toBe(true);
  });

  it('onMaxDepthReached accepts a callback for per-message decisions', async () => {
    const decisions: string[] = [];
    const { budget } = makeBudget({
      maxSummaryDepth: 1,
      onMaxDepthReached: (message) => {
        decisions.push(message.id);
        return 'evict';
      },
    });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const depth1 = first.messages.find((m) => m.metadata?.synthetic)!;
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    await budget.getContext();
    expect(decisions).toContain(depth1.id);
  });

  it('explain() distinguishes first-pass from re-summarization, including depth', async () => {
    const { budget } = makeBudget();
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const firstReport = budget.explain()!;
    expect(firstReport.steps[0]!.synthesized[0]!.reason).toContain('first-pass');
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    await budget.getContext();
    const secondReport = budget.explain()!;
    expect(secondReport.steps[0]!.synthesized[0]!.reason).toContain('re-summarized');
    expect(secondReport.steps[0]!.synthesized[0]!.reason).toContain('depth 2');
  });

  it('explain() reports a hard-eviction-only step when nothing is left to summarize', async () => {
    const { budget } = makeBudget({ maxSummaryDepth: 1, onMaxDepthReached: 'evict' });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    const depth1 = first.messages.find((m) => m.metadata?.synthetic)!;
    budget.commit(first.messages);

    // Nothing else non-pinned exists — the only evictable unit is the
    // already-maxed synthetic itself, so this round hard-evicts it
    // without summarizing anything.
    const second = await budget.getContext();
    const report = budget.explain()!;
    expect(report.steps[0]!.synthesized).toHaveLength(0);
    expect(report.steps[0]!.evicted.some((e) => e.id === depth1.id)).toBe(true);
    expect(second.messages.some((m) => m.id === depth1.id)).toBe(false);
  });

  it('respects pinned messages throughout multiple summarization passes', async () => {
    const { budget } = makeBudget();
    const sys = budget.addMessage({ role: 'system', content: 'system prompt', pinned: true });
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'b'.repeat(10) });
    const first = await budget.getContext();
    budget.commit(first.messages);

    budget.addMessage({ role: 'user', content: 'c'.repeat(10) });
    budget.addMessage({ role: 'user', content: 'd'.repeat(10) });
    const second = await budget.getContext();
    expect(second.messages.some((m) => m.id === sys.id)).toBe(true);
  });
});
