# token-budget-context-management (Agent Skill)

An [Agent Skill](https://github.com/shivam039/token-budget) that teaches
an AI coding agent to **diagnose LLM context-management problems and fix
them correctly** — using [`@shivam.dixit/token-budget`](https://www.npmjs.com/package/@shivam.dixit/token-budget)
when it's the right tool, and explicitly saying so when it isn't.

This Skill is not a product pitch packaged as documentation. Its job is
to make an agent better at solving context-window problems in general —
diagnosing the real cause, inspecting the host application's actual
architecture, choosing an appropriate strategy, and testing the result —
with `token-budget` as one possible, well-justified outcome of that
process, not the starting assumption.

## What it does

Given a report like *"my agent keeps hitting the context window,"* the
Skill walks an agent through:

1. Confirming this is actually a context-size problem (not retrieval
   quality, not model quality, not a pure tokenization question).
2. Inspecting the host app's real architecture — where conversation
   state lives, where it becomes model input.
3. Computing the real available budget (model window minus output
   reservation minus fixed overhead — never just the raw context
   window).
4. Identifying what must be protected (`pinned`/`priority`) and which
   messages form tool-call/tool-result pairs (`toolCallId`).
5. Choosing a strategy with an honest trade-off, not a default guess.
6. Installing only the packages actually needed.
7. Integrating at one clear boundary instead of scattering trimming
   logic through the app.
8. Testing the result against a concrete checklist.
9. Explaining the outcome via `budget.explain()` instead of guessing.

And, just as importantly, it teaches the agent to recognize when *none*
of this applies — see `SKILL.md`'s "When this Skill should NOT reach for
token-budget."

## Supported agent ecosystem

Targets the **Agent Skills / `SKILL.md` convention** used by Claude Code
and Claude.ai (YAML frontmatter with `name`/`description`, a Markdown
body, and progressive-disclosure `references/`/`examples/` directories
loaded on demand). This is the same format documented and produced by
Anthropic's `skill-creator` tooling, so it's portable to any environment
that reads that convention, and packageable into a distributable
`.skill` file with `skill-creator`'s `package_skill.py`.

## Installation

Copy this directory into wherever the target agent looks for skills:

```sh
# Claude Code / Claude.ai — user-level, available in every project:
cp -r skills/token-budget-context-management ~/.claude/skills/

# Or project-level, active only inside one repo:
cp -r skills/token-budget-context-management <your-project>/.claude/skills/
```

No build step, no dependencies of its own — it's documentation the
agent reads, not code that runs.

A pre-packaged, distributable archive is also checked in at
[`packaged/token-budget-context-management.skill`](packaged/token-budget-context-management.skill)
(built with `skill-creator`'s `package_skill.py`) — an environment that
supports installing a `.skill` file directly (e.g. dropping it onto a
"Save skill" prompt) can use that instead of copying the directory by
hand. It's a plain zip of this same directory; regenerate it after any
edit here with:

```sh
python -m scripts.package_skill skills/token-budget-context-management
```
(run from Anthropic's `skill-creator` tooling — this is what produced
the archive checked in here).

### Using this with Cursor

Cursor doesn't read `SKILL.md` natively — its equivalent is a `.mdc`
rule file under `.cursor/rules/` (YAML frontmatter with `description`,
optional `globs`, and `alwaysApply`, then a Markdown body; see
[Cursor's rules docs](https://cursor.com/docs/rules)). To adapt this
Skill: copy this whole directory into the target project (e.g. as
`.cursor/skills/token-budget-context-management/`, so `references/`
and `examples/` stay reachable as files Cursor's agent can open), then
add a thin pointer rule:

```
.cursor/rules/token-budget-context-management.mdc
---
description: Diagnose and fix LLM context-window/conversation-growth problems — see the full guide before touching context/eviction/trimming code.
alwaysApply: false
---
Before writing or changing any LLM context-management code (trimming,
eviction, token budgets, pinned messages, tool-call handling), read
.cursor/skills/token-budget-context-management/SKILL.md in full, and
its references/ and examples/ files as it points you to.
```

This isn't a tested integration — Cursor's rule-activation heuristics
and file-reading behavior differ from Claude Code's Skill loader, so
treat it as a starting point to adapt, not a guaranteed drop-in.

## Usage

Once installed, nothing needs to be invoked explicitly — the Skill's
`description` frontmatter is what an agent uses to decide when to
consult it. Just describe the actual problem.

### Example activation prompts

```
My agent keeps exceeding the context window.
```
```
Our conversation history is growing indefinitely.
```
```
We need to trim old messages but preserve tool calls.
```
```
Replace our manual message slicing with a proper token budget.
```
```
Keep the system prompt while managing conversation history.
```

### Example prompts this Skill should NOT act on by installing token-budget

```
How many tokens is this string? (a pure tokenization question, not context management)
```
```
Our RAG results are irrelevant. (a retrieval-quality problem)
```
The Skill's job in these cases is to say so, not to reach for the
package anyway.

## Architecture

```
skills/token-budget-context-management/
├── SKILL.md                          — activation logic, diagnostic workflow, decision tree
├── README.md                         — this file
├── references/
│   ├── strategy-selection.md         — all 6 strategies, config, trade-offs
│   ├── integration-patterns.md       — the context-boundary architecture, persistence, streaming
│   ├── anti-patterns.md              — DIY patterns that look fine and fail, and why
│   ├── migration-from-diy.md         — converting an existing manual implementation
│   └── troubleshooting.md            — diagnosing four common post-integration symptoms
└── examples/
    ├── openai.md
    ├── anthropic.md
    ├── vercel-ai.md
    └── langchain.md
```

`SKILL.md` stays short and is always loaded when the Skill activates;
everything under `references/` and `examples/` is read on demand, only
when the situation calls for that specific depth.

## Contributing

This Skill is maintained alongside the library it documents, in the
same repository: https://github.com/shivam039/token-budget. Every API
signature quoted in it is read from `packages/token-budget`'s actual
TypeScript source, not reconstructed from memory — if a future release
changes a signature quoted here, that's a real inconsistency to fix,
not just this Skill going stale silently. Please open an issue or PR
against the main repository if you find one.

## Limitations

- Validated against `@shivam.dixit/token-budget` v0.1.5 — a future
  breaking release may change signatures this Skill quotes; check
  `docs/API.md` in the main repository if something doesn't match.
- Framework coverage is limited to the adapters that actually exist
  today (OpenAI, Anthropic, Vercel AI SDK, LangChain.js) — a host app on
  a different framework needs the general pattern in
  `references/integration-patterns.md`, not a dedicated example file.
- This Skill teaches judgment, not a rule an agent can apply
  mechanically without reading the host application's actual code — the
  diagnostic steps in `SKILL.md` assume the agent will genuinely inspect
  the app, not pattern-match on keywords alone.
