# 0.12.0 readiness record

This record captures what the repository can establish for a future 1.0 decision. It is not a 1.0 approval. Evidence was checked against the current source tree; npm publication state and external usage require separate evidence.

## Verified repository facts

### Public API and migration

The core package's documented entry points are the root export and `./test-utils` subpath in `packages/token-budget/package.json`. The root source exports `TokenBudget`, the `strategies` namespace, tokenizer and model-window helpers, explain formatting, tool-output truncation, strategy unit helpers, and the public types listed in `packages/token-budget/src/index.ts`. `./test-utils` is a separate testing utility entry point. Internal files are not declared package subpath exports.

`CHANGELOG.md` describes 0.2.0 as a minor release with no intentional breaking change to the core public API. That statement documents the 0.1-to-0.2 transition; it is not a blanket compatibility guarantee for future releases. The package remains version 0.x, and no 1.0 stability commitment is made here.

### Runtime support

All publishable npm package manifests currently declare Node.js `>=18`; private devtools and playground packages do not declare an engine floor. The repository CI workflow currently tests Node 18, 20, and 22. Check it before each release because `engines` is a support floor, not proof that every Node release has been exercised.

### Adapter matrix

See [`COMPATIBILITY.md`](../COMPATIBILITY.md) and each package manifest for peer ranges. Adapters use structural interfaces and tests cover the documented wire/message shapes. A tested shape does not guarantee compatibility with every version of an upstream SDK. The Claude tokenizer is an approximation, pricing data is a point-in-time snapshot, and optional native tokenizer paths have separate runtime constraints documented by their packages.

### Experimental, approximate, and non-release surfaces

| Surface | Status and limitation |
| --- | --- |
| Python port | Work in progress and not feature parity with the JavaScript package; see [`PYTHON_ROADMAP.md`](./PYTHON_ROADMAP.md). |
| Claude token counting | Approximation requiring calibration for application-specific accuracy; see the package README. |
| Model context-window and pricing tables | Static snapshots that can become stale; callers should override with current provider data. |
| Devtools and playground | Development/demo tools, not a production service or core runtime dependency. |
| MCP hosted HTTP mode | Optional demo/integration surface; deployment operators must configure authentication and limits. It is not the recommended production consumption model for the core library. |
| `test-utils` | Testing support, not a runtime API for application behavior. |

No `@experimental` annotation or formal deprecation policy is currently established for the core API. This record therefore does not label unmarked exports as stable beyond the package's current 0.x semver contract.

## User evidence

[`USER_VALIDATION.md`](./USER_VALIDATION.md) currently reports no public pilot outcomes and says counts are not recorded. That means evidence is unavailable in this public record; it does not establish that nobody has tried the package. Maintainer examples, downloads, stars, and planned evaluations do not meet the independent installed/tested evidence bar. Do not count a person without their explicit confirmation under [`EXTERNAL_PILOT.md`](./EXTERNAL_PILOT.md).

**Gate status:** independent external use is not established by the repository evidence reviewed for this record. The next validation milestone remains three unrelated developers explicitly confirming a local evaluation. No participant identity or private correspondence belongs in this repository.

## Security and privacy review

This is a documentation and repository-surface review, not a penetration test, dependency-vulnerability attestation, or formal security audit. The core package declares no required runtime dependencies. The library processes caller-supplied conversation content in memory; persistence is opt-in through serialization and hooks. Applications remain responsible for protecting prompts, tool output, serialized state, logs, and any summarizer/scorer integrations they provide. The hosted MCP package has a separate network-facing surface; private deployments require authentication and should configure resource limits. Its opt-in shared public demo key must not be used for private or sensitive data; see the [MCP deployment guidance](../packages/token-budget-mcp/README.md#hosting-it-remotely-streamable-http).

No claim of “no P0 bugs” is made here: this repository review does not establish that all defects have been triaged. A release owner must review open issues and security reports and record the result before a 1.0 decision.

## Unresolved risks

- External installed/tested evidence and continued-use evidence are not established in the public validation log.
- No formal 1.0 API stability/deprecation policy has been approved.
- Structural adapter tests do not span every released upstream SDK version.
- Approximate token counting, static model/pricing data, and third-party callbacks (tokenizers, summarizers, scorers, persistence hooks) have application-specific correctness and privacy implications.
- The network-facing MCP service and its explicitly shared public demo need operational configuration and deployment review beyond the core library review. The shared demo is not suitable for private or sensitive data.
- Current absence of P0 issues has not been independently confirmed as part of this documentation record.

## Future 1.0 decision checklist

- [x] Record the current public core entry points and package subpaths.
- [x] Record the declared Node support floor and describe the adapter evidence limits.
- [x] State the migration claim supported by the changelog.
- [x] Inventory clearly limited or non-core surfaces and document review scope.
- [ ] Complete the external pilot milestone and update aggregate evidence with consent-safe reporting.
- [ ] Review open bugs and security reports; confirm no open P0 issues.
- [ ] Approve and publish an API stability and deprecation policy.
- [ ] Maintainer sign-off on the 1.0 decision, including unresolved risks and release checklist.

## Adversarial review findings

Review this record against `packages/token-budget/src/index.ts`, package manifests, `COMPATIBILITY.md`, `CHANGELOG.md`, CI workflows, `USER_VALIDATION.md`, and `EXTERNAL_PILOT.md` before merge. Findings and their dispositions are recorded in the associated pull request. Any unsupported claim must be removed or marked unresolved.
