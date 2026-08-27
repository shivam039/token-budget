import type { Tokenizer } from './types.js';

/**
 * Options for {@link truncateToolOutput}.
 */
export interface TruncateToolOutputOptions {
  /**
   * Which part of the text to keep when it doesn't fit `maxTokens`.
   * `'end'` (default) keeps the tail — the right call for most terminal
   * output, test runners, and stack traces, where the actionable line
   * (the failure, the final result) is usually last. `'start'` keeps the
   * head. `'both'` keeps a head and a tail, splitting the surviving
   * budget between them — useful for a long file read where both the
   * imports/header and the relevant tail matter.
   */
  keep?: 'start' | 'end' | 'both';
  /**
   * Builds the marker text inserted where content was cut, given the
   * number of characters omitted. Default: a short `…[N chars cut]…`
   * marker — kept compact on purpose, since this utility is most useful
   * exactly when the token budget is small enough that a verbose marker
   * would itself eat a meaningful share of it.
   */
  marker?: (omittedChars: number) => string;
}

const defaultMarker = (omittedChars: number): string => `…[${omittedChars} chars cut]…`;

/**
 * Shrinks `text` to fit `maxTokens`, counted by `tokenizer` — for the one
 * case eviction strategies can't fix on their own: a *single* tool result
 * (a file dump, a verbose terminal log) that alone is larger than the
 * whole budget, or large enough that keeping it whole would evict
 * everything else. Apply this to raw tool-output text **before** it goes
 * into a `ContentBlock`/`addMessage()` call — it has nothing to do with
 * the message buffer, eviction, or `toolCallId` pairing, and doesn't
 * touch either; it's a content-prep step that composes with every
 * built-in strategy rather than replacing any of them. Returns `text`
 * unchanged if it already fits.
 *
 * Assumes `tokenizer.count` is monotonic non-decreasing in text length
 * (shortening text never increases its token count) — true for the
 * built-in estimator and every tokenizer this project ships.
 */
export function truncateToolOutput(
  text: string,
  maxTokens: number,
  tokenizer: Tokenizer,
  options: TruncateToolOutputOptions = {},
): string {
  if (maxTokens <= 0) return '';
  if (tokenizer.count(text) <= maxTokens) return text;

  const keep = options.keep ?? 'end';
  const marker = options.marker ?? defaultMarker;

  const buildWithKeepLength = (keepLength: number): string => {
    const omitted = text.length - keepLength;
    if (omitted <= 0) return text;
    const markerText = marker(omitted);
    if (keep === 'start') return text.slice(0, keepLength) + markerText;
    if (keep === 'end') return markerText + text.slice(text.length - keepLength);
    const head = Math.ceil(keepLength / 2);
    const tail = keepLength - head;
    return text.slice(0, head) + markerText + text.slice(text.length - tail);
  };

  // Binary search for the largest keepLength (0..text.length-1) whose
  // rendered form (content + marker) still fits maxTokens.
  let lo = 0;
  let hi = text.length - 1;
  let best = '';
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = buildWithKeepLength(mid);
    if (tokenizer.count(candidate) <= maxTokens) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // best === '' means even a bare marker doesn't fit maxTokens — the
  // caller's maxTokens is smaller than the marker itself costs.
  return best;
}
