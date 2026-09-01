/**
 * A deterministic, purely local stand-in for a real summarizer, so the
 * `summarizeOldest` strategy can be demonstrated in this playground without
 * an API key or a network call — summarizeOldest() takes a `summarize`
 * callback that's meant to call a real LLM in production; this one instead
 * concatenates the first N characters of each message with an ellipsis.
 * The UI labels this explicitly as a demo summarizer, never presented as
 * real model output.
 */
import type { BudgetMessage } from '@shivam.dixit/token-budget';

export const DEMO_SUMMARIZER_LABEL =
  'Demo summarizer (deterministic, local — not a real LLM call). In production, pass your own async summarize() callback to strategies.summarizeOldest().';

export async function demoSummarize(messages: BudgetMessage[]): Promise<string> {
  const parts = messages.map((m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const clipped = text.length > 40 ? text.slice(0, 40) + '…' : text;
    return `${m.role}: ${clipped}`;
  });
  return `[demo summary of ${messages.length} messages] ` + parts.join(' | ');
}
