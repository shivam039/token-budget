# User validation

The metric that matters is **"how many unrelated developers actually
use token-budget?"** — not GitHub stars, not social-media followers, not
raw npm download counts (a download can be a CI cache warm-up, an
abandoned `npm install`, or a bot; it's never proof of use).

## Targets

A funnel, each stage gated on the one before it:

| Stage | Target | Definition |
| --- | --- | --- |
| 1. Identified | 50 developers | A real candidate found via `docs/FIRST_USERS.md`'s GitHub-search channel — an active repo with visible hand-rolled context management, or an open issue describing the problem. |
| 2. Contacted | 20 | Sent the outreach template (or a genuine variant of it), one human message, addressed to a specific person about their specific code. |
| 3. Installed/tested | 10 | Ran `npm install`, actually exercised the API against their own data — confirmed via their own words (a reply, an issue, a comment), not assumed from a download event. |
| 4. Real project use | 5 | Merged it into an actual codebase they ship, not a throwaway spike. |
| 5. Still using it | 3 | Still present in their codebase after enough time has passed that novelty alone doesn't explain it (a few weeks, not a few days). |
| 6. Independent feature requests | 3 | Three *different* people ask for something the library doesn't do yet, unprompted — the strongest signal that people are relying on it enough to want more from it. |

Stage 6 is also the trigger for reconsidering anything in
`docs/DO_NOT_BUILD_YET.md` — it's evidence, not a hunch.

## What's explicitly not a target

- GitHub stars — vanity, not usage.
- Social-media followers/impressions — same.
- Raw npm download counts — see above; track them if curious, never
  report them as a success metric.
- "It got mentioned somewhere" — a mention isn't use.

## Tracking

Keep a private, person-level working log and update this file with aggregate
counts and sanitized themes after each outreach round. Do not commit names,
handles, contact dates, identity mappings, project details, or private
correspondence. Do not publish a quote or attribute feedback without
permission. The evaluation steps and evidence bar are in
[`EXTERNAL_PILOT.md`](./EXTERNAL_PILOT.md); candidate research and human
outreach are described in [`FIRST_USERS.md`](./FIRST_USERS.md).

No pilot outcomes have been recorded in this public file yet. This is a
documentation status, not a claim that nobody has tried the package.

| Funnel stage | Long-term target | Publicly recorded count |
| --- | ---: | --- |
| Identified | 50 | Not recorded |
| Contacted | 20 | Not recorded |
| Installed/tested | 10 | Not recorded |
| Real project use | 5 | Not recorded |
| Still using it | 3 | Not recorded |
| Independent feature requests | 3 | Not recorded |

Repeated setup or documentation friction and concrete unmet feature needs
are also not yet characterized in the public record.

## Next milestone

The next product-validation milestone is three unrelated developers at
stage 3 (installed/tested). Treat it as pending until each person explicitly
confirms a real local evaluation. This is an initial pilot milestone toward
the stage-3 target of ten; it does not lower the long-term target. Until the
pilot produces evidence, prioritize learning and documentation fixes over
new feature work.

## Cadence

Check this funnel's numbers, honestly, before proposing any new
engineering work. If stage 3 (installed/tested) is still 0, the next
priority is outreach, not more features — a library with strong
functionality and no users to validate it against is not further
de-risked by adding more functionality.
