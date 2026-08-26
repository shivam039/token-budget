# Changelog

This file tracks changes to `token-budget-claude`'s approximation method
specifically (FR2-2.2.2) — not a full release changelog. When Anthropic
publishes new model or tokenizer information (a public tokenizer, updated
token-counting API behavior, official vocabulary size, etc.), re-validate
the approximation against it and add an entry here, even if the code
itself doesn't change.

## Unreleased

- Initial approximation: counts using OpenAI's `cl100k_base` BPE tokenizer
  (via `token-budget-tiktoken`) as a stand-in for Claude's tokenizer,
  since Anthropic has never published one. Default `ratio: 1` — no
  scaling is applied, because no real Claude token counts were available
  to calibrate against at the time this package was built. See the
  README's "Accuracy" section for the full disclaimer and how to use
  `calibrate()` against your own data.
