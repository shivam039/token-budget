# Release status

Exact current state of every package in this monorepo, GitHub (HEAD)
vs. npm, as of this audit. Regenerate this table (don't hand-edit stale
numbers) whenever a version changes — see the verification commands at
the bottom.

**HEAD**: `main` @ the SEO/AEO pass (PR #10) plus a CI robustness fix
(PR #11). All 10 publishable packages are now in sync between GitHub
and npm at `0.1.4` — verified directly against the real registry
below, not assumed. Full monorepo `build && typecheck && test` clean:
378 tests, 0 failures.

| Package | GitHub version | npm version (verified) | Ready? | Action |
| --- | --- | --- | --- | --- |
| `token-budget` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-anthropic` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-openai` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-vercel-ai` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-tiktoken` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-langchain` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-claude` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-pricing` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-otel` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-embeddings` | 0.1.4 | 0.1.4 | ✅ | None — in sync. |
| `token-budget-devtools` | 0.1.0 | *(not published, `private: true`)* | N/A | Intentionally unpublished. No action. |
| `token-budget-py` | 0.1.0 | *(not on PyPI)* | N/A | Deliberately unpublished per `docs/PYTHON_ROADMAP.md`. No action. |

## CI fix that unblocked this publish (PR #11)

The first attempt to publish this round (run
[33139771675](https://github.com/shivam039/token-budget/actions/runs/33139771675))
failed immediately: `token-budget` core was already published at
0.1.4 with nothing changed, it's first in the publish script's package
list, and GitHub Actions' default `bash -e` aborts a `run:` step on
the first non-zero exit — so the 9 adapters that actually needed
0.1.4 were never even attempted. Fixed in
`.github/workflows/publish.yml` to tolerate specifically "cannot
publish over the previously published version" (logged as a warning,
loop continues) while still hard-failing on any other error. Re-run
([33139986708](https://github.com/shivam039/token-budget/actions/runs/33139986708))
published all 9 adapters successfully.

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
