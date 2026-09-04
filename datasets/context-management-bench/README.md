---
pretty_name: LLM Context Management Benchmark Cases
license: mit
tags:
  - llm
  - context-management
  - token-budget
  - ai-agents
  - conversational
  - tool-use
task_categories:
  - conversational
size_categories:
  - n<1K
---

# context-management-bench

Realistic context-management scenarios for testing/benchmarking eviction strategies (drop-oldest, sliding-window, priority, summarization), pinned-message preservation, and tool-call/tool-result atomicity in multi-turn LLM conversations.

## Dataset Summary

Every conversation in this dataset was **generated deterministically and then run through the real [`@shivam.dixit/token-budget`](https://www.npmjs.com/package/@shivam.dixit/token-budget) engine** — the `evicted_message_ids`/`retained_message_ids` fields are not hand-authored or approximated, they're the actual output of the library's strategies applied to the generated conversation and budget. This means the dataset is reproducible end to end: the same generator, seed, and library version will always produce the same records.

Context management matters because every long-running LLM agent eventually accumulates more conversation history, tool calls, and tool results than its context window can hold, and naive trimming (`.shift()`/`.slice(-N)`) breaks in predictable ways — it can drop a pinned system instruction, split a tool-call from its result, or leave no record of what was removed and why. This dataset gives concrete before/after cases across eight realistic scenario categories, each demonstrating a specific thing an eviction strategy needs to get right.

**Categories** (3 conversations each, at 30/80/150 messages): `coding-agent`, `research-agent`, `customer-support`, `tool-heavy-agent`, `long-running-agent`, `pinned-instruction`, `tool-call-atomicity`, `priority-based-context`.

## Intended Use

- Testing or benchmarking your own context-management/eviction algorithm against known-good expected behavior.
- Benchmarking LLM "memory" strategies (what should survive when a conversation exceeds budget).
- Evaluating whether a tool-call/tool-result preservation implementation actually keeps pairs atomic.
- Building or testing agent frameworks that need realistic multi-turn conversation shapes (mixed system/user/assistant/tool messages, interleaved tool-call pairs, pinned instructions).
- Testing context-window policies (e.g. "does my pinned system prompt survive at this budget").

**Not intended for:** training a model to generate conversations (the text is synthetic and templated, not naturalistic dialogue), or evaluating model output quality/intelligence — this dataset is about *what stays in context*, not what a model says.

## Limitations

- **This is not a benchmark of model intelligence.** Nothing here evaluates response quality — only which messages an eviction strategy keeps or drops.
- **Synthetic, not production traffic.** Conversations are generated from a deterministic template-and-seed system (see `scripts/lib/generateConversation.ts` in the source repository), not sampled from real usage. They're realistic in *shape* (system/user/assistant/tool interleaving, tool-call pairs, filler vs. substantive turns), not in exact wording.
- **Token counts are estimates, explicitly labeled as such.** `token_count_estimate` uses the library's built-in heuristic tokenizer (~4 characters/token) — the same default `TokenBudget` uses when no real model tokenizer is configured. It is **not** an exact count from any specific model's tokenizer (OpenAI's, Anthropic's, or otherwise). Every record's `notes` field repeats this.
- **`expected_behavior` describes what this specific strategy/budget combination does, not a universal rule.** Different applications legitimately want different eviction policies for the same conversation shape — see [`docs/strategy-guide.md`](https://github.com/shivam039/token-budget/blob/main/docs/strategy-guide.md) in the source repository for the general decision guidance this dataset's per-category choices are drawn from.
- **Small size.** 24 records total (3 sizes × 8 categories) — enough to exercise every scenario shape at multiple conversation lengths, not a large-scale training corpus.

## Schema

Each line of each `data/<category>.jsonl` file is one JSON record:

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Unique record id, e.g. `"coding-agent-002"`. |
| `scenario` | string | One of the eight category names. |
| `messages` | array of objects | The full conversation. Each message: `{ id, role, content, pinned?, priority?, toolCallId? }` — the same shape `@shivam.dixit/token-budget`'s `addMessage()` accepts directly. |
| `token_budget` | number | The `maxTokens` value the strategy was run against. |
| `token_count_estimate` | number | Total estimated tokens of the full conversation before eviction. **An estimate — see Limitations.** |
| `token_count_is_estimate` | boolean | Always `true` — present so a consumer can filter/flag on it programmatically without reading the docs. |
| `strategy` | string | Which built-in strategy was actually run: `"dropOldest"`, `"slidingWindow"`, or `"priority"`. |
| `pinned_message_ids` | array of strings | Ids of messages marked `pinned: true` in the conversation. |
| `protected_tool_groups` | array of `{ call_id, result_id }` | Every tool-call/tool-result pair in the conversation, by id. |
| `evicted_message_ids` | array of strings | Message ids **actually evicted** by running the real library — not predicted or hand-written. |
| `retained_message_ids` | array of strings | Message ids that survived — the complement of `evicted_message_ids`. |
| `expected_behavior` | string | A human-readable description of what this scenario demonstrates. |
| `notes` | string | Caveats specific to this record (currently: the token-count-is-an-estimate note). |

## Example

One trimmed record from `data/pinned-instruction.jsonl` (message list shortened for readability — see the actual file for the full conversation):

```json
{
  "id": "pinned-instruction-003",
  "scenario": "pinned-instruction",
  "messages": [
    { "id": "msg_pinned-instruction_0", "role": "system", "content": "You are a secure production coding assistant. Never expose credentials, API keys, or secrets in any response.", "pinned": true },
    { "id": "msg_pinned-instruction_1", "role": "user", "content": "Can you show me the current database connection string?" }
  ],
  "token_budget": 400,
  "token_count_estimate": 2380,
  "token_count_is_estimate": true,
  "strategy": "dropOldest",
  "pinned_message_ids": ["msg_pinned-instruction_0"],
  "protected_tool_groups": [{ "call_id": "msg_pinned-instruction_11", "result_id": "msg_pinned-instruction_12" }],
  "evicted_message_ids": ["msg_pinned-instruction_1", "msg_pinned-instruction_2"],
  "retained_message_ids": ["msg_pinned-instruction_0"],
  "expected_behavior": "The pinned system instruction survives eviction regardless of how small the budget is, even when hundreds of other messages do not.",
  "notes": "token_count_estimate uses the built-in heuristic estimator (~4 chars/token), the same default TokenBudget uses when no real tokenizer is configured — it is an estimate, not an exact count from any specific model's tokenizer."
}
```

## Reproducing / regenerating this dataset

From the [source repository](https://github.com/shivam039/token-budget):

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install && npm run build
npm run generate:dataset
```

This runs `scripts/generate-context-dataset.ts`, which imports the same deterministic generator (`scripts/lib/generateConversation.ts`) used by the [`packages/token-budget-playground`](https://github.com/shivam039/token-budget/tree/main/packages/token-budget-playground) Hugging Face Space's own "Generate long conversation" feature — one implementation, not two.

## Publishing updates to Hugging Face

[`.github/workflows/deploy-dataset.yml`](https://github.com/shivam039/token-budget/blob/main/.github/workflows/deploy-dataset.yml)
pushes this directory to the Hugging Face dataset repo automatically on
every push to `main` that touches it (or on demand via the Actions tab).
It needs the dataset repo to already exist on Hugging Face — create it
once at [huggingface.co/new-dataset](https://huggingface.co/new-dataset)
(name: `context-management-bench`, license: `mit`) — and the same
`HF_TOKEN` repository secret the playground's deploy workflow uses, with
write access to datasets. Missing either one doesn't fail the workflow;
it prints setup instructions and skips instead.

## License

MIT — matching the source repository's [`LICENSE`](https://github.com/shivam039/token-budget/blob/main/LICENSE). All content is synthetically generated; no real user conversations, credentials, or personal data are included.
