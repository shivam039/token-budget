# Production checklist

Before shipping a `token-budget`-managed agent loop, work through this
list. Every item links to where it's actually documented — nothing here
is a recommendation for functionality that doesn't exist.

- [ ] **Set a real context budget.** `maxTokens` explicitly, or `model`
      set to a name in `MODEL_CONTEXT_WINDOWS` — see
      [`docs/model-budgets.md`](./model-budgets.md). Don't leave this at
      an arbitrary placeholder number from a quickstart example.
- [ ] **Reserve output tokens.** `reserve` should reflect your model's
      actual expected reply length, not `0` — an unreserved budget lets
      the strategized context alone consume the entire window, leaving
      no room for the model's response. See
      [`docs/configuration.md#budget-sizing`](./configuration.md#budget-sizing).
- [ ] **Decide on a safety margin, deliberately.** There's no automatic
      buffer beyond `reserve` — if your tokenizer is an estimate (the
      default) rather than an exact count, consider a smaller explicit
      `maxTokens` than the model's real limit, or a real tokenizer (see
      [Token counting modes](../README.md#token-counting-modes)) if you
      need a hard guarantee.
- [ ] **Pin system instructions.** `addMessage({ ..., pinned: true })` on
      your system prompt (and anything else that must never be evicted) —
      untested, this is the single most common regression: a system
      prompt silently disappearing after enough turns.
- [ ] **Protect tool-call/tool-result groups.** Set `toolCallId` on every
      tool-result message so it's linked to the assistant message that
      produced the call — every built-in strategy then treats the pair as
      one atomic unit. Verify this directly against your own message
      shapes; [`examples/coding-agent`](../examples/coding-agent) shows
      the assertion pattern.
- [ ] **Select the strategy that matches your agent's shape**, not just
      the default. See the [decision table in `docs/strategy-guide.md`](./strategy-guide.md#decision-table) — `dropOldest` (the default) is a
      reasonable floor, but a coding agent or long-running agent usually
      wants `priority` or `summarizeOldest`.
- [ ] **Test your worst-case tool output.** A single oversized tool result
      (a full file, a verbose build log) can exceed the entire budget on
      its own — no eviction strategy fixes that, since strategies operate
      on whole messages. Shrink it first with
      [`truncateToolOutput`](./API.md#tool-output) and confirm the
      `overflow` event (reason `single-message-exceeds-budget`) doesn't
      fire in your real worst case.
- [ ] **Test unknown/unrecognized models**, not just the ones you use
      today. If `model` isn't in `MODEL_CONTEXT_WINDOWS`, construction
      throws unless `maxTokens` is also set — decide now whether your
      code path always sets `maxTokens` explicitly, or handles that throw.
      See [`docs/model-budgets.md#unknown-model-behavior`](./model-budgets.md#unknown-model-behavior).
- [ ] **Test serialization/recovery**, if your process can restart
      mid-session. `serialize()`/`TokenBudget.deserialize()` round-trip
      messages and JSON-safe config, but not the tokenizer instance,
      strategy, or function-typed options — confirm your `deserialize()`
      call supplies the right `overrides`. See
      [`docs/API.md#serialization`](./API.md#serialization).
- [ ] **Add observability.** At minimum, listen for `overflow` and
      `strategy-error` in production — both indicate a real problem
      (a message that can't fit, or a summarizer that's failing). Consider
      `auditLog: true` + `onAuditEvent` for a compliance-grade record, or
      [`token-budget-otel`](../packages/token-budget-otel) for OpenTelemetry
      spans/counters. See [`docs/explainability.md`](./explainability.md).
- [ ] **Verify behavior under real context pressure**, not just a small
      test case. `docs/benchmarks.md` documents this package's own
      published performance at 100,000 messages — run your own worst-case
      session length through `getContext()`/`getContextSync()` and confirm
      it stays fast enough for your latency budget.

## Related documentation

- [`docs/configuration.md`](./configuration.md) — every option referenced above, in one table
- [`docs/API.md`](./API.md) — exact signatures
- [`docs/benchmarks.md`](./benchmarks.md) — reproducible performance numbers
