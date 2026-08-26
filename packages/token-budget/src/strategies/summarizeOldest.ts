import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits, type Unit } from '../internal/units.js';
import { unitTokens } from '../internal/trim.js';
import { dropOldest } from './dropOldest.js';

export type OnMaxDepthReached = 'evict' | 'keep-forever' | ((message: BudgetMessage) => 'evict' | 'keep-forever');

export interface SummarizeOldestOptions {
  /** Summarizes a contiguous block of the oldest non-pinned messages into replacement text. */
  summarize: (messages: BudgetMessage[]) => Promise<string>;
  /**
   * Fraction of the effective budget at which to trigger summarization,
   * before a hard overflow. Default 1 (only trigger once over budget).
   */
  preThreshold?: number;
  /**
   * Fixed number of oldest eligible non-pinned atomic units to summarize
   * per call. Default: grow the block until removing it would bring the
   * buffer back under the trigger threshold.
   */
  blockSize?: number;
  /** Behavior once `summarize` has failed `1 + retries` times. Default 'throw'. */
  onError?: 'throw' | 'fallback-drop-oldest';
  /** Number of retries after the first failed summarize() call. Default 0. */
  retries?: number;
  /**
   * Once a synthetic summary's `metadata.summaryDepth` reaches this value,
   * it's never folded into another summary again (FR2-5.2). Default 3.
   */
  maxSummaryDepth?: number;
  /**
   * What to do with a depth-maxed summary that's the oldest thing in an
   * over-budget buffer (FR2-5.4). `'keep-forever'` (default) leaves it in
   * place untouched — chain with `dropOldest()` as a hard backstop if you
   * need a guarantee the buffer always fits. `'evict'` drops it like
   * `drop-oldest` would, without summarizing it further.
   */
  onMaxDepthReached?: OnMaxDepthReached;
}

function isSyntheticUnit(unit: Unit): boolean {
  return unit.messages.length === 1 && unit.messages[0]!.metadata?.['synthetic'] === true;
}

function summaryDepthOf(unit: Unit): number {
  if (!isSyntheticUnit(unit)) return 0;
  const depth = unit.messages[0]!.metadata?.['summaryDepth'];
  return typeof depth === 'number' ? depth : 1;
}

function collectSourceIds(unit: Unit): string[] {
  if (isSyntheticUnit(unit)) {
    const prior = unit.messages[0]!.metadata?.['sourceIds'];
    return Array.isArray(prior) ? (prior as string[]) : [unit.messages[0]!.id];
  }
  return unit.messages.map((m) => m.id);
}

/**
 * When over budget (or over `preThreshold`), takes the oldest eligible
 * block of non-pinned atomic units, summarizes them via the caller-supplied
 * `summarize` callback, and replaces them with a single synthetic message
 * (FR-4.3). Tool-call/tool-result pairs are summarized as a unit, never
 * split (FR-4.9). Supports re-summarizing a previous summary when it's the
 * oldest eligible content and the buffer overflows again, accumulating
 * provenance across passes and respecting `maxSummaryDepth` (FR2-5.1-5.4).
 */
export function summarizeOldest(options: SummarizeOldestOptions): Strategy {
  const preThreshold = options.preThreshold ?? 1;
  const maxAttempts = 1 + Math.max(0, options.retries ?? 0);
  const onError = options.onError ?? 'throw';
  const maxSummaryDepth = options.maxSummaryDepth ?? 3;
  const onMaxDepthReached = options.onMaxDepthReached ?? 'keep-forever';
  const useFixedBlockSize = Boolean(options.blockSize && options.blockSize > 0);

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
      const nonPinned = units.filter((u) => !u.pinned);
      if (nonPinned.length === 0) return noop();

      const block: Unit[] = [];
      const hardEvicted: Unit[] = [];
      let running = tokens;

      for (const unit of nonPinned) {
        if (useFixedBlockSize ? block.length >= options.blockSize! : running <= triggerAt) break;

        if (summaryDepthOf(unit) >= maxSummaryDepth) {
          const decision = typeof onMaxDepthReached === 'function' ? onMaxDepthReached(unit.messages[0]!) : onMaxDepthReached;
          if (decision === 'keep-forever') continue;
          hardEvicted.push(unit);
          running -= unitTokens(unit, ctx);
          continue;
        }

        block.push(unit);
        running -= unitTokens(unit, ctx);
      }

      if (block.length === 0 && hardEvicted.length === 0) return noop();

      let synthetic: BudgetMessage | undefined;
      let blockMessages: BudgetMessage[] = [];
      let blockIds = new Set<string>();

      if (block.length > 0) {
        blockMessages = block.flatMap((u) => u.messages);
        blockIds = new Set(blockMessages.map((m) => m.id));

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
          if (onError === 'fallback-drop-oldest') return dropOldest().apply(messages, ctx) as BudgetMessage[];
          throw lastError;
        }

        const sourceIds = block.flatMap(collectSourceIds);
        const priorDepths = block.map(summaryDepthOf);
        const newDepth = 1 + Math.max(0, ...priorDepths);
        synthetic = ctx.makeSynthetic(summaryText ?? '', sourceIds, { summaryDepth: newDepth });
      }

      const hardEvictedIds = new Set(hardEvicted.flatMap((u) => u.messages.map((m) => m.id)));
      const removedIds = new Set([...blockIds, ...hardEvictedIds]);

      const result: BudgetMessage[] = [];
      let insertedSynthetic = false;
      for (const message of messages) {
        if (removedIds.has(message.id)) {
          if (synthetic && blockIds.has(message.id) && !insertedSynthetic) {
            result.push(synthetic);
            insertedSynthetic = true;
          }
          continue;
        }
        result.push(message);
      }

      if (ctx.trace) {
        const evicted = [
          ...(synthetic
            ? blockMessages.map((m) => ({ id: m.id, reason: `summarized into synthetic message ${synthetic!.id} (covering ${blockIds.size} messages)` }))
            : []),
          ...hardEvicted.flatMap((u) =>
            u.messages.map((m) => ({ id: m.id, reason: `max summary depth (${maxSummaryDepth}) reached; evicted per onMaxDepthReached: 'evict'` })),
          ),
        ];
        const synthesized = synthetic
          ? [
              {
                id: synthetic.id,
                sourceIds: [...blockIds],
                reason:
                  (synthetic.metadata!['summaryDepth'] as number) > 1
                    ? `re-summarized ${blockIds.size} messages, including a prior summary (depth ${synthetic.metadata!['summaryDepth']})`
                    : `first-pass summary of ${blockIds.size} messages (depth 1)`,
              },
            ]
          : [];
        ctx.trace({
          strategyName: 'summarize-oldest',
          tokensBefore: tokens,
          tokensAfter: ctx.countTokens(result),
          messagesConsidered: messages.length,
          evicted,
          synthesized,
        });
      }
      return result;
    },
  };
}
