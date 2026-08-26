import type { BudgetMessage, Strategy, StrategyContext, Scorer, ScoringContext } from '../types.js';
import { groupIntoUnits, filterByUnits, type Unit } from '../internal/units.js';

export interface SemanticRelevanceOptions {
  /** Pluggable relevance scorer — see `token-budget-embeddings` for a reference cosine-similarity implementation. */
  scorer: Scorer;
  /** Optional context passed through to the scorer (e.g. an active goal or system prompt). */
  auxiliaryContext?: unknown;
  /** Predicate for messages that must be retained even if they aren't pinned. */
  mustRetain?: (msg: BudgetMessage) => boolean;
  /**
   * Hybrid scoring weights: `finalScore = semantic*semanticWeight +
   * recency*recencyWeight + priority*priorityWeight`. Default: semantic
   * (1.0), recency (0.0), priority (0.0) — pure semantic scoring.
   */
  weights?: {
    semantic?: number;
    recency?: number;
    priority?: number;
  };
  /** Timeout in ms for a single `scorer.score()` call. Default 2000. */
  scoringTimeoutMs?: number;
  /** Fallback strategy used if scoring throws or times out. */
  fallback?: Strategy;
}

const DEFAULT_TIMEOUT_MS = 2000;

// See budget.ts's getTimers() for why this package accesses
// setTimeout/clearTimeout via a typed globalThis cast rather than relying
// on ambient DOM/Node lib types — this package stays runtime-agnostic.
interface TimerLike {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

function getTimers(): TimerLike {
  return globalThis as unknown as TimerLike;
}

/**
 * Races `promise` against a timeout, always clearing the timer handle
 * afterward — a plain `Promise.race` with a bare `setTimeout` leaves a
 * dangling timer running (and holding the event loop open) for the rest
 * of `ms` every time the real promise wins, which adds up fast when
 * scoring hundreds of messages.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timers = getTimers();
  let handle: unknown;
  const timeout = new Promise<never>((_, reject) => {
    handle = timers.setTimeout(() => reject(new Error('Scoring timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => timers.clearTimeout(handle));
}

/**
 * Scores every non-pinned/non-mustRetain message with `scorer`, blending
 * in recency/priority per `weights`, and retains the highest-scoring
 * atomic units until the budget is full (Phase 3 §4-5). Falls back to
 * `options.fallback` (if provided) on any scoring error or timeout,
 * otherwise rethrows.
 *
 * The returned `Strategy` caches scores in a per-instance closure, keyed
 * by message id and invalidated when the query changes. **Construct one
 * instance per `TokenBudget`** — sharing a single instance across
 * multiple budgets can cross-contaminate cached scores if their messages
 * happen to share an id (e.g. two tenants both starting ids from `"1"`).
 * `scorer` itself is fine to share/reuse across instances; only the
 * strategy object's own cache is instance-scoped.
 */
export function semanticRelevance(options: SemanticRelevanceOptions): Strategy {
  const scorer = options.scorer;
  const weights = {
    semantic: options.weights?.semantic ?? 1.0,
    recency: options.weights?.recency ?? 0.0,
    priority: options.weights?.priority ?? 0.0,
  };
  const mustRetain = options.mustRetain;
  const timeoutMs = options.scoringTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Scores are cached per message id, invalidated whenever the query
  // (most recent user message) changes — a stale score under a new query
  // would be meaningless.
  let lastQueryId: string | undefined;
  const scoreCache = new Map<string, number>();

  return {
    name: 'semantic-relevance',
    sync: false,
    async apply(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> {
      if (messages.length === 0 || ctx.tokensUsed <= ctx.effectiveBudget) {
        return messages;
      }

      const queryMsg = [...messages].reverse().find((m) => m.role === 'user') ?? messages[messages.length - 1]!;
      if (lastQueryId !== queryMsg.id) {
        scoreCache.clear();
        lastQueryId = queryMsg.id;
      }

      const scoringCtx: ScoringContext = {
        buffer: messages,
        query: queryMsg,
        auxiliaryContext: options.auxiliaryContext,
      };

      try {
        // One entry per message id, built in a single O(n) pass — scored
        // in parallel, then looked up (not re-scanned) when computing
        // each unit's score below.
        const finalScoreById = new Map<string, number>();
        await Promise.all(
          messages.map(async (msg, index) => {
            if (msg.pinned || mustRetain?.(msg)) {
              finalScoreById.set(msg.id, Infinity);
              return;
            }

            let semanticScore = scoreCache.get(msg.id);
            if (semanticScore === undefined) {
              semanticScore = await withTimeout(Promise.resolve(scorer.score(msg, scoringCtx)), timeoutMs);
              scoreCache.set(msg.id, semanticScore);
            }

            const recencyScore = index / messages.length;
            const priorityScore = msg.priority ?? 0;
            finalScoreById.set(
              msg.id,
              semanticScore * weights.semantic + recencyScore * weights.recency + priorityScore * weights.priority,
            );
          }),
        );

        // Group into atomic units (tool-call/tool-result pairing), scoring
        // each unit by its highest-scoring member. Scores are tracked in a
        // side Map rather than mutating the Unit objects themselves — Unit
        // is a shared internal type other strategies also build from
        // groupIntoUnits(), so bolting an ad hoc field onto it is a
        // type-safety hazard for no benefit.
        const units = groupIntoUnits(messages);
        const unitScore = new Map<Unit, number>();
        for (const unit of units) {
          unitScore.set(unit, Math.max(...unit.messages.map((m) => finalScoreById.get(m.id)!)));
        }

        const sortedUnits = [...units].sort((a, b) => unitScore.get(b)! - unitScore.get(a)!);

        const keptUnits: Unit[] = [];
        const evictedMsgs: BudgetMessage[] = [];
        let currentTokens = 0;

        // Pinned/mustRetain units (score === Infinity) always survive first.
        for (const unit of sortedUnits) {
          if (unitScore.get(unit) === Infinity) {
            keptUnits.push(unit);
            currentTokens += ctx.countTokens(unit.messages);
          }
        }

        // Then fill the remaining budget by score, highest first.
        for (const unit of sortedUnits) {
          if (unitScore.get(unit) === Infinity) continue;
          const tokens = ctx.countTokens(unit.messages);
          if (currentTokens + tokens <= ctx.effectiveBudget) {
            keptUnits.push(unit);
            currentTokens += tokens;
          } else {
            evictedMsgs.push(...unit.messages);
          }
        }

        if (ctx.trace && evictedMsgs.length > 0) {
          ctx.trace({
            strategyName: 'semantic-relevance',
            tokensBefore: ctx.tokensUsed,
            tokensAfter: currentTokens,
            messagesConsidered: messages.length,
            evicted: evictedMsgs.map((m) => ({ id: m.id, reason: 'lowest semantic relevance' })),
            synthesized: [],
          });
        }

        return filterByUnits(messages, keptUnits);
      } catch (err) {
        if (options.fallback) return options.fallback.apply(messages, ctx);
        throw err;
      }
    },
  };
}
