/**
 * Shared fixtures so every benchmark script generates the same shape of
 * data — a fair comparison requires the systems under test to see
 * identical input, not each benchmark inventing its own.
 */

const SAMPLE_SENTENCE =
  'The quick brown fox jumps over the lazy dog while contemplating the nature of large language models and their context windows. ';

/** A large, single block of text for bulk-tokenization throughput tests. */
export function bulkCorpus(repeats = 4000) {
  return SAMPLE_SENTENCE.repeat(repeats);
}

/** One short, realistic chat message — the unit used for "counting one message at a time" tests. */
export function shortMessage() {
  return 'What is the weather like in Paris today, and should I bring an umbrella?';
}

/** A moderate-length message body, used for the message-buffer benchmarks (context management, incremental accounting). */
export function messageText(i) {
  return `Message number ${i}: this is a representative chat message of moderate length used for benchmarking purposes.`;
}

/** A length-based token counter (~4 chars/token) shared by every buffer benchmark so results isolate buffer/eviction machinery, not tokenizer choice. */
export function approxCount(text) {
  return Math.ceil(text.length / 4);
}
