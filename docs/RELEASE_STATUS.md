# Release status

Exact current state of every package in this monorepo, GitHub (HEAD)
vs. npm, as of this audit. Regenerate this table (don't hand-edit stale
numbers) whenever a version changes — see the verification commands at
the bottom.

**HEAD**: `main` @ the SEO/AEO pass, version-bumped to carry the
adapter keyword/description changes to npm (9 adapters 0.1.3 → 0.1.4 —
patch bumps, metadata only, no API or behavior change). `token-budget`
core stays at 0.1.4 — nothing in its published tarball (`dist/` +
`packages/token-budget/README.md`) changed this pass, only the root
README, `docs/`, and adapter `package.json` files, none of which core
ships. Full monorepo `build && typecheck && test` clean: 378 tests, 0
failures.

| Package | GitHub version | npm version (at last check) | Ready? | Action |
| --- | --- | --- | --- | --- |
| `token-budget` | 0.1.4 | 0.1.4 | ✅ | None — already in sync, nothing to republish. |
| `token-budget-anthropic` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4 (new keywords/description). |
| `token-budget-openai` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-vercel-ai` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-tiktoken` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-langchain` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-claude` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-pricing` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-otel` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-embeddings` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4. |
| `token-budget-devtools` | 0.1.0 | *(not published, `private: true`)* | N/A | Intentionally unpublished. No action. |
| `token-budget-py` | 0.1.0 | *(not on PyPI)* | N/A | Deliberately unpublished per `docs/PYTHON_ROADMAP.md`. No action. |

## Why only the adapters bumped this time

This pass's `package.json` changes were scoped to the 9 adapters
(ecosystem-specific keywords and descriptions — see
`docs/SEO_AEO_AUDIT.md`). `token-budget` core's `package.json` and its
own `README.md` weren't touched; the root `README.md`, `docs/`
additions, and `COOKBOOK.md` aren't part of any published tarball
(`files` on core is `["dist", "README.md"]`, referring to the
package's own README, not the repo root's). Bumping core for a change
it doesn't actually ship would be a no-op publish — skipped.

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
