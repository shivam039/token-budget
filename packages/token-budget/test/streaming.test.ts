import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';

describe('beginStream', () => {
  it('registers a new open stream', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(() => budget.beginStream('s1', 'assistant')).not.toThrow();
  });

  it('throws if the id is already open', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    expect(() => budget.beginStream('s1', 'assistant')).toThrow();
  });

  it('allows reusing an id after it has been finalized', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'hi');
    budget.endStream('s1');
    expect(() => budget.beginStream('s1', 'assistant')).not.toThrow();
  });
});

describe('appendStreamChunk', () => {
  it('throws for an unknown stream id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(() => budget.appendStreamChunk('nope', 'hi')).toThrow();
  });

  it('accumulates an approximate running token count as chunks arrive', () => {
    const budget = new TokenBudget({ maxTokens: 1000, charsPerToken: 1 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'aaaa');
    expect(budget.stats().streaming).toEqual([{ id: 's1', estimatedTokens: 4 }]);
    budget.appendStreamChunk('s1', 'bbbb');
    expect(budget.stats().streaming).toEqual([{ id: 's1', estimatedTokens: 8 }]);
  });

  it('reflects the streaming estimate in stats().tokensUsed in real time', () => {
    const budget = new TokenBudget({ maxTokens: 1000, charsPerToken: 1 });
    const before = budget.stats().tokensUsed;
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'aaaaaaaaaa');
    expect(budget.stats().tokensUsed).toBe(before + 10);
  });

  it('accepts structured ContentBlock chunks', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    expect(() => budget.appendStreamChunk('s1', { type: 'tool_call', id: 'x', name: 'y', arguments: {} })).not.toThrow();
    expect(budget.stats().streaming[0]!.estimatedTokens).toBeGreaterThan(0);
  });

  it('supports multiple concurrent streams, keyed independently', () => {
    const budget = new TokenBudget({ maxTokens: 1000, charsPerToken: 1 });
    budget.beginStream('a', 'assistant');
    budget.beginStream('b', 'assistant');
    budget.appendStreamChunk('a', 'aa');
    budget.appendStreamChunk('b', 'bbbb');
    const streaming = budget.stats().streaming;
    expect(streaming.find((s) => s.id === 'a')!.estimatedTokens).toBe(2);
    expect(streaming.find((s) => s.id === 'b')!.estimatedTokens).toBe(4);
  });

  it('is O(chunk length) per call, not O(total accumulated length)', () => {
    const budget = new TokenBudget({ maxTokens: 10_000_000, charsPerToken: 1 });
    budget.beginStream('s1', 'assistant');
    const chunk = 'x'.repeat(50);
    const n = 20_000;
    const start = performance.now();
    for (let i = 0; i < n; i++) budget.appendStreamChunk('s1', chunk);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000); // generous ceiling; O(total) would be far slower at this n
    expect(budget.stats().streaming[0]!.estimatedTokens).toBe(n * chunk.length);
  });
});

describe('endStream', () => {
  it('throws for an unknown stream id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(() => budget.endStream('nope')).toThrow();
  });

  it('folds all-string chunks into a single string message', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'Hello, ');
    budget.appendStreamChunk('s1', 'world!');
    const message = budget.endStream('s1');
    expect(message.content).toBe('Hello, world!');
    expect(message.role).toBe('assistant');
    expect(message.id).toBe('s1');
  });

  it('folds mixed string/ContentBlock chunks into ContentBlock[], merging adjacent text', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', "I'll check that. ");
    budget.appendStreamChunk('s1', { type: 'tool_call', id: 'c1', name: 'get_weather', arguments: {} });
    const message = budget.endStream('s1');
    expect(message.content).toEqual([
      { type: 'text', text: "I'll check that. " },
      { type: 'tool_call', id: 'c1', name: 'get_weather', arguments: {} },
    ]);
  });

  it('folds the buffer into the main message list and removes it from streaming state', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'hi');
    budget.endStream('s1');
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.stats().streaming).toHaveLength(0);
  });

  it('performs an exact recount, reconciling any drift from the running estimate', () => {
    const budget = new TokenBudget({ maxTokens: 1000 }); // default estimate tokenizer, chars/4
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'a'); // ceil(1/4) = 1 token estimated for this chunk alone
    budget.appendStreamChunk('s1', 'a'); // ceil(1/4) = 1 token estimated for this chunk alone -> running estimate 2
    const message = budget.endStream('s1'); // exact: ceil(2/4) = 1 content token + overhead
    expect(message.tokens).toBeLessThan(2 + 4); // reconciled count differs from the naive per-chunk sum
  });

  it('preserves metadata passed to beginStream', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant', { requestId: 'req_1' });
    budget.appendStreamChunk('s1', 'hi');
    const message = budget.endStream('s1');
    expect(message.metadata).toEqual({ requestId: 'req_1' });
  });
});

describe('abortStream', () => {
  it('throws for an unknown stream id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(() => budget.abortStream('nope')).toThrow();
  });

  it('discard (default) drops the partial message entirely', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'partial...');
    budget.abortStream('s1');
    expect(budget.getMessages()).toHaveLength(0);
    expect(budget.stats().streaming).toHaveLength(0);
  });

  it('keep-partial finalizes the partial content as a complete message', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'partial...');
    budget.abortStream('s1', 'keep-partial');
    expect(budget.getMessages()).toHaveLength(1);
    expect(budget.getMessages()[0]!.content).toBe('partial...');
  });
});

describe('onStrategyDuringStream', () => {
  it('defaults to "skip": getContext proceeds normally, ignoring the open stream', async () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.addMessage({ role: 'user', content: 'hi' });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'still typing...');
    await expect(budget.getContext()).resolves.toBeTruthy();
    expect((await budget.getContext()).messages).toHaveLength(1); // open stream never appears
  });

  it('"error" throws while any stream is open', () => {
    const budget = new TokenBudget({ maxTokens: 1000, onStrategyDuringStream: 'error' });
    budget.beginStream('s1', 'assistant');
    expect(() => budget.getContextSync()).toThrow();
  });

  it('"error" stops throwing once the stream is finalized', () => {
    const budget = new TokenBudget({ maxTokens: 1000, onStrategyDuringStream: 'error' });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'hi');
    budget.endStream('s1');
    expect(() => budget.getContextSync()).not.toThrow();
  });
});

describe('streaming + warning event', () => {
  it('fires warning based on the streaming-inclusive total', () => {
    const budget = new TokenBudget({ maxTokens: 100, charsPerToken: 1, warningThreshold: 0.5 });
    const handler = vi.fn();
    budget.on('warning', handler);
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'a'.repeat(60));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
