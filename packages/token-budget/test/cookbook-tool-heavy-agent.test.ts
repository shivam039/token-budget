import { describe, expect, it } from 'vitest';
import { runToolHeavyAgent } from '../examples/cookbook-tool-heavy-agent.js';

describe('cookbook: tool-output-heavy agent', () => {
  it('caps each tool result before buffering and evicts call/result pairs atomically', () => {
    const { context, toolPairs, tokenizer } = runToolHeavyAgent();
    const ids = new Set(context.messages.map((message) => message.id));
    for (const pair of toolPairs) {
      expect(tokenizer.count(pair.cappedOutput)).toBeLessThanOrEqual(45);
      expect(pair.cappedOutput).toContain('FINAL: tests passed');
      expect(ids.has(pair.callId)).toBe(ids.has(pair.resultId));
    }
    expect(context.messages.some((message) => message.role === 'system')).toBe(true);
    expect(context.messages.some((message) => message.content === 'Fix the failing validation test in src/validate.ts.')).toBe(true);
    expect(context.tokensUsed).toBeLessThanOrEqual(110);
  });
});
