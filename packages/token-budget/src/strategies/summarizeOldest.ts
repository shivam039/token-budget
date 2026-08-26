import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits } from '../internal/units.js';
import { unitTokens } from '../internal/trim.js';
import { dropOldest } from './dropOldest.js';

export interface SummarizeOldestOptions {
  /** Summarizes a contiguous block of the oldest non-pinned messages into replacement text. */
  summarize: (messages: BudgetMessage[]) => Promise<string>;
  /**
   * Fraction of the effective budget at which to trigger summarization,
   * before a hard overflow. Default 1 (only trigger once over budget).
   */
  preThreshold?: number;
  /**
   * Fixed number of oldest non-pinned atomic units to summarize per call.
   * Default: grow the block until removing it would bring the buffer back
   * under the trigger threshold.
   */
  blockSize?: number;
  /** Behavior once `summarize` has failed `1 + retries` times. Default 'throw'. */
  onError?: 'throw' | 'fallback-drop-oldest';
  /** Number of retries after the first failed summarize() call. Default 0. */
  retries?: number;
}

/**
 * When over budget (or over `preThreshold`), takes the oldest contiguous
 * block of non-pinned atomic units, summarizes them via the caller-supplied
 * `summarize` callback, and replaces them with a single synthetic message
 * (FR-4.3). Tool-call/tool-result pairs are summarized as a unit, never
 * split (FR-4.9).
 */
export function summarizeOldest(options: SummarizeOldestOptions): Strategy {
  const preThreshold = options.preThreshold ?? 1;
  const maxAttempts = 1 + Math.max(0, options.retries ?? 0);
  const onError = options.onError ?? 'throw';

  return {
    name: 'summarize-oldest',
    sync: false,
    async apply(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> {
      const triggerAt = preThreshold * ctx.effectiveBudget;
      const tokens = ctx.countTokens(messages);
      const noop = (): BudgetMessage[] => {
        ctx.trace?.({ strategyName: 'summarize-oldest', tokensBefore: tokens, tokensAfter: tokens, messagesConsidered: messages.length, evicted: [], synthesized: [] });
        return messages;
      };
      if (tokens <= triggerAt) return noop();

      const units = groupIntoUnits(messages);
      const evictable = units.filter((u) => !u.pinned);
      if (evictable.length === 0) return noop();

      const block: typeof evictable = [];
      if (options.blockSize && options.blockSize > 0) {
        block.push(...evictable.slice(0, options.blockSize));
      } else {
        let running = tokens;
        for (const unit of evictable) {
          if (running <= triggerAt) break;
          block.push(unit);
          running -= unitTokens(unit, ctx);
        }
        if (block.length === 0) block.push(evictable[0]!);
      }

      const blockMessages = block.flatMap((u) => u.messages);
      const blockIds = new Set(blockMessages.map((m) => m.id));

      let summaryText: string | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          summaryText = await options.summarize(blockMessages);
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (lastError !== undefined) {
        if (onError === 'fallback-drop-oldest') {
          return dropOldest().apply(messages, ctx) as BudgetMessage[];
        }
        throw lastError;
      }

      const synthetic = ctx.makeSynthetic(summaryText ?? '', [...blockIds]);
      const result: BudgetMessage[] = [];
      let inserted = false;
      for (const message of messages) {
        if (blockIds.has(message.id)) {
          if (!inserted) {
            result.push(synthetic);
            inserted = true;
          }
          continue;
        }
        result.push(message);
      }

      if (ctx.trace) {
        const reason = `summarized into synthetic message ${synthetic.id} (covering ${blockIds.size} messages)`;
        ctx.trace({
          strategyName: 'summarize-oldest',
          tokensBefore: tokens,
          tokensAfter: ctx.countTokens(result),
          messagesConsidered: messages.length,
          evicted: blockMessages.map((m) => ({ id: m.id, reason })),
          synthesized: [{ id: synthetic.id, sourceIds: [...blockIds], reason: `first-pass summary of ${blockIds.size} messages` }],
        });
      }
      return result;
    },
  };
}
