import { describe, expect, it } from 'vitest';
import { runPinnedCurrentQuery } from '../examples/cookbook-pinned-current-query.js';

describe('cookbook: system prompt plus current query', () => {
  it('keeps the system instructions and newest user request while dropping old turns', () => {
    const { context, currentQuery } = runPinnedCurrentQuery();
    expect(context.messages.some((message) => message.role === 'system' && message.pinned)).toBe(true);
    expect(context.messages.some((message) => message.role === 'user' && message.content === currentQuery && message.pinned)).toBe(true);
    expect(context.messages.some((message) => message.content === 'Earlier request 0: inspect module 0 and report its behavior.')).toBe(false);
    expect(context.tokensUsed).toBeLessThanOrEqual(120);
  });
});
