"""Query decomposition for deep research.

Adapted from open_deep_research (MIT):
https://github.com/langchain-ai/open_deep_research

And STORM (MIT):
https://github.com/stanford-oval/storm

Now supports perspective-guided decomposition (STORM-inspired):
1. Generate diverse research personas/perspectives
2. Each persona asks focused questions from their angle
3. All questions are aggregated into the research plan
"""

from dataclasses import dataclass, field

from loguru import logger

from academic.governance import get_academic_governance
from research.persona_generator import (
    Persona,
    generate_personas,
    generate_perspective_questions,
)


@dataclass
class ResearchPlan:
    """A plan for deep research."""
    original_query: str
    sub_questions: list[str] = field(default_factory=list)
    brief: str = ""
    personas: list[Persona] = field(default_factory=list)
    workflow: str = "research_analysis"
    governance_version: str = ""


def _workflow_prompt(task: str, **values: str) -> str:
    """Use policy/knowledge selected outside the model instead of embedded standards."""
    governance = get_academic_governance()
    if task == "decompose":
        rules = governance.rules(("research_planning",))
        knowledge = governance.retrieve_knowledge(values["query"], limit=1)
        schema = '{"brief": "short objective", "sub_questions": ["question"]}'
        body = f"Research question: {values['query']}\nReturn JSON exactly matching: {schema}"
    elif task == "compress":
        rules = governance.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        knowledge = governance.retrieve_knowledge("evidence synthesis", limit=1)
        body = f"Evidence findings:\n{values['findings']}\nReturn a structured evidence summary."
    else:
        rules = governance.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        knowledge = governance.retrieve_knowledge(values["query"], limit=2)
        body = f"Research question: {values['query']}\nCollected evidence:\n{values['findings']}\nWrite a grounded report."
    guidance = "\n".join(f"- {item.content} ({item.provenance})" for item in knowledge)
    return "\n".join([body, "Policy:", *[f"- {rule}" for rule in rules], "Relevant guidance:", guidance])


def decompose_query(query: str) -> ResearchPlan:
    """Break down a complex query into sub-questions using perspective-guided decomposition.

    STORM-inspired: generates diverse personas, each asks questions from their angle,
    then aggregates into a comprehensive research plan.
    """
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        msg = "Generator not initialized"
        logger.error(msg)
        return ResearchPlan(original_query=query, sub_questions=[query], brief=msg)

    from research.workflow_engine import build_workflow
    workflow = build_workflow()

    # Step 1: Generate diverse perspectives (STORM-inspired)
    logger.info(f"Generating perspectives for: {query}")
    perspective_set = generate_personas(query)

    all_questions: list[str] = []
    brief_parts: list[str] = []

    if perspective_set.personas:
        # Step 2: Each persona asks questions from their angle
        for persona in perspective_set.personas:
            questions = generate_perspective_questions(query, persona)
            all_questions.extend(questions)
            brief_parts.append(f"{persona.name}: {persona.description}")
    else:
        # Fallback: standard decomposition
        logger.info("No personas generated, using standard decomposition")
        prompt = _workflow_prompt("decompose", query=query)
        try:
            result = generator.generate_direct(
                user_prompt=prompt,
                system_prompt=get_academic_governance().task_contract("planning"),
                task_type="research",
            )
            import json
            data = json.loads(result)
            all_questions = data.get("sub_questions", [query])
            brief_parts.append(data.get("brief", ""))
        except Exception as e:
            logger.warning(f"Standard decomposition failed: {e}")
            all_questions = [query]

    # Deduplicate and limit
    seen = set()
    unique_questions: list[str] = []
    for q in all_questions:
        q_lower = q.lower().strip()
        if q_lower not in seen and len(q_lower) > 10:
            seen.add(q_lower)
            unique_questions.append(q)
        if len(unique_questions) >= 8:
            break

    if not unique_questions:
        unique_questions = [query]

    brief = "; ".join(brief_parts) if brief_parts else ""
    logger.info(f"Decomposed query into {len(unique_questions)} perspective-guided questions")
    return ResearchPlan(
        original_query=query,
        sub_questions=unique_questions,
        brief=brief,
        personas=perspective_set.personas,
        workflow=workflow.name,
        governance_version=workflow.governance_version,
    )


def decompose_query_simple(query: str) -> ResearchPlan:
    """Break down a complex query into sub-questions using standard LLM-based decomposition.

    Fallback method without perspective guidance.
    """
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        msg = "Generator not initialized"
        logger.error(msg)
        return ResearchPlan(original_query=query, sub_questions=[query], brief=msg)

    prompt = _workflow_prompt("decompose", query=query)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt=get_academic_governance().task_contract("planning"),
            task_type="research",
        )
        import json
        data = json.loads(result)
        brief = data.get("brief", "")
        sub_questions = data.get("sub_questions", [query])
        logger.info(f"Decomposed query into {len(sub_questions)} sub-questions")
        return ResearchPlan(original_query=query, sub_questions=sub_questions, brief=brief)
    except Exception as e:
        logger.warning(f"Query decomposition failed, using original query: {e}")
        return ResearchPlan(original_query=query, sub_questions=[query], brief="")


def compress_findings(findings: list[str]) -> str:
    """Compress raw research findings into a structured summary."""
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return "\n\n".join(findings)

    combined = "\n\n---\n\n".join(findings)
    prompt = _workflow_prompt("compress", findings=combined)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt=get_academic_governance().task_contract("synthesis"),
            task_type="synthesis",
        )
        return result
    except Exception as e:
        logger.warning(f"Compression failed: {e}")
        return combined


def synthesize_answer(query: str, findings: str) -> str:
    """Synthesize final answer from compressed findings."""
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return findings

    prompt = _workflow_prompt("synthesize", query=query, findings=findings)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt=get_academic_governance().task_contract("report_writing"),
            task_type="synthesis",
        )
        return result
    except Exception as e:
        logger.warning(f"Synthesis failed: {e}")
        return findings
