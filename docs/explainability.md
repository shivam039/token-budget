# Explainability: why did this message get removed?

Every `getContext()`/`getContextSync()` call produces a structured record
of exactly what happened and why — `budget.explain()`. This is the thing
most truncation code, hand-rolled or built into a framework, doesn't give
you: not just *that* something was dropped, but which strategy dropped it
and the specific reason.

## Why this matters

Debugging a long-running agent almost always starts with "why is the
model behaving like it forgot something?" Without an explanation trail,
the answer is guesswork — re-reading strategy source, adding print
statements, or just re-running and hoping. With `explain()`, it's one
call:

```ts
const { messages } = await budget.getContext();
// ... send messages to the model, something looks wrong ...
const report = budget.explain();
console.log(JSON.stringify(report, null, 2));
```

It's also useful *before* anything looks wrong — as a compliance/audit
log (`auditLog: true` + `onAuditEvent`, see [`docs/API.md`](./API.md#tokenbudget-constructor--config)),
or as a live "what's using my budget" indicator in a debugging UI.

## Real output, not illustrative

This is what `budget.explain()` actually returns — every field below is a
real property on `ExplainReport` (see [`docs/API.md#explain`](./API.md#explain)
for the exact type):

```json
{
  "strategyApplied": "sliding-window",
  "tokensBefore": 48,
  "tokensAfter": 32,
  "tokensRemaining": 168,
  "timestamp": 1735689600000,
  "steps": [
    {
      "strategyName": "sliding-window",
      "tokensBefore": 48,
      "tokensAfter": 32,
      "messagesConsidered": 6,
      "evicted": [
        { "id": "msg_1", "reason": "outside the last 3 turns (position 1 of 6)" },
        { "id": "msg_2", "reason": "outside the last 3 turns (position 2 of 6)" }
      ],
      "synthesized": []
    }
  ]
}
```

A `summarizeOldest` call additionally populates `synthesized` — one entry
per summary it created, with the `sourceIds` it was built from:

```json
"synthesized": [
  { "id": "msg_summary_1", "sourceIds": ["msg_3", "msg_4", "msg_5"], "reason": "folded 3 oldest eligible messages into a summary (over preThreshold)" }
]
```

`chain([...])` produces one `steps` entry per member strategy, in the
order they ran — so a `summarizeOldest` → `dropOldest` chain's `explain()`
shows exactly how much summarization alone accomplished, and how much the
`dropOldest` backstop had to additionally trim.

Only fields that actually exist in the current `ExplainReport`/
`StrategyStepTrace` types are shown above — nothing here is aspirational.

## Answering the questions you'll actually ask in a debugger

```ts
const report = budget.explain()!;

report.tokensBefore - report.tokensAfter;                     // tokens this call saved
report.strategyApplied;                                       // which strategy (or chain) ran
report.steps.flatMap((s) => s.evicted);                        // every eviction, with a reason
report.steps.flatMap((s) => s.synthesized);                    // every summary this call created

// "Why did *this* message disappear?"
report.steps.flatMap((s) => s.evicted).find((e) => e.id === messageId)?.reason;

// "Why was *this* message preserved?" — explain() reports what left;
// anything still in ctx.messages and not synthetic answers "it wasn't evicted":
const { messages } = await budget.getContext();
messages.some((m) => m.id === messageId && !m.metadata?.['synthetic']);
```

## Live, not just after the fact

Subscribe to the `decision` event to get the same report pushed to you the
moment it's produced, instead of pulling it via `explain()` afterward —
useful for a live debugging panel or a streaming log:

```ts
budget.on('decision', (report) => {
  if (report.steps.some((s) => s.evicted.length > 0)) {
    logger.info('context evicted', report);
  }
});
```

`devMode: true` in the constructor does the equivalent as a one-line
`console.debug` for local debugging, no listener required.

## What `explain()` does *not* do

- It reports the **most recent** call only — `explain()` returns
  `undefined` until `getContext()`/`getContextSync()` has run at least
  once, and each call overwrites the previous report. Persist it yourself
  (e.g. via `onAuditEvent`) if you need history across many calls.
- It explains what a strategy *did*, not what it *would* do — there's no
  dry-run mode. `getContext()` itself is safe to call speculatively (it
  never mutates the buffer — see [`docs/API.md#getcontext`](./API.md#getcontext)),
  so calling it and reading `explain()` afterward is the dry-run.
- Reasons are short, human-readable strings, not a formal machine-parseable
  taxonomy — if you need to categorize reasons programmatically, match on
  `steps[].strategyName` plus which strategy produced the eviction (each
  built-in strategy's reason strings are stable, but not a documented enum).

## See it against a realistic session

[`examples/coding-agent-context`](../examples/coding-agent-context) prints
a full `explain()` trace, formatted as a readable report instead of raw
JSON, against a realistic ~20-message coding-agent session that actually
overflows its budget.

## Related documentation

- [`docs/API.md#explain`](./API.md#explain) — exact `ExplainReport`/`StrategyStepTrace` types
- [`docs/API.md#events`](./API.md#events) — the `decision` event and every other event
- [`docs/production-checklist.md`](./production-checklist.md) — "add observability"
