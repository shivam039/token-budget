import { createTiktokenTokenizer } from 'token-budget-tiktoken';
import type { Tokenizer } from 'token-budget';

/**
 * FR2-2.2.1: Anthropic has never published Claude's real tokenizer, so
 * this is a best-effort approximation, not ground truth — it counts with
 * OpenAI's `cl100k_base` BPE tokenizer (via `token-budget-tiktoken`,
 * pure-JS, cached per encoding) as a stand-in, scaled by `ratio`.
 *
 * No accuracy claim is baked in: `ratio` defaults to `1` (raw cl100k_base
 * counts, unscaled) because this package has no access to real Claude
 * token counts to calibrate against. Use `calibrate()` with your own
 * actual usage/billing data before relying on this for anything
 * precision-sensitive — see the README for the full disclaimer, and
 * FR2-2.2.2 / CHANGELOG.md for how this gets revisited if Anthropic ever
 * publishes tokenizer details.
 */
export interface CreateClaudeTokenizerOptions {
  /** Scaling factor applied to the cl100k_base-approximated count. Default 1 (uncalibrated). */
  ratio?: number;
}

const baseTokenizer = () => createTiktokenTokenizer({ encoding: 'cl100k_base' });

/** FR2-2.2.4: drop-in `Tokenizer` — async factory (loads cl100k_base once), sync `count()` after that. */
export async function createClaudeTokenizer(options: CreateClaudeTokenizerOptions = {}): Promise<Tokenizer> {
  const ratio = options.ratio ?? 1;
  const base = await baseTokenizer();
  return {
    // `encode()` is intentionally omitted: cl100k_base token ids are not
    // real Claude token ids, so exposing them would be misleading —
    // count() is the only meaningful operation this approximation supports.
    count: (text: string) => Math.round(base.count(text) * ratio),
  };
}

export interface CalibrationSample {
  text: string;
  /** The real token count for `text`, from Claude API usage/billing data. */
  actualTokens: number;
}

/**
 * FR2-2.2.3: fits a scaling `ratio` from real `(text, actualTokens)` pairs
 * — pass real Claude usage/billing data for your own content distribution,
 * then use the result as `createClaudeTokenizer({ ratio })`'s `ratio`.
 * Uses a simple ratio-of-sums fit (total actual ÷ total cl100k_base base
 * count); throws if `samples` is empty.
 */
export async function calibrate(samples: CalibrationSample[]): Promise<number> {
  if (samples.length === 0) throw new Error('token-budget-claude: calibrate() requires at least one sample.');
  const base = await baseTokenizer();
  let totalActual = 0;
  let totalBase = 0;
  for (const sample of samples) {
    totalActual += sample.actualTokens;
    totalBase += base.count(sample.text);
  }
  return totalBase === 0 ? 1 : totalActual / totalBase;
}
