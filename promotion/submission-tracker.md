# Submission tracker

Every channel considered for this distribution pass, with an honest
status. Nothing is marked SUBMITTED or ACCEPTED unless it actually
happened and was confirmed — a DRAFT READY or PR OPEN status means work
is prepared but a human still needs to act (post/monitor), per the
task's explicit "do not automate spam" constraint.

Status values: NOT CHECKED · NOT RELEVANT · PAID — SKIPPED · DRAFT READY
· SUBMITTED · PR OPEN · ACCEPTED · REJECTED · WAITING · COMPLETED

| Channel | Type | URL | Status | Date | Free? | Referral value | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| npm registry | Package registry | https://www.npmjs.com/package/@shivam.dixit/token-budget | COMPLETED | Ongoing (this session) | Free | HIGH | Already published; the actual product surface, not a "submission." |
| GitHub repo README/docs | Code host / discovery | https://github.com/shivam039/token-budget | COMPLETED | Ongoing | Free | HIGH | README, FAQ, guides, comparisons already optimized in prior SEO/AEO pass. |
| **GitHub repo Topics/description** | Repo metadata | Repo Settings → About | **WAITING (manual action needed)** | 2026-08-28 | Free | HIGH | **Confirmed still blank** ("No description, website, or topics provided") — no tool in this session can set it; 1-minute manual fix, see final report recommended action #1. |
| libraries.io | Package index | — | NOT RELEVANT | 2026-08-28 | Free | LOW | Auto-indexes from npm; no submission mechanism exists. Domain blocked in this sandbox so live entry couldn't be confirmed, but no action is possible either way. |
| npms.io | Package search | — | NOT RELEVANT | 2026-08-28 | Free | LOW | Same as libraries.io — automatic, no submission mechanism. |
| AlternativeTo | Product directory | https://alternativeto.net | DRAFT READY | 2026-08-28 | Free | LOW | Confirmed technically permitted (npm packages exist there) but weak mechanistic fit — no "alternative to X" anchor app. Low priority. |
| There's An AI For That | AI directory | theresanaiforthat.com | PAID — SKIPPED | 2026-08-28 | No (~$347, or a monthly lottery) | LOW | Consumer AI-tool audience, not npm packages. |
| Toolify | AI directory | toolify.ai | PAID — SKIPPED | 2026-08-28 | No (~$99) | LOW | Consumer AI-tool audience. |
| SaaSHub | Product directory | saashub.com | DRAFT READY | 2026-08-28 | **Yes, free** | MEDIUM | Confirmed free self-service listing; general software/dev-tool directory, genuine fit. Needs a human account to submit. |
| Futurepedia / FutureTools | AI directory | futurepedia.io | PAID — SKIPPED | 2026-08-28 | No ($197+) | LOW | No free tier at all. |
| AI Tool Hunt | AI directory | aitoolhunt.co | NOT RELEVANT | 2026-08-28 | Free tier requires a dofollow backlink badge | LOW | Marginal — optional only if a badge on the repo/site is acceptable. Not prioritized. |
| Dang.ai | AI directory | dang.ai | NOT RELEVANT | 2026-08-28 | Free tier requires a verification badge | LOW | Same caveat as AI Tool Hunt. |
| Uneed | Product directory | uneed.best | PAID — SKIPPED | 2026-08-28 | No — free queue closed 2026-08-17 | LOW | One-time "launch" site, not an ongoing discovery channel anyway. |
| DevHunt | Dev-tool launch site | devhunt.org | DRAFT READY | 2026-08-28 | **Yes, free** | MEDIUM-HIGH | Confirmed free; explicitly built as "Product Hunt for developer tools" — best taxonomy fit of the whole directory list. Needs a human account to submit. |
| BetaList | Startup directory | betalist.com | PAID — SKIPPED | 2026-08-28 | No (~$29–$129) | LOW | Also wrong stage — token-budget is already published, not pre-launch. |
| pleasedodisturb/awesome-llm-token-optimization | GitHub awesome-list | github.com/pleasedodisturb/awesome-llm-token-optimization | DRAFT READY | 2026-08-28 | Free | HIGH | Best-fit candidate, dedicated Context Window Management section, no age/star rule. Exact PR content in `awesome-list-submissions.md`. Not opened as a real PR — this session's GitHub access is scoped to shivam039/token-budget only (verified via a real, rejected add_repo attempt). |
| congvmit/awesome-llm-token-reduction | GitHub awesome-list | github.com/congvmit/awesome-llm-token-reduction | DRAFT READY | 2026-08-28 | Free | MEDIUM-HIGH | Strong scope fit, thinner community. Same access limitation as above — content ready in `awesome-list-submissions.md`. |
| kyrolabs/awesome-langchain | GitHub awesome-list | github.com/kyrolabs/awesome-langchain | NOT RELEVANT (for now) | 2026-08-28 | Free | MEDIUM | Explicit rule auto-closes PRs from brand-new repos/contributors — token-budget's repo is 2 days old. Revisit in a few weeks. |
| sindresorhus/awesome-nodejs | GitHub awesome-list | github.com/sindresorhus/awesome-nodejs | REJECTED | 2026-08-28 | Free | LOW (too broad anyway) | Hard-disqualified by an explicit rule (30+ days old, 100+ stars) that token-budget doesn't yet meet. |
| Hacker News (Show HN) | Community launch | news.ycombinator.com | DRAFT READY | 2026-08-28 | Free | HIGH | Draft in community-posts.md; requires a human account, not auto-posted. |
| Reddit r/node | Community | reddit.com/r/node | DRAFT READY | 2026-08-28 | Free | MEDIUM | Verify current subreddit rules before posting — not confirmed live in this pass. |
| Reddit r/javascript | Community | reddit.com/r/javascript | DRAFT READY | 2026-08-28 | Free | MEDIUM | Verify current rules (possible megathread-only policy) before posting. |
| Reddit r/LocalLLaMA | Community | reddit.com/r/LocalLLaMA | DRAFT READY | 2026-08-28 | Free | HIGH | Best-fit subreddit — audience is people running long agent/model sessions. |
| Reddit r/SideProject | Community | reddit.com/r/SideProject | DRAFT READY | 2026-08-28 | Free | LOW-MEDIUM | Self-promo-friendly but general audience, not necessarily LLM-agent builders. |
| Indie Hackers | Community | indiehackers.com | DRAFT READY | 2026-08-28 | Free | LOW | Business/product audience mismatch for a non-monetized library; drafted anyway per instructions. |
| Product Hunt | Launch platform | producthunt.com | DRAFT READY | 2026-08-28 | Free | LOW | Explicitly not a high-priority channel for an npm library per task instructions — drafted, not recommended to prioritize. |

Full awesome-list research (including rejected candidates and why) is in
`awesome-list-candidates.md`; exact copy-paste-ready PR content for the
two DRAFT READY lists above is in `awesome-list-submissions.md`.
