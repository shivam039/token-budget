import { describe, expect, it } from 'vitest';
import { MODEL_CONTEXT_WINDOWS, getModelContextWindow } from '../src/modelContextWindows.js';

describe('MODEL_CONTEXT_WINDOWS / getModelContextWindow', () => {
  it('returns a known model\'s context window', () => {
    expect(getModelContextWindow('gpt-4o')).toBe(128_000);
    expect(getModelContextWindow('claude-3-5-sonnet-20240620')).toBe(200_000);
  });

  it('returns undefined for an unrecognized model', () => {
    expect(getModelContextWindow('not-a-real-model')).toBeUndefined();
  });

  it('every entry is a positive finite number', () => {
    for (const [model, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      expect(Number.isFinite(window), `${model} context window`).toBe(true);
      expect(window, `${model} context window`).toBeGreaterThan(0);
    }
  });
});
