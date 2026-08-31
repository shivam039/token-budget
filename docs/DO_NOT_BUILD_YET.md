# Do not build yet

A scope-creep guard. Everything below is explicitly deferred — not
rejected forever, just not justified by current evidence. Before
building any of these, re-read `docs/USER_VALIDATION.md`'s targets: if
real, unrelated developers haven't asked for it, it doesn't get built,
no matter how good an idea it seems in the abstract.

| Item | Why deferred |
| --- | --- |
| **MCP client middleware** | Not the same thing as `token-budget-mcp` (built — see below). This is a different, still-unbuilt opportunity: an adapter that wraps an MCP *client's* tool-call responses, applying eviction/truncation to what comes back from MCP tools specifically. Needs a real MCP-using project to design against — see `docs/MCP.md`'s closing section. |
| **VS Code extension** | No evidence of demand, and it's IDE tooling, not context management — doesn't advance the coding-agent-*library* use case this project is actually built for. |
| **Vector database integration** | Out of category — see `docs/comparisons.md`'s taxonomy. Retrieval/embedding storage is a memory-system's job, not a context-budget-management job. `token-budget-embeddings` already provides the one integration point that's actually in scope: a pluggable `Scorer` for the `semanticRelevance` strategy, bring-your-own embeddings. |
| **Full Python rewrite to parity** | P1, not P0 — see `docs/PYTHON_ROADMAP.md`. Acquiring the JS package's first real users matters more right now than doubling the surface area to maintain. |
| **Arbitrary new tokenizer packages** | The existing set (`token-budget-tiktoken`, `token-budget-claude`, the built-in estimator, structural `Tokenizer` typing for anything else) covers real usage. A new tokenizer package needs a specific model/provider gap a real user has hit, not "tokenizer X exists and we don't wrap it." |
| **More provider/framework adapters** (Gemini, Mistral, Cohere, etc.) | The existing 4 (OpenAI, Anthropic, Vercel AI SDK, LangChain.js) cover the large majority of real usage, and `COMPATIBILITY.md`'s structural-typing approach already lets a developer use the raw `TokenBudget` API against an unsupported provider without a dedicated adapter. Build the next one when a real user's actual code needs it. |
| **Generic chatbot functionality** | Out of scope by design — this is context-management infrastructure for agent loops specifically, not a chatbot framework. Genericizing toward "any chat app" dilutes the coding-agent positioning without adding real capability. |
| **A giant memory platform** (long-term recall, cross-session knowledge, user profiles) | A different category entirely — "memory systems" in `docs/comparisons.md`'s taxonomy, not "context budget management." `token-budget` manages what stays inside a token budget *right now*; it does not store or retrieve long-term memory, and conflating the two would make both worse. |
| **A hosted/SaaS dashboard** | This is a client-side library, and that's the point — it runs the same way against every provider, with no network dependency and no data leaving the caller's process. A hosted dashboard is a different product with a different trust model. |
| **A generic tool-output framework** (truncation *strategies*, streaming summarizer pipelines, pluggable tool-output transformers) | `truncateToolOutput()` (added this pass) is deliberately a single small primitive, not a framework — see the Phase 3 notes in `docs/PRODUCT_AUDIT.md`. If real usage shows it needs more shapes (different truncation heuristics, streaming support), extend that one primitive; don't build a parallel system around it. |
| **A live, in-browser eviction playground** (paste/build messages, run a strategy, visualize retained vs. evicted with `explain()`) | Real value, but meaningfully more scope than what exists: it would need the core package bundled for browser use plus an interactive message-building UI, not just a viewer. `token-budget-devtools` already covers the adjacent, much smaller job — a static Vite app that visualizes a `serialize()` dump (messages, token counts, pinned markers) — it just doesn't yet render `explain()`'s strategy trace from that same dump. Extending devtools to show the eviction trace it already has the data for is the low-maintenance next step, if this is ever prioritized; building a new interactive simulator from scratch is not justified by current evidence, per this doc's own bar. |

## How to un-defer something on this list

1. A real, unrelated developer (not the maintainer) asks for it, with a
   concrete use case — tracked per `docs/USER_VALIDATION.md`.
2. The smallest version of it is scoped and written down before any code
   — what exactly is being built, and why the existing API can't already
   do it.
3. It doesn't duplicate something `docs/PRODUCT_AUDIT.md` already lists
   as existing.

Absent all three, it stays on this list.
