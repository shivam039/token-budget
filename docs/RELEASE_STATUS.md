# Release status

Exact current state of every package in this monorepo, GitHub (HEAD)
vs. npm, as of this audit. Regenerate this table (don't hand-edit stale
numbers) whenever a version changes — see the verification commands at
the bottom.

**HEAD**: `main` @ the model-aware-`maxTokens` pass (PR #14, core and
`token-budget-vercel-ai` at `0.1.5`) plus the new `token-budget-mcp`
package (first-ever release at `0.1.0`). `token-budget-mcp`'s first
publish attempt needs npm Trusted Publishing configured for that
package name before it can succeed — see the note below the table.

| Package | GitHub version | npm version (verified) | Ready? | Action |
| --- | --- | --- | --- | --- |
| `token-budget` | 0.1.5 | 0.1.5 | ✅ | None — in sync. |
| `token-budget-anthropic` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-openai` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-vercel-ai` | 0.1.5 | 0.1.5 | ✅ | None — in sync. |
| `token-budget-tiktoken` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-langchain` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-claude` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-pricing` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-otel` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-embeddings` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-mcp` | 0.1.0 | *(not yet published — see below)* | ⚠️ | Needs npm Trusted Publisher setup for this new package name, then publish. |
| `token-budget-devtools` | 0.1.0 | *(not published, `private: true`)* | N/A | Intentionally unpublished. No action. |
| `token-budget-py` | 0.1.0 | *(not on PyPI)* | N/A | Deliberately unpublished per `docs/PYTHON_ROADMAP.md`. No action. |

## New package: `token-budget-mcp` needs manual first-publish setup

Every other package in this table already has npm's OIDC Trusted
Publishing linked to this repo's `publish.yml` workflow (set up
manually, once, back when the original 10 packages first shipped —
see the CHANGELOG's early entries). `token-budget-mcp` is a brand-new
package name that has never been published, so npm has no Trusted
Publisher record for it yet — the first `workflow_dispatch` run after
this package's PR merges will very likely fail specifically on this
package (a real auth/authorization failure, not a "cannot publish over
the previously published version" case, so the CI loop correctly
hard-fails there rather than silently skipping it — see PR #11's fix
for why the loop only tolerates that one specific case).

**To fix:** on [npmjs.com](https://www.npmjs.com), under
`@shivam.dixit/token-budget-mcp`'s package settings → Trusted
Publisher, link it to this GitHub repo (`shivam039/token-budget`),
workflow file `publish.yml`. This has to be done once, manually, by
whoever owns the `@shivam.dixit` npm scope — no tool available in this
session can do it. After that, `workflow_dispatch` publishes it like
every other package.

## Why only 3 packages changed version this time

`token-budget` and `token-budget-vercel-ai` bumped to `0.1.5` for the
model-aware-`maxTokens` feature (PR #14) — the only two packages whose
shipped `dist/` actually changed. `token-budget-mcp` is a new package
at its first version, `0.1.0`. Every other package's `package.json` and
own `README.md` are untouched since the last publish, so republishing
them would be a no-op — correctly skipped.

## How this table was verified (not assumed)

```sh
# GitHub version — read directly from each package.json
node -e "console.log(require('./packages/token-budget/package.json').version)"

# npm version — read from the real registry, not cached
curl -s https://registry.npmjs.org/@shivam.dixit/token-budget | \
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)['dist-tags'].latest))"

# "Ready?" — the full monorepo suite, not a partial check
npm install && npm run build && npm run typecheck && npm run test
```

Re-run these (or `npm run bench` for the separate performance claims in
[`docs/benchmarks.md`](./benchmarks.md)) any time this table looks like
it might be stale — don't trust a table that isn't regenerated against
the actual registry.
