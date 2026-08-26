import { describe, expect, it } from 'vitest';
import { TokenBudget } from './budget.js';
import type { AddMessageInput, BudgetMessage, ContentBlock, Tokenizer } from './types.js';

/**
 * Contract a framework adapter package implements to be exercised by
 * `runAdapterConformanceSuite` (FR2-1.5.3). Keep `toExternal`/`fromExternal`
 * as thin, pure functions — exactly what the adapter's public
 * `toXMessages`/`fromXResponse`-style helpers already do.
 */
export interface AdapterUnderTest<ExternalFormat = unknown> {
  name: string;
  /** Converts token-budget's raw buffer into the adapter's wire format. */
  toExternal: (messages: BudgetMessage[]) => ExternalFormat;
  /** Converts the wire format back into `addMessage`-ready input, in order. */
  fromExternal: (external: ExternalFormat) => AddMessageInput[];
  /**
   * A representative fixture: a pinned system message, a plain user
   * message, an assistant tool-call linked to a tool-result via
   * `toolCallId`, and a final assistant reply. Adapters should give the
   * tool-call message an explicit `id` so the fixture can reference it.
   */
  buildFixtureMessages: () => AddMessageInput[];
}

function textOf(content: BudgetMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is ContentBlock & { text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function hasToolCallBlock(content: BudgetMessage['content']): boolean {
  return Array.isArray(content) && content.some((block) => block.type === 'tool_call');
}

/**
 * Shared conformance suite for framework adapters (FR2-1.5.3). Call this
 * inside an adapter package's own test file — it registers `describe`/`it`
 * blocks via vitest, verifying round-trip fidelity, tool-call/tool-result
 * atomicity, pinned-message handling, and post-conversion token accounting.
 */
export function runAdapterConformanceSuite<ExternalFormat>(adapter: AdapterUnderTest<ExternalFormat>): void {
  describe(`adapter conformance: ${adapter.name}`, () => {
    function buildOriginal(): BudgetMessage[] {
      const budget = new TokenBudget({ maxTokens: 1_000_000 });
      for (const input of adapter.buildFixtureMessages()) budget.addMessage(input);
      return budget.getMessages();
    }

    it('round-trips the same number of messages, in the same role order', () => {
      const original = buildOriginal();
      const roundTripped = adapter.fromExternal(adapter.toExternal(original));
      expect(roundTripped.map((m) => m.role)).toEqual(original.map((m) => m.role));
    });

    it('round-trips plain-text content without data loss', () => {
      const original = buildOriginal();
      const roundTripped = adapter.fromExternal(adapter.toExternal(original));
      original.forEach((message, i) => {
        if (typeof message.content === 'string') {
          expect(textOf(roundTripped[i]!.content)).toBe(textOf(message.content));
        }
      });
    });

    it('preserves the pinned system message', () => {
      const original = buildOriginal();
      const pinnedOriginal = original.filter((m) => m.pinned);
      expect(pinnedOriginal.length).toBeGreaterThan(0);

      const roundTripped = adapter.fromExternal(adapter.toExternal(original));
      const pinnedRoundTripped = roundTripped.filter((m) => m.pinned);
      expect(pinnedRoundTripped).toHaveLength(pinnedOriginal.length);
      expect(pinnedRoundTripped.every((m) => m.role === 'system')).toBe(true);
    });

    it('preserves tool-call/tool-result atomicity through conversion', () => {
      const original = buildOriginal();
      const roundTripped = adapter.fromExternal(adapter.toExternal(original));

      const rebuilt = new TokenBudget({ maxTokens: 1_000_000 });
      const added = roundTripped.map((input) => rebuilt.addMessage(input));

      const toolResults = added.filter((m) => Boolean(m.toolCallId));
      expect(toolResults.length).toBeGreaterThan(0);
      for (const result of toolResults) {
        const call = added.find((m) => m.id === result.toolCallId);
        expect(call).toBeTruthy();
        expect(hasToolCallBlock(call!.content)).toBe(true);
      }
    });

    it('produces correct, positive token accounting after conversion', () => {
      const original = buildOriginal();
      const roundTripped = adapter.fromExternal(adapter.toExternal(original));

      const rebuilt = new TokenBudget({ maxTokens: 1_000_000 });
      for (const input of roundTripped) rebuilt.addMessage(input);

      expect(rebuilt.getMessages()).toHaveLength(original.length);
      expect(rebuilt.stats().tokensUsed).toBeGreaterThan(0);
    });
  });
}

/**
 * Shared conformance suite for tokenizer adapters (FR2-9.3, mirroring
 * FR2-1.5.3's adapter suite). Call this inside a tokenizer package's own
 * test file, passing an already-resolved `Tokenizer` (await any async
 * factory first) — it registers `describe`/`it` blocks via vitest,
 * verifying the `Tokenizer` contract: non-negative integer counts,
 * determinism, `encode()`/`count()` self-consistency where `encode` is
 * provided, rough monotonicity with text length, and drop-in
 * compatibility with a real `TokenBudget`.
 */
export function runTokenizerConformanceSuite(name: string, tokenizer: Tokenizer): void {
  describe(`tokenizer conformance: ${name}`, () => {
    it('count() returns 0 for empty text', () => {
      expect(tokenizer.count('')).toBe(0);
    });

    it('count() returns a non-negative integer for non-empty text', () => {
      const n = tokenizer.count('Hello, world!');
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    });

    it('count() is deterministic — same input, same output', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const first = tokenizer.count(text);
      const second = tokenizer.count(text);
      expect(second).toBe(first);
    });

    it('count() does not decrease as text grows (rough monotonicity)', () => {
      const short = tokenizer.count('Hello');
      const long = tokenizer.count('Hello, this is a much longer piece of representative sample text.');
      expect(long).toBeGreaterThanOrEqual(short);
    });

    if (tokenizer.encode) {
      it('encode() length matches count() (self-consistency)', () => {
        const text = 'Self-consistency check between encode() and count().';
        expect(tokenizer.encode!(text).length).toBe(tokenizer.count(text));
      });

      it('encode() returns a plain array of numbers', () => {
        const encoded = tokenizer.encode!('hi');
        expect(Array.isArray(encoded)).toBe(true);
        expect(encoded.every((n) => typeof n === 'number')).toBe(true);
      });
    }

    it('is a drop-in replacement for TokenBudget\'s tokenizer option', () => {
      const budget = new TokenBudget({ maxTokens: 100_000, tokenizer });
      const message = budget.addMessage({ role: 'user', content: 'Hello, world! This is a test message.' });
      expect(message.tokens).toBeGreaterThan(0);
      expect(budget.stats().tokensUsed).toBe(message.tokens);
    });
  });
}
