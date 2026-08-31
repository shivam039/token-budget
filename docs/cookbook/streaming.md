# Tracking budget for a streamed response

**Problem:** a model response arrives incrementally (SSE, a streaming
provider SDK) — you want the running token estimate to update live, and
the finished message to be exact once the stream ends, without needing to
buffer the whole reply yourself before calling `addMessage()`.

**Why a naive implementation fails:** buffering the entire stream before
calling `addMessage()` means `stats()`/`getContext()` don't reflect
in-flight content at all — a "context usage" indicator would jump instead
of updating live, and you'd have no way to account for tokens the reply
is *already* consuming before it finishes.

## Solution

```ts
budget.beginStream('reply-1', 'assistant');

for await (const chunk of modelStream) {
  budget.appendStreamChunk('reply-1', chunk); // running, approximate estimate
  // budget.stats().streaming reflects this stream's estimatedTokens live
}

const message = budget.endStream('reply-1'); // exact recount, folded into the buffer
```

If the client disconnects or the stream is cancelled mid-flight:

```ts
budget.abortStream('reply-1'); // discards the partial message entirely (default)
// or:
budget.abortStream('reply-1', 'keep-partial'); // finalizes whatever arrived so far
```

## Explanation

`appendStreamChunk` counts each chunk on its own and sums running totals —
O(chunk length) per call, not O(total accumulated length), so it stays
cheap even for a long reply. This is additive-*approximate* for tokenizers
whose token boundaries can span chunk edges; `endStream()` always does an
exact recount over the full accumulated content before folding it into
the buffer as a normal message, reconciling any drift.

Open-stream content is never visible to strategies or `getContext()`/
`getContextSync()` until `endStream()`/`abortStream()` runs — it isn't
part of the buffer yet. By default (`onStrategyDuringStream: 'skip'`),
building a context while a stream is open just proceeds without that
in-flight content; set `onStrategyDuringStream: 'error'` if your
application needs a hard guarantee that never happens silently.

## Production considerations

- Always pair `beginStream` with exactly one of `endStream`/`abortStream`
  — an open stream left dangling keeps consuming `stats().streaming`
  budget indefinitely (and `beginStream` throws if you call it again with
  the same `id` while one is still open).
- If your UI shows live token usage, read `budget.stats().tokensUsed` —
  it already includes open streams' running estimates.
- `serialize({ includeOpenStreams: true })` can persist an in-progress
  stream's partial content across a restart, each marked
  `wasInterrupted: true` — see [`docs/cookbook/serialization.md`](./serialization.md).
  Resuming a genuinely mid-flight network stream is out of scope; you
  decide whether to finalize, discard, or re-request on restore.

## Related documentation

- [`docs/API.md#streaming`](../API.md#streaming) — full signatures
- [`docs/cookbook/serialization.md`](./serialization.md)
