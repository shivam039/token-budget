import { TokenBudget, strategies } from '../src/index.js';

export async function runSummarizePriorityBackstop() {
  const budget = new TokenBudget({
    maxTokens: 300,
    charsPerToken: 1,
    strategy: strategies.chain([
      strategies.summarizeOldest({
        blockSize: 1,
        summarize: async (messages) => `Checkpoint: ${String(messages[0]?.content).slice(0, 28)}`,
      }),
      strategies.priority(),
    ]),
  });
  budget.addMessage({ role: 'system', content: 'Preserve the active investigation and its instructions.', pinned: true });
  for (let turn = 0; turn < 5; turn++) {
    budget.addMessage({
      role: 'assistant',
      content: `Low-value trace ${turn}: ${'stale intermediate output '.repeat(2)}`,
      priority: -1,
    });
  }
  budget.addMessage({ role: 'user', content: 'Current task: identify why parseConfig rejects a valid option.', priority: 10 });
  budget.addMessage({ role: 'assistant', content: 'I will inspect the validation path and reproduce the accepted shape.', priority: 10 });
  const context = await budget.getContext();
  return { context, trace: budget.explain() };
}
