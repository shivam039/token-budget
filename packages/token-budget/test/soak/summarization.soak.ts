import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { summarizeOldest } from '../../src/strategies/summarizeOldest.js';
import { dropOldest } from '../../src/strategies/dropOldest.js';
import { chain } from '../../src/strategies/chain.js';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FR2-5.6: simulates a very long conversation (10,000+ messages) against a
 * small budget with recursive summarize-oldest (backstopped by
 * drop-oldest, per the documented "if absolutely necessary" pattern),
 * asserting: the buffer never exceeds budget, maxSummaryDepth is
 * respected, and provenance chains remain intact and traceable.
 *
 * Long-running by design — see vitest.soak.config.ts / `npm run test:soak`;
 * not part of the default `npm test` run.
 */
describe('soak: 10,000+ message conversation with recursive summarization', () => {
  it('never exceeds budget, respects maxSummaryDepth, and keeps provenance traceable', async () => {
    const MAX_SUMMARY_DEPTH = 3;
    const MESSAGE_COUNT = 10_500;
    const rng = mulberry32(20260826);
    const originalIds = new Set<string>();
    let maxObservedDepth = 0;

    const budget = new TokenBudget({
      maxTokens: 400,
      charsPerToken: 1,
      strategy: chain([
        summarizeOldest({
          summarize: async (msgs) => `(summary of ${msgs.length} messages)`,
          // Trigger with headroom below the hard budget: summarize-oldest's
          // own growing-block loop doesn't know the new synthetic's token
          // cost in advance (documented in the README), so without margin
          // a fresh summary can immediately push back over budget and get
          // evicted by the drop-oldest backstop in the same pass, before
          // it ever gets a chance to survive to a later round.
          preThreshold: 0.7,
          maxSummaryDepth: MAX_SUMMARY_DEPTH,
          onMaxDepthReached: 'keep-forever',
        }),
        dropOldest(), // hard backstop: "still evictable by drop-oldest if absolutely necessary"
      ]),
    });
    budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });

    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      const content = 'x'.repeat(5 + Math.floor(rng() * 20));
      const msg = budget.addMessage({ role, content });
      originalIds.add(msg.id);

      const ctx = await budget.getContext();
      expect(ctx.tokensUsed).toBeLessThanOrEqual(budget.effectiveBudget);

      for (const message of ctx.messages) {
        if (message.metadata?.synthetic) {
          const depth = message.metadata.summaryDepth as number;
          maxObservedDepth = Math.max(maxObservedDepth, depth);
          expect(depth).toBeLessThanOrEqual(MAX_SUMMARY_DEPTH);

          // Provenance (FR2-5.3): every traced-back id must be a real
          // original message id — never a synthetic id or garbage.
          const sourceIds = message.metadata.sourceIds as string[];
          expect(sourceIds.length).toBeGreaterThan(0);
          for (const id of sourceIds) expect(originalIds.has(id)).toBe(true);
        }
      }

      budget.commit(ctx.messages); // make this round's compaction stick for the next one
    }

    expect(budget.getMessages().length).toBeGreaterThan(0);
    expect(budget.getMessages().length).toBeLessThan(MESSAGE_COUNT); // real compaction happened
    expect(maxObservedDepth).toBeGreaterThan(1); // recursion actually kicked in at least once
    expect(budget.getMessages().some((m) => m.pinned)).toBe(true); // system prompt survived throughout
  });
});
