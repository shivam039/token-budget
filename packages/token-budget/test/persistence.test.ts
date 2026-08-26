import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';

describe('serialize()', () => {
  it('captures messages and JSON-safe config', () => {
    const budget = new TokenBudget({ maxTokens: 1000, reserve: 100, warningThreshold: 0.7, charsPerToken: 3 });
    budget.addMessage({ role: 'system', content: 'sys', pinned: true });
    budget.addMessage({ role: 'user', content: 'hi' });

    const state = budget.serialize();
    expect(state.schemaVersion).toBe(1);
    expect(state.maxTokens).toBe(1000);
    expect(state.reserve).toBe(100);
    expect(state.warningThreshold).toBe(0.7);
    expect(state.charsPerToken).toBe(3);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.pinned).toBe(true);
  });

  it('is JSON-serializable (no functions, no circular refs)', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.addMessage({ role: 'user', content: 'hi', metadata: { note: 'x' } });
    expect(() => JSON.stringify(budget.serialize())).not.toThrow();
  });

  it('excludes open streams by default', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant');
    budget.appendStreamChunk('s1', 'partial...');
    const state = budget.serialize();
    expect(state.streaming).toBeUndefined();
  });

  it('includes open streams, marked wasInterrupted, when includeOpenStreams is set', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.beginStream('s1', 'assistant', { requestId: 'r1' });
    budget.appendStreamChunk('s1', 'partial...');
    const state = budget.serialize({ includeOpenStreams: true });
    expect(state.streaming).toEqual([{ id: 's1', role: 'assistant', parts: ['partial...'], metadata: { requestId: 'r1' }, wasInterrupted: true }]);
  });
});

describe('TokenBudget.deserialize()', () => {
  it('reconstructs a functionally identical budget from serialize()', () => {
    const original = new TokenBudget({ maxTokens: 1000, reserve: 50, charsPerToken: 4 });
    original.addMessage({ role: 'system', content: 'sys', pinned: true });
    original.addMessage({ role: 'user', content: 'hello there' });

    const restored = TokenBudget.deserialize(original.serialize());
    expect(restored.getMessages()).toEqual(original.getMessages());
    expect(restored.stats().tokensUsed).toBe(original.stats().tokensUsed);
    expect(restored.maxTokens).toBe(1000);
    expect(restored.reserve).toBe(50);
  });

  it('produces the same next eviction decisions as the original (behavioral parity)', async () => {
    const original = new TokenBudget({ maxTokens: 20, charsPerToken: 1, strategy: dropOldest() });
    original.addMessage({ role: 'user', content: 'a'.repeat(10) });
    original.addMessage({ role: 'user', content: 'b'.repeat(10) });
    original.addMessage({ role: 'user', content: 'c'.repeat(10) });

    const restored = TokenBudget.deserialize(original.serialize(), { strategy: dropOldest() });
    const originalCtx = await original.getContext();
    const restoredCtx = await restored.getContext();
    expect(restoredCtx.messages.map((m) => m.id)).toEqual(originalCtx.messages.map((m) => m.id));
    expect(restoredCtx.tokensUsed).toBe(originalCtx.tokensUsed);
  });

  it('accepts overrides for non-serializable config (tokenizer, strategy)', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    original.addMessage({ role: 'user', content: 'hi' });

    const customTokenizer = { count: () => 42 };
    const restored = TokenBudget.deserialize(original.serialize(), { tokenizer: customTokenizer, strategy: dropOldest() });
    expect(restored.estimateBeforeAdd({ role: 'user', content: 'anything' })).toBe(42 + 4); // + default messageOverhead
  });

  it('overrides can also change JSON-safe config, e.g. a bigger maxTokens', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    original.addMessage({ role: 'user', content: 'hi' });
    const restored = TokenBudget.deserialize(original.serialize(), { maxTokens: 5000 });
    expect(restored.maxTokens).toBe(5000);
  });

  it('restores open streams as still-open, leaving finalization to the caller', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    original.beginStream('s1', 'assistant', { requestId: 'r1' });
    original.appendStreamChunk('s1', 'partial...');
    const state = original.serialize({ includeOpenStreams: true });

    const restored = TokenBudget.deserialize(state);
    expect(restored.stats().streaming).toEqual([{ id: 's1', estimatedTokens: expect.any(Number) }]);
    const finalized = restored.endStream('s1');
    expect(finalized.content).toBe('partial...');
  });

  it('throws for a schemaVersion newer than this package supports', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    const state = original.serialize();
    expect(() => TokenBudget.deserialize({ ...state, schemaVersion: 999 })).toThrow();
  });

  it('warns (does not throw) for a schemaVersion older than current', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    const state = original.serialize();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => TokenBudget.deserialize({ ...state, schemaVersion: 0 })).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('round-trips through JSON.stringify/parse, not just object identity', () => {
    const original = new TokenBudget({ maxTokens: 1000 });
    original.addMessage({ role: 'user', content: 'hi', metadata: { a: 1 } });
    const roundTripped = JSON.parse(JSON.stringify(original.serialize()));
    const restored = TokenBudget.deserialize(roundTripped);
    expect(restored.getMessages()[0]!.content).toBe('hi');
    expect(restored.getMessages()[0]!.metadata).toEqual({ a: 1 });
  });
});

describe('onPersist', () => {
  it('is called after a mutation with the current serialize()-shaped state (debounce off by default)', () => {
    const onPersist = vi.fn();
    const budget = new TokenBudget({ maxTokens: 1000, onPersist });
    budget.addMessage({ role: 'user', content: 'hi' });
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(onPersist.mock.calls[0]![0].messages).toHaveLength(1);
  });

  it('fires on every mutating method: addMessage, removeMessage, editMessage, clear, commit', async () => {
    const onPersist = vi.fn();
    const budget = new TokenBudget({ maxTokens: 1000, onPersist });
    const msg = budget.addMessage({ role: 'user', content: 'hi' });
    budget.editMessage(msg.id, { content: 'hi!' });
    budget.removeMessage(msg.id);
    budget.commit([]);
    budget.clear();
    expect(onPersist.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('debounces rapid mutations into one call carrying the latest state (persistDebounceMs > 0)', async () => {
    vi.useFakeTimers();
    try {
      const onPersist = vi.fn();
      const budget = new TokenBudget({ maxTokens: 1000, onPersist, persistDebounceMs: 50 });
      budget.addMessage({ role: 'user', content: 'one' });
      budget.addMessage({ role: 'user', content: 'two' });
      budget.addMessage({ role: 'user', content: 'three' });
      expect(onPersist).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(onPersist).toHaveBeenCalledTimes(1);
      expect(onPersist.mock.calls[0]![0].messages).toHaveLength(3); // never dropped — carries the latest state
    } finally {
      vi.useRealTimers();
    }
  });

  it('a later mutation within the debounce window resets the timer without losing the call', async () => {
    vi.useFakeTimers();
    try {
      const onPersist = vi.fn();
      const budget = new TokenBudget({ maxTokens: 1000, onPersist, persistDebounceMs: 50 });
      budget.addMessage({ role: 'user', content: 'one' });
      await vi.advanceTimersByTimeAsync(30);
      budget.addMessage({ role: 'user', content: 'two' }); // resets the 50ms window
      await vi.advanceTimersByTimeAsync(30);
      expect(onPersist).not.toHaveBeenCalled(); // original window would have fired by now
      await vi.advanceTimersByTimeAsync(20);
      expect(onPersist).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
