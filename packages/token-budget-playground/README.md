---
title: LLM Context Budget Playground
emoji: 🧮
colorFrom: indigo
colorTo: blue
sdk: static
app_file: index.html
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
- **Set a budget and strategy** — `dropOldest`, `slidingWindow`, `priority`, `summarizeOldest` (using a deterministic demo summarizer, since this runs with no API key and no server calls — see below), or `smartPriority` (zero-config: auto-pins the system prompt + current query, drops tool-call noise first).
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

This Space uses the `static` SDK — Hugging Face serves whatever's at `app_file` (`index.html`, at the Space repo's root — the deploy step copies this package's built `dist/` *contents* to that root, not the `dist/` folder itself) directly, no server process. No secrets or environment variables are required by the *playground itself* — it makes no network calls and needs no API key at runtime.

### Automatic (recommended): GitHub Actions

[`.github/workflows/deploy-playground.yml`](../../.github/workflows/deploy-playground.yml)
builds this package and pushes `dist/` to the Space on every push to
`main` that touches the playground (or on demand via the Actions tab's
"Run workflow" button). One-time setup:

1. Generate a Hugging Face access token with write access to the target Space at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. In the GitHub repo: Settings → Secrets and variables → Actions → New repository secret → name it `HF_TOKEN`, paste the token.
3. Push to `main` (or trigger the workflow manually) — it deploys to `huggingface.co/spaces/shivam039-dev/llm-context-budget-playground`. Change the `HF_SPACE` env var in the workflow file if deploying to a different Space.

Without the secret, the workflow still runs and passes — it just skips the deploy step with a clear notice instead of failing.

### Manual

```sh
npm run build --workspace=token-budget-playground
cp packages/token-budget-playground/README.md packages/token-budget-playground/dist/README.md   # carries the Space's sdk/license front matter
cd packages/token-budget-playground/dist
git init && git remote add space https://huggingface.co/spaces/<your-username>/llm-context-budget-playground
git add -A && git commit -m "Deploy playground build"
git push --force space main
```

## License

MIT — see [`LICENSE`](https://github.com/shivam039/token-budget/blob/main/LICENSE).
