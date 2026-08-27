# First users

npm downloads don't create users; this is a plan for getting the first
10 real ones. It does not include sending anything automatically — every
outreach message in the flow below is sent by a human, one at a time,
after actually reading the target repo.

## Who to target

The three use cases the product thesis identifies as the strongest
beachhead, in priority order:

1. **Coding agents** — highest priority. Anyone building a tool-calling
   loop over a codebase (read files, run tests, edit, repeat) hits the
   context-overflow problem fast and hard, and the atomic tool-call
   pairing guarantee is worth the most to exactly this audience.
2. **Long-running autonomous agents** — task-execution loops, browser
   agents, anything that runs for many turns without a human in it.
3. **Research agents** — retrieval-heavy, tool-heavy, multi-step
   research/analysis loops (deep-research-style products).

Not targeted (yet): generic chatbot builders, RAG-only apps without a
long-running loop, teams already happy with a framework's built-in
trimming. Their problem is real but less acute — lower priority, not
excluded.

## Acquisition channel: GitHub search

The strongest channel is GitHub itself — find people who've already
written the problem this library solves, in public.

**Search queries** (GitHub code search, run periodically, not once):

```
"messages.shift()" language:TypeScript agent
"messages.slice(-" language:TypeScript context
trimMessages language:TypeScript
"maxTokens" "toolCallId" language:TypeScript
"context window" "truncate" language:TypeScript agent
"countTokens" "conversation history" language:TypeScript
"tool_call_id" orphan OR pairing language:TypeScript
```

Also worth checking periodically: recently-opened issues on popular
agent-framework repos (LangChain.js, Vercel AI SDK, agent-starter-kit
style projects) with titles/bodies mentioning "context window,"
"token limit," "truncat," or "conversation history" — these are people
who've already hit the problem and are asking for help, which is a much
warmer lead than a repo that silently wrote a workaround.

**What makes a good candidate**, once found:

- A real, active repo (recent commits, not abandoned) — not a tutorial
  fork or a one-off gist.
- Visible hand-rolled context management: a `shift()`/`slice()` call
  near message history, a homemade token-counting function, or an issue
  explicitly asking "how do I keep this under the context limit."
- TypeScript/JavaScript (matches this package's ecosystem) — a Python
  agent repo is a real lead too, but should be routed to
  `docs/PYTHON_ROADMAP.md`'s evidence-gathering instead of an install
  attempt, since the Python port isn't at parity yet.

## Outreach template

Sent by a human, to a specific person, after reading their code — never
templated blindly across dozens of repos in one sitting.

> Hey — I came across your context-management code while looking at how
> agent projects handle long histories. I recently released an
> open-source library for exactly this problem: keeping a growing
> message buffer inside a token budget, without dropping the system
> prompt or splitting a tool-call from its result (which most provider
> APIs reject outright).
>
> It's `token-budget` on npm — pluggable eviction/summarization
> strategies, an `explain()` trace so you can see why something was
> dropped, and adapters for OpenAI/Anthropic/Vercel AI SDK/LangChain.js
> if you want them, though the core has zero dependencies and works
> standalone.
>
> I'd genuinely appreciate your take on whether it'd simplify what
> you're doing here — even if the answer is no, I'd rather know what's
> missing than not hear it.

Rules for using this:

- Reference something specific and true about their actual code — the
  template above is a starting point, not a script to paste verbatim.
- One message, no follow-up ping if they don't respond. A second
  unsolicited message is the line between outreach and spam.
- If they respond with a problem the library doesn't solve, say so
  honestly rather than stretching the pitch to fit.

## The loop

1. Run the GitHub search queries above; read 5-10 new candidate repos.
2. For each genuine match, send one outreach message (issue comment, PR
   comment if there's an open relevant one, or a direct message if the
   platform and etiquette allow it).
3. Log every contact in `docs/USER_VALIDATION.md`'s tracking table (see
   that doc) — target, channel, date, response, outcome.
4. Repeat weekly until the targets in `USER_VALIDATION.md` are hit.

No spamming, no mass-DMing, no automated messages. This is a slow,
manual, honest channel by design — the goal is 10 real users, not 10
impressions.
