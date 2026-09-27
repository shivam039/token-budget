import { TokenBudget, strategies } from '../src/index.js';

export function runPinnedCurrentQuery() {
  const budget = new TokenBudget({
    maxTokens: 100,
    charsPerToken: 1,
    strategy: strategies.smartPriority(),
  });
  budget.addMessage({ role: 'system', content: 'Keep these system instructions.' });
  for (let turn = 0; turn < 5; turn++) {
    budget.addMessage({ role: 'user', content: `Earlier request ${turn}: inspect module ${turn} and report its behavior.` });
    budget.addMessage({ role: 'assistant', content: `Earlier response ${turn}: module ${turn} handles a previous implementation detail.` });
  }
  const currentQuery = 'Fix the parser bug in src/parser.ts.';
  budget.addMessage({ role: 'user', content: currentQuery });
  return { context: budget.getContextSync(), currentQuery };
}
