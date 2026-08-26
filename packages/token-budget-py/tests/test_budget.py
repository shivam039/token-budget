from token_budget import TokenBudget, TokenBudgetConfig, BudgetMessage
from token_budget import drop_oldest, sliding_window, priority, chain, summarize_oldest


def test_budget_initialization():
    config = TokenBudgetConfig(max_tokens=100)
    budget = TokenBudget(config)
    assert budget.max_tokens == 100
    assert budget.effective_budget == 100


def test_add_message():
    config = TokenBudgetConfig(max_tokens=100)
    budget = TokenBudget(config)
    msg = budget.add_message("user", "hello")
    assert msg.role == "user"
    assert msg.content == "hello"
    assert msg.tokens is not None


def test_drop_oldest_eviction():
    config = TokenBudgetConfig(max_tokens=10)
    budget = TokenBudget(config)
    budget.add_message("user", "first message")
    budget.add_message("user", "second message")
    ctx = budget.get_context()
    assert len(ctx.evicted) > 0
    assert "second message" in [m.content for m in ctx.messages]
    assert "first message" not in [m.content for m in ctx.messages]


def test_stats_reflects_current_buffer():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=1000))
    budget.add_message("user", "hello", pinned=True)
    stats = budget.stats()
    assert stats["messageCount"] == 1
    assert stats["pinnedCount"] == 1
    assert stats["tokensUsed"] > 0


def test_get_messages_returns_full_raw_buffer():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=1000, strategy=drop_oldest()))
    budget.add_message("user", "a")
    budget.add_message("user", "b")
    assert len(budget.get_messages()) == 2


def test_pinned_messages_survive_drop_oldest():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=10, strategy=drop_oldest()))
    budget.add_message("system", "pinned prompt", pinned=True)
    budget.add_message("user", "filler filler filler filler")
    ctx = budget.get_context()
    assert "pinned prompt" in [m.content for m in ctx.messages]


def test_sliding_window_keeps_only_last_n_turns():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=1000, strategy=sliding_window(1)))
    budget.add_message("user", "first")
    budget.add_message("user", "second")
    ctx = budget.get_context()
    contents = [m.content for m in ctx.messages]
    assert contents == ["second"]


def test_priority_keeps_highest_priority_first():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=8, strategy=priority()))
    budget.add_message("user", "low", priority=0)
    budget.add_message("user", "high", priority=10)
    ctx = budget.get_context()
    contents = [m.content for m in ctx.messages]
    assert "high" in contents
    assert "low" not in contents  # forced eviction: low+high together exceed the budget


def test_chain_applies_strategies_in_order():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=10, strategy=chain([sliding_window(1), drop_oldest()])))
    budget.add_message("user", "first")
    budget.add_message("user", "second")
    ctx = budget.get_context()
    assert ctx.strategy_applied == "chain"
    assert [m.content for m in ctx.messages] == ["second"]


def test_summarize_oldest_actually_calls_the_summarizer():
    # Regression: an earlier version of summarize_oldest silently ignored
    # the summarizer argument and delegated straight to drop_oldest(),
    # never calling it at all.
    calls = []

    def summarizer(block):
        calls.append(list(block))
        return f"summary of {len(block)} messages"

    budget = TokenBudget(TokenBudgetConfig(max_tokens=10, strategy=summarize_oldest(summarizer)))
    budget.add_message("user", "first message here")
    budget.add_message("user", "second message here")
    ctx = budget.get_context()

    assert len(calls) == 1
    synthetic = [m for m in ctx.messages if m.metadata.get("synthetic")]
    assert len(synthetic) == 1
    assert synthetic[0].content.startswith("summary of")
    assert synthetic[0].metadata["sourceIds"]


def test_summarize_oldest_leaves_pinned_messages_alone():
    def summarizer(block):
        return "summary"

    budget = TokenBudget(TokenBudgetConfig(max_tokens=10, strategy=summarize_oldest(summarizer)))
    budget.add_message("system", "pinned", pinned=True)
    budget.add_message("user", "old filler content here")
    ctx = budget.get_context()
    assert "pinned" in [m.content for m in ctx.messages]


def test_explain_reflects_the_most_recent_get_context_call():
    budget = TokenBudget(TokenBudgetConfig(max_tokens=1000))
    assert budget.explain() is None  # nothing run yet

    budget.add_message("user", "hello")
    budget.get_context()
    report = budget.explain()

    assert report is not None
    assert report.strategy_applied == "drop-oldest"
    assert report.tokens_before > 0


def test_explain_captures_summarize_oldest_trace_steps():
    def summarizer(block):
        return "summary"

    budget = TokenBudget(TokenBudgetConfig(max_tokens=10, strategy=summarize_oldest(summarizer)))
    budget.add_message("user", "first message here")
    budget.add_message("user", "second message here")
    budget.get_context()

    report = budget.explain()
    assert len(report.steps) == 1
    assert report.steps[0]["strategyName"] == "summarize-oldest"
    assert len(report.steps[0]["synthesized"]) == 1
