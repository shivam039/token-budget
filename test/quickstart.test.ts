import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runQuickstart } from '../examples/quickstart.js';

/**
 * Acceptance criteria: "A new user can go from npm install to a working
 * budget-managed chat loop in under 15 lines of code" — enforced here so
 * the quickstart example can't silently rot past that budget.
 */
describe('quickstart example', () => {
  it('produces a working budget-managed context', async () => {
    const { messages, tokensUsed, tokensRemaining, strategyApplied } = await runQuickstart();
    expect(messages).toHaveLength(2);
    expect(messages[0]!.pinned).toBe(true);
    expect(tokensUsed).toBeGreaterThan(0);
    expect(tokensRemaining).toBeGreaterThan(0);
    expect(strategyApplied).toBe('drop-oldest');
  });

  it('stays under 15 lines of code', () => {
    const path = fileURLToPath(new URL('../examples/quickstart.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const bodyMatch = source.match(/runQuickstart\(\)\s*{([\s\S]*)\n}/);
    expect(bodyMatch).toBeTruthy();
    const bodyLines = bodyMatch![1]!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(bodyLines.length).toBeLessThan(15);
  });
});
