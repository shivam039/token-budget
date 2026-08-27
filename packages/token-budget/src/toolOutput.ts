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
 * Nudges a slice boundary back by one UTF-16 code unit if it would
 * otherwise fall between a high surrogate and its paired low surrogate —
 * `String.prototype.slice` operates on code units, not code points, so an
 * unguarded boundary can split an emoji (or any astral-plane character)
 * into two lone, malformed surrogates. Real tool output (file contents,
 * terminal logs) routinely contains these, so this isn't a theoretical
 * edge case.
 */
function safeBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index;
  const before = text.charCodeAt(index - 1);
  const at = text.charCodeAt(index);
  const isHighSurrogate = before >= 0xd800 && before <= 0xdbff;
  const isLowSurrogate = at >= 0xdc00 && at <= 0xdfff;
  return isHighSurrogate && isLowSurrogate ? index - 1 : index;
}

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
 * unchanged if it already fits. Never splits a UTF-16 surrogate pair (an
 * emoji or other astral-plane character right at the cut point) — the
 * output is always well-formed, even if that means keeping one character
 * fewer than the absolute token ceiling allows.
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
    if (keep === 'start') return text.slice(0, safeBoundary(text, keepLength)) + markerText;
    if (keep === 'end') return markerText + text.slice(safeBoundary(text, text.length - keepLength));
    const head = Math.ceil(keepLength / 2);
    const tail = keepLength - head;
    return text.slice(0, safeBoundary(text, head)) + markerText + text.slice(safeBoundary(text, text.length - tail));
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
