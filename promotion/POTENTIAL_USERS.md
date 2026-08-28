# Potential token-budget Users — Research Notes

Research date: 2026-08-28. Goal: find real, actively-maintained TypeScript/JavaScript AI-agent or
LLM-application projects that currently roll their own naive/fragile conversation-history trimming,
where `token-budget` (https://github.com/shivam039/token-budget) would genuinely help.

Methodology: GitHub code search (`messages.shift()`, `.slice(-N)`, `trimHistory`, `truncateMessages`,
`pruneHistory`/`compactHistory`, `"drop oldest"`) across TypeScript repos, filtered to small/medium
AI-agent projects (excluding LangChain and other frameworks that already solve this well), then
verified each candidate's activity (recent commits/pushes) and read the actual trimming code via
raw GitHub file fetches.

**This is discovery only. No issues, PRs, or contact were made.** Every entry below is marked with
a recommended outreach posture; most should be "aware of only" per the task instructions — unsolicited
promotional contact is not okay, and the human should decide case-by-case.

---

### Kimchi
- **Repository:** getkimchi/kimchi
- **URL:** https://github.com/getkimchi/kimchi
- **Technology:** TypeScript terminal coding agent with multi-model orchestration (OpenAI, Anthropic, and others via its own routing layer). 2,214 stars, 132 forks — the most popular project found in this search.
- **Current context-management approach:** Hand-rolled `truncateMessages()` in `src/extensions/model-guard.ts`. Walks messages newest-to-oldest accumulating an estimated token count (chars/4-style estimate), finds a cutoff index, slices the array, and prepends a synthetic "⚠️ Context truncated to fit model context window." user message. Uses a flat 0.95 `SAFETY_MARGIN` constant and always protects only the last 2 messages as a floor.
- **Why token-budget may be relevant:** This is a textbook drop-oldest-with-safety-margin implementation — exactly one of token-budget's built-in strategies — but built from scratch with a char/4 token estimator instead of a real tokenizer (token-budget ships a tiktoken adapter), no atomic tool-call/tool-result pairing guarantee (slicing at an arbitrary cutoff index can orphan a `tool_result` from its `tool_use`), and no `explain()`-style decision trace for why a given cutoff was chosen.
- **Evidence:** `src/extensions/model-guard.ts` — `export function truncateMessages(messages: ContextEvent["messages"], maxTokens: number)`, with `SAFETY_MARGIN = 0.95` and `TRUNCATE_NOTICE = "⚠️ Context truncated to fit model context window.\n\n"`. Triggered from a "context" event handler when a session is restored onto a smaller model.
- **Potential integration:** Swap `truncateMessages()` for token-budget's sliding-window/drop-oldest strategy with the tiktoken adapter, gaining atomic tool pairing and model-specific context-window presets for free.
- **Contact/issue/PR opportunity:** Aware of only. High-visibility, high-star project — any outreach should go through the human, not an unsolicited PR/issue from us given the project's popularity and existing (functioning) implementation.

### Aiden
- **Repository:** taracodlabs/aiden
- **URL:** https://github.com/taracodlabs/aiden
- **Technology:** TypeScript autonomous desktop AI agent (browser control, terminal execution, workflows). 796 stars, 140 forks, AGPL-3.0. Pushed as recently as 2026-08-24 — very active.
- **Current context-management approach:** A multi-layered, entirely hand-built compaction pipeline in `core/agentLoop.ts`: `preflightCompressionCheck()` estimates tokens via `Math.ceil(text.length / 4)`, compares against a `MODEL_CONTEXT_LIMITS` table, and at >50% usage keeps the first 2 messages + last 10 messages and collapses everything else into one summarized message. A separate `flushMemoryFromMessages()` extracts user content into semantic memory before discarding it, and `rebuildContextAfterCompaction()` re-injects protected files (SOUL.md, STANDING_ORDERS.md, etc.) as system messages after compaction so identity/instructions survive.
- **Why token-budget may be relevant:** This is essentially a homegrown, more elaborate version of token-budget's pinned-messages + summarize + chainable-strategy design (pinned "protected blocks" ≈ token-budget's pinned messages; the first-2/last-10 keep rule ≈ sliding window; the summarize-then-fallback shape ≈ token-budget's summarize strategy). The char/4 token estimate and ad-hoc percentage thresholds are exactly the fragile parts token-budget's tokenizer adapters and `explain()` are built to replace.
- **Evidence:** `core/agentLoop.ts` — `protectedStart = messages.slice(0, 2)`, `protectedEnd = messages.slice(-10)`, `middleMessages = messages.slice(2, -10)`, with `[COMPRESSED CONTEXT — ${middleMessages.length} messages summarized]` injected as the replacement content.
- **Potential integration:** Replace the custom threshold/slice logic with token-budget's pinned-message + summarize-then-drop-oldest chain, keeping their existing protected-file re-injection as pinned messages.
- **Contact/issue/PR opportunity:** Aware of only. Large, actively maintained, single-maintainer-led project with its own opinionated memory architecture — a good candidate for the maintainer to discover organically (e.g. blog post, npm listing) rather than an unsolicited PR touching core agent internals.

### Franklin
- **Repository:** BlockRunAI/Franklin
- **URL:** https://github.com/BlockRunAI/Franklin
- **Technology:** TypeScript autonomous economic agent ("AI agent with a wallet"), Apache-2.0. 550 stars, 53 forks. Pushed 2026-08-26 — very active.
- **Current context-management approach:** `src/agent/compact.ts` implements LLM-based summarization with an ROI gate — `projectCompactionSavings()` only summarizes if projected savings exceed 20% of current tokens — plus a `microCompact()` step that clears/truncates stale tool results before falling back to full summarization, and finally an `emergencyTruncate()` that (per its own comment) is an "Emergency fallback: drop oldest messages until under threshold. Used when the summarization model call itself fails," while trying to keep the first message a user message.
- **Why token-budget may be relevant:** This is close to a hand-built version of token-budget's chainable strategies (summarize → drop-oldest fallback) plus a bespoke tool-result-shrinking pass. It's a strong signal that this team has already felt the need for exactly the layered strategy pattern token-budget provides out of the box, including the "what happens when summarization itself fails" edge case.
- **Evidence:** `src/agent/compact.ts` — `emergencyTruncate()` comment: "Emergency fallback: drop oldest messages until under threshold. Used when the summarization model call itself fails."; `projectCompactionSavings()` gating compaction on a 20% token-savings threshold.
- **Potential integration:** Token-budget's chainable strategy API (summarize with configurable model, then drop-oldest fallback, with atomic tool-pairing preserved throughout) maps almost directly onto Franklin's existing three-tier design, potentially replacing ~200+ lines of custom logic.
- **Contact/issue/PR opportunity:** Aware of only. Active funded-looking project with a already-sophisticated custom solution; better suited to organic discovery than unsolicited contact.

### BrowserBee
- **Repository:** parsaghaffari/browserbee
- **URL:** https://github.com/parsaghaffari/browserbee
- **Technology:** TypeScript Chrome-extension browser-automation agent ("Cline for web browsing") using the Anthropic API directly (`Anthropic.MessageParam[]`). 982 stars, 79 forks, Apache-2.0.
- **Current context-management approach:** `src/agent/TokenManager.ts` exports `trimHistory(msgs: Anthropic.MessageParam[], maxTokens = 12_000)`. Always keeps message 0 and every user message, then greedily re-adds assistant messages newest-first until the token budget (a rough char-based `contextTokenCount`) is exhausted, dropping the rest.
- **Why token-budget may be relevant:** Because it selectively removes individual assistant messages by token cost without regard for Anthropic's `tool_use`/`tool_result` pairing requirement, this trimming can produce an invalid message sequence (a `tool_result` block whose matching `tool_use` was dropped), which the Anthropic API will reject. This is precisely the "atomic tool-call/tool-result pairing" problem token-budget is designed to solve.
- **Evidence:** `src/agent/TokenManager.ts`, `MAX_CONTEXT_TOKENS = 12_000`, and the two-pass keep-user/re-add-assistant-newest-first loop with no tool-pair awareness.
- **Potential integration:** Token-budget's Anthropic adapter with atomic pairing would directly fix a latent correctness bug (invalid tool_result sequences) in addition to simplifying the code.
- **Contact/issue/PR opportunity:** Worth flagging as a possible **issue** (not PR) about the tool-pairing risk specifically, since it is a plausible functional bug, not just a style preference — but this is a judgment call for the human; do not file without their sign-off. Note: last push was 2025-10-22 (~10 months old as of this research), so repo activity has slowed even though it remains a well-known, high-star project.

### NeuroNest
- **Repository:** NETGVai/NeuroNest
- **URL:** https://github.com/NETGVai/NeuroNest
- **Technology:** TypeScript, Electron-based "agent-first IDE," uses the OpenAI SDK (`openai@6.33.0`) plus multi-channel bot integrations (Discord/Slack/Telegram/WhatsApp). 18 stars, 14 forks. Pushed 2026-08-20 — active.
- **Current context-management approach:** `src/pipeline/sub-agent-context-isolator.ts` computes a per-sub-agent token budget (`computeInputTokenBudget()` off the active model's context length, minus a reserved amount, floored at 1) and, when no context summarizer is configured, falls back to `while (scope.messages.length > 1 && totalTokens(scope.messages) + messageCost > scope.tokenBudget) { /* remove first non-system message */ }`.
- **Why token-budget may be relevant:** A near-exact re-implementation of token-budget's drop-oldest strategy with a manual token-budget calculator, built specifically to isolate context per sub-agent in a multi-agent pipeline — the same use case token-budget's per-conversation budget tracking targets.
- **Evidence:** `src/pipeline/sub-agent-context-isolator.ts` — comment "No summarizer available — drop oldest non-system messages to make room," with the while-loop shown above.
- **Potential integration:** Token-budget could back each sub-agent's isolated context window directly, replacing the custom `computeInputTokenBudget()` + manual loop.
- **Contact/issue/PR opportunity:** Aware of only. Small but active project; a well-timed issue comment could be appropriate later but is not something to initiate unprompted.

### Open Walnut
- **Repository:** EvanZhang008/open-walnut
- **URL:** https://github.com/EvanZhang008/open-walnut
- **Technology:** TypeScript, "personal AI butler powered by Claude" — task management, Claude Code sessions, memory system, self-hosted web UI. 28 stars, 8 forks, MIT. Pushed 2026-08-24 — active.
- **Current context-management approach:** `src/agent/token-budget.ts` (name coincidentally matches our package) implements a two-stage guard: Stage 1 soft-trims large tool-result blocks in older messages (keeps head/tail of anything over 3,000 chars, replaces the middle with a "[trimmed N chars]" marker, shields the last 3 user turns) using a suffix-sum precomputation to avoid O(n²) re-estimation; Stage 2, only if Stage 1 isn't enough, deletes whole oldest messages from the front (minimum 4 messages kept, only starts deletion on a valid user message so tool pairs aren't orphaned).
- **Why token-budget may be relevant:** This is the most sophisticated hand-rolled implementation found in this search — it already independently arrived at several of token-budget's design principles (tool-call/tool-result pairing safety, priority-preserving trimming, staged strategies) using a custom `~4 chars/token` estimator and an 84%-of-context-window working budget. It's strong evidence the pattern is worth productizing, and a natural candidate to eventually replace ~150+ lines of custom logic with the library (plus gain a real tokenizer via the tiktoken adapter and `explain()` for debugging why a message was dropped).
- **Evidence:** `src/agent/token-budget.ts` — 84% context-window budget ("~16% headroom for output + estimation slack"), Stage 1 tool-result shrinking (1,000 chars head/tail, 3,000-char trigger, last-3-turns protection), Stage 2 whole-message deletion (min 4 messages, user-message-aligned cuts).
- **Potential integration:** Directly swap the file's exports for token-budget's summarize/priority + drop-oldest chain with the tool-result-shrink step modeled as a custom eviction strategy.
- **Contact/issue/PR opportunity:** Aware of only. Given the near-identical naming and philosophy, this maintainer in particular may be receptive to hearing about token-budget — but that determination and any outreach is for the human to make, not for us to initiate.

### OpenCode Warden
- **Repository:** toreuyar/opencode-warden
- **URL:** https://github.com/toreuyar/opencode-warden
- **Technology:** TypeScript security plugin for OpenCode (a coding-agent CLI) — intercepts tool calls to detect secrets, redact sensitive data, and evaluate safety risk. 9 stars, 1 fork, MIT. Pushed 2026-07-18 — active.
- **Current context-management approach:** `src/llm/context.ts` defines a `ConversationContext` class with `maxPairs` (default 5) and `maxChars` (default 16,000) limits. Trimming is two-stage and sequential: first drop oldest message pairs if `history.length > maxPairs` (`this.history.shift()`), then apply a character-based cap by dropping oldest pairs until under the char budget. An optional `detectionsOnly` mode keeps only exchanges that contain a security detection.
- **Why token-budget may be relevant:** A clean, minimal example of the sliding-window + drop-oldest strategy token-budget ships as a default — built here specifically to bound an LLM conversation used for security risk evaluation, with the same "pairs must stay aligned" concern token-budget's atomic pairing addresses.
- **Evidence:** `src/llm/context.ts` — `maxPairs` default 5, sequential shift-then-char-trim logic, `detectionsOnly` selective retention.
- **Potential integration:** Token-budget's sliding-window strategy (max-pairs equivalent) plus a priority strategy for `detectionsOnly` could replace the class's manual trimming methods.
- **Contact/issue/PR opportunity:** Aware of only. Small, focused plugin; low urgency, no clear open issue about this specifically.

### Weixin AI Bridge
- **Repository:** yansc153/weixin-ai-bridge
- **URL:** https://github.com/yansc153/weixin-ai-bridge
- **Technology:** TypeScript bridge connecting WeChat to Claude Code, OpenAI, Anthropic, and Ollama. 68 stars, 4 forks.
- **Current context-management approach:** The exact same `compressHistory()` logic is implemented **twice**, once per provider adapter — `src/agents/openai.ts` and `src/agents/ollama.ts` — each checking `history.length <= MAX_MESSAGES_BEFORE_COMPRESS`, then keeping the system message, `history.slice(1, 6)` as early context, `history.slice(-10)` as recent context, and inserting a static "[earlier conversation summarized]" placeholder text (not an actual generated summary) in between.
- **Why token-budget may be relevant:** The duplication across two provider files is itself the strongest evidence of the exact problem token-budget's provider adapters solve: this logic should live once, adapter-agnostic, rather than being copy-pasted per LLM backend. The "summary" isn't a real summary (no LLM call), just a fixed placeholder string — a good candidate for token-budget's real `summarize` strategy or, more simply, its drop-oldest/sliding-window strategy applied once instead of per-provider.
- **Evidence:** `src/agents/openai.ts` and `src/agents/ollama.ts`, both defining `function compressHistory(history)` with identical `early = history.slice(1, 6)` / `recent = history.slice(-10)` logic and an identical static summary placeholder.
- **Potential integration:** Centralize both adapters on a single token-budget instance instead of maintaining duplicate trimming code per provider.
- **Contact/issue/PR opportunity:** Aware of only. Last push was 2026-03-22 (~5 months old as of this research) — activity has cooled, so lower priority than the actively-maintained candidates above, though the evidence itself is compelling.

---

## Summary of Activity Status

| Project | Stars | Last Push | Status |
|---|---|---|---|
| kimchi | 2,214 | 2026-08-27 | Very active |
| aiden | 796 | 2026-08-24 | Very active |
| Franklin | 550 | 2026-08-26 | Very active |
| browserbee | 982 | 2025-10-22 | Slowed (~10 mo) |
| NeuroNest | 18 | 2026-08-20 | Active |
| open-walnut | 28 | 2026-08-24 | Active |
| opencode-warden | 9 | 2026-07-18 | Active |
| weixin-ai-bridge | 68 | 2026-03-22 | Slowed (~5 mo) |

## Candidates investigated and excluded (weak match or too stale)

- **newrelic-experimental/preflight** — `context-tracker.ts` uses `history.shift()`, but this bounds a local *metrics/observability* buffer, not conversation history sent to an LLM. Not a real fit despite matching the search pattern.
- **dkyazzentwatwa/Cyber-Claude** (98 stars) — last commit 2025-12-29, ~8 months stale; excluded on activity grounds.
- **miskibin/asystent-rp**, **stukennedy/fluxgraph**, **DafinEdison/agentic-seo-agent**, **sarmadsangi/openrouter-code**, **plyght/angel**, **presidio-oss/factif-ai** — all had matching naive-trimming code (`slice(-10)` patterns, `trimHistory`/`truncateMessages` functions) but pushes ranging from 6 months to over a year old, or (for openrouter-code) zero stars/forks/engagement — did not meet the "genuinely active" bar for this list.
