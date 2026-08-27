import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { streamTextIntoBudget } from '../src/index.js';

async function* fakeTextStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk;
}

/**
 * FR2-1.3.3 / FR2-3.8: reference integration against a live-shaped
 * streamText() textStream (an AsyncIterable<string>, exactly what the SDK
 * returns), wired chunk by chunk into the Phase 2 streaming API.
 */
describe('streamTextIntoBudget', () => {
  it('consumes a textStream chunk by chunk and finalizes an exact message', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const message = await streamTextIntoBudget(fakeTextStream(['The weather ', 'in Paris ', 'is sunny.']), budget);
    expect(message.content).toBe('The weather in Paris is sunny.');
    expect(message.role).toBe('assistant');
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.stats().streaming).toHaveLength(0);
  });

  it('reflects partial tokens in stats() while the stream is still being consumed', async () => {
    const budget = new TokenBudget({ maxTokens: 100000, charsPerToken: 1 });
    let sawPartial = false;
    async function* observedStream(): AsyncIterable<string> {
      yield 'aaaaaaaaaa';
      sawPartial = budget.stats().streaming.length === 1 && budget.stats().streaming[0]!.estimatedTokens === 10;
      yield 'bbbbbbbbbb';
    }
    await streamTextIntoBudget(observedStream(), budget);
    expect(sawPartial).toBe(true);
  });

  it('finalizes whatever was received so far if the upstream stream throws', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    async function* throwingStream(): AsyncIterable<string> {
      yield 'partial content';
      throw new Error('connection dropped');
    }
    await expect(streamTextIntoBudget(throwingStream(), budget)).rejects.toThrow('connection dropped');
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.getMessages()[0]!.content).toBe('partial content');
  });

  it('accepts a caller-supplied id and metadata', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const message = await streamTextIntoBudget(fakeTextStream(['hi']), budget, { id: 'req_42', metadata: { requestId: 'req_42' } });
    expect(message.id).toBe('req_42');
    expect(message.metadata).toEqual({ requestId: 'req_42' });
  });

  it('supports multiple concurrent streams into the same budget', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const [a, b] = await Promise.all([
      streamTextIntoBudget(fakeTextStream(['a', 'a']), budget, { id: 'a' }),
      streamTextIntoBudget(fakeTextStream(['b', 'b']), budget, { id: 'b' }),
    ]);
    expect(new Set([a.id, b.id])).toEqual(new Set(['a', 'b']));
    expect(budget.getMessages()).toHaveLength(2);
  });
});
