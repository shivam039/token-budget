import type { CostModel, Role } from '@shivam.dixit/token-budget';

/**
 * Public model pricing table, in USD per 1 token (not per 1M/1K — matches
 * `CostModel.costPerToken`'s per-token contract).
 *
 * Pricing changes frequently and this table is a point-in-time snapshot —
 * it will lag reality. Pass `overrides` to `createCostModel()` for
 * up-to-date or custom rates, or supply your own `CostModel` entirely if
 * you need something other than a static table (e.g. a live pricing API).
 */
export const PRICING_TABLE: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5e-6, output: 10e-6 }, // $2.50 / $10.00 per 1M
  'gpt-4o-mini': { input: 0.15e-6, output: 0.6e-6 }, // $0.15 / $0.60 per 1M
  'gpt-4-turbo': { input: 10e-6, output: 30e-6 },
  'gpt-3.5-turbo': { input: 0.5e-6, output: 1.5e-6 },

  // Anthropic
  'claude-3-opus-20240229': { input: 15e-6, output: 75e-6 }, // $15 / $75 per 1M
  'claude-3-5-sonnet-20240620': { input: 3e-6, output: 15e-6 }, // $3 / $15 per 1M
  'claude-3-haiku-20240307': { input: 0.25e-6, output: 1.25e-6 }, // $0.25 / $1.25 per 1M
  'claude-3-5-haiku-20241022': { input: 0.8e-6, output: 4e-6 }, // $0.80 / $4.00 per 1M

  // Google
  'gemini-1.5-pro': { input: 1.25e-6, output: 5e-6 },
  'gemini-1.5-flash': { input: 0.075e-6, output: 0.3e-6 },
};

/**
 * Static `CostModel` backed by `PRICING_TABLE`, merged with any
 * `overrides` you pass in (constructor argument takes precedence over the
 * built-in table for a given model name). `role` is accepted for
 * `CostModel` interface compatibility but not used — pricing here is
 * per-model/per-direction, not per-role.
 */
export class StaticCostModel implements CostModel {
  private table: Record<string, { input: number; output: number }>;

  constructor(overrides?: Record<string, { input: number; output: number }>) {
    this.table = { ...PRICING_TABLE, ...(overrides ?? {}) };
  }

  costPerToken(_role: Role, model: string, direction: 'input' | 'output'): number {
    const entry = this.table[model];
    if (!entry) return 0; // Unknown model: no pricing data, cost 0 rather than throwing.
    return entry[direction];
  }
}

export function createCostModel(overrides?: Record<string, { input: number; output: number }>): CostModel {
  return new StaticCostModel(overrides);
}
