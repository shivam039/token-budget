import type { BudgetMessage, ContentBlock, ContentCounter, EstimatorProfile, Tokenizer } from './types.js';

/**
 * chars-per-token ratios per script profile (FR2-7.2), calibrated against
 * a small representative corpus using OpenAI's cl100k_base tokenizer —
 * see the README's "Locale-aware estimation" section for the exact
 * corpus, methodology, and measured numbers these round from. A
 * reasonably conservative, widely-used baseline, not a claim about any
 * specific model's real tokenizer (none of these scripts have one public
 * and free to run offline).
 */
const PROFILE_RATIOS: Record<'latin' | 'cjk' | 'cyrillic', number> = {
  latin: 4, // Phase 1's original, unchanged default
  cjk: 1,
  cyrillic: 2,
};

function isCJK(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x3040 && code <= 0x30ff) || // Hiragana + Katakana
    (code >= 0xac00 && code <= 0xd7a3) // Hangul Syllables
  );
}

function isCyrillic(code: number): boolean {
  return code >= 0x0400 && code <= 0x04ff;
}

/**
 * FR2-7.3: lightweight, zero-dependency script detection over a prefix of
 * the text (Unicode code-point range sampling — no language-detection
 * dependency). Mixed-script text gets a single best-effort classification
 * by majority, not a true per-character blend (FR2-7.4) — for precision,
 * use a real tokenizer adapter (`token-budget-tiktoken`, `token-budget-claude`).
 */
function detectScript(text: string): 'latin' | 'cjk' | 'cyrillic' {
  const sample = text.slice(0, 200);
  let cjk = 0;
  let cyrillic = 0;
  let other = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    if (isCJK(code)) cjk++;
    else if (isCyrillic(code)) cyrillic++;
    else if (!/\s/.test(ch)) other++;
  }
  if (cjk > cyrillic && cjk > other) return 'cjk';
  if (cyrillic > cjk && cyrillic > other) return 'cyrillic';
  return 'latin';
}

/**
 * Zero-dependency fallback estimator. Approximates token count from
 * character length, two ways:
 *  - `charsPerToken`: a fixed ratio override — takes precedence whenever
 *    it's a positive number (Phase 1's original knob, unchanged).
 *  - `profile` (FR2-7.1, default `'latin'`, ratio 4 — Phase 1's exact
 *    original behavior): `'cjk'` (ratio 1), `'cyrillic'` (ratio 2), or
 *    `'auto-detect'` to pick a ratio per call via `detectScript`.
 */
export function createEstimateTokenizer(charsPerToken?: number, profile: EstimatorProfile = 'latin'): Tokenizer {
  if (charsPerToken !== undefined && charsPerToken > 0) {
    const ratio = charsPerToken;
    return {
      count(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / ratio);
      },
    };
  }
  return {
    count(text: string): number {
      if (!text) return 0;
      const resolved = profile === 'auto-detect' ? detectScript(text) : profile;
      return Math.ceil(text.length / PROFILE_RATIOS[resolved]);
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
