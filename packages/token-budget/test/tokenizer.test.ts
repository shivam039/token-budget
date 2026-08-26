import { describe, expect, it } from 'vitest';
import { createEstimateTokenizer, defaultMessageOverhead, createDefaultContentCounters, countMessageTokens } from '../src/tokenizer.js';
import type { BudgetMessage } from '../src/types.js';

describe('createEstimateTokenizer', () => {
  it('estimates tokens as chars/4 by default', () => {
    const tokenizer = createEstimateTokenizer();
    expect(tokenizer.count('12345678')).toBe(2);
    expect(tokenizer.count('')).toBe(0);
  });

  it('rounds up partial tokens', () => {
    const tokenizer = createEstimateTokenizer();
    expect(tokenizer.count('123456789')).toBe(3);
  });

  it('is tunable via charsPerToken', () => {
    const dense = createEstimateTokenizer(2); // e.g. CJK-tuned
    expect(dense.count('12345678')).toBe(4);
  });

  it('falls back to the default ratio for non-positive charsPerToken', () => {
    const tokenizer = createEstimateTokenizer(0);
    expect(tokenizer.count('12345678')).toBe(2);
  });
});

describe('defaultMessageOverhead', () => {
  it('adds a flat per-message overhead', () => {
    expect(defaultMessageOverhead({ id: '1', role: 'user', content: 'hi' })).toBe(4);
  });

  it('adds extra overhead when a name is present', () => {
    expect(defaultMessageOverhead({ id: '1', role: 'user', content: 'hi', name: 'alice' })).toBe(5);
  });
});

describe('countMessageTokens', () => {
  const tokenizer = createEstimateTokenizer();
  const counters = {
    tokenizer,
    messageOverhead: defaultMessageOverhead,
    contentCounters: createDefaultContentCounters(tokenizer),
  };

  it('counts plain string content plus overhead', () => {
    const message: BudgetMessage = { id: '1', role: 'user', content: '12345678' };
    expect(countMessageTokens(message, counters)).toBe(2 + 4);
  });

  it('counts structured content blocks via type-keyed counters', () => {
    const message: BudgetMessage = {
      id: '1',
      role: 'assistant',
      content: [
        { type: 'text', text: '12345678' },
        { type: 'image' },
      ],
    };
    expect(countMessageTokens(message, counters)).toBe(2 + 85 + 4);
  });

  it('falls back to JSON-size counting for unknown block types', () => {
    const message: BudgetMessage = {
      id: '1',
      role: 'tool',
      content: [{ type: 'custom-block', payload: 'x'.repeat(8) }],
    };
    const tokens = countMessageTokens(message, counters);
    expect(tokens).toBeGreaterThan(4);
  });

  it('falls back to String() when a block is not JSON-serializable (e.g. circular)', () => {
    const circular: Record<string, unknown> = { type: 'custom-block' };
    circular.self = circular;
    const message: BudgetMessage = { id: '1', role: 'tool', content: [circular as any] };
    expect(() => countMessageTokens(message, counters)).not.toThrow();
  });

  it('allows overriding a content counter', () => {
    const custom = {
      tokenizer,
      messageOverhead: defaultMessageOverhead,
      contentCounters: { ...createDefaultContentCounters(tokenizer), image: () => 1 },
    };
    const message: BudgetMessage = { id: '1', role: 'user', content: [{ type: 'image' }] };
    expect(countMessageTokens(message, custom)).toBe(1 + 4);
  });
});
