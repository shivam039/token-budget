# PRD: 0.12.0 — 1.0 readiness evidence

**Status:** Draft for implementation  
**Release:** 0.12.0  
**Decision:** This milestone prepares evidence for a future 1.0 decision. It does not release 1.0 or declare the project production ready.

## Problem

The repository has accumulated a broad public API, adapter packages, release history, and pilot guidance. The existing product audit predates several releases and contains claims that conflict with current code. A maintainer cannot make a defensible stability decision from stale documentation, and external usage evidence has not been recorded in the public validation log.

## Goal

Create a current, source-backed readiness record that separates verified repository facts from unknowns that require external evidence or maintainer judgment. Fix stale readiness documentation and make the remaining 1.0 gate explicit.

## Out of scope

- Shipping 1.0 or changing public APIs solely to satisfy this document.
- Claiming adoption from downloads, stars, internal examples, or maintainer testing.
- Contacting pilot participants or recording private identities/correspondence.
- Claiming a complete security audit or absence of P0 defects without the relevant review evidence.

## Deliverables

1. Public API stability and migration statement grounded in package exports and changelog.
2. Node support range and adapter compatibility matrix checked against manifests and documented test baselines.
3. An inventory of experimental, approximate, private, and intentionally unpublished surfaces, with the limitations users need to know.
4. A privacy/security review of the data handling described by code and docs, plus unresolved risks and the limits of that review.
5. A user-evidence status that preserves the existing evidence bar and does not turn unknown counts into zero or adoption claims.
6. A 1.0 decision checklist with explicit maintainer sign-off and no-open-P0 gate.

## Acceptance criteria

- The readiness record distinguishes source-verified facts, documentation claims, and items requiring human or external evidence.
- Public API and Node statements match `packages/token-budget/src/index.ts`, package manifests, and supported CI configuration.
- Adapter support is described as tested shape/baseline, not blanket compatibility with every upstream SDK version.
- Migration language reflects the changelog; no unsupported semver promise is introduced.
- User evidence follows `docs/USER_VALIDATION.md` and `docs/EXTERNAL_PILOT.md`; unknown or unreported counts remain unknown.
- The security/privacy section states its review scope and records unresolved risks rather than waiving them.
- The 1.0 checklist remains incomplete until external evidence, P0 triage, and maintainer sign-off are supplied.
- Existing docs that this release record supersedes are corrected or clearly linked to the current source of truth.

## Adversarial review for this iteration

Before merge, challenge each readiness claim against source, manifests, changelog, workflows, and existing validation guidance. Specifically look for API exports omitted from the inventory, package matrices overstating tested SDK coverage, unsupported migration guarantees, privacy claims contradicted by data flow, and any wording that implies 1.0 approval. Record findings and dispositions in the PR. Unknowns must stay visible.

## Work breakdown

- Refresh the stale product audit using current repository evidence.
- Publish the 0.12.0 readiness record and checklist.
- Keep the umbrella issue open until evidence requiring external participants and maintainer sign-off exists.

## Rollout and success measure

This is a documentation-only release milestone. Success means a maintainer can identify what is verified and what blocks a 1.0 decision without relying on stale claims. It does not mean the 1.0 gate has passed.
