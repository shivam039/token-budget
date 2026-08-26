// In an installed project this import would be `from 'token-budget'`.
import { TokenBudget, strategies } from '../src/index.js';

/**
 * Customer-support bot: conversations are short-lived and only the last
 * few turns matter for resolving the current ticket, so `slidingWindow`
 * (a hard cap on turn count, not a summary) is the right fit — cheaper
 * and more predictable than summarization for this shape of chat.
 */
export function runCustomerSupportBot() {
  const budget = new TokenBudget({
    maxTokens: 2000,
    strategy: strategies.slidingWindow({ turns: 4, enforceBudget: true }),
  });

  budget.addMessage({ role: 'system', content: 'You are a customer support agent for Acme Cloud.', pinned: true });
  for (let i = 0; i < 10; i++) {
    budget.addMessage({ role: 'user', content: `Ticket update ${i}: still seeing the login error.` });
    budget.addMessage({ role: 'assistant', content: `Response ${i}: have you tried clearing cookies?` });
  }

  return budget.getContextSync();
}
