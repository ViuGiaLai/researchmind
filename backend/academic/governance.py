"""Versioned academic rules and local knowledge retrieval.

This module keeps academic policy and editorial knowledge outside model prompts.
The model receives only the small contract assembled for the active workflow.
Governance data: academic_governance.json (v1.1.0+)
"""
from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_RESOURCE = Path(__file__).with_name("resources") / "academic_governance.json"
_TOKEN = re.compile(r"[\w-]+", re.UNICODE)
_CITATION = re.compile(r"\[([^\]\n]+)\]")


@dataclass(frozen=True)
class KnowledgeSnippet:
    id: str
    title: str
    content: str
    provenance: str
    score: int


@dataclass(frozen=True)
class GraphExtractionSchema:
    version: str
    entity_types: tuple[str, ...]
    tuple_delimiter: str
    record_delimiter: str
    completion_delimiter: str
    weight_minimum: float
    weight_maximum: float

    def prompt(self, input_text: str, entity_types: Iterable[str] | None = None) -> str:
        allowed = tuple(item.upper() for item in (entity_types or self.entity_types))
        entities = self.tuple_delimiter.join(("\"entity\"", "ENTITY_NAME", "ENTITY_TYPE", "ENTITY_DESCRIPTION"))
        relationships = self.tuple_delimiter.join(("\"relationship\"", "SOURCE_ENTITY", "TARGET_ENTITY", "RELATIONSHIP_DESCRIPTION", "RELATIONSHIP_STRENGTH"))
        return "\n".join([
            "Extract explicitly supported academic knowledge-graph records from this source excerpt.",
            "Allowed entity types: " + ", ".join(allowed),
            "Use canonical capitalization and concise evidence-based descriptions.",
            f"Entity record: ({entities})",
            f"Relationship record: ({relationships})",
            f"Separate records with {self.record_delimiter}; finish with {self.completion_delimiter}.",
            "Source excerpt:", input_text, "Output:",
        ])

@dataclass(frozen=True)
class CitationAudit:
    cited: tuple[str, ...]
    unsupported: tuple[str, ...]

    @property
    def passed(self) -> bool:
        return not self.unsupported


class AcademicGovernance:
    def __init__(self, source: Path = _RESOURCE):
        self.source = source
        self._data = self._load()

    def _load(self) -> dict:
        with self.source.open(encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data.get("rule_packs"), dict):
            raise ValueError("academic governance requires rule_packs")
        return data

    @property
    def version(self) -> str:
        return str(self._data["version"])

    def rules(self, rule_ids: Iterable[str]) -> tuple[str, ...]:
        result: list[str] = []
        for rule_id in rule_ids:
            pack = self._data["rule_packs"].get(rule_id)
            if pack is None:
                raise KeyError(f"Unknown academic rule pack: {rule_id}")
            result.extend(str(rule) for rule in pack.get("rules", []))
        return tuple(result)

    def retrieve_knowledge(self, query: str, *, limit: int = 2) -> tuple[KnowledgeSnippet, ...]:
        terms = set(_TOKEN.findall(query.lower()))
        ranked: list[KnowledgeSnippet] = []
        for item in self._data.get("knowledge_documents", []):
            haystack = " ".join([item.get("title", ""), *item.get("tags", []), item.get("content", "")]).lower()
            score = sum(1 for term in terms if term in haystack)
            if score:
                ranked.append(KnowledgeSnippet(
                    id=str(item["id"]), title=str(item["title"]), content=str(item["content"]),
                    provenance=str(item["provenance"]), score=score,
                ))
        ranked.sort(key=lambda item: (-item.score, item.id))
        return tuple(ranked[:limit])

    def search_knowledge(
        self,
        query: str,
        *,
        tags: list[str] | None = None,
        limit: int = 5,
    ) -> tuple[KnowledgeSnippet, ...]:
        """Extended knowledge search with optional tag filter.

        If *tags* is provided, only documents that contain at least one of those
        tags are considered.  Score is computed by token overlap between the
        query and (title + tags + content).  More generous than retrieve_knowledge:
        default limit is 5 instead of 2.
        """
        terms = set(_TOKEN.findall(query.lower()))
        tag_set = {t.lower() for t in tags} if tags else None

        ranked: list[KnowledgeSnippet] = []
        for item in self._data.get("knowledge_documents", []):
            item_tags = [t.lower() for t in item.get("tags", [])]
            if tag_set and not tag_set.intersection(item_tags):
                continue
            haystack = " ".join([item.get("title", ""), *item_tags, item.get("content", "")]).lower()
            score = sum(1 for term in terms if term in haystack)
            if score or not query:
                ranked.append(KnowledgeSnippet(
                    id=str(item["id"]), title=str(item["title"]), content=str(item["content"]),
                    provenance=str(item["provenance"]), score=score,
                ))
        ranked.sort(key=lambda item: (-item.score, item.id))
        return tuple(ranked[:limit])

    def list_knowledge_topics(self) -> list[dict]:
        """Return a summary list of all knowledge_documents for UI display.

        Each entry contains id, title, tags, and provenance — not the full content.
        """
        return [
            {
                "id": item.get("id", ""),
                "title": item.get("title", ""),
                "tags": item.get("tags", []),
                "provenance": item.get("provenance", ""),
                "last_updated": item.get("last_updated", ""),
            }
            for item in self._data.get("knowledge_documents", [])
        ]

    def rule_pack_titles(self) -> dict[str, str]:
        """Return {pack_id: title} for all registered rule packs."""
        return {
            pack_id: pack.get("title", pack_id)
            for pack_id, pack in self._data.get("rule_packs", {}).items()
        }

    def system_contract(self, *, language_instruction: str = "", reasoning_mode: str = "fast", strict_evidence: bool = False) -> str:
        rule_ids = ["evidence_grounding", "citation_integrity", "uncertainty_reporting"]
        if strict_evidence:
            rules = list(self.rules(rule_ids)) + ["If the evidence is insufficient, say so; do not use outside knowledge."]
        else:
            rules = list(self.rules(rule_ids))
        presentation = (
            "Answer with conclusion, cited evidence, limitations, and next steps. "
            "Never score confidence; ResearchMind engines do that."
        ) if strict_evidence else (
            "Answer directly: conclusion first, then cited evidence and limitations. "
            "Do not assign confidence scores or expose internal engine data."
        )
        return "\n".join(["You are ResearchMind, an academic research assistant.", presentation, *[f"- {rule}" for rule in rules], language_instruction]).strip()

    def rag_request(self, *, context: str, query: str) -> str:
        snippets = self.retrieve_knowledge(query)
        knowledge = "\n".join(f"- {item.title} ({item.provenance}): {item.content}" for item in snippets)
        sections = ["## Evidence\n" + context]
        if knowledge:
            sections.append("## Retrieved research guidance\n" + knowledge)
        sections.append("## User question\n" + query)
        return "\n\n".join(sections)

    def planning_schema(self, name: str) -> dict:
        try:
            return dict(self._data["planning_schemas"][name])
        except KeyError as error:
            raise KeyError(f"Unknown planning schema: {name}") from error

    def persona_request(self, query: str, related_context: str) -> str:
        spec = self.planning_schema("personas")
        rules = self.rules(("research_planning",)) + tuple(spec["rules"])
        schema = '{"personas": [{"name": "name", "description": "role", "focus_areas": ["area"]}]}'
        return "\n".join([f"Research topic: {query}", "Related structure:", related_context, "Planning policy:", *[f"- {rule}" for rule in rules], f"Return JSON exactly matching: {schema}"])

    def perspective_questions_request(self, topic: str, name: str, description: str, focus_areas: str) -> str:
        spec = self.planning_schema("perspective_questions")
        rules = self.rules(("research_planning",)) + tuple(spec["rules"])
        schema = '{"questions": ["question"]}'
        return "\n".join([f"Perspective: {name}. {description}", f"Research topic: {topic}", f"Focus areas: {focus_areas}", "Planning policy:", *[f"- {rule}" for rule in rules], f"Return JSON exactly matching: {schema}"])
    def graph_extraction_schema(self) -> GraphExtractionSchema:
        data = self._data["graph_extraction"]
        weight = data["relationship_weight"]
        return GraphExtractionSchema(
            version=str(data["version"]), entity_types=tuple(str(item).upper() for item in data["entity_types"]),
            tuple_delimiter=str(data["tuple_delimiter"]), record_delimiter=str(data["record_delimiter"]),
            completion_delimiter=str(data["completion_delimiter"]),
            weight_minimum=float(weight["minimum"]), weight_maximum=float(weight["maximum"]),
        )
    def graph_contract(self, mode: str) -> str:
        """Reusable evidence policy for GraphRAG search and community summaries."""
        rules = self.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        citation_rule = {
            "local": "Cite graph sources as [Paper: paper_id] and [Community: community_id].",
            "global": "Preserve community and paper source markers on the claims they support.",
            "community": "Do not claim significance beyond the supplied graph evidence.",
        }.get(mode, "Preserve source markers on the claims they support.")
        return "\n".join([
            "You are ResearchMind working with academic knowledge-graph evidence.",
            citation_rule,
            *[f"- {rule}" for rule in rules],
        ])
    def insight_task(self, task: str) -> dict:
        try:
            return dict(self._data["insight_tasks"][task])
        except KeyError as error:
            raise KeyError(f"Unknown insight task: {task}") from error

    def insight_request(self, task: str) -> str:
        spec = self.insight_task(task)
        rules = self.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        requirements = "\n".join(f"- {item}" for item in spec["requirements"])
        return "\n".join([spec["objective"], "Task requirements:", requirements, "Academic policy:", *[f"- {rule}" for rule in rules]])
    def review_section(self, section: str) -> dict:
        """Return a versioned review-section manifest, not a hand-written prompt."""
        try:
            return dict(self._data["review_sections"][section])
        except KeyError as error:
            raise KeyError(f"Unknown review section: {section}") from error

    def review_request(self, section: str, paper_titles: Iterable[str]) -> str:
        spec = self.review_section(section)
        rules = self.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        requirements = "\n".join(f"- {item}" for item in spec.get("requirements", []))
        sources = "\n".join(f"- {title}" for title in paper_titles)
        return "\n".join([
            spec["objective"],
            f"Target length: approximately {spec['words']} words.",
            "Section requirements:", requirements,
            "Available papers:", sources,
            "Academic policy:", *[f"- {rule}" for rule in rules],
        ])
    def audit_citations(self, response: str, allowed_labels: Iterable[str]) -> CitationAudit:
        allowed = {label.strip() for label in allowed_labels}
        cited = tuple(match.strip() for match in _CITATION.findall(response))
        unsupported = tuple(label for label in cited if label not in allowed)
        return CitationAudit(cited=cited, unsupported=unsupported)

    def workflow(self, name: str) -> tuple[dict, ...]:
        try:
            return tuple(self._data["workflows"][name]["steps"])
        except KeyError as error:
            raise KeyError(f"Unknown workflow: {name}") from error


    def graph_prompt(self, name: str, **values: str) -> str:
        """Return a versioned graph user-prompt template rendered with supplied values.

        All graph prompt templates live in academic_governance.json under
        ``graph_prompts``.  Call without keyword arguments to get the raw
        template string (useful for inspection/testing).
        """
        try:
            template: str = self._data["graph_prompts"][name]["template"]
        except KeyError as error:
            raise KeyError(f"Unknown graph prompt: {name!r}") from error
        return template.format(**values) if values else template

    def task_contract(self, task: str) -> str:
        """Return a minimal role-only system contract for a named task.

        Roles and output expectations are stored in academic_governance.json
        under ``task_contracts`` so they can be updated without code changes.
        """
        try:
            spec = self._data["task_contracts"][task]
        except KeyError as error:
            raise KeyError(f"Unknown task contract: {task!r}") from error
        role = str(spec.get("role", ""))
        fmt = str(spec.get("output_format", ""))
        return f"{role} {fmt}".strip()

    def sub_question_request(self, context: str, sub_question: str) -> str:
        """Build a grounded RAG user prompt for deep-research sub-questions.

        Applies the evidence_grounding + citation_integrity +
        uncertainty_reporting rule packs so citation policy is never
        embedded as a raw string at the call site.
        """
        rules = self.rules(("evidence_grounding", "citation_integrity", "uncertainty_reporting"))
        return "\n".join([
            "Answer the sub-question using only the supplied document context.",
            "Context:", context,
            "Sub-question:", sub_question,
            "Policy:", *[f"- {rule}" for rule in rules],
        ])


@lru_cache(maxsize=1)
def get_academic_governance() -> AcademicGovernance:
    return AcademicGovernance()
