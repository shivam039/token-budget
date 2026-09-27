import { describe, expect, it } from 'vitest';
import { runSummarizePriorityBackstop } from '../examples/cookbook-summarize-priority-backstop.js';

describe('cookbook: summarize then priority backstop', () => {
  it('summarizes an old item, then uses priority to enforce the remaining budget', async () => {
    const { context, trace } = await runSummarizePriorityBackstop();
    expect(trace?.steps.some((step) => step.strategyName === 'summarize-oldest')).toBe(true);
    expect(trace?.steps.some((step) => step.strategyName === 'priority' && step.evicted.length > 0)).toBe(true);
    expect(context.messages.some((message) => message.metadata?.['synthetic'] === true)).toBe(true);
    expect(context.messages.some((message) => message.content === 'Current task: identify why parseConfig rejects a valid option.')).toBe(true);
    expect(context.tokensUsed).toBeLessThanOrEqual(300);
  });
});
