import type { BudgetMessage, TraceDecision } from '../types.js';
import type { Unit } from './units.js';

export function survivorIdSet(units: Unit[]): Set<string> {
  const ids = new Set<string>();
  for (const unit of units) for (const message of unit.messages) ids.add(message.id);
  return ids;
}

/** Builds one `TraceDecision` per message from `original` that isn't in `keptIds`, in original order. */
export function evictedEntries(
  original: BudgetMessage[],
  keptIds: Set<string>,
  reason: (message: BudgetMessage, index: number) => string,
): TraceDecision[] {
  const entries: TraceDecision[] = [];
  original.forEach((message, index) => {
    if (!keptIds.has(message.id)) entries.push({ id: message.id, reason: reason(message, index) });
  });
  return entries;
}
