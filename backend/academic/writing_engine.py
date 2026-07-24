"""Scientific Writing Engine — rules and structure for drafting the 7 manuscript sections.

Sections:
1. Abstract (Background, Objective, Method, Results, Conclusion)
2. Introduction (Hook, Gap, Contribution list, Roadmap)
3. Related Work (Thematic grouping, Critical analysis, Currency)
4. Method (Mathematical formalization, Algorithm pseudocode, Setup)
5. Results (Empirical benchmarks, Statistical significance, Baselines)
6. Discussion (Interpretation, Scope limitations, Broader impact)
7. Conclusion (Summary of achievements, Future directions)
"""

from __future__ import annotations

from dataclasses import dataclass

from academic.governance import get_academic_governance


@dataclass
class SectionTemplate:
    section_name: str
    target_words: str
    required_elements: list[str]
    writing_rules: list[str]


class ScientificWritingEngine:
    """Provides section-specific writing rules, structure, and formatting contracts."""

    def __init__(self):
        self.governance = get_academic_governance()

    def get_section_template(self, section_name: str) -> SectionTemplate:
        """Return the writing template and guidelines for a specific manuscript section."""
        sec_key = section_name.lower().replace(" ", "_")
        try:
            review_spec = self.governance.review_section(sec_key)
            words = review_spec.get("words", "300-500")
            reqs = review_spec.get("requirements", [])
        except KeyError:
            words = "300-500"
            reqs = ["State key findings clearly.", "Cite relevant sources."]

        writing_rules = list(self.governance.rules(("writing_quality", "peer_review_standards")))

        return SectionTemplate(
            section_name=section_name,
            target_words=words,
            required_elements=reqs,
            writing_rules=writing_rules,
        )

    def format_section(self, section_name: str, content: str) -> str:
        """Format and structure a draft section into valid Markdown/LaTeX."""
        self.get_section_template(section_name)
        lines = [
            f"## {section_name.title()}",
            content.strip(),
        ]
        return "\n\n".join(lines)
