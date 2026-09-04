# token-budget-context-management (Agent Skill)

An Agent Skill, from the [`token-budget`](https://github.com/shivam039/token-budget)
project, that teaches an AI coding agent to **diagnose LLM
context-management problems and fix them correctly** — using
[`@shivam.dixit/token-budget`](https://www.npmjs.com/package/@shivam.dixit/token-budget)
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

Targets the **[Agent Skills specification](https://agentskills.io/specification)**
— a `SKILL.md` file with YAML frontmatter (`name`/`description` are
the only required fields; this Skill uses just those two) and a
Markdown body, plus `references/` for documentation loaded on demand
(this Skill also uses its own `examples/` directory for
framework-integration guides — not a spec-named convention, just a
clearer name for that particular content than `references/` would be).
Claude Code, Claude.ai, and Cursor all read this format natively; it's
portable to any other environment that does the same, and packageable
into a distributable `.skill` file with Anthropic's `skill-creator`
tooling's `package_skill.py`.

## Installation

Copy this directory into wherever the target agent looks for skills.
Claude Code, Claude.ai, and Cursor all read the same `SKILL.md`
convention, and Cursor additionally discovers `.claude/skills/` for
compatibility — so a single copy under `.claude/skills/` works for
both without maintaining two installs:

```sh
# User-level, available in every project (Claude Code, Claude.ai, and Cursor):
cp -r skills/token-budget-context-management ~/.claude/skills/

# Or project-level, active only inside one repo:
cp -r skills/token-budget-context-management <your-project>/.claude/skills/
```

If you'd rather use Cursor's own directory instead of relying on its
`.claude/skills/` compatibility path, the same copy works there too —
see "Using this with Cursor" below.

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

Cursor supports Agent Skills natively (`SKILL.md`, same convention as
Claude Code) — no conversion into a `.cursor/rules/*.mdc` rule is
needed. Cursor scans, in order of scope: `.cursor/skills/` (project),
`~/.cursor/skills/` (user-level, every project on the machine), and
`.claude/skills/` (project) / `~/.claude/skills/` (user-level) for
compatibility with Claude Code installs.

```sh
# Project-level, Cursor-specific location:
cp -r skills/token-budget-context-management <your-project>/.cursor/skills/

# User-level, every project on this machine:
cp -r skills/token-budget-context-management ~/.cursor/skills/
```

If the project (or your home directory) already has this Skill under
`.claude/skills/` — see "Installation" above — Cursor picks it up from
there automatically; you don't need a second copy under `.cursor/skills/`
unless you specifically want it scoped to Cursor only.

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
├── LICENSE.txt                       — MIT, copied from the source repository
├── references/
│   ├── strategy-selection.md         — all 6 strategies, config, trade-offs
│   ├── integration-patterns.md       — the context-boundary architecture, persistence, streaming
│   ├── anti-patterns.md              — DIY patterns that look fine and fail, and why
│   ├── migration-from-diy.md         — converting an existing manual implementation
│   └── troubleshooting.md            — diagnosing four common post-integration symptoms
├── examples/
│   ├── openai.md
│   ├── anthropic.md
│   ├── vercel-ai.md
│   └── langchain.md
└── packaged/
    └── token-budget-context-management.skill  — pre-built distributable archive
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

## License

MIT — see [`LICENSE.txt`](LICENSE.txt) in this directory, copied from
the source repository's own [`LICENSE`](https://github.com/shivam039/token-budget/blob/main/LICENSE)
so this Skill folder is self-contained if copied elsewhere.
