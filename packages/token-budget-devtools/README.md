# token-budget-devtools

A local, standalone Vite app for visually inspecting a
[`token-budget`](https://www.npmjs.com/package/token-budget)
`serialize()` dump: buffer contents, per-message token counts, pinned
markers, and role. Not published to npm — clone the monorepo and run it
locally.

## Running it

```sh
npm install     # from the monorepo root
npm run dev --workspace=token-budget-devtools
```

Then open the printed local URL, and drop a JSON file in (or click to
select one). Produce that JSON from your own app with:

```ts
const dump = JSON.stringify(budget.serialize(), null, 2);
// write `dump` to a file, then drag it into the devtools page
```

## What it shows

- Total `maxTokens`/`reserve`/tokens-used summary.
- Every message in the dump, in order, with its role, id, token count, a
  pin marker for pinned messages, and a truncated content preview.

## Scope

This reads a static JSON snapshot — it does not connect to a running
process, and it does not visualize `explain()`'s strategy trace or
streaming state. Untrusted JSON is treated as such: every field is
HTML-escaped before being inserted into the page, since a dump could come
from someone else (e.g. shared for debugging help) and shouldn't be able
to run script in your browser just by being opened.

## License

MIT
