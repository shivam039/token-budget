# Release status

Exact current state of every package in this monorepo, GitHub (HEAD)
vs. npm, as of this audit. Regenerate this table (don't hand-edit stale
numbers) whenever a version changes — see the verification commands at
the bottom.

**HEAD**: `main` @ the release/discoverability pass, version-bumped to
carry it to npm (`token-budget` 0.1.3 → 0.1.4, all 9 adapters 0.1.2 →
0.1.3 — patch bumps, docs/metadata only, no API or behavior change).
Full monorepo `build && typecheck && test` clean: 378 tests, 0 failures.

| Package | GitHub version | npm version (at last check) | Ready? | Action |
| --- | --- | --- | --- | --- |
| `token-budget` | 0.1.4 | 0.1.3 | ✅ | Publish 0.1.4 via the Trusted Publisher pipeline. |
| `token-budget-anthropic` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-openai` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-vercel-ai` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-tiktoken` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-langchain` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-claude` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-pricing` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-otel` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-embeddings` | 0.1.3 | 0.1.2 | ✅ | Publish 0.1.3. |
| `token-budget-devtools` | 0.1.0 | *(not published, `private: true`)* | N/A | Intentionally unpublished. No action. |
| `token-budget-py` | 0.1.0 | *(not on PyPI)* | N/A | Deliberately unpublished per `docs/PYTHON_ROADMAP.md`. No action. |

## Why every package bumped together

The only thing that changed was documentation (a "wider project" link
in all 9 adapter READMEs, the root README's install-experience diagram,
`token-budget`'s description/keywords) — no source, no behavior, no
dependency change anywhere. Bumping every package in lockstep for a
docs-only change is simpler to reason about and verify than bumping
some and not others; the alternative (independent per-package
versioning here) would save nothing real, since all 10 READMEs changed
together in the same PR.

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
