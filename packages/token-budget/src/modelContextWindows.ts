/**
 * Known context-window sizes (in tokens), keyed by the same model name
 * strings `token-budget-pricing`'s `PRICING_TABLE` uses — set `model` once
 * and both cost accounting and `maxTokens` auto-detection recognize it.
 *
 * A static, point-in-time snapshot: providers add models and change limits
 * over time, so this will lag reality the same way `PRICING_TABLE` does.
 * Pass `maxTokens` explicitly for anything not listed here, or to override
 * a listed value (e.g. a smaller context-window tier on your API plan).
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-3.5-turbo': 16_385,

  // Anthropic
  'claude-3-opus-20240229': 200_000,
  'claude-3-5-sonnet-20240620': 200_000,
  'claude-3-haiku-20240307': 200_000,
  'claude-3-5-haiku-20241022': 200_000,

  // Google
  'gemini-1.5-pro': 2_000_000,
  'gemini-1.5-flash': 1_000_000,
};

/** Looks up `model`'s known context-window size, or `undefined` if not listed in `MODEL_CONTEXT_WINDOWS`. */
export function getModelContextWindow(model: string): number | undefined {
  return MODEL_CONTEXT_WINDOWS[model];
}
