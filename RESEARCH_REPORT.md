# token-budget Market & Ecosystem Research

## Executive Summary
**token-budget** currently positions itself as a "buffer-management layer underneath whatever you're already using" to keep LLM conversations inside their token budget automatically. It prevents context window blowouts and broken tool-call pairs.
Our research indicates that the most painful context window problems do not lie in standard chat applications (where simple `messages.shift()` often suffices), but in **long-running autonomous and coding agents** where large, unpredictable tool outputs (like compiler logs and code reads) rapidly consume the token budget, and critical instructions must not be shifted out.

The strongest evidence for `token-budget`'s necessity is the proliferation of DIY solutions using complex truncation loops and the frequency of developers struggling with missing context in AI agents. The biggest opportunity is positioning the library as the definitive **context management infrastructure for AI agents** rather than just a token counter.

---

## 1. Competitive Landscape
*OBSERVATION: The ecosystem is crowded with token counters and memory stores, but lacks true mid-layer budget enforcers.*

We searched GitHub and npm for LLM context optimization, memory management, and token budget enforcement tools.

15 strong examples found; additional results were excluded because they were not sufficiently relevant.

| Project | GitHub / npm URL | Stars | Purpose | Language | Ecosystem | Type | Key Features | Major Limitations | Overlaps | Integration Opp |
|---|---|---|---|---|---|---|---|---|---|---|
| **unsloth** | https://github.com/unslothai/unsloth | 74K+ | Fast fine-tuning | Python | Local LLMs | I. Complementary | Quantization, speed | No direct context window mgmt | Low | Fine-tuning outputs |
| **headroom** | https://github.com/headroomlabs-ai/headroom | 67K+ | Context compression | Python | Agents/RAG | H. Direct competitor | Compresses tool outputs/RAG | Modifies content semantics | High | Alternative tool |
| **distill** | https://github.com/Siddhant-K-code/distill | ~170 | Persistent memory | Go | Agents | H. Direct competitor | Dedup, hierarchical decay | No dynamic runtime LLM calls | High | Can consume token-budget |
| **OmniGlyph** | https://github.com/diegosouzapw/OmniGlyph | ~100 | Visual context | TS | Web/Claude | F. Prompt compression | Renders to PNG | Breaks text parsability | Low | Visual proxy only |
| **context-compressor** | https://github.com/Huzaifa785/context-compressor | ~89 | Text compression | Python | RAG/API | H. Direct competitor | Reduce tokens 50-60% | Slows down processing | High | N/A |
| **mercury-agent** | https://github.com/cosmicstack-labs/mercury-agent | 3K+ | Agent execution | TS | Node | E. Agent framework | Built-in token budgets | Locked to their agent | High | Can adopt token-budget |
| **dsh-cost-meter** | https://github.com/Han-1413141/dsh-cost-meter | ~200 | Cost tracking | JS | DeepSeek | G. Observability | Session budgets, pricing | UI only, no mid-flight drop | Low | Visual pairing |
| **context-engine** | https://github.com/Emmimal/context-engine | ~195 | Context layer | Python | General LLM | H. Direct competitor | Memory decay, budgets | Python only, no atomic tools | High | Python port target |
| **composto** | https://github.com/mertcanaltin/composto | ~78 | AST compression | TS | Code Agents | F. Prompt compression | Tree-sitter parsing | Code specific only | Low | Pre-processor |
| **slurp** | https://github.com/CarlosVallejoRuiz/slurp | ~45 | Graph navigation | Python | Code Agents | D. Memory system | Budget-aware navigation | Complex setup | High | N/A |
| **prompt-refiner** | https://github.com/JacobHuang91/prompt-refiner | ~39 | Prompt tools | Python | General LLM | C. Context manager | Auto token optimization | Basic array manipulation | High | Python port target |
| **skim** | https://github.com/dean0x/skim | ~29 | Code optimization | Rust | Code Agents | C. Context manager | Output compression | Rust only | High | N/A |
| **tokenfirewall** | https://github.com/Ruthwik000/tokenfirewall | ~26 | Cost protection | TS | Node | G. Observability | Cost middleware | Doesn't manage chat history | Low | Use together |
| **llm-kit** | https://github.com/SergeevDmitry/llm-kit | ~22 | LLM plumbing | TS | Node | C. Context manager | Token budgets, streams | No complex strategies | High | Direct replacement |
| **token_guard** | https://github.com/abhijitgunjal/token_guard | ~19 | Usage tracking | Python | Cloud APIs | G. Observability | Rate limits, alerts | Doesn't modify messages | Low | Use together |

*INFERENCE:* `token-budget` must differentiate by focusing on reliability (pinned system prompts, atomic tool pairing) and explainability (`budget.explain()`) against these competitors.

---

## 2. Real-World DIY Implementations
*FACT: Developers frequently write custom logic to handle context overflow manually.*

We searched GitHub code and developer forums for developers manually implementing `messages.shift()` and `countTokens`. Due to platform search limitations prioritizing repositories over deep code snippets, we located 5 strong DIY conceptual approaches and actual implementation pain-points.

5 strong examples found; additional results were excluded because they were not sufficiently relevant.

1. **Pi (earendil-works/pi)**
   - *URL:* https://github.com/earendil-works/pi/issues/2626
   - *Problem:* Ollama context overflow errors not detected by auto-compaction.
   - *Solution:* They attempt auto-compaction and chunking but fail gracefully.
   - *Code pattern:* Custom sliding window with threshold.
   - *Framework:* Custom Rust/TS.
   - *What token-budget replaces:* Provides a robust compaction strategy out of the box instead of failing out.
   - *API Attraction:* `budget.addMessage` and `budget.getContext()` with automatic sliding window.
2. **Flagagent (alfa-reza/flagagent)**
   - *URL:* https://github.com/alfa-reza/flagagent/issues/56
   - *Problem:* Large tool responses saturate the context and IPC backpressure.
   - *Solution:* Manual backpressure and payload restriction.
   - *Code pattern:* Early termination on response size.
   - *Framework:* Go/Rust custom.
   - *What token-budget replaces:* Safely truncating tool outputs so they never saturate the budget to begin with.
   - *API Attraction:* Truncation configuration for tool results.
3. **Mog Programming Language (Ted)**
   - *URL:* https://news.ycombinator.com/item?id=47312728
   - *Problem:* Wanted to enforce a token budget on LLM calls so plugins don't burn too many tokens.
   - *Solution:* Manually writing a library inside Mog for budgeting.
   - *Code pattern:* Manual token budgeting library written ad-hoc.
   - *Framework:* Custom / Agent.
   - *What token-budget replaces:* A standard middleware budget enforcer for the host agent.
   - *API Attraction:* Hard budget limit configuration.
4. **Context Window Limit Discarding**
   - *URL:* https://news.ycombinator.com/item?id=42676063
   - *Problem:* Throwing too much data into context ruins the prompt limit.
   - *Solution:* Filtering content explicitly before injecting.
   - *Code pattern:* Static filtering.
   - *Framework:* OpenAI generic.
   - *What token-budget replaces:* Dynamic prioritization of messages instead of static filtering.
   - *API Attraction:* `strategy: strategies.priority()`
5. **The Naive Shift in JS Apps**
   - *Pattern:* `while (countTokens(messages) > maxTokens) { messages.shift(); }`
   - *Problem:* Breaks tool-call pairs when the shift happens.
   - *Solution/Code Pattern:* Naive array shifting.
   - *Framework:* LangChain/AI SDK.
   - *What token-budget replaces:* Replaces custom loops with atomic tool-call pairing and pinned system prompts.
   - *API Attraction:* Guaranteed atomic tool-call pairing.

---

## 3. Developer Pain Evidence
*FACT: AI Agent developers actively struggle with context saturation.*

We searched Hacker News and GitHub Issues.

7 strong examples found; additional results were excluded because they were not sufficiently relevant.

1. **Claude Code forgetting context across sessions**
   - *URL:* https://news.ycombinator.com/item?id=47929504
   - *Date:* Recent (HN discussion).
   - *Problem:* Agents cannot hold onto long-term rules while managing short-term tool outputs. Developers have to build complex "Forge" systems to persist and re-inject context correctly without blowing the limit.
   - *Technology:* Claude Code, Markdown.
   - *Existing Solution:* Custom markdown-based wiki injection.
   - *Pain:* Manually writing complex tooling to inject context.
   - *Could token-budget solve it:* Yes, by combining `pinned: true` system messages with a sliding window budget for standard output.
2. **Context Window limitation forcing fine-tuning**
   - *URL:* https://news.ycombinator.com/item?id=44264946
   - *Date:* Recent.
   - *Problem:* Passing massive code chunks blows up context, pushing developers toward expensive fine-tuning instead of smart context management.
   - *Technology:* Custom scripts.
   - *Existing Solution:* Fine tuning.
   - *Pain:* Expensive and slow iteration cycles.
   - *Could token-budget solve it:* Yes, by managing a strict retrieval token budget.
3. **Context overflow in open source chat interfaces**
   - *URL:* https://github.com/open-webui/open-webui/issues/123
   - *Date:* 2024.
   - *Problem:* Long conversations crash the provider API.
   - *Technology:* Python/JS.
   - *Existing Solution:* `messages.shift()`.
   - *Pain:* Hard 400 errors.
   - *Could token-budget solve it:* Yes, out of the box integration.
4. **Structure shrinking due to token limits**
   - *URL:* https://news.ycombinator.com/item?id=38118719
   - *Date:* 2023.
   - *Problem:* Developer experience suffers because structures shrink and simplify to fit token limits.
   - *Technology:* Generic.
   - *Existing Solution:* Manual text shortening.
   - *Pain:* Loss of quality.
   - *Could token-budget solve it:* No, but it can manage it automatically.
5. **Rate limiting and Token Budget issues in Pro tools**
   - *URL:* https://news.ycombinator.com/item?id=44249173
   - *Date:* Recent.
   - *Problem:* Users complaining about limits on AI products and CLI tools running out of context limits.
   - *Technology:* CLI tools.
   - *Existing Solution:* Paid tiers.
   - *Pain:* UX friction.
   - *Could token-budget solve it:* By compressing the context properly.
6. **Anthropic releasing Context Management**
   - *URL:* https://news.ycombinator.com/item?id=46873260
   - *Date:* Early 2025.
   - *Problem:* Anthropic themselves had to build context editing to clear stale tool calls because the pain was so high.
   - *Technology:* Claude.
   - *Existing Solution:* Provider native.
   - *Pain:* Framework lock in.
   - *Could token-budget solve it:* Token-budget implements this provider-agnostically.
7. **Ollama context overflow errors not detected by auto-compaction**
   - *URL:* https://github.com/bramburn/pi/issues/801
   - *Date:* 2025.
   - *Problem:* Auto-compaction fails or isn't triggered correctly when responses grow too large, causing hard crashes.
   - *Technology:* Ollama/Pi.
   - *Existing Solution:* Broken compaction.
   - *Pain:* Random crashes.
   - *Could token-budget solve it:* Yes, deterministic local budget limits.

*INFERENCE:* The pain isn't just "counting tokens"; it's safely deciding *what to evict* when a coding agent reads a 10,000-line file.

---

## 4. Ecosystem Analysis

| Ecosystem | Demand | Competition | Integration Difficulty | Adoption Potential | Strategic Value | Reasoning |
|---|---|---|---|---|---|---|
| **Vercel AI SDK** | 9/10 | 4/10 | 3/10 | 9/10 | 10/10 | Popular in JS ecosystem. Native truncation is basic array manipulation. High potential for adapter plugin. |
| **LangChain** | 7/10 | 8/10 | 5/10 | 6/10 | 6/10 | Already has built-in `trim_messages`. Adoption requires displacing their native memory module. |
| **OpenAI** | 5/10 | 5/10 | 4/10 | 5/10 | 5/10 | Generic usage; developers usually rely on wrappers. |
| **Anthropic** | 5/10 | 6/10 | 4/10 | 5/10 | 5/10 | Anthropic just introduced native context pruning, reducing urgency but increasing lock-in concerns. |
| **LlamaIndex** | 6/10 | 8/10 | 6/10 | 5/10 | 5/10 | Primarily Python, heavily focused on RAG, already has deep memory handling. |
| **MCP** | 8/10 | 2/10 | 5/10 | 8/10 | 9/10 | Tool outputs blow up context windows fast. Huge opportunity as a middleware. |
| **Coding Agents** | 10/10 | 6/10 | 6/10 | 8/10 | 10/10 | Highest pain point. Long loops and massive compiler logs mandate exact token budgeting. |
| **RAG** | 8/10 | 9/10 | 4/10 | 7/10 | 7/10 | Huge demand but saturated by specialized chunking tools. |
| **Browser Agents** | 6/10 | 4/10 | 7/10 | 5/10 | 6/10 | High DOM context sizes, but a niche market currently. |
| **Research Agents** | 8/10 | 5/10 | 5/10 | 7/10 | 8/10 | Reading 100-page PDFs kills context windows. Strong use case. |
| **Customer Support** | 4/10 | 7/10 | 3/10 | 4/10 | 4/10 | Short conversations, `messages.shift()` usually works fine. |
| **Autonomous Agents** | 10/10 | 5/10 | 6/10 | 8/10 | 10/10 | Crucial infrastructure for agents running for days. |

---

## 5. MCP Opportunity
*Is MCP a meaningful opportunity for token-budget?*

1. **Is MCP a meaningful opportunity?** Yes, but as a middleware, not a server.
2. **What would the MCP server actually do?** A server would be a distraction. The LLM shouldn't manage its own budget via a tool call.
3. **What tools should it expose?** None.
4. **Who would use it?** Framework builders.
5. **What would be technically difficult?** Intercepting the tool outputs reliably before they reach the LLM history.
6. **What makes it different from npm library wrapper?** It shouldn't be an MCP server. It should be a client-side interceptor that handles MCP protocols.
7. **Should it be built?** An MCP *Server*: No. An MCP *Client Middleware*: Yes.

---

## 6. Killer Use Case

| Use Case | Problem Severity | Frequency | Existing Solutions | Willingness to Adopt | Why token-budget fits | Distribution Channel |
|---|---|---|---|---|---|---|
| **1. Autonomous Agents** | High | Constant | Native hacks | High | Precise control | Framework integrations |
| **2. Coding Agents** | High | High | Custom logic | High | Atomic tool pairs | GitHub/HN |
| **3. Research Agents** | High | Med | Chunking | Med | Explainability | RAG communities |
| **4. RAG** | Med | High | Vector DBs | Low | Prioritization | LangChain |
| **5. MCP Agents** | High | Med | None yet | High | Tool truncation | MCP Discord |
| **6. Browser Agents** | Med | Med | DOM parsers | Med | Eviction | specialized repos |
| **7. Chat Apps** | Low | High | `shift()` | Low | Drop oldest | Vercel AI SDK |
| **8. Support** | Low | Med | Summaries | Low | Basic tools | N/A |
| **9. Other** | Low | Low | N/A | Low | N/A | N/A |

**Top 3:** Autonomous Agents, Coding Agents, MCP Agents.

**The Killer Use Case:**
**Long-running autonomous AI agents (Coding & Research).**
*WHY:* A generic chatbot can usually survive with `messages.slice(-10)`. An autonomous coding agent *cannot*. If a coding agent's `tool_call` gets shifted out but the `tool_result` remains, the API rejects the request. If the system prompt (containing the agent's core instructions) is shifted out, the agent lobotomizes itself. `token-budget` solves this exact, highly-technical pain point.

---

## 7. Positioning Recommendation

**Ranked Positioning:**
1. **"Context management infrastructure for AI agents"**
   - Understands immediately: Framework devs, advanced agent builders.
   - Searchability: "AI agent context management" is rising.
   - Differentiation: Signals maturity over basic "token counting".
   - Comp Risk: Low.
2. **"Automatic context compaction for long-running AI agents"**
   - Understands immediately: AI engineers.
   - Differentiation: Focuses purely on long-running.
3. **"Token counting and budgeting library"**
   - Too basic.
4. **"Context management for LLM applications"**
   - Too broad.
5. **"Token management library"**
   - Vague.

*RECOMMENDATION:* Adopt **"Context management infrastructure for AI agents"**. It immediately tells framework builders and agent developers that this handles the hard edge-cases (atomic tool pairing, pinned prompts, exact limits).

---

## 8. Feature Roadmap

**P0 — Must Have**
- **Tool-Output Truncation:** Ability to truncate a specific massive `tool_result` rather than dropping the whole message.
- **Explainability Export:** Visually outputting exactly what was dropped and why (for debugging agent loops).
- **Python Port Completion:** The Python ecosystem is where most heavy agent development occurs. Finish `packages/token-budget-py`.

**P1 — High Value**
- **MCP Client Interceptor:** Middleware to automatically summarize or compress large MCP tool responses before they hit the budget.
- **Automatic Summarization Plugins:** Better callbacks out of the box.

**P2 — Useful Later**
- Context visualization UI.
- Additional obscure tokenizers.

**DO NOT BUILD**
- An MCP Server (architectural mismatch).
- Vector DB integrations (keep it focused on budget, not RAG retrieval).

---

## 9. Distribution Strategy
How a zero-following developer gets the first users:

1. **GitHub Code Search / Issues** - Highest effectiveness for exact matches.
2. **Vercel AI SDK Discord** - High effectiveness.
3. **Hacker News "Show HN"** - High variance, potentially high reward.
4. **Dev.to Technical SEO** - Slow but steady.
5. **Twitter/X** - Low effectiveness without following.
6. **Reddit (r/LocalLLaMA)** - Medium effectiveness.

---

## 10. First 100 Users Strategy

**Exact plan:**
1. Search GitHub issues for `"LangChain" AND "memory" AND "tool_call"`. Find users getting 400 errors.
2. Reply with a short snippet of `TokenBudget` wrapping their existing framework.
3. Post a detailed tutorial on Dev.to: "Building an Autonomous Agent that doesn't forget its System Prompt".
4. Target the Vercel AI SDK GitHub Discussions board, which is highly active, providing `token-budget` as the solution to "how do I limit context?".

---

## 11. Evidence / Sources
- GitHub Search APIs (Repositories, Issues)
- npm Registry Data
- Hacker News Algolia Search API
*(All specific URLs referenced inline above)*

---

## 12. Recommended Actions
1. **Update README:** Pivot positioning to emphasize AI Agents and the danger of breaking tool-call pairs.
2. **Evangelize the Pain:** Write content explicitly detailing why standard array shifting breaks LLM APIs (due to dangling tool results).
3. **Target Python:** Accelerate the Python port. While Node/TS is great for Vercel AI SDK, heavy autonomous agent logic is predominantly written in Python.
