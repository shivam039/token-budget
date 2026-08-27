// In an installed project this import would be `from '@shivam.dixit/token-budget'`.
import { TokenBudget, strategies } from '../src/index.js';

export async function runQuickstart() {
  const budget = new TokenBudget({
    maxTokens: 8000,
    reserve: 1000,
    strategy: strategies.dropOldest(),
  });

  budget.addMessage({ role: 'system', content: 'You are a helpful assistant.', pinned: true });
  budget.addMessage({ role: 'user', content: 'Hello!' });

  return budget.getContext();
}
