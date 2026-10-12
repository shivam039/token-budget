# User feedback template

Use this privately for each substantive response from the
[`docs/FIRST_USERS.md`](./FIRST_USERS.md) outreach loop — anyone who
actually responded with substance, not just "thanks, will check it
out." The point is to turn a conversation into something the project can
act on, not to collect a testimonial. Do not commit completed forms or
private correspondence. If you add common themes to the public tracking
log, keep it aggregate; get permission before public attribution.

Fill in what the developer actually confirmed, not what you hoped they
would say. An incomplete answer is better than guessing. Never include
private code, prompts, conversation logs, credentials, or customer data.

```
Participant ID:
Project type (generic description):
Pilot outcome (could not start / installed / exercised / production use):
Packages and versions:
Runtime and framework versions:
Evaluation scenario (sanitized):
Setup time or blocker:
Current context-management approach:
Problem encountered:
Would token-budget solve it?
What is missing?
Performance concerns:
API concerns:
Would they use it in production?
What would make them switch?
Would they recommend it?
```

## Field-by-field

- **Participant ID** — a private ID used only to connect notes during
  evaluation. Keep it and any identity mapping outside the repository.
- **Project type** — a generic description (e.g. "a coding agent that
  reads and edits a repository over long sessions"); omit the project,
  employer, and customer names.
- **Pilot outcome** — record only the highest stage the developer
  explicitly confirmed; a download or intention to try does not count as
  exercising the API.
- **Packages and versions** — include `token-budget` and any adapter used.
- **Runtime and framework versions** — Node and framework versions, if
  known; don't infer missing details.
- **Evaluation scenario (sanitized)** — summarize the case without copying
  prompts, conversation history, private source, or customer data.
- **Setup time or blocker** — approximate time or the exact public error
  message with secrets removed.
- **Framework** — LangChain.js, Vercel AI SDK, a raw provider SDK, their
  own orchestration — whatever they're actually calling.
- **Current context-management approach** — exactly what they do today:
  `messages.shift()`, a homemade token counter, a framework's built-in
  trimmer, or "we just let it fail sometimes." This is the baseline
  token-budget is competing against for *them specifically*, not the
  generic DIY comparison in `docs/comparisons.md`.
- **Problem encountered** — what actually broke, or what they're
  worried will break. A dropped system prompt? An orphaned tool result?
  A context-window 400? Slow trimming at scale? Get the specific
  failure, not a vague "context management is hard."
- **Would token-budget solve it?** — their honest assessment, not yours.
  "Yes," "partially — X still isn't covered," or "no, this isn't
  actually their problem" are all valid, useful answers.
- **What is missing?** — the single most valuable field in this
  template. A real, specific gap here is exactly the kind of evidence
  that's allowed to override `docs/DO_NOT_BUILD_YET.md`'s defaults (see
  that doc's "how to un-defer something" section) — a vague "more
  features" is not.
- **Performance concerns** — did they ask about scale, latency, or
  memory? At what size history? Compare their number against
  `docs/benchmarks.md` — if the existing numbers don't cover their
  scale, that's itself a finding.
- **API concerns** — anything about `TokenBudget`'s shape that confused
  them, felt awkward, or they had to read the source to understand.
  This is usage-friction feedback, not a feature request.
- **Would they use it in production?** — yes/no/maybe, plus why.
  "Maybe, once X is fixed" is more useful than a bare "maybe."
- **What would make them switch?** — from their current approach to
  this library, concretely. Sometimes it's a missing feature; often
  it's just "I haven't had time," which is a distribution problem, not
  a product one.
- **Would they recommend it?** — to a specific person or team they know,
  not "to developers in general." A concrete name is a stronger signal
  than an abstract yes.

## What to do with a filled-in template

- A real, specific "what's missing" from **three independent people**
  is the trigger defined in `docs/USER_VALIDATION.md` for reconsidering
  what to build next — check whether this response is the 1st, 2nd, or
  3rd on a given gap.
- A "no, this isn't my problem" is still useful — it tells you the
  targeting in `docs/FIRST_USERS.md` needs adjusting, not that the
  product is wrong.
- Don't let one loud response override the aggregate. Log it, keep
  going, look at the pattern across several before changing anything.
