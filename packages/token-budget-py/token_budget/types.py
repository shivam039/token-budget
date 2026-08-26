from typing import List, Dict, Optional, Union, Literal, Callable, Any

Role = Literal["user", "assistant", "system", "tool"]


class BudgetMessage:
    def __init__(
        self,
        id: str,
        role: Role,
        content: Union[str, List[Dict[str, Any]]],
        name: Optional[str] = None,
        pinned: bool = False,
        priority: int = 0,
        tool_call_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[int] = None,
        tokens: Optional[int] = None,
    ):
        self.id = id
        self.role = role
        self.content = content
        self.name = name
        self.pinned = pinned
        self.priority = priority
        self.tool_call_id = tool_call_id
        self.metadata = metadata or {}
        self.timestamp = timestamp
        self.tokens = tokens


class Tokenizer:
    def count(self, text: str) -> int:
        raise NotImplementedError


class StrategyContext:
    def __init__(
        self,
        effective_budget: int,
        tokens_used: int,
        count_tokens: Callable,
        count_message: Callable,
        make_synthetic: Callable,
        trace: Optional[Callable] = None,
    ):
        self.effective_budget = effective_budget
        self.tokens_used = tokens_used
        self.count_tokens = count_tokens
        self.count_message = count_message
        self.make_synthetic = make_synthetic
        self.trace = trace


class Strategy:
    def __init__(self, name: str, sync: bool = True):
        self.name = name
        self.sync = sync

    def apply(self, messages: List[BudgetMessage], ctx: StrategyContext) -> List[BudgetMessage]:
        raise NotImplementedError


class TokenBudgetConfig:
    def __init__(
        self,
        max_tokens: int,
        reserve: int = 0,
        tokenizer: Optional[Union[Tokenizer, Literal["estimate"]]] = "estimate",
        chars_per_token: int = 4,
        strategy: Optional[Strategy] = None,
    ):
        self.max_tokens = max_tokens
        self.reserve = reserve
        self.tokenizer = tokenizer
        self.chars_per_token = chars_per_token
        self.strategy = strategy


class ExplainReport:
    def __init__(
        self,
        steps: List[Any],
        tokens_before: int,
        tokens_after: int,
        tokens_remaining: int,
        strategy_applied: str,
        timestamp: int,
    ):
        self.steps = steps
        self.tokens_before = tokens_before
        self.tokens_after = tokens_after
        self.tokens_remaining = tokens_remaining
        self.strategy_applied = strategy_applied
        self.timestamp = timestamp


class ContextResult:
    def __init__(
        self,
        messages: List[BudgetMessage],
        tokens_used: int,
        tokens_remaining: int,
        evicted: List[BudgetMessage],
        strategy_applied: str,
    ):
        self.messages = messages
        self.tokens_used = tokens_used
        self.tokens_remaining = tokens_remaining
        self.evicted = evicted
        self.strategy_applied = strategy_applied
