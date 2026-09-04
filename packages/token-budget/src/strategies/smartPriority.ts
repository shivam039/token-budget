import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';
import { groupIntoUnits } from '../internal/units.js';
import { priority } from './priority.js';
import { summarizeOldest, type SummarizeOldestOptions } from './summarizeOldest.js';

export interface SmartPriorityOptions {
  /**
   * Auto-pin every `system`-role message, without requiring the caller to
   * set `pinned: true` on each one. Default true. An explicit `pinned:
   * false` on a message is never overridden — this only ever adds a pin,
   * never removes one.
   */
  autoPinSystem?: boolean;
  /**
   * Auto-pin the most recent `user`-role message — the current query —
   * so it survives eviction the same way a pinned system prompt does.
   * Default true.
   */
  autoPinLatestUser?: boolean;
  /**
   * Effective priority applied to tool-call/tool-result units (grouped
   * the same way every built-in strategy groups them, via `toolCallId`)
   * that don't already have an explicit `priority` set on any of their
   * messages — so they're evicted before ordinary conversation turns,
   * which default to priority 0. Only ever raises or lowers *untagged*
   * messages; an explicit `priority` you set yourself always wins.
   * Default -1.
   */
  toolPriority?: number;
  /**
   * Optional condensation pass, applied before priority-based eviction:
   * older non-pinned turns are folded into one synthetic message via
   * `summarize` instead of being dropped outright. Takes the same options
   * as `summarizeOldest()` — pass a function that calls a real model for
   * an actual summary, or one that resolves to a fixed string (e.g.
   * `() => Promise.resolve('[Prior conversation omitted]')`) for a
   * zero-cost placeholder instead. Omit (default) to skip condensation
   * and go straight to priority-based eviction, which keeps this strategy
   * synchronous and usable with `getContextSync()`.
   */
  condense?: SummarizeOldestOptions;
}

function tagMessages(
  messages: BudgetMessage[],
  autoPinSystem: boolean,
  autoPinLatestUser: boolean,
  toolPriority: number,
): BudgetMessage[] {
  let latestUserId: string | undefined;
  if (autoPinLatestUser) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        latestUserId = messages[i]!.id;
        break;
      }
    }
  }

  const patches = new Map<string, { pinned?: boolean; priority?: number }>();
  for (const unit of groupIntoUnits(messages)) {
    const isToolUnit = unit.messages.some((m) => m.role === 'tool' || m.toolCallId !== undefined);
    for (const m of unit.messages) {
      const patch: { pinned?: boolean; priority?: number } = {};
      if (autoPinSystem && m.role === 'system' && m.pinned !== false) patch.pinned = true;
      if (autoPinLatestUser && m.id === latestUserId && m.pinned !== false) patch.pinned = true;
      if (isToolUnit && m.priority === undefined) patch.priority = toolPriority;
      if (Object.keys(patch).length > 0) patches.set(m.id, patch);
    }
  }
  if (patches.size === 0) return messages;

  return messages.map((m) => {
    const patch = patches.get(m.id);
    if (!patch) return m;
    return {
      ...m,
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    };
  });
}

/**
 * A zero-config, opinionated default that composes the library's existing
 * primitives into the three-tier eviction policy most agents actually
 * want, without hand-tagging every message:
 *
 * 1. **Never drop** — every `system`-role message and the current (most
 *    recent) `user`-role message are auto-pinned, on top of anything you
 *    pin yourself.
 * 2. **Drop first** — tool-call/tool-result units with no explicit
 *    `priority` default to a low one (`toolPriority`, default -1), so
 *    they're evicted before ordinary untagged conversation turns
 *    (priority 0) once eviction is actually needed.
 * 3. **Condense, don't just drop** — pass `condense` to fold older
 *    non-pinned turns into one synthetic message (a real summary, or a
 *    fixed placeholder string) instead of discarding them outright.
 *
 * This never overrides a `pinned`/`priority` value you set explicitly —
 * it only fills in defaults for messages that didn't specify one. For
 * full manual control over tagging instead of these defaults, compose
 * `priority()` (and `summarizeOldest()`/`chain()`) directly.
 */
export function smartPriority(options: SmartPriorityOptions = {}): Strategy {
  const autoPinSystem = options.autoPinSystem ?? true;
  const autoPinLatestUser = options.autoPinLatestUser ?? true;
  const toolPriority = options.toolPriority ?? -1;
  const condenseStrategy = options.condense ? summarizeOldest(options.condense) : undefined;
  const priorityStrategy = priority();
  const sync = !condenseStrategy;

  function applySync(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
    const tagged = tagMessages(messages, autoPinSystem, autoPinLatestUser, toolPriority);
    return priorityStrategy.apply(tagged, ctx) as BudgetMessage[];
  }

  async function applyAsync(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> {
    const tagged = tagMessages(messages, autoPinSystem, autoPinLatestUser, toolPriority);
    const condensed = await condenseStrategy!.apply(tagged, ctx);
    const tokensUsed = ctx.countTokens(condensed);
    return priorityStrategy.apply(condensed, { ...ctx, tokensUsed }) as BudgetMessage[];
  }

  return {
    name: 'smart-priority',
    sync,
    apply(messages: BudgetMessage[], ctx: StrategyContext) {
      return sync ? applySync(messages, ctx) : applyAsync(messages, ctx);
    },
  };
}
