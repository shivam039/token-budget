# Guardrails Plan

## Baseline
- `npm run test`, `npm run typecheck`, `npm run build` all pass on the current main branch.
- CI workflows are defined in `.github/workflows/*.yml`.
- Skill evaluation uses `scripts/generate-context-dataset.ts` for generation.
- Datasets are in `datasets/context-management-bench`.

## Proposed Architecture
- `.agent-guardrails/guardrails.json`: Config toggles.
- `scripts/guardrails/runner.js`: Central guardrail runner (`npm run guardrails`).
- `scripts/guardrails/check-*.js`: Check scripts (return PASS, FAIL, or WARN).
- CI Integration: Run `npm run guardrails` in `ci.yml`.

## P1-P8 Deliverables

### P0 Discovery / baseline (Complete)
- Baseline established.

### P1 Guardrail runner
- `runner.js` created.
- Supports execution of check modules with blocking vs non-blocking results.
- `npm run guardrails` command registered.

### P2 Core integrity + security
- Tests, Typecheck, Build executed as child processes.
- Secrets detection (blocking).
- Scope check (warning on suspicious large diffs).

### P3 Public API
- Compares API exports/types against base branch.
- Warning for new exports; Blocking for breaking changes/removals.

### P4 Agent Skill integrity
- Validates frontmatter.
- Validates internal references.

### P5 Skill trigger regression
- Verifies skill preserves diagnostic properties.

### P6 Benchmark and dataset integrity
- Validates schema and IDs of `.jsonl` files in `datasets/`.

### P7 Documentation/API drift
- Checks file links in documentation (Warning).

### P8 CI integration
- Adds guardrails step to GitHub actions.

## Principles
- **Prefer warnings** for unclear cases.
- **Do not block** normal development (refactors, doc changes, additive API).
- No LLM calls. Fully deterministic.
- Fast, predictable, understandable.

## Recent Updates
- Integrity checks in CI: `check-integrity.js` skips redundant checks if `GUARDRAILS_SKIP_INTEGRITY=1` is set (which is configured in `.github/workflows/ci.yml`). `npm run test` is entirely removed from integrity checks because testing is thoroughly covered elsewhere in the suite. Unit tests do not re-enter the full suite.
- Base Ref Resolution: `check-public-api.js` uses explicit references via `GITHUB_BASE_REF` or `GUARDRAILS_BASE_REF` to securely verify API changes in shallow clones. Missing base references fallback to a warning, avoiding CI failure solely due to a missing base.
