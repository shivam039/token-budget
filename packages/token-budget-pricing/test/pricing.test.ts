import { describe, it, expect } from 'vitest';
import { PRICING_TABLE, createCostModel, StaticCostModel } from '../src/index.js';

describe('token-budget-pricing', () => {
  it('provides known models', () => {
    expect(PRICING_TABLE['gpt-4o']).toBeDefined();
    expect(PRICING_TABLE['gpt-4o']!.input).toBe(2.5e-6);
  });

  it('creates a cost model that returns correct pricing', () => {
    const costModel = createCostModel();
    expect(costModel.costPerToken('user', 'gpt-4o', 'input')).toBe(2.5e-6);
    expect(costModel.costPerToken('assistant', 'gpt-4o', 'output')).toBe(10e-6);
  });

  it('handles unknown models safely (cost 0, not a throw)', () => {
    const costModel = createCostModel();
    expect(costModel.costPerToken('user', 'unknown-model', 'input')).toBe(0);
  });

  it('supports overrides, taking precedence over the built-in table', () => {
    const costModel = createCostModel({
      'my-custom-model': { input: 1.0, output: 2.0 },
      'gpt-4o': { input: 999, output: 999 },
    });
    expect(costModel.costPerToken('user', 'my-custom-model', 'input')).toBe(1.0);
    expect(costModel.costPerToken('assistant', 'my-custom-model', 'output')).toBe(2.0);
    expect(costModel.costPerToken('user', 'gpt-4o', 'input')).toBe(999);
  });

  it('StaticCostModel can be constructed directly, same as createCostModel()', () => {
    const costModel = new StaticCostModel();
    expect(costModel.costPerToken('user', 'gpt-4o-mini', 'input')).toBe(0.15e-6);
  });
});
