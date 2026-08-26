import { describe, expect, it, vi } from 'vitest';
import { TokenBudget } from '../src/budget.js';
import { dropOldest } from '../src/strategies/dropOldest.js';

describe('warning event', () => {
  it('fires once usage crosses warningThreshold', () => {
    const budget = new TokenBudget({ maxTokens: 100, charsPerToken: 1, warningThreshold: 0.8 });
    const handler = vi.fn();
    budget.on('warning', handler);
    budget.addMessage({ role: 'user', content: 'a'.repeat(10) }); // 14 tokens, 14% -> no warning
    expect(handler).not.toHaveBeenCalled();
    budget.addMessage({ role: 'user', content: 'a'.repeat(70) }); // total 88 tokens -> 88% crosses 80%
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].threshold).toBe(0.8);
  });

  it('does not re-fire on every subsequent add while still above threshold', () => {
    const budget = new TokenBudget({ maxTokens: 100, charsPerToken: 1, warningThreshold: 0.5 });
    const handler = vi.fn();
    budget.addMessage({ role: 'user', content: 'a'.repeat(60) }); // crosses 50%
    budget.on('warning', handler);
    budget.addMessage({ role: 'user', content: 'a' }); // still above, no new crossing
    expect(handler).not.toHaveBeenCalled();
  });

  it('can be unsubscribed via the returned function or off()', () => {
    const budget = new TokenBudget({ maxTokens: 100, charsPerToken: 1, warningThreshold: 0.1 });
    const handler = vi.fn();
    const unsubscribe = budget.on('warning', handler);
    unsubscribe();
    budget.addMessage({ role: 'user', content: 'a'.repeat(50) });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('overflow event', () => {
  it('fires when a single added message alone exceeds the effective budget', () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1 });
    const handler = vi.fn();
    budget.on('overflow', handler);
    budget.addMessage({ role: 'user', content: 'a'.repeat(50) });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].reason).toBe('single-message-exceeds-budget');
  });

  it('fires when pinned messages alone cannot fit, even after strategy application', async () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    budget.addMessage({ role: 'system', content: 'a'.repeat(20), pinned: true });
    const handler = vi.fn();
    budget.on('overflow', handler);
    await budget.getContext();
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls.at(-1)![0].reason).toBe('unresolvable-after-strategy');
  });
});

describe('evicted event', () => {
  it('fires with the messages a strategy dropped', async () => {
    const budget = new TokenBudget({ maxTokens: 10, charsPerToken: 1, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'a'.repeat(20) });
    const handler = vi.fn();
    budget.on('evicted', handler);
    await budget.getContext();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire when nothing was evicted', async () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: dropOldest() });
    budget.addMessage({ role: 'user', content: 'hi' });
    const handler = vi.fn();
    budget.on('evicted', handler);
    await budget.getContext();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('strategy-error event', () => {
  it('fires when the configured strategy throws', async () => {
    const throwing = {
      name: 'throwing',
      sync: false as const,
      apply: async () => {
        throw new Error('strategy exploded');
      },
    };
    const budget = new TokenBudget({ maxTokens: 100, strategy: throwing });
    budget.addMessage({ role: 'user', content: 'hi' });
    const handler = vi.fn();
    budget.on('strategy-error', handler);
    await expect(budget.getContext()).rejects.toThrow('strategy exploded');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].strategyName).toBe('throwing');
  });
});
