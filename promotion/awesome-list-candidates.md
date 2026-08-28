# Awesome-List Candidates for token-budget

Researched: 2026-08-28. Package: `@shivam.dixit/token-budget` (repo: https://github.com/shivam039/token-budget).

**Critical context that shaped every verdict below:** the `shivam039/token-budget` GitHub repo was created **2026-08-26 — two days ago** — and currently has **0 stars**. Several of the lists checked have explicit or informal bars against brand-new, unproven submissions. This doesn't disqualify scope-appropriate lists, but it is the single biggest real-world risk to any PR right now, bigger than scope fit. I've flagged it per-candidate below. Recommendation: let the repo accumulate at least a few weeks of history and some stars/npm downloads before opening these PRs, or expect some to bounce on a first attempt.

---

## STRONG candidates

### 1. pleasedodisturb/awesome-llm-token-optimization ⭐ best fit

- **URL:** https://github.com/pleasedodisturb/awesome-llm-token-optimization
- **Active?** Yes — pushed 2026-08-23 (5 days before this research), updated 2026-08-27. 63 stars, 21 forks, 6 open issues. Real, current curation activity.
- **Community:** 63 stars — modest but genuine, growing (created 2026-04-15, so ~50 stars gained in ~4 months).
- **Contribution mechanism:** PR to `README.md` directly (no YAML/data file). `CONTRIBUTING.md` present and explicit: fork → add entry in correct section, alphabetical → open PR with a short justification, one entry per PR preferred. **No self-promotion warning, no issue-first requirement, no star/age minimum.** Only exclusions: abandoned projects (12+ months no commits, doesn't apply to us), duplicates, tutorials without a cost angle.
- **Scope fit:** Excellent. The whole list is about reducing LLM token costs and managing context; it has a dedicated **`## Context Window Management`** section (with `### Key Research`, `### Provider Docs`, `### Chunking & Splitting` subsections). token-budget is a direct, on-topic tool for exactly this problem.
- **Duplicate check:** No existing entry does chat-history eviction/token-budget accounting. The one library-style entry in that section, `OpenProvence`, does RAG-chunk pruning/reranking — a different problem (retrieval-time compression, not multi-turn conversation eviction). No overlap.
- **Where it goes:** New entry in `## Context Window Management`, placed alphabetically within a subsection. There is no existing `### Libraries` subsection there — closest precedent is `### Chunking & Splitting`, which already mixes guides and one tool-with-a-star-badge (OpenProvence). Safest approach: open the PR proposing the entry go into `### Chunking & Splitting` (or propose it as a new `### Libraries` subsection if the maintainer prefers) — the PR description should make the placement question explicit since the section currently lacks a clean "libraries" bucket.
- **Suggested entry (matches their exact format** `- [Name](URL) - Description.` **+ star badge, per CONTRIBUTING.md):**
  ```
  - [token-budget](https://github.com/shivam039/token-budget) - TypeScript-first token accounting and eviction (drop-oldest, sliding-window, priority, summarize) to keep long-running LLM agent conversations inside their context window. ![Stars](https://img.shields.io/github/stars/shivam039/token-budget)
  ```
- **Risk:** Repo age/star count (2 days, 0 stars) isn't a written disqualifier here, but a sharp-eyed maintainer curating a "high-quality, directly relevant" list could still push back on a brand-new, unstarred package. Confidence this is a *scope-appropriate* fit: high. Confidence a same-week PR gets merged without pushback: moderate.

### 2. congvmit/awesome-llm-token-reduction

- **URL:** https://github.com/congvmit/awesome-llm-token-reduction
- **Active?** Marginal. Created 2026-06-13, single push that day, `updated_at` 2026-07-27 is likely just a star/watch event, not a commit — I could not confirm further commits beyond the initial one. It's not abandoned in spirit (recent creation, current topic, "PRs welcome" badge, live Star History widget) but it also hasn't visibly been curated since day one.
- **Community:** Small — 6 stars, 2 forks, 2 open issues. Real but low-visibility.
- **Contribution mechanism:** PR to `README.md`. `CONTRIBUTING.md` present: fork → add entry to the right section → open PR explaining why it fits. Entry format is a single bullet with a trailing star badge. Inclusion bar requires **at least one** of: actively maintained, notable citations/paper, or notable adoption — and rejects dead links, off-topic entries, duplicates, and "pure marketing" pages. No explicit anti-self-promotion clause, no star/age minimum.
- **Scope fit:** Excellent — has a dedicated **`## Context & Memory Management`** section described as "Persist and retrieve only what matters, so sessions stay short instead of replaying everything," which is almost a description of token-budget's job.
- **Duplicate check:** Existing entries in that section are `codex-agent-mem`, `mnemosyne`, `Zep` — all retrieval/persistent-memory tools, not chat-history token-budget/eviction libraries. No direct duplicate.
- **Where it goes:** `## Context & Memory Management` section, alphabetical order (after `codex-agent-mem`, before `mnemosyne`).
- **Suggested entry (exact format used in that section):**
  ```
  - [token-budget](https://github.com/shivam039/token-budget) - Model-agnostic token accounting and eviction strategies to keep long-running LLM agent conversations inside their context window. ![Stars](https://img.shields.io/github/stars/shivam039/token-budget?style=social)
  ```
- **Verdict:** Genuine scope fit, but weaker than #1 on community/proof-of-active-curation. Worth doing, but rank it second — a 6-star list reviewing a 0-star submission is a thinner signal than a 63-star list doing the same.

---

## Moderate / worth a look but flagged

### kyrolabs/awesome-langchain

- **URL:** https://github.com/kyrolabs/awesome-langchain
- **Active?** Yes, very — 9,510 stars, 940 forks, pushed 2026-08-11, updated 2026-08-27.
- **Contribution mechanism:** PR directly to `README.md` (edit via GitHub UI is even documented). `contributing.md`: "Submit a PR, not an issue." **Explicit warning: PRs are auto-closed for brand-new repos lacking history, brand-new contributors, or wrong-category placement.** This is a direct, stated risk given the token-budget repo is 2 days old.
- **Scope fit:** Reasonable but not perfect — this is a LangChain-ecosystem list (Tools/Services, Agents, Templates, Platforms, Open Source Projects). token-budget isn't built on LangChain; it ships an *optional* `token-budget-langchain` adapter, similar in spirit to how the list already includes general-purpose infra like `GPTCache` (semantic cache) under Services, or memory tools like `Mem0`/`Letta`/`Memary`. A plausible but secondary fit, not a "built for LangChain" tool.
- **Duplicate check:** No direct duplicate — `Mem0`, `Letta`, `Memary` are memory/persistence layers, not token-budget/eviction accounting.
- **Verdict:** Include as a secondary target, not a top pick. The explicit "auto-closed for brand-new repos/contributors" rule combined with the imperfect scope fit (adapter-only relationship to LangChain) makes this a lower-confidence bet than the two token/context-specific lists above. Recommend waiting until the repo has some history before trying this one specifically.

---

## Rejected / weak — brief notes

- **tensorchord/Awesome-LLMOps** (5,922 stars, active) — No dedicated context/token-management category; the relevant `## LLMOps` section is a broad table of full LLMOps *platforms* (Agenta, etc.), not narrow SDKs like token-budget. Weak scope fit.
- **InftyAI/Awesome-LLMOps** (260 stars, active) — Sections are Inference/Orchestration/Runtime/Training only, nothing for context/memory. Contribution is "simply opening an issue," not a PR — doesn't match the standard self-submission-via-PR mechanism. Weak fit + non-standard process.
- **e2b-dev/awesome-ai-agents** (29,716 stars, very active) — Huge community, but wrong scope: it catalogs actual autonomous *agents* (AutoGPT-style projects), not supporting SDKs/libraries. Only memory-adjacent entry is MemGPT, itself a full agent system. token-budget would be a category mismatch here.
- **bradAGI/awesome-cli-coding-agents** (1,097 stars, very active — pushed within 2 days) — Scope is CLI coding agents (Claude Code, Codex CLI, Aider, etc.) and their orchestration harnesses, not general-purpose libraries. token-budget doesn't belong in "terminal-native coding agents" or "harnesses."
- **sindresorhus/awesome-nodejs** (66,636 stars) — Explicit hard rule in `contributing.md`: *"The submitted project should be more than 30 days old and the repo should have at least 100 stars."* token-budget fails both right now (2 days old, 0 stars) — a flat disqualifier regardless of scope quality. Revisit in ~4-8 weeks once the repo has traction. Also note: general Node.js list is a broad-scope, low-priority target even once eligible.
- **vercel-labs/awesome-ai** — Not actually a curated README list; it's a CLI + registry tool project ("A CLI and terminal UI for adding AI agents, tools, and prompts to your projects from a curated registry"). No PR-to-README mechanism exists in the form this task is looking for. Wrong format entirely, not a rejection on merit.
- **sourcegraph/awesome-code-ai** — Repository is `archived: true` on GitHub (confirmed via API). Effectively read-only/no longer accepting contributions despite a stale-but-recent push date. Inactive for this purpose.
- **suin/awesome-typescript, awesomelistsio/awesome-typescript, dzharii/awesome-typescript** — Not deep-checked; per the task's own framing, a general "awesome TypeScript" list is a weaker fit than a token/context-specific one, and time was better spent verifying the on-scope candidates above. Low priority — worth a light pass later if capacity allows, but general-purpose TS lists won't move the needle like the token/context-specific lists will.

---

## Summary ranking

| Rank | List | Stars | Last push | Scope fit | Contribution risk |
|---|---|---|---|---|---|
| 1 | pleasedodisturb/awesome-llm-token-optimization | 63 | 2026-08-23 | Excellent | Low |
| 2 | congvmit/awesome-llm-token-reduction | 6 | 2026-06-13 (single push) | Excellent | Low, but thin community |
| 3 | kyrolabs/awesome-langchain | 9,510 | 2026-08-11 | Secondary (adapter-only) | Medium — explicit new-repo auto-close rule |

Everything else checked is a reject: wrong scope (agent/harness catalogs), wrong mechanism (registry tool, not a list), archived, or explicitly disqualified by a stars/age rule.
