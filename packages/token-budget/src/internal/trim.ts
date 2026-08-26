import type { StrategyContext } from '../types.js';
import type { Unit } from './units.js';

export function unitTokens(unit: Unit, ctx: StrategyContext): number {
  let sum = 0;
  for (const message of unit.messages) sum += ctx.countMessage(message);
  return sum;
}

/**
 * Single O(n) pass: evicts non-pinned units in order (oldest first) until
 * the remaining total is at or under `budget`, or there is nothing left
 * that can be evicted. Pinned units are always kept and never counted
 * against the eviction order (FR-3.3).
 */
export function evictOldestUnitsToBudget(units: Unit[], ctx: StrategyContext, budget: number = ctx.effectiveBudget): Unit[] {
  let tokens = 0;
  for (const unit of units) tokens += unitTokens(unit, ctx);

  const survivors: Unit[] = [];
  let doneEvicting = tokens <= budget;
  for (const unit of units) {
    if (!doneEvicting && !unit.pinned) {
      tokens -= unitTokens(unit, ctx);
      if (tokens <= budget) doneEvicting = true;
      continue;
    }
    survivors.push(unit);
  }
  return survivors;
}
