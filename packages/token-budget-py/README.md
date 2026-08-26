# token-budget (Python)

Python port of [`token-budget`](https://www.npmjs.com/package/token-budget).
**Work in progress** — this is an early, partial port, not yet at parity
with the JS package.

## What's implemented today

- `TokenBudget`: `add_message()`, `get_messages()`, `stats()`,
  `get_context()`, `explain()`.
- A built-in `estimate` tokenizer (`chars_per_token`-based heuristic,
  same default ratio as the JS package) — bring your own `Tokenizer`
  subclass for anything else.
- Strategies: `drop_oldest()`, `sliding_window()`, `priority()`,
  `chain()`, and a **single-pass** `summarize_oldest(summarizer)`
  (`summarizer` must be a plain synchronous callable — everything in this
  port is synchronous today, unlike the JS package's async
  `getContext()`).

## What's not implemented yet

- Recursive re-summarization (`maxSummaryDepth`/`onMaxDepthReached`) — a
  summary produced by `summarize_oldest` is treated like any other
  message on a later call, never folded into a deeper summary.
- Tool-call/tool-result atomic-unit grouping — pairing is a JS-only
  concept (`toolCallId`) not yet respected by any Python strategy.
- Events, streaming, persistence (`serialize()`/`deserialize()`), cost/
  governance accounting (Phase 3 features on the JS side), and a
  `tiktoken`-backed exact tokenizer.

## Install

```sh
cd packages/token-budget-py
pip install -e ".[dev]"
```

## Usage

```python
from token_budget import TokenBudget, TokenBudgetConfig

budget = TokenBudget(TokenBudgetConfig(max_tokens=8000))
budget.add_message(role="system", content="You are a helpful assistant.", pinned=True)
budget.add_message(role="user", content="Hello!")

ctx = budget.get_context()
report = budget.explain()
```

## Testing

```sh
pytest
```

## License

MIT
