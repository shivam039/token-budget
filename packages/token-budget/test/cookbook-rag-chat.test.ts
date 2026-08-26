import { describe, expect, it } from 'vitest';
import { runRagChat } from '../examples/cookbook-rag-chat.js';

/**
 * Cookbook recipe: RAG chat. Validates that old turns are folded into a
 * synthetic summary rather than silently dropped — preserving continuity
 * of the conversation — while the pinned system prompt survives and the
 * result stays within budget.
 */
describe('cookbook: RAG chat', () => {
  it('folds old turns into a synthetic summary instead of dropping them', async () => {
    const { messages, evicted, strategyApplied, tokensUsed, tokensRemaining } = await runRagChat();
    expect(strategyApplied).toBe('summarize-oldest');

    expect(messages[0]!.pinned).toBe(true);
    const synthetic = messages.find((m) => m.metadata?.['synthetic']);
    expect(synthetic).toBeTruthy();
    expect(typeof synthetic!.content).toBe('string');
    expect(synthetic!.content as string).toContain('Summary of');

    expect(evicted.length).toBeGreaterThan(0);
    expect(tokensUsed).toBeGreaterThan(0);
    expect(tokensRemaining).toBeGreaterThanOrEqual(0);
  });
});
