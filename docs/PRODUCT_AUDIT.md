# Product audit

This is a current repository inventory, checked against source and package manifests for the 0.12.0 readiness work. It describes what is present; it does not declare every API stable or claim external adoption. The dedicated [0.12.0 readiness record](./READINESS_0.12.0.md) tracks evidence and the remaining 1.0 decision gates.

## Product scope

`@shivam.dixit/token-budget` is an in-process JavaScript/TypeScript context manager. Applications provide messages, tokenization, and any external summarizing or scoring services. The core package applies strategies to fit conversation context to a token budget; it is not a hosted memory service or an agent framework.

## Core surface

The package manifest declares two entry points: the root module and `./test-utils`. The root exports `TokenBudget`; the `strategies` namespace (`dropOldest`, `slidingWindow`, `priority`, `summarizeOldest`, `chain`, `semanticRelevance`, `smartPriority`); tokenizer and model-window helpers; explain formatting; tool output truncation; message-unit helpers; and public types. See [`API.md`](./API.md) and the actual barrel [`index.ts`](../packages/token-budget/src/index.ts).

The implementation also includes streaming, serialization and persistence hooks, cost and usage reporting, governance hooks, explanation traces, and incremental token accounting. See the API reference and package README for the exact behavior and limitations. The core manifest declares Node `>=18`; CI currently covers Node 18, 20, and 22.

## Package ecosystem

The npm workspace contains the core plus OpenAI, Anthropic, Vercel AI, LangChain, tokenizer, pricing, embeddings, OpenTelemetry, and MCP packages. Each published package has its own version and release state. Devtools and playground packages are local development/demo tools. The Python port is a separate work in progress. Consult the individual manifests and [`COMPATIBILITY.md`](../COMPATIBILITY.md); package presence in this checkout does not imply publication or parity.

Adapter tests cover declared structural message/API shapes and selected dependency baselines. They do not guarantee support for every upstream SDK version. Claude token counts are approximate, and model-window/pricing data are snapshots. Optional native tokenizer paths and the hosted MCP service have package-specific runtime and operational requirements.

## Evidence and limits

- The documented public API is determined by package exports and the source barrel, not every exported helper in the repository.
- CI versions describe the configured test matrix, not every supported Node release.
- Registry publication must be checked against npm; a manifest version alone does not prove publication.
- `USER_VALIDATION.md` currently has no public pilot outcomes recorded. Downloads, stars, examples, and maintainer testing are not independent usage evidence.
- This audit does not establish that no P0 bugs exist and is not a security audit.

## Scope decisions

Continue to prioritize reliability, documentation clarity, and external validation. Defer new frameworks, provider adapters, hosted memory features, and broad Python parity until user evidence demonstrates a concrete need. Keep the MCP server positioned as a demo/integration surface; production library use is in-process. See [`DO_NOT_BUILD_YET.md`](./DO_NOT_BUILD_YET.md), [`MCP.md`](./MCP.md), and [`PYTHON_ROADMAP.md`](./PYTHON_ROADMAP.md).

## Next decision

The next milestone is evidence gathering and a future 1.0 decision, not another feature release. Use [`READINESS_0.12.0.md`](./READINESS_0.12.0.md) to record verified claims, unresolved risks, external validation, P0 triage, and maintainer sign-off. Keep the 1.0 gate open until all required evidence is available.
