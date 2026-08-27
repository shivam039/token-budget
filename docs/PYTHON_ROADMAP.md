# Python roadmap

**Status: P1. Not prioritized above acquiring the JS package's first
real users.** This document is a snapshot of what exists, what's
missing, and what would need to be true before investing further —
not a commitment to a timeline.

## What exists today (`packages/token-budget-py`)

A real, partial port — not a stub:

- `TokenBudget`: `add_message()`, `get_messages()`, `stats()`,
  `get_context()`, `explain()`.
- Built-in `estimate` tokenizer (same `chars_per_token` heuristic and
  default ratio as the JS package); bring your own `Tokenizer` subclass
  for anything else.
- Strategies: `drop_oldest()`, `sliding_window()`, `priority()`,
  `chain()`, and a single-pass `summarize_oldest(summarizer)`.
- Synchronous only — no `asyncio`, unlike the JS package's async
  `getContext()`. `summarizer` must be a plain synchronous callable.

## What's missing, and why it matters

In priority order, based on what a real coding/autonomous-agent user
would hit first:

1. **Tool-call/tool-result atomicity** (`toolCallId` grouping). This is
   the single most important gap — it's the JS package's strongest
   differentiator for exactly the coding-agent use case this project is
   targeting, and it doesn't exist in Python at all yet. A Python coding
   agent using this port today could have a tool result orphaned by
   eviction, the exact failure mode the JS package is built to prevent.
2. **Recursive re-summarization** (`maxSummaryDepth`/
   `onMaxDepthReached`) — a summary is treated like any other message on
   a later call, never folded into a deeper summary. Matters for
   sessions long enough to summarize more than once.
3. **Events, streaming, persistence** (`serialize()`/`deserialize()`),
   **cost/governance accounting** — Phase 3 features on the JS side,
   entirely absent in Python.
4. **An exact tokenizer** — no `tiktoken`-backed option; Python users are
   limited to the heuristic estimator or their own `Tokenizer`.
5. **Not published to PyPI** — installable today only via
   `pip install -e packages/token-budget-py` from a repo checkout. No
   `pip install token-budget` exists.

## API parity assessment

Roughly: the *shape* of the core API (config → add messages → get a
budgeted context → explain) is there and matches the JS package's
mental model. The *guarantees* that make token-budget specifically
useful for agents — atomic tool-call pairing above all — are not yet
ported. A Python user today gets a token-aware message trimmer with
pluggable strategies; they don't yet get the agent-safety guarantees
that are this project's actual differentiator.

## Demand evidence

None collected yet, specifically. No GitHub issue, no outreach response,
no download-source signal currently points at Python demand — this
roadmap exists because the port was already started (Phase 3 of the
original build), not because a user asked for it.

## What would justify investing further

- A real user (found via `docs/FIRST_USERS.md`) building a Python coding
  or autonomous agent who hits the tool-call-orphaning problem this
  library exists to prevent, and who would use a Python port if it had
  parity.
- Multiple independent requests for `pip install token-budget` — the
  `USER_VALIDATION.md` metric of "3 independent feature requests" from
  real users applies here as anywhere else.

Until then: keep the port as-is (real, but explicitly partial, per its
own README), don't publish to PyPI (an unmaintained-looking PyPI
package with "not yet at parity" in its README is worse for the
project's credibility than no PyPI package at all), and don't invest
further engineering time here ahead of JS user acquisition.
