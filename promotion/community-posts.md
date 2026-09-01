# Community post drafts

**None of these have been posted.** They are drafts for manual review and
manual posting by a human with a real, non-throwaway account — per the
task's explicit instruction, nothing here is automated or auto-published.
Rules for each community were checked (sources at the bottom of each
section) as of 2026-08-28; re-check before actually posting, since
subreddit/site rules change.

---

## Hacker News — Show HN

**Rules checked:** Show HN must link directly to the thing itself (not a
landing page), be something people can try/run/inspect, and the poster
should personally have worked on it. No landing-page-only submissions, no
vote asking, no multiple accounts. ([HN guidelines](https://news.ycombinator.com/newsguidelines.html))

**Where to link:** https://github.com/shivam039/token-budget (the repo
itself — inspectable, clonable, runnable — not the npm page or a docs
site).

**Title:**
```
Show HN: token-budget – Keep long-running AI agents inside their context window
```

**Body draft:**

```
Long-running AI agents accumulate conversation history, tool calls, tool
results, and intermediate context turn after turn. Eventually that
history approaches the model's context limit and something has to give.

The naive fix is `messages.shift()` or `.slice(-N)` behind an `if`. It
works for a while, then breaks in three predictable ways once an agent
runs long enough:

1. It eventually shifts out the system prompt, because age-based trimming
   has no concept of "this one is pinned."
2. It can split a tool call from the result it's paired with — most
   provider APIs reject the resulting request outright (an orphaned
   tool_call_id).
3. It gives no answer to "why did it drop that message," which matters
   the moment a user or an incident review asks.

token-budget is a TypeScript library that replaces that with an explicit
token budget and a set of composable eviction strategies: drop-oldest,
sliding-window, priority, and summarize-oldest, chainable (e.g.
summarize first, drop-oldest as a hard backstop). Pinned messages are
never evicted regardless of age. Tool-call/tool-result pairs are treated
as one atomic unit by every built-in strategy, so a pair is always kept
or dropped together, never split. `explain()` returns a structured trace
of what was evicted or summarized and why.

It's model-agnostic — works standalone against a plain message array, or
through adapters for OpenAI, Anthropic, the Vercel AI SDK, and
LangChain.js, plus a tiktoken adapter for exact token counts instead of
estimates.

Honest limitations: this is a young project (0.1.x), the eviction
strategies operate at message granularity (a single oversized tool
result needs `truncateToolOutput()` separately, which the library also
provides), and it's a narrower tool than a full agent framework — if
you're already deep in LangChain, its own `trim_messages` may be enough
for simpler cases.

GitHub: https://github.com/shivam039/token-budget
npm: https://www.npmjs.com/package/@shivam.dixit/token-budget

Happy to answer questions about the design or trade-offs.
```

---

## Reddit — r/node

**Rules checked:** No official HN-style self-promo page; subreddit
moderators set their own bar. General Reddit spam guidance: keep
promotional content to a minority of your activity, and a post should be
useful even with the promotional angle removed. **Action before posting:**
read r/node's current sidebar/rules directly — they were not confirmed in
this research pass; if there's a dedicated self-promo thread, use it
instead of a standalone post.

**Draft title:**
```
I built a small TypeScript library for keeping long-running LLM agent
conversations under a token budget (open source, MIT)
```

**Draft body:**

```
If you're building anything that keeps a growing conversation history
for an LLM (a chat app, an agent loop, a coding assistant), you've
probably hit the "context window is full" problem. The usual first fix —
`messages.shift()` or `.slice(-N)` — works until it doesn't: it can trim
the system prompt, split a tool call from its result, and gives no way
to explain afterward why something got dropped.

I wrote token-budget to handle this properly: an explicit token budget,
composable eviction strategies (drop-oldest, sliding-window, priority,
summarize), pinned messages that are never evicted, atomic tool-call/
tool-result pairing, and an explain() call that returns a structured
trace of every eviction decision.

Zero required runtime dependencies, TypeScript-first, Node >=18, works
in the browser/edge too. Adapters for OpenAI, Anthropic, Vercel AI SDK,
and LangChain.js if you want to skip the message-shape conversion.

GitHub: https://github.com/shivam039/token-budget
npm: @shivam.dixit/token-budget

It's early (0.1.x) — feedback on the API or gaps you hit would be
genuinely useful.
```

---

## Reddit — r/javascript

**Rules checked:** Same general caveat as r/node — subreddit-specific
self-promo policy not confirmed in this pass; some large subreddits
(e.g. r/webdev) restrict project posts to a weekly megathread. **Action
before posting:** check r/javascript's current rules/sidebar for a
"Showoff Saturday"-style megathread requirement before posting as a
standalone submission.

**Draft title:**
```
token-budget: token-budget management for LLM agent conversations (TS, MIT, no required deps)
```

**Draft body:** (intentionally different framing from r/node — leads with
the technical mechanism, not the "I built" narrative, since r/javascript
skews toward engineering discussion over project-launch posts)

```
Sharing a small library I've been building: token-budget manages the
message history you send to an LLM so it never exceeds a token budget,
without the failure modes of `messages.shift()` / `.slice(-N)` trimming
(dropping the system prompt, orphaning a tool call from its result, no
audit trail for what got cut).

Core mechanism: strategies (drop-oldest, sliding-window, priority,
summarize-oldest) that compose via `chain()`, a `pinned` flag that
exempts a message from every strategy, and atomic tool-call/tool-result
pairing enforced at the strategy level rather than left to the caller.
`explain()` gives a structured trace of what a strategy evicted/
synthesized and why — useful when you need to debug "why is this
information gone."

TypeScript-first, zero required runtime deps, Node >=18, browser/edge
compatible. Adapters exist for OpenAI, Anthropic, Vercel AI SDK, and
LangChain.js.

GitHub: https://github.com/shivam039/token-budget

Open to feedback, especially from anyone who's rolled their own version
of this and hit edge cases I haven't.
```

---

## Reddit — r/LocalLLaMA

**Rules checked:** Self-promotion is tolerated when it stays a minority
of your activity, affiliation is disclosed, and the post leads with
genuine technical content/lesson rather than a bare pitch. Framing as
"here's a problem and how I solved it," not "check out my tool," fits
the community norm best.

**Draft title:**
```
The context-window problem with long-running agents, and why naive
message trimming breaks (wrote a library to fix it properly)
```

**Draft body:** (leads with the problem/lesson, tool mentioned as the
outcome — matches the community's stated preference)

```
Anyone running an agent loop against a local model with a real context
limit has hit this: conversation history + tool calls + tool results
grows every turn, and eventually you're over budget. The obvious fix —
shift/slice the oldest messages off — has three failure modes once it
runs long enough: it can shift out your system prompt (no concept of
"pinned"), it can separate a tool call from its result (most chat
templates/APIs choke on an orphaned tool call), and it gives you no way
to know afterward what got cut and why.

I ended up writing token-budget (TypeScript, MIT, disclosure: I'm the
author) to handle this as a real problem instead of a one-off `if`
block: an explicit token budget, composable eviction strategies
(drop-oldest, sliding-window, priority, summarize — chainable), a
`pinned` flag, atomic tool-call/tool-result pairing built into every
strategy, and `explain()` for a structured trace of every decision.

It's model-agnostic (works against a plain token count from any
tokenizer you give it, including a tiktoken adapter), so it's not tied
to any specific API — should work fine in front of a local model's own
context handling too.

GitHub: https://github.com/shivam039/token-budget

Curious whether others running long local-model agent sessions have hit
the same tool-call-orphaning issue, and how you've been handling it.
```

---

## Reddit — r/SideProject

**Rules checked:** Explicitly self-promotion-friendly, but strict about
authenticity — wants real progress/screenshots/working demo, framed
around the building experience (motivation, stack, challenges), not a
launch pitch. Repeat posts of the same project should be spaced
~3–4 weeks apart, each with something new to report.

**Draft title:**
```
Built a library to stop my AI agent from losing its system prompt
mid-conversation
```

**Draft body:** (leads with the "why I built this" story, matches
r/SideProject's stated preference for motivation/build narrative)

```
Backstory: I was building an agent loop and kept hitting the same bug —
once the conversation got long enough, my naive `messages.slice(-N)`
trimming would occasionally drop the system prompt or, worse, split a
tool call from its result and get a rejected request from the API. Both
are the kind of bug that only shows up after the agent's been running a
while, which makes them miserable to debug.

So I built token-budget: a small TypeScript library that treats this as
an actual problem instead of a slice() call. It enforces a real token
budget, applies eviction strategies you choose (drop-oldest,
sliding-window, priority, or summarize — and you can chain them), lets
you pin messages so they're never evicted, and keeps tool-call/
tool-result pairs atomic so they're never split. There's also an
explain() method that tells you exactly what got evicted and why, which
has saved me a lot of "wait, where did that go" moments.

It's open source (MIT), zero required runtime dependencies, and has
adapters for OpenAI, Anthropic, the Vercel AI SDK, and LangChain.js if
you don't want to hand-roll the message-shape conversion.

GitHub: https://github.com/shivam039/token-budget
npm: @shivam.dixit/token-budget

Still early (0.1.x) — would love feedback from anyone else who's hit
this problem building their own agent.
```

---

## Indie Hackers

**Fit assessment:** Indie Hackers skews toward products with a business
angle (revenue, users, growth) more than pure open-source infrastructure
libraries. token-budget has no monetization and no user-facing product —
a technical/build-in-public post framed around the engineering problem
is the honest fit here, not a "launch" post. Draft below is written that
way; if actually posting, use IH's "Product" or general discussion
format as appropriate, not their revenue-tracked "Milestones" feature
(not applicable — there's no revenue to report).

**Draft title:**
```
Building token-budget: an open-source context-management library for LLM agents
```

**Draft body:**

```
I've been building AI agents and kept running into the same problem:
conversation history grows without bound, and naive trimming
(shift/slice the oldest messages) breaks in ways that are hard to debug
— dropped system prompts, orphaned tool calls, no record of why
something got evicted.

token-budget is my attempt at solving this properly: explicit token
budgets, composable eviction strategies, pinned messages, atomic
tool-call/tool-result pairing, and an explain() trace for every
decision. It's open source (MIT), TypeScript-first, and has adapters for
OpenAI, Anthropic, Vercel AI SDK, and LangChain.js.

No monetization plan right now — it's infrastructure I needed and
figured other people building agents probably need too. Posting here
mainly to get it in front of people who might actually hit this problem
and to hear how others have approached it.

GitHub: https://github.com/shivam039/token-budget
```

---

## Product Hunt

**Important context (per task instructions): Product Hunt should NOT be
treated as a high-priority developer distribution channel** for an
open-source npm library — its audience skews toward consumer/SaaS
product discovery, not `npm install` decisions, and a CLI/library launch
typically gets a fraction of the traction a polished consumer app does.
Prepared here only because requested, not because it's expected to be a
strong channel.

**Draft tagline:**
```
Keep long-running AI agents inside their context window
```

**Draft description:**

```
token-budget is an open-source TypeScript library that keeps multi-turn
LLM conversations under a token budget as they grow — with drop-oldest,
sliding-window, priority, and summarization eviction strategies (that
chain together), pinned messages that are never evicted, atomic
tool-call/tool-result pairing so eviction never breaks a request, and
explain() for a full trace of every decision. Adapters for OpenAI,
Anthropic, the Vercel AI SDK, and LangChain.js. Zero required runtime
dependencies, MIT licensed, free.
```

**First comment (maker comment) draft:**

```
Hi — I built this because every long-running agent project I worked on
eventually hit the same bug: naive conversation trimming (shift/slice
the oldest messages) drops the system prompt or splits a tool call from
its result once the session runs long enough. token-budget makes context
management an explicit, inspectable decision instead of an implicit one.
Happy to answer questions about the design.
```

---

## Medium

**Fit assessment:** Medium suits a longer technical walkthrough better
than any of the short launch posts above — the format below leads with
the failure mode (with a concrete before/after), walks through the
mechanism, and closes with the real, sourced benchmark numbers from
`docs/benchmarks.md` rather than a vague performance claim. No numbers
below are invented — each is quoted directly from that file, cited so
they stay checkable against `npm run bench`.

**Draft title:**
```
Why "messages.shift()" breaks your AI agent (and what to do instead)
```

**Draft subtitle:**
```
The three failure modes of naive context trimming, and a benchmarked
look at what replacing it with an explicit token budget actually costs
```

**Draft body:**

```
Every long-running AI agent hits the same wall eventually: conversation
history, tool calls, tool results, and retrieved context keep growing,
and the model's context window doesn't. Something has to give.

The first fix almost everyone writes looks like this:

    while (estimateTokens(messages) > maxTokens) {
      messages.shift();
    }

It works. For a while.

## Three ways it breaks

**It deletes the system prompt.** Age-based trimming has no concept of
"this one is pinned" — the system prompt is just the oldest message in
the buffer, and the loop above doesn't know the difference between it
and a stale tool result from ten turns ago. Eventually it gets shifted
out, and the agent quietly loses its instructions. This is the kind of
bug that only shows up after a session has run long enough, which makes
it miserable to catch in testing.

**It splits a tool call from its result.** If the call lands at position
`shift()` is about to remove and the result doesn't, you get an orphaned
`tool_call_id` — a tool result with no matching call, or vice versa.
Most provider APIs reject the resulting request outright. This isn't a
degraded response; it's a hard error, and it's specifically the kind of
error that's hard to reproduce because it depends on exactly where the
trim boundary happened to fall that turn.

**It gives you no way to explain what happened.** When someone asks "why
did the agent forget X," the honest answer with `.shift()` is "we don't
know — the array is just shorter now." Nothing recorded which message
left, or why.

## What an explicit token budget looks like

I wrote [token-budget](https://github.com/shivam039/token-budget) (MIT,
TypeScript) to make this an explicit, inspectable decision instead of an
implicit side effect of an `if` statement:

    import { TokenBudget, strategies } from '@shivam.dixit/token-budget';

    const budget = new TokenBudget({
      maxTokens: 128000,
      reserve: 4096,
      strategy: strategies.priority(),
    });

    budget.addMessage({ role: 'system', content: systemPrompt, pinned: true });
    budget.addMessage({ role: 'user', content: userText, toolCallId, priority: 5 });

    const { messages, evicted } = await budget.getContext();

`pinned: true` means the system prompt is never evicted, by any
strategy, regardless of age. A `toolCallId` linking a tool result back to
the call it answers means every built-in strategy treats the pair as one
atomic unit — both survive, or both go, never split. And every call is
explainable:

    const report = budget.explain();
    // { strategyApplied: 'priority', steps: [{ evicted: [{ id, reason }], ... }] }

That last part matters more than it sounds like it should. The first
time `explain()` told me *exactly* which message got dropped and why,
during a debugging session that would otherwise have been "stare at logs
and guess," I understood why I'd bothered writing this instead of just
tightening the `.shift()` loop.

## Does the extra machinery cost anything?

This is the part I don't want to hand-wave. Explicit token budgets,
pluggable strategies, and an explain trace sound like they should be
slower than a bare `while` loop. Benchmarked, not assumed — three
findings from `docs/benchmarks.md`, reproducible via `npm run bench`:

**Recomputing the running token count from scratch on every add** (the
obvious way to write the naive loop) is quadratic. At 100,000 messages,
token-budget's incremental accounting takes ~287ms while a full recount
takes ~28,854ms for the same workload — about 100× slower for naive
recount, not a rounding error, and the gap widens with size (at 10,000
messages it's already ~19.5ms vs. ~266.9ms, roughly 14×).

**Querying a bounded window against a large history** — the shape most
real apps actually run (a big stored history, a smaller window actually
sent to the model) — is where the gap gets large. At a 10,000-token
window over a big history, token-budget took ~76.6ms; a comparable
LangChain.js `trimMessages` call took ~21,883ms in the same benchmark.
That's not "LangChain is bad" — `trim_messages` isn't built for
repeated, large-scale eviction against a big history, which is exactly
the scenario this benchmark is testing.

**Where token-budget is honestly slower:** its own tokenizer package,
`token-budget-tiktoken`, is slower than the standalone `gpt-tokenizer` at
raw token counting (521k tok/sec vs. 5.7M tok/sec in the same benchmark
suite) — published without spin, because a tokenizer counting fast isn't
the problem this library is solving. You can use `gpt-tokenizer` *as*
token-budget's tokenizer directly if raw counting speed matters more to
you than anything else.

## Where this fits

It's not an agent framework — it doesn't orchestrate tool calls or call
a model itself. It's the layer underneath whatever already is: a raw
provider SDK, LangChain.js, or the Vercel AI SDK, with adapters for
OpenAI, Anthropic, and both of those. Strategies compose (drop-oldest,
sliding-window, priority, summarize-oldest, chainable), and it's zero
required runtime dependencies.

It's early (0.1.x). If you're already hand-rolling a version of this and
have hit an edge case I haven't, I'd genuinely like to hear about it.

GitHub: https://github.com/shivam039/token-budget
npm: https://www.npmjs.com/package/@shivam.dixit/token-budget
Full benchmark methodology (including where token-budget loses):
https://github.com/shivam039/token-budget/blob/main/docs/benchmarks.md
```

**Tags to use on Medium:** `Artificial Intelligence`, `LLM`, `TypeScript`,
`Software Engineering`, `Open Source` (Medium allows up to 5 per post).

**Note on publishing this:** same limitation as the directory listings in
`devtool-directory-submissions.md` — `medium.com` requires a signed-in
human account to publish under (a "Draft" isn't public until a real
person reviews and hits Publish), and posting under a real identity is
the right call anyway for something with an author's name attached. This
draft is ready to paste into a new Medium story as-is; nothing further
needs writing.
