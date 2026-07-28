"""Fit LLM prompts within per-provider input token budgets."""

import re

from loguru import logger

from chat.context_compressor import compress_context_blocks
from common.text_utils import count_tokens, truncate_to_token_limit

# Conservative input budgets (tokens), leaving room for system prompt + output.
PROVIDER_INPUT_BUDGET: dict[str, int] = {
    "groq": 10_000,
    "github": 6_000,
    "github_deepseek_v3": 6_000,
    "gemini": 28_000,
    "nvidia": 14_000,
    "nvidia_deepseek": 14_000,
    "deepseek": 28_000,
    "openrouter": 28_000,
    "openrouter_r1": 28_000,
    "freemodel": 12_000,
    "cohere": 8_000,
    "cloudflare": 8_000,
    "cerebras": 8_000,
    "claude": 80_000,
    # Local GGUF on CPU is prefill-bound and context-constrained (2048 ctx max); keep input <= 1.2k tokens.
    "local": 1_200,
}

OVERHEAD_TOKENS = 256

CONTEXT_BLOCK_RE = re.compile(r"(?s)^(## Document context:\n)(.*?)(\n\n## (?:User q|Q)uestion:\n.*)$")
# History may be prepended before document context (multi-turn chat).
HISTORY_CONTEXT_RE = re.compile(
    r"(?s)^(## Conversation history\n.*?)(\n\n## Document context:\n)(.*?)(\n\n## (?:User q|Q)uestion:\n.*)$"
)
HISTORY_PREFIX_RE = re.compile(r"(?s)^(## Conversation history\n.*?)(\n\n)(.+)$")
SNIPPET_BLOCK_RE = re.compile(r"(?s)^(.*?)(\nExcerpt:\n)(.*)$")


def get_provider_input_budget(provider: str) -> int:
    return PROVIDER_INPUT_BUDGET.get((provider or "").lower(), 8_000)


def _allowed_user_tokens(
    system_prompt: str,
    provider: str,
    max_output_tokens: int,
    model: str = "gpt-4o",
) -> int:
    budget = get_provider_input_budget(provider)
    sys_tokens = count_tokens(system_prompt or "", model)
    allowed = budget - sys_tokens - max_output_tokens - OVERHEAD_TOKENS
    return max(allowed, 512)


def trim_context_text(
    context_text: str,
    query: str,
    provider: str,
    max_output_tokens: int = 1024,
    system_prompt: str = "",
    model: str = "gpt-4o",
) -> str:
    """Trim raw RAG context before assembling the user prompt."""
    if not context_text or not context_text.strip():
        return context_text

    query_shell = (
        f"## Document context:\n\n\n## Question:\n{query}\n\n"
        "Answer naturally and concisely based on the context. "
        "Vary your sentence openings - do NOT keep starting with 'In this document' or 'The document' or 'Ở tài liệu này'. "
        "Cite each supported claim as [Paper title, page X] when a page is supplied, otherwise [Paper title]."
    )
    allowed = _allowed_user_tokens(system_prompt, provider, max_output_tokens, model)
    allowed -= count_tokens(query_shell, model)
    allowed = max(allowed, 512)

    ctx_tokens = count_tokens(context_text, model)
    if ctx_tokens <= allowed:
        return context_text

    trimmed, block_truncated = compress_context_blocks(context_text, allowed, model)
    if not block_truncated:
        trimmed = truncate_to_token_limit(context_text, allowed, model)
    logger.info(
        f"prompt_budget: review context {ctx_tokens}→{count_tokens(trimmed, model)} tokens "
        f"for {provider} (budget={allowed})"
    )
    return trimmed + "\n\n[...(context truncated to fit the model)...]"


def fit_prompt_for_provider(
    user_prompt: str,
    system_prompt: str,
    provider: str,
    max_output_tokens: int = 1024,
    model: str = "gpt-4o",
) -> tuple[str, bool]:
    """Return (fitted_prompt, was_truncated).

    Truncation priority (keep what users need for follow-ups):
    1. Shrink document context first
    2. Keep conversation history + current question when possible
    3. Only then hard-truncate the whole prompt
    """
    allowed = _allowed_user_tokens(system_prompt, provider, max_output_tokens, model)
    user_tokens = count_tokens(user_prompt, model)
    if user_tokens <= allowed:
        return user_prompt, False

    # Multi-turn + RAG: history + document context + question
    hist_ctx = HISTORY_CONTEXT_RE.match(user_prompt)
    if hist_ctx:
        history, ctx_prefix, context, suffix = (
            hist_ctx.group(1),
            hist_ctx.group(2),
            hist_ctx.group(3),
            hist_ctx.group(4),
        )
        fixed = history + ctx_prefix + suffix
        fixed_tokens = count_tokens(fixed, model)
        context_budget = max(allowed - fixed_tokens, 128)
        trimmed = truncate_to_token_limit(context, context_budget, model)
        fitted = f"{history}{ctx_prefix}{trimmed}\n\n[...(context truncated for {provider})...]{suffix}"
        if count_tokens(fitted, model) <= allowed:
            logger.info(f"prompt_budget: {provider} history+context trimmed (user budget={allowed}, kept history)")
            return fitted, True
        # Still over budget: keep question, shrink history, drop most context.
        question = suffix
        hist_budget = max(allowed - count_tokens(question, model) - 64, 128)
        short_history = truncate_to_token_limit(history, hist_budget, model)
        fitted = f"{short_history}\n\n{question.lstrip()}"
        logger.info(f"prompt_budget: {provider} history+question fit (dropped long context)")
        return fitted, True

    match = CONTEXT_BLOCK_RE.match(user_prompt)
    if match:
        prefix, context, suffix = match.group(1), match.group(2), match.group(3)
        suffix_tokens = count_tokens(prefix + suffix, model)
        context_budget = max(allowed - suffix_tokens, 256)
        trimmed = truncate_to_token_limit(context, context_budget, model)
        fitted = f"{prefix}{trimmed}\n\n[...(context truncated for {provider})...]{suffix}"
        logger.info(
            f"prompt_budget: {provider} context {count_tokens(context, model)}→"
            f"{count_tokens(trimmed, model)} tokens (user budget={allowed})"
        )
        return fitted, True

    # Multi-turn plain chat (no document context): prefer keeping the current turn.
    hist_only = HISTORY_PREFIX_RE.match(user_prompt)
    if hist_only:
        history, sep, current = hist_only.group(1), hist_only.group(2), hist_only.group(3)
        current_tokens = count_tokens(current, model)
        hist_budget = max(allowed - current_tokens - 16, 64)
        short_history = truncate_to_token_limit(history, hist_budget, model)
        fitted = f"{short_history}{sep}{current}"
        if count_tokens(fitted, model) > allowed:
            # Last resort: keep current question only.
            fitted = truncate_to_token_limit(current, allowed, model)
        logger.info(f"prompt_budget: {provider} multi-turn history trimmed (budget={allowed})")
        return fitted, True

    match = SNIPPET_BLOCK_RE.match(user_prompt)
    if match:
        prefix, marker, context = match.group(1), match.group(2), match.group(3)
        prefix_tokens = count_tokens(prefix + marker, model)
        context_budget = max(allowed - prefix_tokens, 256)
        trimmed = truncate_to_token_limit(context, context_budget, model)
        fitted = f"{prefix}{marker}{trimmed}\n\n[...(excerpt truncated for {provider})...]"
        logger.info(f"prompt_budget: {provider} snippet truncated (user budget={allowed})")
        return fitted, True

    trimmed = truncate_to_token_limit(user_prompt, allowed, model)
    logger.info(f"prompt_budget: {provider} whole prompt {user_tokens}→{count_tokens(trimmed, model)} tokens")
    return trimmed, True
