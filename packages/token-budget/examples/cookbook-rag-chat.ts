// In an installed project this import would be `from 'token-budget'`.
import { TokenBudget, strategies } from '../src/index.js';

/**
 * RAG chat: retrieved document chunks are pinned for the current turn (the
 * app re-injects fresh chunks each time, so old ones can be dropped
 * outright), but the conversational back-and-forth itself should stay
 * legible as the session grows — so old turns are folded into a running
 * summary instead of being silently dropped, via `summarizeOldest`.
 */
export async function runRagChat() {
  const budget = new TokenBudget({
    maxTokens: 150,
    strategy: strategies.summarizeOldest({
      summarize: async (messages) => `Summary of ${messages.length} earlier turns about the account setup process.`,
    }),
  });

  budget.addMessage({ role: 'system', content: 'You are a support assistant answering from the retrieved docs below.', pinned: true });
  for (let i = 0; i < 6; i++) {
    budget.addMessage({ role: 'user', content: `Question ${i}: how do I configure step ${i} of account setup?` });
    budget.addMessage({ role: 'assistant', content: `Answer ${i}: here is the retrieved documentation for step ${i}, in detail.` });
  }

  return budget.getContext();
}
