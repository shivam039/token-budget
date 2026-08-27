// In an installed project this import would be `from 'token-budget'`.
import { TokenBudget, strategies } from '../src/index.js';

/**
 * Long-form writing assistant: a single drafting session can run for
 * hours across many rounds of "draft, critique, revise." Dropping early
 * drafts loses the throughline of the piece, so `summarizeOldest` with a
 * higher `maxSummaryDepth` lets old summaries fold into progressively
 * higher-level ones across rounds, rather than being evicted once summarized
 * once. `budget.commit()` after each round is what makes each round's
 * strategized result the new starting point for the next (`getContext()`
 * itself never mutates the buffer — see the README's "Recursive
 * summarization" section).
 */
export async function runLongFormWritingAssistant(rounds: number) {
  const budget = new TokenBudget({
    maxTokens: 150,
    strategy: strategies.summarizeOldest({
      summarize: async (messages) => `Condensed draft notes covering ${messages.length} earlier passages.`,
      preThreshold: 0.7,
      maxSummaryDepth: 5,
    }),
  });

  budget.addMessage({ role: 'system', content: 'You are a long-form writing assistant helping draft a novella.', pinned: true });

  let last;
  for (let round = 0; round < rounds; round++) {
    budget.addMessage({ role: 'user', content: `Round ${round}: here is my revised paragraph, please critique it in detail.` });
    budget.addMessage({ role: 'assistant', content: `Round ${round} critique: consider tightening the pacing here and there.` });
    last = await budget.getContext();
    budget.commit(last.messages);
  }

  return last!;
}
