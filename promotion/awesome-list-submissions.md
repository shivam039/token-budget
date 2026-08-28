# Awesome-list submissions

**Status: DRAFT READY, not submitted.** Full research is in
`awesome-list-candidates.md`. This file has the exact, ready-to-paste
content for the two strong candidates identified there.

**Why these weren't opened as real PRs:** this session's GitHub access
is scoped to `shivam039/token-budget` only — a real, tested attempt to
add `pleasedodisturb/awesome-llm-token-optimization` and
`congvmit/awesome-llm-token-reduction` as additional sources was
rejected by the platform ("cross-tier adds are not supported... session
already has repos from owner(s) [shivam039]"), not skipped by choice.
Opening these PRs needs either a session started fresh against that
specific repo, or — the faster path — a human doing it directly through
GitHub's web editor, which takes under two minutes per list since it's
a single-line addition. Steps below are written for that path.

**Important:** re-check `awesome-list-candidates.md`'s risk note before
submitting — the `token-budget` repo is very new (2 days old, 0 stars at
research time). Neither target list has a hard age/star rule, so this
isn't blocking, but if a submission bounces, it's the likely reason. If
that happens, waiting a few weeks for the repo to accumulate some real
history/stars/downloads and resubmitting is the right move, not arguing
with a maintainer's judgment call.

---

## 1. pleasedodisturb/awesome-llm-token-optimization (submit this one first)

**How to submit (GitHub web UI, no local git needed):**

1. Go to https://github.com/pleasedodisturb/awesome-llm-token-optimization/blob/main/README.md
2. Click the pencil (edit) icon — GitHub auto-forks the repo for you.
3. Find the `## Context Window Management` section, `### Chunking & Splitting` subsection.
4. Add this line in alphabetical order among the existing entries:

   ```markdown
   - [token-budget](https://github.com/shivam039/token-budget) - TypeScript-first token accounting and eviction (drop-oldest, sliding-window, priority, summarize) to keep long-running LLM agent conversations inside their context window. ![Stars](https://img.shields.io/github/stars/shivam039/token-budget)
   ```

5. Commit directly to a new branch (GitHub's UI defaults to this) and open the PR. Use this PR description:

   ```markdown
   ## What this adds

   `token-budget` (https://github.com/shivam039/token-budget) — a
   TypeScript library for keeping multi-turn LLM conversations under a
   token budget: chainable eviction strategies (drop-oldest,
   sliding-window, priority, summarize), pinned messages, atomic
   tool-call/tool-result pairing, and an `explain()` trace of every
   eviction decision. MIT licensed, zero required runtime dependencies.

   I placed it under Context Window Management → Chunking & Splitting
   since there isn't yet a dedicated "Libraries" subsection there — happy
   to move it if you'd rather it go elsewhere, or if you'd prefer a new
   subsection for tools like this one.
   ```

6. Note (disclosure, optional but honest): mention in the PR that you're the author if the list's norms expect that — this specific list's CONTRIBUTING.md doesn't require it, but it's good practice.

---

## 2. congvmit/awesome-llm-token-reduction

**How to submit (GitHub web UI):**

1. Go to https://github.com/congvmit/awesome-llm-token-reduction/blob/main/README.md
2. Click the pencil (edit) icon.
3. Find the `## Context & Memory Management` section.
4. Add this line in alphabetical order (after `codex-agent-mem`, before `mnemosyne`):

   ```markdown
   - [token-budget](https://github.com/shivam039/token-budget) - Model-agnostic token accounting and eviction strategies to keep long-running LLM agent conversations inside their context window. ![Stars](https://img.shields.io/github/stars/shivam039/token-budget?style=social)
   ```

5. Commit to a new branch and open the PR. Use this PR description:

   ```markdown
   Adding token-budget (https://github.com/shivam039/token-budget) to
   Context & Memory Management — it manages the chat-history side of
   this problem specifically: chainable eviction strategies
   (drop-oldest, sliding-window, priority, summarize), pinned messages,
   atomic tool-call/tool-result pairing so eviction never breaks a
   request, and explain() for a structured trace of every decision.
   Complements the existing entries here, which are retrieval/
   persistent-memory tools rather than conversation-eviction ones.
   ```

---

## Not submitted (deliberately)

**kyrolabs/awesome-langchain** — their `contributing.md` explicitly
states PRs are auto-closed for brand-new repos/contributors. Given
`token-budget`'s repo is 2 days old, submitting now would very likely
just get auto-closed and waste the maintainer's time. Revisit once the
repo has some real age/stars — see `awesome-list-candidates.md` for the
full reasoning.

**sindresorhus/awesome-nodejs** — hard-disqualified right now by an
explicit rule (30+ days old, 100+ stars minimum). Not worth attempting
until the repo clears that bar.
