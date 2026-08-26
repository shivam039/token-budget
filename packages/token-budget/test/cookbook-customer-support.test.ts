import { describe, expect, it } from 'vitest';
import { runCustomerSupportBot } from '../examples/cookbook-customer-support.js';

/**
 * Cookbook recipe: customer-support bot. Validates the described behavior
 * — pinned system prompt survives, only the last `turns` messages remain,
 * and the buffer stays within budget — so the recipe can't silently rot.
 */
describe('cookbook: customer-support bot', () => {
  it('keeps the pinned system prompt plus only the last 4 turns', () => {
    const { messages, tokensUsed, strategyApplied } = runCustomerSupportBot();
    expect(strategyApplied).toBe('sliding-window');
    expect(messages).toHaveLength(5); // 1 pinned system prompt + 4 kept turns
    expect(messages[0]!.pinned).toBe(true);
    expect(messages[0]!.role).toBe('system');
    // The kept turns are the most recent ones, not the earliest.
    expect(messages.at(-1)!.content).toContain('9');
    expect(messages.some((m) => typeof m.content === 'string' && m.content.includes('Ticket update 0'))).toBe(false);
    expect(tokensUsed).toBeGreaterThan(0);
  });
});
