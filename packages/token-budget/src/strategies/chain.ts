import type { BudgetMessage, Strategy, StrategyContext } from '../types.js';

/**
 * Composes strategies into a pipeline, applied in order — e.g.
 * "sliding-window, then summarize-oldest on overflow" (FR-4.6). Each
 * strategy sees the previous strategy's output and a freshly recomputed
 * `tokensUsed`. The chain is sync only if every member strategy is sync.
 */
export function chain(strategies: Strategy[]): Strategy {
  const sync = strategies.every((s) => s.sync);
  const name = `chain(${strategies.map((s) => s.name).join(' -> ')})`;

  function applySync(messages: BudgetMessage[], ctx: StrategyContext): BudgetMessage[] {
    let current = messages;
    for (const strategy of strategies) {
      const tokensUsed = ctx.countTokens(current);
      current = strategy.apply(current, { ...ctx, tokensUsed }) as BudgetMessage[];
    }
    return current;
  }

  async function applyAsync(messages: BudgetMessage[], ctx: StrategyContext): Promise<BudgetMessage[]> {
    let current = messages;
    for (const strategy of strategies) {
      const tokensUsed = ctx.countTokens(current);
      current = await strategy.apply(current, { ...ctx, tokensUsed });
    }
    return current;
  }

  return {
    name,
    sync,
    apply(messages: BudgetMessage[], ctx: StrategyContext) {
      return sync ? applySync(messages, ctx) : applyAsync(messages, ctx);
    },
  };
}
