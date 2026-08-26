import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';

describe('TokenBudget config validation', () => {
  it('throws if maxTokens is missing or non-positive', () => {
    expect(() => new TokenBudget({ maxTokens: 0 })).toThrow();
    expect(() => new TokenBudget({} as any)).toThrow();
  });

  it('throws if reserve >= maxTokens', () => {
    expect(() => new TokenBudget({ maxTokens: 100, reserve: 100 })).toThrow();
    expect(() => new TokenBudget({ maxTokens: 100, reserve: 150 })).toThrow();
  });

  it('throws if reserve is negative', () => {
    expect(() => new TokenBudget({ maxTokens: 100, reserve: -1 })).toThrow();
  });

  it('throws if warningThreshold is out of [0,1]', () => {
    expect(() => new TokenBudget({ maxTokens: 100, warningThreshold: 1.5 })).toThrow();
    expect(() => new TokenBudget({ maxTokens: 100, warningThreshold: -0.1 })).toThrow();
  });

  it('accepts a valid config', () => {
    expect(() => new TokenBudget({ maxTokens: 100, reserve: 10, warningThreshold: 0.5 })).not.toThrow();
  });
});

describe('TokenBudget buffer management', () => {
  it('addMessage returns a message with an id, timestamp, and cached tokens', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    const msg = budget.addMessage({ role: 'user', content: '12345678' });
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeTypeOf('number');
    expect(msg.tokens).toBe(2 + 4);
  });

  it('preserves a caller-supplied id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    const msg = budget.addMessage({ id: 'custom-1', role: 'user', content: 'hi' });
    expect(msg.id).toBe('custom-1');
  });

  it('incrementally tracks tokensUsed across add/remove/edit', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    const a = budget.addMessage({ role: 'user', content: '12345678' }); // 2 + 4 = 6
    const b = budget.addMessage({ role: 'assistant', content: '1234' }); // 1 + 4 = 5
    expect(budget.stats().tokensUsed).toBe(11);

    budget.removeMessage(a.id);
    expect(budget.stats().tokensUsed).toBe(5);

    budget.editMessage(b.id, { content: '12345678' }); // now 2 + 4 = 6
    expect(budget.stats().tokensUsed).toBe(6);
  });

  it('removeMessage returns false for an unknown id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(budget.removeMessage('nope')).toBe(false);
  });

  it('editMessage throws for an unknown id', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    expect(() => budget.editMessage('nope', { content: 'x' })).toThrow();
  });

  it('clear() resets messages and totals', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.addMessage({ role: 'user', content: 'hello' });
    budget.clear();
    expect(budget.getMessages()).toHaveLength(0);
    expect(budget.stats().tokensUsed).toBe(0);
  });

  it('getMessages() maintains insertion order and is a defensive copy', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    budget.addMessage({ role: 'user', content: 'one' });
    budget.addMessage({ role: 'assistant', content: 'two' });
    const messages = budget.getMessages();
    expect(messages.map((m) => m.content)).toEqual(['one', 'two']);
    messages.push({ id: 'x', role: 'user', content: 'mutated' });
    expect(budget.getMessages()).toHaveLength(2);
  });

  it('estimateBeforeAdd previews token cost without mutating state', () => {
    const budget = new TokenBudget({ maxTokens: 1000 });
    const before = budget.stats().tokensUsed;
    const estimate = budget.estimateBeforeAdd({ role: 'user', content: '12345678' });
    expect(estimate).toBe(6);
    expect(budget.stats().tokensUsed).toBe(before);
    expect(budget.getMessages()).toHaveLength(0);
  });

  it('stats() reports maxTokens, reserve, counts', () => {
    const budget = new TokenBudget({ maxTokens: 100, reserve: 20 });
    budget.addMessage({ role: 'system', content: 'sys', pinned: true });
    budget.addMessage({ role: 'user', content: 'hi' });
    const stats = budget.stats();
    expect(stats.maxTokens).toBe(100);
    expect(stats.reserve).toBe(20);
    expect(stats.messageCount).toBe(2);
    expect(stats.pinnedCount).toBe(1);
    expect(stats.tokensRemaining).toBe(80 - stats.tokensUsed);
  });
});

describe('TokenBudget runtime reconfiguration', () => {
  it('setMaxTokens changes the effective budget without losing buffer state', () => {
    const budget = new TokenBudget({ maxTokens: 100 });
    budget.addMessage({ role: 'user', content: 'hello world' });
    budget.setMaxTokens(500);
    expect(budget.maxTokens).toBe(500);
    expect(budget.getMessages()).toHaveLength(1);
  });

  it('setMaxTokens rejects a value not greater than the current reserve', () => {
    const budget = new TokenBudget({ maxTokens: 100, reserve: 50 });
    expect(() => budget.setMaxTokens(40)).toThrow();
  });

  it('setReserve changes the reserve without losing buffer state', () => {
    const budget = new TokenBudget({ maxTokens: 100 });
    budget.addMessage({ role: 'user', content: 'hello world' });
    budget.setReserve(30);
    expect(budget.reserve).toBe(30);
    expect(budget.effectiveBudget).toBe(70);
    expect(budget.getMessages()).toHaveLength(1);
  });

  it('setReserve rejects a value not less than maxTokens', () => {
    const budget = new TokenBudget({ maxTokens: 100 });
    expect(() => budget.setReserve(100)).toThrow();
  });
});

describe('TokenBudget id generation fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to a counter-based id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const budget = new TokenBudget({ maxTokens: 100 });
    const a = budget.addMessage({ role: 'user', content: 'a' });
    const b = budget.addMessage({ role: 'user', content: 'b' });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^msg_/);
  });
});

describe('TokenBudget getContextSync misuse', () => {
  it('throws a descriptive error if a strategy declares sync:true but returns a Promise', () => {
    const lying = {
      name: 'lying',
      sync: true as const,
      apply: () => Promise.resolve([]) as any,
    };
    const budget = new TokenBudget({ maxTokens: 100, strategy: lying });
    budget.addMessage({ role: 'user', content: 'hi' });
    expect(() => budget.getContextSync()).toThrow(/declaring sync: true/);
  });
});
