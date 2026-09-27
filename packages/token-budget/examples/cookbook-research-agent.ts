import { TokenBudget, strategies } from '../src/index.js';

export async function runResearchAgent(turns = 18) {
  const budget = new TokenBudget({
    maxTokens: 400,
    charsPerToken: 1,
    strategy: strategies.summarizeOldest({
      preThreshold: 0.8,
      maxSummaryDepth: 64,
      summarize: async (messages) => `Research brief: ${messages.length} earlier evidence items retained; verify source claims before citing.`,
    }),
  });

  budget.addMessage({ role: 'system', content: 'Research carefully. Track findings, evidence, uncertainty, and open questions.', pinned: true });
  let context;
  for (let turn = 0; turn < turns; turn++) {
    budget.addMessage({ role: 'user', content: `Research pass ${turn}: investigate the reliability of source ${turn}.` });
    budget.addMessage({ role: 'assistant', content: `Finding ${turn}: source ${turn} supports one claim; confidence is moderate pending a second source.` });
    context = await budget.getContext();
    budget.commit(context.messages);
  }
  return context!;
}
