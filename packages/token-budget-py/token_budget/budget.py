import time
import uuid
import json
from typing import List, Dict, Optional, Any
from .types import TokenBudgetConfig, BudgetMessage, Tokenizer, ContextResult, StrategyContext, ExplainReport
from .strategies import drop_oldest


class EstimateTokenizer(Tokenizer):
    def __init__(self, chars_per_token: int = 4):
        self.chars_per_token = chars_per_token

    def count(self, text: str) -> int:
        return max(1, len(text) // self.chars_per_token)


def default_message_overhead(msg: BudgetMessage) -> int:
    return 4


class TokenBudget:
    def __init__(self, config: TokenBudgetConfig):
        if not isinstance(config.max_tokens, int) or config.max_tokens <= 0:
            raise ValueError("TokenBudget: config.max_tokens must be a positive integer.")
        if not isinstance(config.reserve, int) or config.reserve < 0:
            raise ValueError("TokenBudget: config.reserve must be a non-negative integer.")
        if config.reserve >= config.max_tokens:
            raise ValueError(f"TokenBudget: reserve ({config.reserve}) must be less than max_tokens ({config.max_tokens}).")

        self._max_tokens = config.max_tokens
        self._reserve = config.reserve

        if config.tokenizer == "estimate" or config.tokenizer is None:
            self.tokenizer = EstimateTokenizer(config.chars_per_token)
        else:
            self.tokenizer = config.tokenizer

        self.strategy = config.strategy or drop_oldest()
        self.messages: List[BudgetMessage] = []
        self._total_tokens = 0
        self._last_explain_report: Optional[ExplainReport] = None

    @property
    def max_tokens(self) -> int:
        return self._max_tokens

    @property
    def effective_budget(self) -> int:
        return self._max_tokens - self._reserve

    def compute_tokens(self, msg: BudgetMessage) -> int:
        content = msg.content
        if isinstance(content, str):
            text_tokens = self.tokenizer.count(content)
        else:
            text_tokens = self.tokenizer.count(json.dumps(content))
        return text_tokens + default_message_overhead(msg)

    def generate_id(self) -> str:
        return str(uuid.uuid4())

    def add_message(
        self,
        role: str,
        content: Any,
        id: Optional[str] = None,
        name: Optional[str] = None,
        pinned: bool = False,
        priority: int = 0,
        tool_call_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BudgetMessage:
        msg = BudgetMessage(
            id=id or self.generate_id(),
            role=role,
            content=content,
            name=name,
            pinned=pinned,
            priority=priority,
            tool_call_id=tool_call_id,
            metadata=metadata,
            timestamp=int(time.time() * 1000),
        )
        msg.tokens = self.compute_tokens(msg)
        self.messages.append(msg)
        self._total_tokens += msg.tokens
        return msg

    def get_messages(self) -> List[BudgetMessage]:
        return list(self.messages)

    def stats(self) -> Dict[str, Any]:
        return {
            "tokensUsed": self._total_tokens,
            "tokensRemaining": max(0, self.effective_budget - self._total_tokens),
            "maxTokens": self._max_tokens,
            "reserve": self._reserve,
            "messageCount": len(self.messages),
            "pinnedCount": sum(1 for m in self.messages if m.pinned),
        }

    def get_context(self) -> ContextResult:
        original = list(self.messages)
        steps = []

        def count_msg(m: BudgetMessage) -> int:
            return m.tokens if m.tokens is not None else self.compute_tokens(m)

        def count_msgs(msgs: List[BudgetMessage]) -> int:
            return sum(count_msg(m) for m in msgs)

        def make_synthetic(content: str, source_ids: List[str], extra: Optional[Dict] = None) -> BudgetMessage:
            msg = BudgetMessage(
                id=self.generate_id(),
                role="system",
                content=content,
                metadata={"synthetic": True, "sourceIds": source_ids, **(extra or {})},
                timestamp=int(time.time() * 1000),
            )
            msg.tokens = self.compute_tokens(msg)
            return msg

        ctx = StrategyContext(
            effective_budget=self.effective_budget,
            tokens_used=self._total_tokens,
            count_tokens=count_msgs,
            count_message=count_msg,
            make_synthetic=make_synthetic,
            trace=lambda step: steps.append(step),
        )

        strategized = self.strategy.apply(original, ctx)

        result_ids = {m.id for m in strategized}
        evicted = [m for m in original if m.id not in result_ids]

        tokens_before = count_msgs(original)
        tokens_used = count_msgs(strategized)

        self._last_explain_report = ExplainReport(
            steps=steps,
            tokens_before=tokens_before,
            tokens_after=tokens_used,
            tokens_remaining=max(0, self.effective_budget - tokens_used),
            strategy_applied=self.strategy.name,
            timestamp=int(time.time() * 1000),
        )

        return ContextResult(
            messages=strategized,
            tokens_used=tokens_used,
            tokens_remaining=max(0, self.effective_budget - tokens_used),
            evicted=evicted,
            strategy_applied=self.strategy.name,
        )

    def explain(self) -> Optional[ExplainReport]:
        """Structured trace of the most recent get_context() call. None if it hasn't been called yet."""
        return self._last_explain_report
