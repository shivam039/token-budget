# SEO/AEO audit

What exists, what's missing, and — just as important — what this pass
deliberately did NOT add, so the reasoning survives past this commit.
Written before making changes, per the standing rule for this kind of
pass: audit first, don't duplicate what's already there.

## Current strengths

- **The core positioning is already clear and consistent** everywhere
  it appears — README, `package.json` description, `docs/comparisons.md`
  — "keep long-running AI agents inside their context window," not "a
  tokenizer." No repositioning needed.
- **The honesty the product depends on is already real**, not just
  claimed: `docs/benchmarks.md` explicitly states `token-budget-tiktoken`
  is *slower* than `gpt-tokenizer` at raw counting, with exact numbers;
  `docs/comparisons.md` never claims to "beat" LangChain, only to cover
  a different, narrower job better for a specific need. This matters for
  AEO specifically — answer engines and careful readers both penalize
  overclaiming, and this project already doesn't do that.
- **The "why not X" questions are already answered in the README**, just
  as prose sections rather than extractable Q&A: why not a tokenizer,
  why not `messages.shift()`, why not LangChain, why not provider-native
  truncation. The content is right; the format wasn't optimized for an
  answer engine to quote a self-contained snippet.
- **`docs/comparisons.md`** already has a "categories" table (tokenizers
  vs. memory systems vs. agent frameworks vs. compression systems vs.
  token-budget) plus four full honest comparisons (DIY, `gpt-tokenizer`,
  LangChain, provider-native truncation).
- **`docs/benchmarks.md`** already separates raw tokenizer throughput
  from context-management performance, states hardware/versions/
  methodology/caveats for every number, and reports where the numbers
  don't cover a scenario well (LangChain's 50k-message variance).
- **9 adapter READMEs** each independently document install, a minimal
  example, an API table, and (as of the prior pass) a link back to the
  main repo and compatibility matrix.
- **A real, runnable, deterministic example**
  (`examples/coding-agent-context`) demonstrates the actual product
  value in under a minute, no API key required.
- **`COOKBOOK.md`** has four tested recipes (customer support, coding
  agent, RAG chat, long-form writing) — genuine, non-marketing technical
  content.

## Current weaknesses

- **No content is structured as direct-answer Q&A.** Everything that
  answers a question does so inside a prose paragraph under a
  conversational heading (`## Why not just use a tokenizer?`). This is
  fine for a human reading top-to-bottom, but an answer engine looking
  to quote a short, self-contained answer has to extract it from prose
  — a dedicated FAQ with "question, then a one-line direct answer, then
  detail" is a better shape for that specific job, without changing the
  README's actual reading experience.
- **No page's title/URL matches a likely long-tail search query
  directly.** The content that would answer "how do you manage context
  in a long-running AI agent" exists, but it's spread across the
  README's intro, `docs/comparisons.md`'s categories table, and the
  coding-agent example — no single page is *about* that exact question.
- **Adapter `package.json` keywords are generic**, not ecosystem-
  specific: `token-budget-openai`'s keywords are `["llm", "tokens",
  "openai", "gpt", "token-budget"]` — missing the actual phrases a
  developer integrating OpenAI would search, like "OpenAI context
  window" or "OpenAI token budget."
- **The gpt-tokenizer and LangChain comparisons don't have their own
  page/URL** — they're anchors inside one shared `comparisons.md`. A
  developer (or answer engine) specifically asking "token-budget vs
  gpt-tokenizer" has no page whose title is exactly that.
- **No `llms.txt`** — trivial to add, not currently present.
- **GitHub repository topics/description are unverified** — this audit
  found no tool in this session capable of reading or setting them (no
  repo-settings API exposed by the available GitHub MCP tools), so this
  is a documented recommendation for manual action, not a verified gap
  or a completed fix. Recommended values (Settings → General → Topics,
  and the "Edit" pencil next to the repo description), using only
  topics genuinely supported by the project — no stuffing:

  - **Description**: "Context-management infrastructure for long-running
    AI agents — token budgets, context eviction, tool-call preservation,
    and explainable context decisions."
  - **Topics**: `ai-agents`, `llm`, `context-management`,
    `context-window`, `token-budget`, `coding-agents`, `llm-context`,
    `typescript`, `tool-calling`, `autonomous-agents`

  `agent-frameworks` (from the task's suggested list) was deliberately
  left off — this project is explicitly *not* an agent framework, and
  using that topic would misrepresent it to anyone browsing by topic.

## Keyword/topic opportunities (real, not stuffed)

Already present, verified by grep across README/docs/package.json:
`context-window`, `context-management`, `token budget`, `ai-agents`,
`coding-agents` (added last pass), `autonomous-agents` (added last
pass), `tool-calls`.

Missing, real, worth adding: `context eviction` (have `context-eviction`
as a keyword already but not as README prose), `context trimming` (same
situation), `tool output truncation` (a genuinely new, specific
capability — `truncateToolOutput()` — with almost no dedicated
searchable prose), `LLM context window` (the generic phrasing, not just
`context-window`), per-adapter ecosystem terms (see Phase 2 below).

## Pages worth creating

- **`docs/guides/ai-agent-context-management.md`** — the pillar page
  for the exact question the product exists to answer. Nothing else in
  the repo owns this question as a dedicated page/URL.
- **`docs/guides/tool-output-context-management.md`** — `truncateToolOutput()`
  is a real, recent, specific capability with API docs and a COOKBOOK
  recipe, but no page answering the actual question ("how do you keep
  one huge tool result from blowing your budget") directly.
- **`docs/comparisons/token-budget-vs-gpt-tokenizer.md`** and
  **`docs/comparisons/token-budget-vs-langchain.md`** — dedicated pages
  for the two comparisons developers actually search by name, expanding
  (not duplicating) the existing summaries in `docs/comparisons.md` with
  page-specific Q&A.
- **`docs/FAQ.md`** — direct-answer-first Q&A for the specific questions
  in Phase 6, using only claims the product can actually back up.
- **`llms.txt`** (repo root) — a small navigation pointer, not an SEO
  claim.

## Pages NOT worth creating

- **`docs/guides/llm-context-window-management.md`** — would
  substantially duplicate the new pillar page
  (`ai-agent-context-management.md`) and the README's "What this
  actually does" section. The specific question ("how do you prevent an
  LLM context window from overflowing") is answered in the FAQ instead,
  linking to the pillar page for depth.
- **`docs/guides/llm-context-trimming.md`** — would substantially
  duplicate the README's "Why not just write this myself?" section and
  `docs/comparisons.md`'s DIY comparison, both of which already explain
  why naive FIFO trimming breaks down. Covered by an FAQ entry linking
  to that existing content instead of re-explaining it in a third place.
- **`docs/guides/coding-agent-context-management.md`** — would
  substantially duplicate `examples/coding-agent-context/README.md`
  (already a focused, dedicated page answering exactly this) and the
  root README's "realistic example" section. The FAQ and the pillar page
  both link directly to the existing example instead of restating it.
- **`docs/benchmarks/context-management-benchmark.md`** — `docs/benchmarks.md`
  already *is* this exact content: environment, workload, message
  counts, token counter, eviction methodology, compared implementations,
  results, and limitations, with the raw tokenizer benchmark kept
  explicitly separate. Creating a second file would be closer to
  duplication than a genuinely new page. No action — verified this file
  already satisfies Phase 11's requirements as written.
- **A documentation website** — GitHub-rendered Markdown plus the
  per-package npm READMEs are currently sufficient for this project's
  size and traffic. See "Documentation website" below for the assessed
  future structure, not built now.
- **Structured data (schema.org)** — no crawlable website exists to
  attach it to; GitHub's and npm's own pages are not sites this project
  controls the markup of. Building site infrastructure solely to carry
  schema would be exactly the kind of scope creep this project's own
  `docs/DO_NOT_BUILD_YET.md` exists to prevent.

## Documentation website (assessed, not built)

If this project's traffic or content volume ever justifies a real docs
site, the lowest-risk path is a static-site generator that consumes
these same Markdown files with minimal reformatting (VitePress or
Docusaurus, both of which can point directly at `docs/` and
`packages/*/README.md` with little restructuring) — not a rewrite. Not
justified today: the audience is developers who are comfortable
navigating GitHub, npm already renders every package's README on its
own page, and the content volume doesn't yet exceed what GitHub's own
Markdown rendering and file tree handle well.

## Implementation completed by this task

See the root commit for this pass and the final report delivered at the
end of the session for the complete, verified list — this section
exists so the audit and the implementation stay in the same file for
future reference, updated here rather than left to go stale:

- Adapter `package.json` keywords: ecosystem-specific terms per adapter
  (OpenAI, Anthropic, LangChain, Vercel AI, tiktoken, etc.)
- `docs/FAQ.md` — new
- `docs/guides/ai-agent-context-management.md` — new
- `docs/guides/tool-output-context-management.md` — new
- `docs/comparisons/token-budget-vs-gpt-tokenizer.md` — new
- `docs/comparisons/token-budget-vs-langchain.md` — new
- `llms.txt` — new
- Root README: added compact, extractable Q&A blocks for "is this a
  tokenizer" / "is this an agent framework" alongside the existing prose
  sections (not replacing them), plus internal links to the new guide/
  FAQ/comparison pages
- Internal linking pass tying guides ↔ FAQ ↔ comparisons ↔ benchmarks ↔
  examples ↔ adapter READMEs into one coherent structure
