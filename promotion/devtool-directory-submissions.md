# DevHunt / DevPages / DevTool.io / jsDelivr / daily.dev

Requested directly (2026-08-31): submit `token-budget` to DevHunt,
DevPages, DevTool.io "wherever it's free," then daily.dev and jsDelivr
added mid-request. Findings differ per channel — two (DevHunt, DevPages,
DevTool.io) are free directory listings that need a human to finish; one
(jsDelivr) needs **no action at all**, it's already live; one (daily.dev)
isn't actually a fit for what this project is. See each section below.

## Why this wasn't submitted automatically

- **`devhunt.org` and `devpages.io` are blocked by this sandbox's outbound
  network egress policy** — confirmed directly (not assumed): a `WebFetch`
  to both returned `EGRESS_BLOCKED`, the same restriction that blocked
  reaching the deployed Render URL earlier in this session. This isn't a
  login problem, it's that this session cannot reach either domain at all.
  (This matches what the prior promotion research already found for
  `devhunt.org` — see `ai-directories-research.md`'s method note.)
- **No browser-automation tool is available in this session** — form
  submission on all three sites happens through a web UI (DevHunt
  explicitly requires signing in via Google, GitHub, or email first), and
  there's no API endpoint documented for any of them that a plain HTTP
  request could hit instead.
- **Even if reachable, these should go under a real human account, not an
  agent's** — DevHunt's flow asks for "founder story" and community
  engagement (replying to comments, participating), which only makes
  sense tied to an actual person's account, not created ad hoc here.

## Submission package (identical facts across all three — canonical
source: `descriptions.md`, nothing invented for this pass)

- **Name:** token-budget
- **Tagline / one-liner:** Keep long-running AI agents inside their context window.
- **Short description (50–80 words):**
  > token-budget is a TypeScript library that keeps multi-turn LLM
  > conversations under a token budget as they grow. It applies eviction
  > strategies — drop-oldest, sliding-window, priority, and summarization —
  > that chain together, while preserving pinned system messages and atomic
  > tool-call/tool-result pairs so eviction never breaks a request mid-flight.
  > Every decision is inspectable via `explain()`. Adapters exist for OpenAI,
  > Anthropic, the Vercel AI SDK, LangChain.js, and tiktoken. Zero required
  > runtime dependencies, Node ≥18, browser/edge compatible, MIT licensed.
- **Longer description (150–200 words):** see `descriptions.md`'s "150–200
  word description" section — use verbatim if a field allows that length.
- **Category / tags:** Developer Tools, AI/ML, LLM Tooling, TypeScript,
  Node.js. Keyword list for any "tags" field: see `keywords.md`.
- **Website / primary URL:** https://github.com/shivam039/token-budget
- **GitHub URL:** https://github.com/shivam039/token-budget
- **npm URL:** https://www.npmjs.com/package/@shivam.dixit/token-budget
- **Pricing:** Free / Open Source (MIT)
- **Logo / screenshot:** **none exists in the repo yet** — checked; no
  `.png`/`.svg`/logo file anywhere outside auto-generated coverage-report
  assets. Every one of these three sites' forms will likely ask for at
  least a square logo/icon. If a field is required and blocking, the
  fastest option is a plain text-on-background "token-budget" square PNG;
  none is provided here since generating brand assets wasn't asked for.

## Per-site notes

### DevHunt (devhunt.org)

Already researched in `ai-directories-research.md` (2026-08-28): free
self-service submission, optional $49 paid "featured" upgrade (skip it —
not asked for and not justified for a docs/OSS pass). Flow per DevHunt's
own site (confirmed via web search this session, page itself unreachable
from here): sign in with Google/GitHub/email → "Submit your Dev Tool" →
"New Tool" → fill in the fields above.

### DevPages (devpages.io)

New to this pass — not in the earlier research. Submission form is at
`devpages.io/submit-a-tool` (confirmed via web search; page itself
unreachable from here to inspect exact fields). Described as team-reviewed
(not instant), free, no paid tier mentioned anywhere found. Categories on
the site include AI, DevOps, APIs, databases — "AI/ML Tooling" or
"Developer Tools" is the closest fit category from the list above.

### DevTool.io (devtool.io)

New to this pass. No dedicated submission-form URL was confirmed by
search (site is unreachable from here to inspect); "Submit a Tool" is
described as appearing in the site's navigation and on category pages
(e.g. `devtool.io/category/ai-ml` or `/category/backend`). The closest
existing category the site lists is **AI/ML** or **Backend** — token-budget
doesn't map cleanly to either, being a context-management library rather
than a model/inference tool or a backend framework; pick whichever the
live form actually offers closest to "AI/ML Tooling" or "Libraries."

## jsDelivr — already live, nothing to submit

**No action needed or possible.** jsDelivr automatically serves every
package published to the public npm registry — no submission, review, or
account of any kind exists for individual packages; this is documented
directly on jsDelivr's own GitHub repo and site. Every `token-budget`
package is already being served, right now, at:

- `https://cdn.jsdelivr.net/npm/@shivam.dixit/token-budget/`
- `https://cdn.jsdelivr.net/npm/@shivam.dixit/token-budget-openai/`
- (same pattern for every other published package under the `@shivam.dixit` scope)

New versions become available automatically the moment they're published
to npm — nothing in this project needs to change for this to be true, and
there's no listing to make more "complete" beyond publishing to npm
itself (see `docs/RELEASE_STATUS.md` for what's actually published).
This item is done — not because it was submitted, but because there was
never anything to submit.

## daily.dev — not actually a fit, explained honestly rather than forced

Checked directly (`docs.daily.dev`'s own submission guide, 2026-08-31):
daily.dev's "Suggest new source" mechanism adds an entire **publication's
RSS feed** as an ongoing content source — eligibility is explicitly
scoped to "a well-known publication or developer blogging platform,"
and the docs state plainly that "corporate and personal blogs are not
eligible." `token-budget` is a GitHub repo with a `CHANGELOG.md`, not a
blog or publication with an RSS feed — there's nothing here that fits
what a "Source" actually is on daily.dev, and submitting the repo as one
would very likely be rejected on eligibility grounds alone, not quality.

The closer fit is daily.dev's **Squads** (community link-sharing, similar
in spirit to posting the repo link on Reddit or Hacker News, which are
already drafted in `community-posts.md`) — but that's a one-off community
post under a real person's account, not a directory listing, and
`daily.dev` is itself blocked by this sandbox's egress policy the same
way the three sites above are, so it has the same "needs a human, from a
normal browser" limitation. Not drafted as its own item here since it's
mechanically the same action as the existing Reddit/HN drafts — reuse
those if you want a daily.dev Squad post too.

## What's needed to actually finish the three directory listings

Visit DevHunt, DevPages, and DevTool.io from a normal browser, sign in
with whichever account you want the listing tied to, and paste the
fields from the submission package section above. Total time is a few
minutes per site once reachable — the content itself is already written
and doesn't need drafting from scratch. jsDelivr needs nothing further;
daily.dev isn't a fit as a "Source" (see above).
