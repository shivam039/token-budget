import { describe, expect, it } from 'vitest';
import { runResearchAgent } from '../examples/cookbook-research-agent.js';

describe('cookbook: multi-hour research agent', () => {
  it('carries a bounded research brief and the latest turn across committed passes', async () => {
    const context = await runResearchAgent();
    const summary = context.messages.find((message) => message.metadata?.['synthetic'] === true);
    expect(summary?.content).toContain('Research brief:');
    expect(context.messages.some((message) => message.role === 'system' && message.pinned)).toBe(true);
    expect(context.messages.some((message) => message.content === 'Research pass 17: investigate the reliability of source 17.')).toBe(true);
    expect(context.tokensUsed).toBeLessThanOrEqual(400);
  });
});
