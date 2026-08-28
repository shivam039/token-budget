# Release status

Exact current state of every package in this monorepo, GitHub (HEAD)
vs. npm, as of this audit. Regenerate this table (don't hand-edit stale
numbers) whenever a version changes — see the verification commands at
the bottom.

**HEAD**: `main` @ commit with all of the release/discoverability pass
(adapter README audit, install-experience diagram, `RELEASE_STATUS.md`
and `USER_FEEDBACK_TEMPLATE.md` added). Full monorepo
`build && typecheck && test` clean: 378 tests, 0 failures.

| Package | GitHub version | npm version | Ready? | Action |
| --- | --- | --- | --- | --- |
| `token-budget` | 0.1.3 | 0.1.3 | ⚠️ | Version numbers match, but `package.json` (description/keywords) and `README.md` changed on HEAD *after* `0.1.3` was published — see "Docs-only drift" below. No functional/API change; not urgent. |
| `token-budget-anthropic` | 0.1.2 | 0.1.2 | ⚠️ | `README.md` changed on HEAD (added a "wider project" section) — same docs-only drift as above. |
| `token-budget-openai` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-vercel-ai` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-tiktoken` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-langchain` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-claude` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-pricing` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-otel` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-embeddings` | 0.1.2 | 0.1.2 | ⚠️ | Same docs-only drift. |
| `token-budget-devtools` | 0.1.0 | *(not published, `private: true`)* | N/A | Intentionally unpublished — local Vite app for inspecting `serialize()` dumps, not a library. No action. |
| `token-budget-py` | 0.1.0 | *(not on PyPI — different registry entirely)* | N/A | Deliberately unpublished per `docs/PYTHON_ROADMAP.md` — partial API, no PyPI presence until real demand. No action. |

## Docs-only drift (⚠️, not 🔴)

Every publishable package's `README.md` is bundled into its npm tarball
(`files: ["dist", "README.md"]`) — so a README edit, even with zero code
change, means what's on npm no longer *exactly* matches HEAD. This audit
pass added a short "wider project" section (a link to the GitHub repo
and the compatibility matrix) to all 9 adapter READMEs, and reordered/
expanded the root README and `token-budget`'s own `package.json`
description/keywords — all pure discoverability improvements, no API or
behavior change anywhere.

This is **not a functional gap** — nothing a developer installs today
is broken, incomplete, or misleading; the currently-published READMEs
are simply the *previous*, still-accurate revision. It's flagged here
only because "GitHub and npm are in sync" should mean what it says: an
honest table calls this out rather than reporting all-green because the
version *numbers* happen to still match.

**To close this gap** (optional — not required before real-user
outreach, since nothing functional is affected):

```sh
# Bump whichever packages you want the doc updates live for, e.g. a
# patch bump on all 10, then let the existing Trusted Publisher pipeline
# handle it (same flow as the 0.1.3 release):
#   1. bump "version" in each package's package.json
#   2. git commit, push, open/merge a PR
#   3. trigger .github/workflows/publish.yml (workflow_dispatch) or push a `v*` tag
```

Given the changes are purely descriptive, batching this into whenever
the *next* real code change ships is a reasonable choice too — there's
no urgency either way.

## How this table was verified (not assumed)

```sh
# GitHub version — read directly from each package.json
node -e "console.log(require('./packages/token-budget/package.json').version)"

# npm version — read from the real registry, not cached
curl -s https://registry.npmjs.org/@shivam.dixit/token-budget | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)['dist-tags'].latest))"

# "Ready?" — the full monorepo suite, not a partial check
npm install && npm run build && npm run typecheck && npm run test

# Docs-only drift — diffed each package's committed README.md against
# what a fresh `npm pack --dry-run` would currently bundle; confirmed
# via git log that no packages/*/src changes landed after the last
# publish of each package.
```

Re-run these (or `npm run bench` for the separate performance claims in
[`docs/benchmarks.md`](./benchmarks.md)) any time this table looks like
it might be stale — don't trust a table that isn't regenerated against
the actual registry.
