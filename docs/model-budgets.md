# Model-derived budgets

`maxTokens` can be set explicitly, or derived from a recognized `model`
name. This page is the precise precedence — what's measured, what's
configured, and what happens with a model this package doesn't recognize.

## Precedence

```
Explicit maxTokens
      │
      │  set?  ──yes──▶  used as-is. model (if also set) is NOT
      │                  consulted for sizing — only for cost accounting.
      ▼
      no
      │
Model-derived budget
      │
      │  model set, and listed in MODEL_CONTEXT_WINDOWS?
      │       ──yes──▶  MODEL_CONTEXT_WINDOWS[model] used as maxTokens
      ▼
      no (model unset, or not recognized)
      │
      ▼
   throws at construction — an unresolved budget is never silently guessed
      │
      ▼
Effective usable budget
      = maxTokens - reserve  (the `effectiveBudget` getter; this is what
        every strategy actually targets, not maxTokens itself)
```

## Explicit `maxTokens` precedence

```ts
new TokenBudget({ maxTokens: 50000, model: 'gpt-4o', reserve: 4096 });
// maxTokens is 50000, not 128000 — an explicit value always wins.
// model is still used for cost accounting if costModel is also set.
```

Set `maxTokens` explicitly whenever you want a smaller budget than the
model's real window (to leave headroom for a system you don't fully
control), or a model on a smaller-tier API plan than its published limit.

## Known model handling

```ts
new TokenBudget({ model: 'gpt-4o', reserve: 4096 });
// maxTokens resolves to 128000 (MODEL_CONTEXT_WINDOWS['gpt-4o'])
```

`MODEL_CONTEXT_WINDOWS` (exported, so you can inspect or extend it
yourself) is a **static, point-in-time snapshot** — providers add models
and change limits over time, and this table will lag reality the same way
any hardcoded pricing/limits table does. Currently listed (from
[`packages/token-budget/src/modelContextWindows.ts`](../packages/token-budget/src/modelContextWindows.ts)):

| Model | Context window |
| --- | --- |
| `gpt-4o` | 128,000 |
| `gpt-4o-mini` | 128,000 |
| `gpt-4-turbo` | 128,000 |
| `gpt-3.5-turbo` | 16,385 |
| `claude-3-opus-20240229` | 200,000 |
| `claude-3-5-sonnet-20240620` | 200,000 |
| `claude-3-haiku-20240307` | 200,000 |
| `claude-3-5-haiku-20241022` | 200,000 |
| `gemini-1.5-pro` | 2,000,000 |
| `gemini-1.5-flash` | 1,000,000 |

Check the current list at runtime with `getModelContextWindow(model)` — it
returns `undefined` for anything not listed, rather than throwing, so you
can check before constructing if you want to branch on it yourself.

**What this table cannot know:** provider-side context limits are not
queried at runtime — there's no API call to "ask the provider what my
current limit is." This is a hardcoded snapshot maintained in this
package, the same limitation `token-budget-pricing`'s pricing table has.
If a provider changes a model's window, or you're on an API tier with a
smaller effective limit than the model's published maximum, the table
will be wrong until it's updated (or until you override it with an
explicit `maxTokens`).

## Unknown model behavior

```ts
new TokenBudget({ model: 'some-new-model-not-yet-listed' });
// throws: "config.maxTokens was omitted and config.model
//          ("some-new-model-not-yet-listed") is not in
//          MODEL_CONTEXT_WINDOWS. Pass maxTokens explicitly,
//          or use a listed model name."
```

```ts
new TokenBudget({}); // model also unset
// throws: "config.maxTokens is required unless config.model names
//          a recognized model (see MODEL_CONTEXT_WINDOWS). Pass
//          maxTokens explicitly, or set model to a listed name."
```

This is deliberate: an unresolved budget is never silently guessed at a
default (there is no fallback constant like "assume 8000 tokens"). Pass
`maxTokens` explicitly for any model not yet in the table — including a
brand-new model release the table hasn't caught up to yet.

## Output reservation

`reserve` is independent of how `maxTokens` was resolved — set it either
way:

```ts
new TokenBudget({ model: 'gpt-4o', reserve: 4096 });
// effectiveBudget = 128000 - 4096 = 123904
```

There's no automatic "safety margin" beyond what you set via `reserve` —
if you want additional headroom beyond output reservation (e.g. because a
tokenizer estimate might slightly undercount), that's also just a larger
`reserve`, or a smaller explicit `maxTokens` than the model's real limit.

## Fallback behavior — none

There is no silent fallback path anywhere in this resolution: no default
`maxTokens` constant, no "guess a reasonable window," no partial
resolution. Either `maxTokens` is set, or `model` resolves via the table,
or construction throws. This is the same philosophy as the rest of the
config validation (see [`docs/configuration.md#whats-validated-at-construction`](./configuration.md#whats-validated-at-construction)).

## Related documentation

- [`docs/API.md#model-derived-budgets`](./API.md#model-derived-budgets) — `MODEL_CONTEXT_WINDOWS`/`getModelContextWindow` signatures
- [`docs/configuration.md`](./configuration.md) — every other config option
- [`packages/token-budget-pricing`](../packages/token-budget-pricing) — the equivalent static table for cost accounting
