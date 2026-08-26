import type { BudgetMessage, ContentBlock, ContentCounter, Tokenizer } from './types.js';

/**
 * Zero-dependency fallback estimator. Approximates token count from
 * character length (default: 4 chars/token, a reasonable blended average
 * for English text across GPT/Claude-style BPE tokenizers). Tune
 * `charsPerToken` down for token-dense text (e.g. CJK) or up for
 * token-sparse text (e.g. repetitive whitespace/code).
 */
export function createEstimateTokenizer(charsPerToken = 4): Tokenizer {
  const ratio = charsPerToken > 0 ? charsPerToken : 4;
  return {
    count(text: string): number {
      if (!text) return 0;
      return Math.ceil(text.length / ratio);
    },
  };
}

/**
 * Default per-message fixed overhead: role + message-boundary framing
 * tokens, loosely modeled on OpenAI's chat format overhead. Applications
 * targeting a specific provider should override via `messageOverhead`.
 */
export function defaultMessageOverhead(message: BudgetMessage): number {
  let overhead = 4;
  if (message.name) overhead += 1;
  return overhead;
}

function jsonSize(tokenizer: Tokenizer, value: unknown): number {
  try {
    return tokenizer.count(JSON.stringify(value ?? ''));
  } catch {
    return tokenizer.count(String(value ?? ''));
  }
}

/**
 * Default content-block counters, keyed by `ContentBlock.type`. Callers can
 * override or extend via `TokenBudgetConfig.contentCounters`.
 */
export function createDefaultContentCounters(tokenizer: Tokenizer): Record<string, ContentCounter> {
  return {
    text: (block: ContentBlock) => tokenizer.count(block.text ?? ''),
    tool_call: (block: ContentBlock) => jsonSize(tokenizer, block['arguments'] ?? block) + 4,
    tool_result: (block: ContentBlock) => jsonSize(tokenizer, block['result'] ?? block['content'] ?? block) + 4,
    // A flat, provider-agnostic placeholder cost for image blocks; override
    // via `contentCounters.image` for provider-accurate image tokenization.
    image: () => 85,
  };
}

export interface CounterSet {
  tokenizer: Tokenizer;
  messageOverhead: (message: BudgetMessage) => number;
  contentCounters: Record<string, ContentCounter>;
}

/** Counts a single message's tokens: content (text or content blocks) + overhead. */
export function countMessageTokens(message: BudgetMessage, counters: CounterSet): number {
  const { tokenizer, messageOverhead, contentCounters } = counters;
  let contentTokens = 0;
  if (typeof message.content === 'string') {
    contentTokens = tokenizer.count(message.content);
  } else {
    for (const block of message.content) {
      const counter = contentCounters[block.type];
      contentTokens += counter ? counter(block) : jsonSize(tokenizer, block);
    }
  }
  return contentTokens + messageOverhead(message);
}
