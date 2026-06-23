"""Runtime patch for Generator — adds mixin inheritance + streaming fallback.

PatchedGenerator inherits from all provider mixins first, then the original Generator.
Mixin methods take precedence via MRO, so provider methods come from the clean mixin files
instead of the monolithic generator.py.

Usage: Replace `from chat.generator import Generator` with `from chat.patched_generator import PatchedGenerator as Generator`
"""

from loguru import logger

# Original Generator (unchanged — still has all provider methods as fallback)
from .generator_v2 import Generator as OriginalGenerator

# Provider mixins (take precedence via MRO)
from .providers.openai_provider import OpenAIProviderMixin
from .providers.gemini_provider import GeminiProviderMixin
from .providers.claude_provider import ClaudeProviderMixin
from .providers.local_provider import LocalProviderMixin


class PatchedGenerator(
    OriginalGenerator,
):
    """Generator with mixin-provider inheritance and streaming fallback.

    MRO: PatchedGenerator → OpenAIProviderMixin → GeminiProviderMixin →
         ClaudeProviderMixin → LocalProviderMixin → OriginalGenerator → object

    Provider methods (_generate_github, _generate_gemini, _stream_openai, etc.)
    come from the clean mixin files. OriginalGenerator methods are fallback.
    """

    def _stream_provider(self, provider: str, user_prompt: str, max_tokens: int = 1024):
        """Stream from a single provider by name.
        Yields chunks if provider works, otherwise returns (no yield = fallback).
        """
        try:
            if provider == "github":
                if not self.github_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.github_api_key, self.github_model, self.github_url, max_tokens)
                return
            elif provider == "gemini":
                if not self.gemini_api_key:
                    return
                yield from self._stream_gemini(user_prompt, self.gemini_api_key, max_tokens, True)
                return
            elif provider == "groq":
                if not self.groq_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.groq_api_key, self.groq_model, "https://api.groq.com/openai/v1", max_tokens)
                return
            elif provider == "nvidia":
                if not self.nvidia_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.nvidia_api_key, self.nvidia_model, self.nvidia_url, max_tokens)
                return
            elif provider == "freemodel":
                if not self.freemodel_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.freemodel_api_key, self.freemodel_model, self.freemodel_url, max_tokens)
                return
            elif provider == "openrouter":
                if not self.openrouter_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.openrouter_api_key, self.openrouter_model, self.openrouter_url, max_tokens)
                return
            elif provider == "cohere":
                if not self.cohere_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cohere_api_key, self.cohere_model, self.cohere_url, max_tokens)
                return
            elif provider == "cloudflare":
                if not self.cloudflare_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cloudflare_api_key, self.cloudflare_model, self.cloudflare_url, max_tokens)
                return
            elif provider == "cerebras":
                if not self.cerebras_api_key:
                    return
                yield from self._stream_openai(user_prompt, self.cerebras_api_key, self.cerebras_model, self.cerebras_url, max_tokens)
                return
            elif provider == "deepseek":
                if not self.deepseek_api_key:
                    return
                yield from self._stream_deepseek(user_prompt, self.deepseek_api_key, max_tokens, False)
                return
            elif provider == "claude":
                if not self.claude_api_key:
                    return
                import anthropic
                client = anthropic.Anthropic(api_key=self.claude_api_key)
                sp = getattr(self._local, 'system_prompt_override', None) or self._get_system_prompt()
                with client.messages.stream(
                    model=self.claude_model,
                    max_tokens=max_tokens,
                    temperature=0.3,
                    system=sp,
                    messages=[{"role": "user", "content": user_prompt}],
                ) as stream:
                    for text in stream.text_stream:
                        yield text
                return
            elif provider == "local":
                yield from self._stream_local(user_prompt)
                return
            else:
                logger.warning(f"_stream_provider: unknown provider '{provider}'")
                return
        except Exception as e:
            logger.warning(f"_stream_provider: {provider} failed: {e}")
            return

    def _route_by_task_stream(self, task_type: str, user_prompt: str, max_tokens: int = 1024):
        """Streaming version of _route_by_task.
        Tries primary first, then fallback, then returns (no yield = use chain).
        """
        provider = self._get_provider_for_task(task_type)
        if not provider:
            return  # no mapping → use default chain

        # Try primary provider
        logger.info(f"task_routing_stream: {task_type} → {provider} (primary)")
        stream_gen = self._stream_provider(provider, user_prompt, max_tokens)
        if stream_gen is not None:
            yielded = False
            for chunk in stream_gen:
                yielded = True
                yield chunk
            if yielded:
                return

        # Try fallback provider
        fallback = self._get_fallback_for_task(task_type)
        if fallback and fallback != provider:
            logger.info(f"task_routing_stream: {task_type} primary={provider} failed, trying fallback={fallback}")
            stream_gen = self._stream_provider(fallback, user_prompt, max_tokens)
            if stream_gen is not None:
                yielded = False
                for chunk in stream_gen:
                    yielded = True
                    yield chunk
                if yielded:
                    return
            logger.warning(f"task_routing_stream: {task_type} fallback={fallback} also failed")
        else:
            logger.info(f"task_routing_stream: {task_type} primary={provider} failed, no fallback")

        return  # all fail → use default chain
