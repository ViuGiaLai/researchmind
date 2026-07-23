"""Small prompt adapters over versioned academic governance."""
from academic.governance import get_academic_governance
from common.i18n import get_output_language_name


def build_system_prompt(lang: str = "vi", reasoning_mode: str = "fast", strict_evidence: bool = False) -> str:
    """Build behavior-only system contract from external rule packs."""
    language = get_output_language_name(lang)
    return get_academic_governance().system_contract(
        language_instruction=f"Reply in {language}; reply in English when the user writes in English.",
        reasoning_mode=reasoning_mode,
        strict_evidence=strict_evidence,
    )


def build_rag_user_prompt(context_text: str, query: str) -> str:
    """Attach retrieved evidence and only relevant knowledge-base guidance."""
    prompt = get_academic_governance().rag_request(context=context_text, query=query)
    return prompt.replace("## Evidence", "## Document context:", 1).replace("## User question", "## User question:", 1)
