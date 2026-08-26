import { describe, expect, it } from 'vitest';
import { runLongFormWritingAssistant } from '../examples/cookbook-long-form-writing.js';

/**
 * Cookbook recipe: long-form writing assistant. Validates that across
 * many rounds, old content is progressively folded into deeper summaries
 * (recursive summarization via `budget.commit()` between rounds) rather
 * than being dropped outright or re-summarized from scratch each time.
 */
describe('cookbook: long-form writing assistant', () => {
  it('recursively folds old rounds into progressively deeper summaries', async () => {
    const result = await runLongFormWritingAssistant(8);
    expect(result.strategyApplied).toBe('summarize-oldest');

    const synthetic = result.messages.find((m) => m.metadata?.['synthetic']);
    expect(synthetic).toBeTruthy();
    const depth = synthetic!.metadata!['summaryDepth'] as number;
    expect(depth).toBeGreaterThan(1); // proves re-summarization happened across rounds, not just once

    expect(result.messages[0]!.pinned).toBe(true);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});
