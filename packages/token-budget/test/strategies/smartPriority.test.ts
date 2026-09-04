import { describe, expect, it } from 'vitest';
import { TokenBudget } from '../../src/budget.js';
import { smartPriority } from '../../src/strategies/smartPriority.js';

describe('smartPriority strategy', () => {
  it('is a no-op when under budget', () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: smartPriority() });
    budget.addMessage({ role: 'user', content: 'hi' });
    const ctx = budget.getContextSync();
    expect(ctx.evicted).toHaveLength(0);
  });

  it('is synchronous (usable with getContextSync) with no condense option', () => {
    const budget = new TokenBudget({ maxTokens: 1000, strategy: smartPriority() });
    budget.addMessage({ role: 'user', content: 'hi' });
    expect(() => budget.getContextSync()).not.toThrow();
  });

  it('auto-pins system messages without requiring pinned: true', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: smartPriority() });
    const sys = budget.addMessage({ role: 'system', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    budget.addMessage({ role: 'user', content: 'cccccccccc' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.some((m) => m.id === sys.id)).toBe(true);
  });

  it('auto-pins the most recent user message (the current query)', () => {
    const budget = new TokenBudget({ maxTokens: 15, charsPerToken: 1, strategy: smartPriority() });
    budget.addMessage({ role: 'user', content: 'aaaaaaaaaa' }); // old query, should be evicted
    const currentQuery = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([currentQuery.id]);
  });

  it('respects an explicit pinned: false on a system message (never force-overrides)', () => {
    const budget = new TokenBudget({ maxTokens: 12, charsPerToken: 1, strategy: smartPriority() });
    const sys = budget.addMessage({ role: 'system', content: 'aaaaaaaaaa', pinned: false, priority: -100 });
    const user = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb', priority: 100 });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([user.id]);
    expect(ctx.evicted.map((m) => m.id)).toEqual([sys.id]);
  });

  it('can be turned off via autoPinSystem: false / autoPinLatestUser: false', () => {
    const budget = new TokenBudget({
      maxTokens: 20,
      charsPerToken: 1,
      strategy: smartPriority({ autoPinSystem: false, autoPinLatestUser: false }),
    });
    budget.addMessage({ role: 'system', content: 'aaaaaaaaaa' });
    const user = budget.addMessage({ role: 'user', content: 'bbbbbbbbbb', priority: 1 });
    const ctx = budget.getContextSync();
    // With auto-pinning off, this reduces to plain priority(): both start
    // at the same implicit priority (0), so age breaks the tie -- the
    // newer message (the explicitly-prioritized user turn) survives.
    expect(ctx.messages.map((m) => m.id)).toEqual([user.id]);
  });

  it('evicts untagged tool-call/tool-result units before untagged conversation turns', () => {
    const budget = new TokenBudget({ maxTokens: 25, charsPerToken: 1, strategy: smartPriority() });
    const call = budget.addMessage({ role: 'assistant', content: 'callcallcall' });
    const result = budget.addMessage({ role: 'tool', content: 'resultresult', toolCallId: call.id });
    const turn = budget.addMessage({ role: 'user', content: 'ordinary turn' });
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id)).toEqual([turn.id]);
    expect(ctx.evicted.map((m) => m.id).sort()).toEqual([call.id, result.id].sort());
  });

  it('keeps a tool-call/tool-result pair atomic -- both evicted together, never split', () => {
    const budget = new TokenBudget({ maxTokens: 40, charsPerToken: 1, strategy: smartPriority() });
    const call = budget.addMessage({ role: 'assistant', content: 'callcallcallcallcall' });
    const result = budget.addMessage({ role: 'tool', content: 'resultresultresultresult', toolCallId: call.id });
    budget.addMessage({ role: 'user', content: 'a new turn that pushes it over budget' });
    const ctx = budget.getContextSync();
    const survivedCall = ctx.messages.some((m) => m.id === call.id);
    const survivedResult = ctx.messages.some((m) => m.id === result.id);
    expect(survivedCall).toBe(survivedResult);
  });

  it('respects an explicit priority on a tool message instead of the toolPriority default', () => {
    // autoPinLatestUser is off so this isolates the tagging/priority
    // interaction being tested, rather than the (separately-tested)
    // auto-pin-current-query behavior -- otherwise "turn", being the
    // only/latest user message, would survive regardless of priority.
    const budget = new TokenBudget({
      maxTokens: 40,
      charsPerToken: 1,
      strategy: smartPriority({ autoPinLatestUser: false }),
    });
    const call = budget.addMessage({ role: 'assistant', content: 'callcallcall' });
    const importantResult = budget.addMessage({ role: 'tool', content: 'importantresult', toolCallId: call.id, priority: 50 });
    const turn = budget.addMessage({ role: 'user', content: 'ordinary turn', priority: 1 });
    const ctx = budget.getContextSync();
    // The explicitly high-priority tool result should outrank the
    // untagged-but-still-priority-1 ordinary turn.
    expect(ctx.messages.some((m) => m.id === importantResult.id)).toBe(true);
    expect(ctx.messages.some((m) => m.id === turn.id)).toBe(false);
  });

  it('a custom toolPriority is honored', () => {
    // autoPinLatestUser is off for the same reason as above -- isolating
    // the toolPriority knob from the separately-tested auto-pin behavior.
    // With toolPriority: 5 (above the turn's implicit 0), the tool unit
    // now outranks the turn -- the opposite of the default -1 behavior.
    const budget = new TokenBudget({
      maxTokens: 38,
      charsPerToken: 1,
      strategy: smartPriority({ toolPriority: 5, autoPinLatestUser: false }),
    });
    const call = budget.addMessage({ role: 'assistant', content: 'callcallcall' });
    const result = budget.addMessage({ role: 'tool', content: 'resultresult', toolCallId: call.id });
    const turn = budget.addMessage({ role: 'user', content: 'ordinary turn' }); // implicit priority 0 < 5
    const ctx = budget.getContextSync();
    expect(ctx.messages.map((m) => m.id).sort()).toEqual([call.id, result.id].sort());
    expect(ctx.evicted.map((m) => m.id)).toEqual([turn.id]);
  });

  it('with condense set, folds older turns into a synthetic summary instead of dropping them', async () => {
    // Two 50-token turns (100 total) condense into one ~29-token synthetic
    // placeholder -- a real reduction, not just a same-size swap.
    const budget = new TokenBudget({
      maxTokens: 100,
      charsPerToken: 1,
      strategy: smartPriority({
        condense: { summarize: async () => '[Prior conversation omitted]', blockSize: 2 },
      }),
    });
    budget.addMessage({ role: 'system', content: 'sys' }); // 3, auto-pinned
    budget.addMessage({ role: 'user', content: 'a'.repeat(50) });
    budget.addMessage({ role: 'assistant', content: 'b'.repeat(50) });
    budget.addMessage({ role: 'user', content: 'a very recent current query' }); // 27, auto-pinned (current query)
    const ctx = await budget.getContext();
    const synthetic = ctx.messages.find((m) => m.metadata?.['synthetic'] === true);
    expect(synthetic?.content).toBe('[Prior conversation omitted]');
  });

  it('is not sync (requires getContext, not getContextSync) once condense is set', () => {
    const budget = new TokenBudget({
      maxTokens: 30,
      charsPerToken: 1,
      strategy: smartPriority({ condense: { summarize: async () => 'summary' } }),
    });
    budget.addMessage({ role: 'user', content: 'hi' });
    expect(() => budget.getContextSync()).toThrow();
  });

  it('explain() reports the underlying priority (and condense, if configured) strategy steps', () => {
    const budget = new TokenBudget({ maxTokens: 12, charsPerToken: 1, strategy: smartPriority() });
    budget.addMessage({ role: 'system', content: 'aaaaaaaaaa' });
    budget.addMessage({ role: 'user', content: 'bbbbbbbbbb' });
    budget.addMessage({ role: 'user', content: 'cccccccccc' });
    budget.getContextSync();
    const report = budget.explain();
    expect(report?.steps.some((s) => s.strategyName === 'priority')).toBe(true);
  });
});
