# Phase B & C — AlternativeTo and AI Tool Directories

Research date: 2026-08-28. Method note: several of these domains (theresanaiforthat.com, devhunt.org, saashub.com) are blocked at the network egress-proxy level in this environment, so their live submission/pricing pages could not be fetched directly (confirmed via the proxy's own error, not a tool limitation). Figures below come from the sites' own linked pages where fetchable, and otherwise from third-party submission-guide sites, cross-checked across multiple independent sources. Nothing here is invented — where a figure is third-party-sourced rather than confirmed on the vendor's own page, it's flagged.

## Overall honest take

`token-budget` is a **backend npm library** — code a developer imports, not a hosted app/website with a UI. Almost every directory below is built around "AI tools" in the *ChatGPT-wrapper / SaaS product with a homepage and screenshot* sense: image generators, writing assistants, chatbots. A library that ships as `npm install` doesn't have a "product page" screenshot, a pricing model in their sense, or an end-user to review it. Forcing a listing into these directories mostly produces a low-value, half-fitting entry. The two genuine fits in this whole batch are **SaaSHub** (general software/dev-tool directory, not consumer-AI-only) and **DevHunt** (explicitly built for developer tools). Everything else ranges from "technically possible but wrong audience" to "paid and wrong audience."

---

## Phase B — AlternativeTo

- **Submission process (confirmed via AlternativeTo's own FAQ and the site's help content):** Create an account, use "Suggest new application" from the user menu. A new account must be at least 7 days old before it's allowed to submit. Fill in Platforms, License, Description, Tags, then submit. Review takes roughly a few days to a week.
- **Free:** Yes, listing is free.
- **Fit — checked honestly:** AlternativeTo's model is "X is an alternative to well-known app Y," driven by user upvotes/comparisons. That said, AlternativeTo does maintain an npm-packages platform/category (browsing turns up npm libraries like Sucrase and Windmillcode Angular CDK already listed there), so a library submission is not technically barred.
- **The real problem:** token-budget isn't "an alternative to" any specific well-known named product — there's no obvious anchor app for people to be comparing it against, which is the entire mechanism AlternativeTo's discovery relies on (browsing "alternatives to X"). Traffic to library-type entries on AlternativeTo tends to be minimal for exactly this reason — nobody browses AlternativeTo already knowing to search "token budget library."
- **Verdict:** Technically permitted, but a poor mechanistic fit. Low priority — free enough to eventually do as a five-minute afterthought, but not worth prioritizing over the GitHub Topics / awesome-list work in Phase A, which will reach the actual target audience (developers building agents) far more directly.

---

## Phase C — AI tool directories

| Site | Free? | Accepts developer libraries? | Worth submitting? | Action |
|---|---|---|---|---|
| **There's An AI For That** (theresanaiforthat.com) | No self-serve free tier — reported one-time fee (~$347 per third-party guides, could not confirm on their own pricing page from this environment). A free route exists only as a monthly X/Twitter thread where they pick **one** tool out of the thread. | Consumer AI-tool directory (chatbots, generators, GPTs); not built for npm packages. | No | Skip — paid tier not justified for a free OSS library; the "free" route is a monthly lottery, not a submission channel. |
| **Toolify** (toolify.ai) | Paid: one-time ~$99 for standard listing. Some third-party guides mention a slower "free queue" (2–4 weeks) but sources conflict and this isn't confirmed on Toolify's own page. | Consumer AI-tool directory. | No | Skip — cost unjustified, wrong audience even if free option exists. |
| **SaaSHub** (saashub.com) | **Yes, free** self-service listing (optional paid boost to rank above competitors). Submit via "Submit a Product," paste URL, fill name/tagline/category/alternatives. Approval typically 1–2 days. | General software directory — lists SaaS products *and* developer tools/libraries, broader than "consumer AI tool" sites. | **Yes** | Submit — free, fast, closest fit to an actual dev-tool audience among this list. |
| **Futurepedia** (futurepedia.io) | **No free tier at all.** Basic listing $197; "Verified" listing $497. | Consumer AI-tool directory (listicle style). | No | Skip — no free option, and not the target audience regardless. |
| **AI Tool Hunt** (aitoolhunt.co) | Free tier exists ($0) but requires placing a dofollow backlink badge to them on your own site to stay free; paid tiers ($9.90, $19.90/wk) remove that requirement / add placement. | Has a "Developer Tools" category, but overall framing is still consumer "AI tools," not npm packages specifically. | Marginal | Optional only if a backlink badge on the repo/site is acceptable — otherwise skip. Not a priority. |
| **Dang.ai** | Free tier exists but requires embedding their verification badge on your own site; paid removes that requirement. | Broad AI tools directory, not library-specific. | Marginal | Same caveat as AI Tool Hunt — optional, low priority, decide based on whether a badge is acceptable. |
| **Uneed** (uneed.best) | **No longer free** — the free queue closed to new submissions Aug 17 2026. Now $14.99 (fast-track, ~2 week wait) or $29.99 (pick your own date). | General Product-Hunt-style launch site for startups/products, not library-specific. | No | Skip — no free option currently, and it's a "launch" site (one-time spike), not an ongoing discovery channel; wrong fit for a library with no landing-page "launch" moment. |
| **DevHunt** (devhunt.org) | **Yes, free** submission; optional $49 paid "featured" upgrade for extra visibility. | **Yes — explicitly built as "Product Hunt for developer tools."** Best taxonomy fit of everything in Phase C. | **Yes** | Submit — free tier, and it's the one site in this list actually built for exactly this kind of product. |
| **BetaList** (betalist.com) | **No free tier** — now entirely paid, reported range ~$28.99–$129 depending on plan/tier (BetaList used to be free; that changed). | Pre-launch startup discovery site, not library-specific — also token-budget isn't "pre-launch," it's already published. | No | Skip — paid, wrong stage (pre-launch startups), wrong audience. |

## Bottom line for Phase C

Only **SaaSHub** and **DevHunt** are both free and a reasonable fit. AI Tool Hunt and Dang.ai have a free-with-badge option that's plausible but not a priority. Everything else is either paid-only, built for consumer AI products rather than npm libraries, or both. None of these AI-tool directories reach "developers building LLM agents" nearly as directly as the GitHub Topics fix and the two awesome-list PRs identified in Phase A — those should be the real priority.
