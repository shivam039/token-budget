import type { BudgetMessage } from '../types.js';

/**
 * An eviction unit: one or more messages that must be kept or evicted
 * together. A tool-result message (`toolCallId` set) is grouped with the
 * message that produced the call it answers, so no strategy can ever
 * remove one half of a tool-call/tool-result pair (FR-4.9).
 */
export interface Unit {
  messages: BudgetMessage[];
  pinned: boolean;
  /** Oldest message's position in the original buffer; used for age ordering. */
  order: number;
  /** Highest priority among the unit's messages; used by the priority strategy. */
  priority: number;
}

/**
 * Groups a flat, ordered message list into atomic units. A message with a
 * `toolCallId` referencing an earlier message's `id` is merged into that
 * message's unit (preserving the earlier message's position for ordering).
 * Any message may be a member of at most one such pair.
 */
export function groupIntoUnits(messages: BudgetMessage[]): Unit[] {
  const idToUnit = new Map<string, Unit>();
  const units: Unit[] = [];

  messages.forEach((message, index) => {
    const linked = message.toolCallId ? idToUnit.get(message.toolCallId) : undefined;
    if (linked) {
      linked.messages.push(message);
      linked.pinned = linked.pinned || Boolean(message.pinned);
      linked.priority = Math.max(linked.priority, message.priority ?? 0);
      idToUnit.set(message.id, linked);
      return;
    }
    const unit: Unit = {
      messages: [message],
      pinned: Boolean(message.pinned),
      order: index,
      priority: message.priority ?? 0,
    };
    units.push(unit);
    idToUnit.set(message.id, unit);
  });

  return units;
}

/**
 * Projects a set of surviving units back onto the original message array,
 * preserving the original insertion order exactly (FR-3.6). Grouping
 * messages into units can reorder a unit's own array (a tool-result may be
 * appended to a unit whose anchor message is several positions earlier);
 * always rebuild output order from the original buffer rather than from
 * unit internals.
 */
export function filterByUnits(original: BudgetMessage[], keptUnits: Unit[]): BudgetMessage[] {
  const keptIds = new Set<string>();
  for (const unit of keptUnits) {
    for (const message of unit.messages) keptIds.add(message.id);
  }
  return original.filter((message) => keptIds.has(message.id));
}
