"""Perspective/persona generation for deep research.

Uses versioned planning schemas from academic governance. The model creates domain
perspectives, while scope, output shape, and validation are deterministic.
"""
import json
from dataclasses import dataclass, field

from loguru import logger

from academic.governance import get_academic_governance


@dataclass
class Persona:
    """A research perspective/persona."""
    name: str
    description: str
    focus_areas: list[str] = field(default_factory=list)


@dataclass
class PerspectiveSet:
    """Set of perspectives for researching a topic."""
    query: str
    personas: list[Persona] = field(default_factory=list)
    related_topics: list[str] = field(default_factory=list)


def generate_personas(query: str, related_topics: list[str] | None = None) -> PerspectiveSet:
    """Generate validated, non-overlapping research perspectives for a query."""
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        logger.error("Generator not initialized")
        return PerspectiveSet(query=query)

    related_context = "\n".join(f"- {topic}" for topic in (related_topics or [])[:5]) or "No specific reference material is available."
    governance = get_academic_governance()
    prompt = governance.persona_request(query, related_context)
    try:
        data = json.loads(generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Return the requested structured planning data only.",
            task_type="research",
        ))
        spec = governance.planning_schema("personas")
        personas = [
            Persona(
                name=str(item.get("name") or f"Perspective {index + 1}").strip(),
                description=str(item.get("description") or "").strip(),
                focus_areas=[str(area).strip() for area in item.get("focus_areas", []) if isinstance(area, str) and area.strip()][:3],
            )
            for index, item in enumerate(data.get("personas", []))
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ][:int(spec["maximum"])]
        logger.info(f"Generated {len(personas)} personas for query: {query}")
        return PerspectiveSet(query=query, personas=personas, related_topics=related_topics or [])
    except Exception as error:
        logger.warning(f"Persona generation failed: {error}")
        return PerspectiveSet(query=query, related_topics=related_topics or [])


def generate_perspective_questions(topic: str, persona: Persona) -> list[str]:
    """Generate validated research questions from one research perspective."""
    from app_state import state
    from chat.generator_v2 import Generator

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return [f"{topic} (perspective: {persona.name})"]

    governance = get_academic_governance()
    focus_areas = ", ".join(persona.focus_areas) if persona.focus_areas else "primary expertise"
    prompt = governance.perspective_questions_request(topic, persona.name, persona.description, focus_areas)
    try:
        data = json.loads(generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Return the requested structured planning data only.",
            task_type="research",
        ))
        limit = int(governance.planning_schema("perspective_questions")["maximum"])
        questions = [
            str(question).strip() for question in data.get("questions", [])
            if isinstance(question, str) and len(question.strip()) > 10
        ][:limit]
        logger.info(f"Generated {len(questions)} questions from {persona.name}")
        return questions or [f"{topic} (perspective: {persona.name})"]
    except Exception as error:
        logger.warning(f"Question generation for {persona.name} failed: {error}")
        return [f"{topic} (perspective: {persona.name})"]
