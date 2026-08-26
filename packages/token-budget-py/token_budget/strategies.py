from typing import List, Optional, Callable
from .types import Strategy, BudgetMessage, StrategyContext


def drop_oldest() -> Strategy:
    class DropOldestStrategy(Strategy):
        def __init__(self):
            super().__init__("drop-oldest", sync=True)

        def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
            if ctx.tokens_used <= ctx.effective_budget:
                return messages

            kept = []
            tokens = 0

            # keep pinned first
            for m in reversed(messages):
                if m.pinned:
                    kept.insert(0, m)
                    tokens += ctx.count_message(m)

            for m in reversed(messages):
                if m.pinned:
                    continue
                cost = ctx.count_message(m)
                if tokens + cost <= ctx.effective_budget:
                    kept.insert(0, m)
                    tokens += cost

            return sorted(kept, key=lambda x: messages.index(x))

    return DropOldestStrategy()


def sliding_window(window_size: int) -> Strategy:
    class SlidingWindowStrategy(Strategy):
        def __init__(self):
            super().__init__("sliding-window", sync=True)

        def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
            kept = []
            for m in messages:
                if m.pinned:
                    kept.append(m)

            unpinned = [m for m in messages if not m.pinned]
            kept.extend(unpinned[-window_size:] if window_size > 0 else [])
            return sorted(set(kept), key=lambda x: messages.index(x))

    return SlidingWindowStrategy()


def priority() -> Strategy:
    class PriorityStrategy(Strategy):
        def __init__(self):
            super().__init__("priority", sync=True)

        def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
            if ctx.tokens_used <= ctx.effective_budget:
                return messages

            sorted_msgs = sorted(messages, key=lambda x: (1 if x.pinned else 0, x.priority), reverse=True)
            kept = []
            tokens = 0

            for m in sorted_msgs:
                cost = ctx.count_message(m)
                if m.pinned or tokens + cost <= ctx.effective_budget:
                    kept.append(m)
                    tokens += cost

            return sorted(kept, key=lambda x: messages.index(x))

    return PriorityStrategy()


def summarize_oldest(summarizer: Callable[[List[BudgetMessage]], str]) -> Strategy:
    """
    Single-pass summarization (partial parity with the JS `summarizeOldest`):
    once over budget, takes the oldest contiguous block of non-pinned
    messages needed to fit back under budget and replaces them with one
    synthetic summary message produced by `summarizer`.

    `summarizer` must be a plain synchronous callable returning a string —
    this port's `get_context()` is fully synchronous, unlike the JS
    version's async `summarizeOldest`. Recursive re-summarization
    (`maxSummaryDepth`/`onMaxDepthReached` in the JS version) is not yet
    implemented here; a summary produced by this strategy is treated like
    any other message on a later call, not re-folded into a deeper one.
    """

    class SummarizeOldestStrategy(Strategy):
        def __init__(self):
            super().__init__("summarize-oldest", sync=True)

        def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
            if ctx.tokens_used <= ctx.effective_budget:
                return messages

            non_pinned = [m for m in messages if not m.pinned]
            if not non_pinned:
                return messages

            # Grow the oldest-first block until removing it would bring
            # the buffer back under budget (or we run out of non-pinned
            # messages to fold in).
            block: List[BudgetMessage] = []
            remaining = ctx.tokens_used
            for m in non_pinned:
                block.append(m)
                remaining -= ctx.count_message(m)
                if remaining <= ctx.effective_budget:
                    break

            block_ids = [m.id for m in block]
            summary_text = summarizer(block)
            synthetic = ctx.make_synthetic(summary_text, block_ids)

            block_id_set = set(block_ids)
            result: List[BudgetMessage] = []
            inserted = False
            for m in messages:
                if m.id in block_id_set:
                    if not inserted:
                        result.append(synthetic)
                        inserted = True
                    continue
                result.append(m)

            if ctx.trace:
                ctx.trace(
                    {
                        "strategyName": "summarize-oldest",
                        "tokensBefore": ctx.tokens_used,
                        "tokensAfter": ctx.count_tokens(result),
                        "messagesConsidered": len(messages),
                        "evicted": [{"id": mid, "reason": "folded into summary"} for mid in block_ids],
                        "synthesized": [{"id": synthetic.id, "sourceIds": block_ids, "reason": "summarize-oldest"}],
                    }
                )

            return result

    return SummarizeOldestStrategy()


def chain(strategies: List[Strategy]) -> Strategy:
    class ChainStrategy(Strategy):
        def __init__(self):
            super().__init__("chain", sync=all(s.sync for s in strategies))

        def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
            curr = messages
            for s in strategies:
                curr = s.apply(curr, ctx)
            return curr

    return ChainStrategy()
