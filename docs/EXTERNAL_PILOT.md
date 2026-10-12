# External pilot: evaluate token-budget in your agent

This short pilot is for developers who already maintain a JavaScript or
TypeScript agent with a growing conversation history. The goal is to find
out whether `token-budget` solves a real problem in that project and where
the integration gets in the way. A “no” is useful feedback too.

The first milestone is **three unrelated developers who confirm they
installed the package and exercised it in their own project**. This is a
small first step toward the longer-term funnel targets in
[`USER_VALIDATION.md`](./USER_VALIDATION.md), not evidence of general
adoption by itself.

## First pass (about 15 minutes; more time is fine)

1. **Choose one real context-management problem.** Use a local development
   branch or throwaway spike in an existing agent project. Good examples
   include hand-trimming old messages, protecting system instructions, or
   keeping tool calls paired with their results. Don’t add it to a
   production path just for this evaluation.
2. **Install the core package.** No model-provider key or service account
   is needed to evaluate the library itself:

   ```sh
   npm install @shivam.dixit/token-budget
   ```

   Start with the [smallest working example](../README.md#the-smallest-useful-example).
   Add a provider adapter only if it matches the project’s message format;
   the core can also be used directly.
3. **Exercise one representative conversation locally.** Include the
   system instructions, a recent user turn, and at least one tool call with
   its result if the project uses tools. Build a context with the project’s
   normal budget and inspect `explain()` to see what stayed and why. Check
   that the chosen strategy preserves the messages your agent requires;
   pin required messages or choose a strategy with the needed behavior
   rather than assuming every strategy protects them. Keep the prompt and
   conversation data on your machine.
4. **Compare it with the current approach.** Record whether it preserved
   the context your agent needs, what code changed, how long setup took,
   and any missing behavior or confusing API. If it did not fit, record
   that outcome rather than adapting the project just to make the library
   appear successful.
5. **Share a sanitized result.** Use the [feedback template](./USER_FEEDBACK_TEMPLATE.md)
   in private maintainer notes, or open the matching
   [bug](https://github.com/shivam039/token-budget/issues/new?template=bug_report.md),
   [integration help](https://github.com/shivam039/token-budget/issues/new?template=integration_help.md),
   or [feature request](https://github.com/shivam039/token-budget/issues/new?template=feature_request.md)
   issue. A short description is enough; don’t include private code,
   prompts, conversation logs, credentials, customer data, or employer
   details.

## What counts as a tested pilot

Count a developer at the **installed/tested** stage only after they
explicitly confirm that they installed a package and exercised the API in
their own project or a realistic local spike. A package download, a plan to
try it, or a maintainer-only example run does not count. They do not need to
share source code, prompts, a repository link, or screenshots as proof.

Keep person-level records private, including participant IDs if they could
be linked back to a person. In `USER_VALIDATION.md`, publish only aggregate
counts and sanitized themes; never commit identity mappings, contact dates,
private correspondence, or project details. Publish a quote or attribute
feedback only with the developer’s permission.

Outreach remains manual and specific. Read
[`FIRST_USERS.md`](./FIRST_USERS.md) before contacting someone; send one
relevant message and don’t follow up if they don’t respond.

## Gate for more feature work

Complete the first three pilots before starting the next feature PRD. Triage
each concrete finding as a bug, documentation or integration friction, or
feature request. Fix clear defects and clarify documentation where the
evidence supports it. Start new feature work only when unrelated developers
describe a concrete unmet need; use the evidence threshold in
[`DO_NOT_BUILD_YET.md`](./DO_NOT_BUILD_YET.md) for deferred areas.
