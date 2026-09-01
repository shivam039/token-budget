---
title: LLM Context Budget Playground
emoji: 🧮
colorFrom: indigo
colorTo: blue
sdk: static
app_file: dist/index.html
pinned: false
license: mit
tags:
  - llm
  - context-management
  - token-budget
  - typescript
  - ai-agents
---

# LLM Context Budget Playground

**See what happens to a long LLM conversation when it hits its context budget.**

Edit a conversation, set a token budget, pick an eviction strategy, and watch — live, in your browser — which messages survive, which get evicted, and why. Every result on this page comes from actually running [`@shivam.dixit/token-budget`](https://www.npmjs.com/package/@shivam.dixit/token-budget)'s real engine client-side; nothing here is simulated or hand-scripted.

## What you can do here

- **Edit a conversation** — system/user/assistant/tool messages, with pin and priority controls, starting from a realistic coding-agent example (a JWT-authentication discussion).
- **Set a budget and strategy** — `dropOldest`, `slidingWindow`, `priority`, or `summarizeOldest` (using a deterministic demo summarizer, since this runs with no API key and no server calls — see below).
- **Inspect retained/evicted messages** — every message tagged KEPT, EVICTED, PINNED, or as part of a protected tool-call/tool-result pair.
- **See tool-call atomicity** — a dedicated preset shows a tool call and its result surviving or leaving together, never split.
- **See a pinned system prompt survive** — a preset with a small budget and a pinned instruction, demonstrating the actual production use case.
- **Compare strategies side by side** — the same conversation and budget run through all three synchronous strategies at once.
- **Inspect the real `explain()` trace** — the exact structured decision record the library produces, not a paraphrase of it.
- **Generate a longer conversation** — deterministic, reproducible, up to 5,000 messages (never 50,000 automatically — see Benchmarks).
- **Run a live in-browser benchmark** — token-budget vs. a naive DIY loop, plus honest static reference numbers for the full 50,000-message comparison (including LangChain's `trimMessages`) that isn't run live here.

## What this does *not* demonstrate

- **No real LLM calls.** `summarizeOldest` uses a clearly-labeled deterministic demo summarizer (string truncation, not a model) — see [`docs/playground.md`](https://github.com/shivam039/token-budget/blob/main/docs/playground.md) for why, and how to wire a real one in your own code.
- **Token counts are estimates.** This page uses the library's built-in zero-dependency heuristic tokenizer (~4 chars/token), not any specific model's exact tokenizer — see [`docs/model-budgets.md`](https://github.com/shivam039/token-budget/blob/main/docs/model-budgets.md).
- **Not a benchmark of model intelligence.** This is a context-*management* library — it decides what stays in a message buffer, not how good a model's replies are.

## Built with

[`@shivam.dixit/token-budget`](https://www.npmjs.com/package/@shivam.dixit/token-budget) — TypeScript, MIT licensed, zero required runtime dependencies.

- GitHub: https://github.com/shivam039/token-budget
- npm: https://www.npmjs.com/package/@shivam.dixit/token-budget
- Full API reference: https://github.com/shivam039/token-budget/blob/main/docs/API.md
- Strategy guide: https://github.com/shivam039/token-budget/blob/main/docs/strategy-guide.md

## Run it locally

```sh
git clone https://github.com/shivam039/token-budget.git
cd token-budget
npm install
npm run build --workspace=@shivam.dixit/token-budget   # the playground imports the built core package
npm run dev --workspace=token-budget-playground
```

Production build:

```sh
npm run build --workspace=token-budget-playground   # outputs packages/token-budget-playground/dist/
```

## Deploying this Space

This Space uses the `static` SDK — Hugging Face serves whatever's at `app_file` (`dist/index.html`) directly, no server process. To (re)deploy:

```sh
npm run build --workspace=token-budget-playground
# then push the contents of packages/token-budget-playground/dist/
# as the Space repository's file tree, e.g.:
cd packages/token-budget-playground/dist
git init && git remote add space https://huggingface.co/spaces/<your-username>/llm-context-budget-playground
git add -A && git commit -m "Deploy playground build"
git push --force space main
```

No secrets or environment variables are required — the playground makes no network calls and needs no API key.

## License

MIT — see [`LICENSE`](https://github.com/shivam039/token-budget/blob/main/LICENSE).
