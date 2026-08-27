import { describe, expect, it } from 'vitest';
import { TokenBudget } from '@shivam.dixit/token-budget';
import { TokenBudgetMemory } from '../src/index.js';

describe('TokenBudgetMemory', () => {
  it('memoryKeys defaults to ["history"], configurable via memoryKey', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    expect(new TokenBudgetMemory({ budget }).memoryKeys).toEqual(['history']);
    expect(new TokenBudgetMemory({ budget, memoryKey: 'chat_history' }).memoryKeys).toEqual(['chat_history']);
  });

  it('loadMemoryVariables returns the current context under memoryKey', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    budget.addMessage({ role: 'system', content: 'sys', pinned: true });
    const memory = new TokenBudgetMemory({ budget });
    const vars = await memory.loadMemoryVariables({});
    expect(vars.history).toHaveLength(1);
  });

  it('saveContext appends a human turn and an AI turn, auto-detecting single input/output keys', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const memory = new TokenBudgetMemory({ budget });
    await memory.saveContext({ input: 'hello' }, { output: 'hi there' });
    expect(budget.getMessages().map((m) => m.content)).toEqual(['hello', 'hi there']);
    expect(budget.getMessages().map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('saveContext uses explicit inputKey/outputKey when multiple keys are present', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const memory = new TokenBudgetMemory({ budget, inputKey: 'question', outputKey: 'answer' });
    await memory.saveContext({ question: 'what is 2+2?', context: 'irrelevant' }, { answer: '4', sources: [] });
    expect(budget.getMessages().map((m) => m.content)).toEqual(['what is 2+2?', '4']);
  });

  it('saveContext is a no-op for ambiguous multi-key values without an explicit key', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const memory = new TokenBudgetMemory({ budget });
    await memory.saveContext({ a: 'x', b: 'y' }, { c: 'z', d: 'w' });
    expect(budget.getMessages()).toHaveLength(0);
  });

  it('saveContext commits the strategized result, making eviction/summarization stick', async () => {
    const budget = new TokenBudget({ maxTokens: 20, charsPerToken: 1 });
    const memory = new TokenBudgetMemory({ budget });
    await memory.saveContext({ input: 'a'.repeat(10) }, { output: 'b'.repeat(10) });
    await memory.saveContext({ input: 'c'.repeat(10) }, { output: 'd'.repeat(10) });
    const stats = budget.stats();
    expect(stats.tokensUsed).toBeLessThanOrEqual(budget.effectiveBudget);
  });

  it('clear() empties the underlying budget', async () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const memory = new TokenBudgetMemory({ budget });
    await memory.saveContext({ input: 'hi' }, { output: 'hello' });
    await memory.clear();
    expect(budget.getMessages()).toHaveLength(0);
  });

  it('exposes the underlying TokenBudget for direct access (e.g. stats(), events)', () => {
    const budget = new TokenBudget({ maxTokens: 100000 });
    const memory = new TokenBudgetMemory({ budget });
    expect(memory.budget).toBe(budget);
  });
});
