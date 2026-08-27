import { describe, it, expect, vi } from 'vitest';
import { createEmbeddingsScorer } from '../src/index.js';
import type { BudgetMessage, ScoringContext } from '@shivam.dixit/token-budget';

describe('token-budget-embeddings', () => {
  it('calculates cosine similarity correctly, caching repeated calls', async () => {
    const embed = vi.fn(async (text: string) => {
      if (text === 'apple') return [1, 0, 0];
      if (text === 'banana') return [0, 1, 0];
      if (text === 'fruit') return [0.707, 0.707, 0];
      return [0, 0, 0];
    });

    const scorer = createEmbeddingsScorer({ embed });

    const query = { id: 'q', role: 'user', content: 'fruit' } as BudgetMessage;
    const msg1 = { id: '1', role: 'assistant', content: 'apple' } as BudgetMessage;
    const msg2 = { id: '2', role: 'assistant', content: 'banana' } as BudgetMessage;
    const ctx: ScoringContext = { query, buffer: [msg1, msg2] };

    const score1 = await scorer.score(msg1, ctx);
    const score2 = await scorer.score(msg2, ctx);

    expect(score1).toBeCloseTo(0.707);
    expect(score2).toBeCloseTo(0.707);
    expect(embed).toHaveBeenCalledTimes(3); // query, msg1, msg2

    const score3 = await scorer.score(msg1, ctx);
    expect(embed).toHaveBeenCalledTimes(3); // cache hit, no new calls
    expect(score3).toBeCloseTo(0.707);
  });

  it('throws on mismatched vector dimensions rather than silently misscoring', async () => {
    const embed = vi.fn(async (text: string) => (text === 'query' ? [1, 0, 0] : [1, 0]));
    const scorer = createEmbeddingsScorer({ embed });
    const query = { id: 'q', role: 'user', content: 'query' } as BudgetMessage;
    const msg = { id: 'm', role: 'assistant', content: 'msg' } as BudgetMessage;
    await expect(scorer.score(msg, { query, buffer: [msg] })).rejects.toThrow(/dimension mismatch/);
  });

  it('returns 0 without calling embed() for a message/query with no extractable text', async () => {
    const embed = vi.fn(async () => [1, 0, 0]);
    const scorer = createEmbeddingsScorer({ embed });
    const query = { id: 'q', role: 'user', content: 'real query' } as BudgetMessage;
    const emptyMsg = { id: 'm', role: 'assistant', content: [] } as unknown as BudgetMessage;
    const score = await scorer.score(emptyMsg, { query, buffer: [emptyMsg] });
    expect(score).toBe(0);
  });

  /**
   * Regression test for a real concurrency bug: an earlier version cached
   * the query vector in one shared "lastQueryVector" slot and re-read
   * that shared slot *after* `await embed(queryText)` resolved — so a
   * concurrent call's `embed()` resolving in between could overwrite the
   * slot before the first call read it back for its own `cosineSimilarity`
   * call, silently scoring one caller's message against a *different*
   * caller's query. This is exactly the pattern a multi-tenant server
   * reusing one scorer instance across concurrent requests would hit.
   *
   * This test forces that precise interleaving with manually-resolved
   * embed() promises and asserts each call's score reflects only its own
   * query/message pair, never a concurrently-resolved one.
   */
  it('does not let a concurrent call for a different query contaminate an in-flight score (concurrency regression)', async () => {
    const resolvers: Record<string, (vector: number[]) => void> = {};
    const embed = vi.fn(
      (text: string) =>
        new Promise<number[]>((resolve) => {
          resolvers[text] = resolve;
        }),
    );
    const scorer = createEmbeddingsScorer({ embed });

    const queryA = { id: 'qa', role: 'user', content: 'query A' } as BudgetMessage;
    const queryB = { id: 'qb', role: 'user', content: 'query B' } as BudgetMessage;
    const msgA = { id: 'ma', role: 'assistant', content: 'msg A' } as BudgetMessage;
    const msgB = { id: 'mb', role: 'assistant', content: 'msg B' } as BudgetMessage;

    // Call A starts first: its query embed is requested, then it suspends
    // awaiting the query vector.
    const scoreAPromise = scorer.score(msgA, { query: queryA, buffer: [msgA] });
    await Promise.resolve(); // let the microtask queue advance to the first await
    resolvers['query A']!([1, 0, 0]);
    await Promise.resolve(); // call A now suspends awaiting its message vector

    // Call B starts *while call A is still in flight*, resolves entirely
    // before call A's message vector does.
    const scoreBPromise = scorer.score(msgB, { query: queryB, buffer: [msgB] });
    await Promise.resolve();
    resolvers['query B']!([0, 1, 0]);
    resolvers['msg B']!([0, 1, 0]); // identical to its own query vector
    const scoreB = await scoreBPromise;

    // Now let call A's message vector resolve, orthogonal to its own
    // query vector [1, 0, 0].
    resolvers['msg A']!([0, 1, 0]);
    const scoreA = await scoreAPromise;

    expect(scoreB).toBeCloseTo(1); // scored against its own query, unaffected by A
    expect(scoreA).toBeCloseTo(0); // scored against its own query — NOT B's [0, 1, 0]
  });
});
