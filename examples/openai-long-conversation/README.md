# Example: a long OpenAI conversation, kept inside its context window

```
messages ──▶ token-budget ──▶ context management ──▶ OpenAI ──▶ response
```

Simulates a 300-turn support conversation that would otherwise blow past
a 16,000-token budget, using a chain of strategies (summarize-oldest,
with drop-oldest as a hard backstop), then converts the result to
OpenAI's Chat Completions message format via `token-budget-openai`.

## Run it

Requires the one-time repo-root setup in [`../README.md`](../README.md)
first (`npm install && npm run build`, so `token-budget`'s `dist/`
exists for this example to import). Then:

```sh
cd examples/openai-long-conversation
npm start
```

Set `OPENAI_API_KEY` to actually call the API; without it, the example
prints the request payload it *would* send, so you can see the
token-budget part working with zero setup.

## Expected output (shape — your exact numbers will vary slightly)

```
Token budget:  16,000
Before:        20,897 tokens
After:         12,771 tokens
Evicted:       235 messages
Summarized:    235 messages (folded into 1 summary message(s))
Remaining:     2,229 tokens
```

## What to look at

- `strategies.chain([...])` in `src/index.ts` — composing a summarizer
  with a hard drop-oldest backstop.
- `budget.explain()` — exactly which messages were evicted and why.
- `toOpenAIMessages(ctx)` — the `token-budget-openai` adapter turning a
  strategized context into OpenAI's wire format.
