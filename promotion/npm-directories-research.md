# Phase A — npm / JavaScript Ecosystem Discovery

Research date: 2026-08-28. Package verified live on the npm registry: `@shivam.dixit/token-budget`, latest version `0.1.4`, MIT license, keywords already set to `llm, tokens, token-counting, context-window, context-management, compaction, openai, anthropic, langchain, vercel-ai, ai-agents, chat`.

Note on method: `libraries.io` and `api.npms.io` are blocked at the network egress-proxy level in this environment (confirmed via the proxy's own status log — `connect_rejected` / gateway 403), not just by the fetch tool, so those two could not be checked directly. Findings for them below rely on their public documentation and general search results instead of a live page fetch.

## 1. npm registry / npmjs.com

- **Fit:** Perfect — this is the canonical home of the package.
- **Free:** Yes, already published.
- **Action needed:** None to "list" it (it's already there). The only lever is **discoverability inputs npm's search already uses**: the `keywords` array in `package.json` and the README. Current keywords are solid but could be broadened slightly — e.g. add `eviction`, `sliding-window`, `summarization`, `tool-calling`, `typescript`, `agents`, `streaming`, `prompt-engineering` — since npm search matches on keywords and description text, and none of these terms currently appear in the keyword list even though they describe real features (drop-oldest, sliding-window, priority, summarize strategies; tool-call/tool-result pairing).
- **Verdict:** No submission needed — optimize keywords/description instead. Zero cost, self-service, immediate.

## 2. libraries.io

- **What it is:** A free, non-commercial aggregator that auto-crawls package registries (npm included) via an update stream — **it does not accept manual submissions for indexing**. Packages appear automatically once libraries.io's npm crawler picks them up (documented behavior; could not confirm the live page for this specific package because the domain is blocked in this environment).
- **Free:** Yes, entirely free, no account needed to appear.
- **Action needed:** None. There is nothing to "submit" — if it isn't indexed yet, it will be on the next crawl pass, not something to chase.
- **Verdict:** Passive/automatic. Not a task-list item.

## 3. npms.io

- **What it is:** Same story as libraries.io — an open-source npm search/quality-scoring index that ingests directly from the npm registry on a rolling basis (documented as automatic; live page not directly verifiable here, domain blocked).
- **Free:** Yes.
- **Action needed:** None — no submission mechanism exists; publishing to npm is the only "action."
- **Verdict:** Passive/automatic. Not a task-list item.

## 4. GitHub repo metadata & GitHub Topics

- **Current state (verified by fetching the repo page):** The repo's "About" sidebar shows **"No description, website, or topics provided"** — despite a comprehensive README. This is a real, fixable gap.
- **Why it matters:** GitHub Topics pages are themselves a discovery surface with existing traffic — e.g. `github.com/topics/context-window` and `github.com/topics/token-usage` already list comparable libraries (context-window packers, token-budget SDKs, context compilers for TS/JS agents). A `token-budget` topic page also already exists on GitHub with other projects using that exact tag.
- **Free / self-service:** Yes — repo owner sets this directly in repo Settings, takes under a minute.
- **Recommended topics to add:** `llm`, `typescript`, `token-counting`, `context-window`, `ai-agents`, `openai`, `anthropic`, `langchain`, `context-management`, `npm-package` (mirrors the npm keywords for consistency).
- **Also set:** the repo's one-line "description" and "website" fields in About (currently blank) — cheap and directly affects how the repo shows up in GitHub's own search and in topic listings.
- **Verdict:** Concrete, free, high-value action item — currently an unforced gap.

## 5. Curated "awesome list" repos on GitHub (found during research, strong fit)

These aren't in the original brief but turned up directly relevant during ecosystem research, and they're a legitimate, free, self-service discovery channel via PR:

- **`congvmit/awesome-llm-token-reduction`** — curated list of techniques/tools for reducing LLM token usage, explicitly for agents like Claude Code, Copilot, Cursor. Has a "Prompt Compression Libraries" / context-management section. Contribution rule: one entry per PR, present-tense one-line description, alphabetical placement, link must resolve.
- **`pleasedodisturb/awesome-llm-token-optimization`** — curated list of strategies/tools for cutting LLM token costs in production, with a dedicated "Context Window Management" section. Has a CONTRIBUTING.md.
- **Fit:** Strong — token-budget's actual function (keeping conversations under a token budget via eviction/summarization strategies) is exactly what both lists curate.
- **Verdict:** Worth a PR to both. Free, low-effort, high-relevance audience (people already searching for exactly this kind of tool).

## Summary / action list for Phase A

| Item | Free? | Submission needed? | Worth doing? |
|---|---|---|---|
| npm registry | Yes | Already done | Tune keywords only |
| libraries.io | Yes | No (auto-indexed) | No action |
| npms.io | Yes | No (auto-indexed) | No action |
| GitHub repo description + Topics | Yes | Self-service, repo settings | **Yes — do this first, it's currently blank** |
| awesome-llm-token-reduction (GitHub) | Yes | PR | **Yes** |
| awesome-llm-token-optimization (GitHub) | Yes | PR | **Yes** |
