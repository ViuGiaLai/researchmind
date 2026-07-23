"""Anthropic Claude provider implementation."""

from loguru import logger

from common.i18n import t as _t

from ..types import GenerationResult


class ClaudeProviderMixin:
    """Mixin with Claude (non-stream) method.

    Requires Generator to have these attributes:
    - claude_api_key, claude_model
    - _get_system_prompt(), _extract_citations(), _verify_citations()
    """

    def _generate_claude(self, prompt: str, max_tokens: int = 1024,
                         system_prompt_override: str = None) -> "GenerationResult":
        try:
            sp = system_prompt_override or self._get_system_prompt()
            import anthropic
            client = anthropic.Anthropic(api_key=self.claude_api_key)
            response = client.messages.create(
                model=self.claude_model, max_tokens=max_tokens,
                temperature=0.3, system=sp,
                messages=[{"role": "user", "content": prompt}],
            )
            content = response.content[0].text if response.content else ""
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(content=content, citations=citations,
                                    model_used=f"claude/{self.claude_model}",
                                    finish_reason=response.stop_reason or "stop")
        except Exception as e:
            lang = getattr(getattr(self, '_local', None), 'lang', 'vi')
            logger.error(f"Claude generation failed: {e}")
            return GenerationResult(content=_t("provider.error.claude", lang, error=str(e)),
                                    citations=[], model_used="claude/error", finish_reason="error")
