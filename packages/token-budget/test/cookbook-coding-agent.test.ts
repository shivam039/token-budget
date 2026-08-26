import { describe, expect, it } from 'vitest';
import { runCodingAgent } from '../examples/cookbook-coding-agent.js';

/**
 * Cookbook recipe: coding agent. Validates that stale, low-priority tool
 * output (the old file being investigated) is evicted first, while the
 * pinned system prompt and the current-turn (high-priority) content about
 * the file actually being edited survive — the point of using `priority`
 * over purely age-based eviction here.
 */
describe('cookbook: coding agent', () => {
  it('evicts stale low-priority tool output before high-priority current-file content', () => {
    const { messages, evicted, strategyApplied, tokensUsed } = runCodingAgent();
    expect(strategyApplied).toBe('priority');

    expect(messages.some((m) => m.pinned)).toBe(true);
    expect(messages.some((m) => typeof m.content === 'string' && m.content.includes('current-file.ts'))).toBe(true);
    expect(messages.some((m) => typeof m.content === 'string' && m.content.includes('validate(input'))).toBe(true);

    expect(evicted.length).toBeGreaterThan(0);
    expect(evicted.every((m) => typeof m.content === 'string' && (m.content.includes('old-module') || m.content.includes('legacy(')))).toBe(
      true,
    );
    expect(tokensUsed).toBeGreaterThan(0);
  });
});
