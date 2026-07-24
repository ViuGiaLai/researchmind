"""
VerifyReportBuilder — Rule-first academic verification report.

Takes structured data from ALL academic engines and produces a
pre-verified JSON report. The LLM's ONLY role is to format this
JSON into natural language. It CANNOT change findings, verdicts,
or confidence levels — those are determined by rule engines.

Flow:
  Engines (rule-based) → VerifyReportBuilder → structured JSON
  → LLM (format only) → readable audit report
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# ── Report sections (all pre-verified, LLM-proof) ───────────────


@dataclass
class AcademicVerdict:
    """Final verdict — determined by rule engines, NOT the LLM."""

    verdict: str  # "supported" | "partially_supported" | "inconclusive" | "contradicted"
    reason: str
    determined_by: str = "AcademicVerificationEngine"


@dataclass
class AcademicBasis:
    """What rules and methods were applied."""

    rules_applied: list[str] = field(default_factory=list)
    verification_methods: list[str] = field(default_factory=list)
    standards_used: list[str] = field(default_factory=list)


@dataclass
class EvidenceItem:
    """A single verified evidence finding."""

    check_name: str
    finding: str
    source: str  # "Local PDF" | "Crossref" | "OpenAlex" | "Semantic Scholar"
    confidence: str  # "High" | "Medium" | "Low"
    status: str  # "pass" | "fail" | "warning"


@dataclass
class EvidenceSection:
    """All evidence findings grouped by category."""

    items: list[EvidenceItem] = field(default_factory=list)

    def add(self, check_name: str, finding: str, source: str, confidence: str, status: str = "pass"):
        self.items.append(
            EvidenceItem(
                check_name=check_name,
                finding=finding,
                source=source,
                confidence=confidence,
                status=status,
            )
        )


@dataclass
class Limitation:
    """Something that could not be verified."""

    item: str
    detail: str
    impact: str  # "high" | "medium" | "low"


@dataclass
class LimitationsSection:
    """What could NOT be verified."""

    unverifiable_items: list[Limitation] = field(default_factory=list)
    missing_data: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)


@dataclass
class ConfidenceSection:
    """Overall confidence level and reasoning."""

    level: str  # "High" | "Medium" | "Low"
    reasoning: str = ""
    score: float = 0.0  # 0.0 - 1.0


@dataclass
class NextStepsSection:
    """Concrete actions for the user."""

    steps: list[str] = field(default_factory=list)


@dataclass
class VerifyReport:
    """Complete pre-verified academic audit report.

    All fields are populated by rule engines. The LLM receives this
    as structured JSON and ONLY formats it into natural language.
    """

    query: str = ""
    papers_analysed: list[str] = field(default_factory=list)
    academic_verdict: AcademicVerdict = field(default_factory=AcademicVerdict)
    academic_basis: AcademicBasis = field(default_factory=AcademicBasis)
    evidence: EvidenceSection = field(default_factory=EvidenceSection)
    limitations: LimitationsSection = field(default_factory=LimitationsSection)
    confidence: ConfidenceSection = field(default_factory=ConfidenceSection)
    next_steps: NextStepsSection = field(default_factory=NextStepsSection)
    raw_engine_outputs: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "papers_analysed": self.papers_analysed,
            "academic_verdict": {
                "verdict": self.academic_verdict.verdict,
                "reason": self.academic_verdict.reason,
                "determined_by": self.academic_verdict.determined_by,
            },
            "academic_basis": {
                "rules_applied": self.academic_basis.rules_applied,
                "verification_methods": self.academic_basis.verification_methods,
                "standards_used": self.academic_basis.standards_used,
            },
            "evidence": [
                {
                    "check_name": e.check_name,
                    "finding": e.finding,
                    "source": e.source,
                    "confidence": e.confidence,
                    "status": e.status,
                }
                for e in self.evidence.items
            ],
            "limitations": {
                "unverifiable_items": [
                    {"item": item.item, "detail": item.detail, "impact": item.impact}
                    for item in self.limitations.unverifiable_items
                ],
                "missing_data": self.limitations.missing_data,
                "assumptions": self.limitations.assumptions,
            },
            "confidence": {
                "level": self.confidence.level,
                "reasoning": self.confidence.reasoning,
                "score": self.confidence.score,
            },
            "next_steps": self.next_steps.steps,
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


class VerifyReportBuilder:
    """Builds a VerifyReport from structured engine outputs.

    This is the RULE-based layer. Every finding, verdict, and
    confidence level is determined here, NOT by the LLM.
    """

    def __init__(self):
        self.report = VerifyReport()

    def set_query(self, query: str):
        self.report.query = query

    def set_papers(self, paper_ids: list[str]):
        self.report.papers_analysed = list(paper_ids)

    def apply_verification_result(self, v_result: Any):
        """Apply 5-point verification engine results.

        Call this FIRST — it sets the base verdict, confidence, and
        academic basis. Other apply_* methods then enrich these.
        """
        if v_result is None:
            self.report.confidence.level = "Low"
            self.report.confidence.reasoning = "Verification engine did not run."
            return

        result = v_result if isinstance(v_result, dict) else v_result.__dict__

        # ── Evidence items from 5-point check ──
        checks = [
            ("Citation Correctness", result.get("citation_correctness", False)),
            ("Evidence Grounding", result.get("grounding_valid", False)),
            ("DOI Resolution", result.get("doi_valid", False)),
            ("Reference Completeness", result.get("reference_exists", False)),
            ("Venue Compliance", result.get("venue_compliant", False)),
        ]
        for name, passed in checks:
            self.report.evidence.add(
                check_name=name,
                finding=f"{'PASS' if passed else 'FAIL'}: {name} check completed",
                source="AcademicVerificationEngine",
                confidence="High",
                status="pass" if passed else "fail",
            )

        # ── Errors and warnings ──
        for err in result.get("errors", []):
            self.report.evidence.add(
                check_name="Verification Error",
                finding=err,
                source="AcademicVerificationEngine",
                confidence="High",
                status="fail",
            )
        for warn in result.get("warnings", []):
            self.report.evidence.add(
                check_name="Verification Warning",
                finding=warn,
                source="AcademicVerificationEngine",
                confidence="Medium",
                status="warning",
            )

        # ── Verdict (rule-based) ──
        is_valid = result.get("is_valid", False)
        fail_count = sum(1 for _, passed in checks if not passed)
        if is_valid:
            self.report.academic_verdict.verdict = "supported"
            self.report.academic_verdict.reason = "All 5 verification checks passed."
        elif fail_count >= 3:
            self.report.academic_verdict.verdict = "contradicted"
            self.report.academic_verdict.reason = f"{fail_count} of 5 verification checks failed."
        elif fail_count >= 1:
            self.report.academic_verdict.verdict = "partially_supported"
            self.report.academic_verdict.reason = f"{fail_count} of 5 verification checks failed but remaining passed."
        else:
            self.report.academic_verdict.verdict = "inconclusive"
            self.report.academic_verdict.reason = "Verification engine returned inconclusive results."

        # ── Academic basis (base — enriched by other apply_* methods) ──
        self.report.academic_basis.rules_applied = [
            "evidence_grounding",
            "citation_integrity",
            "uncertainty_reporting",
        ]
        self.report.academic_basis.verification_methods = [
            "Citation format validation",
            "Claim-to-evidence grounding analysis",
            "DOI resolution via Crossref",
            "Reference existence & completeness check",
            "Venue policy compliance audit",
        ]
        self.report.academic_basis.standards_used = [
            "AcademicVerificationEngine (5-point)",
        ]

        # ── Confidence (base — adjusted by other apply_* methods) ──
        pass_rate = sum(1 for _, passed in checks if passed) / len(checks)
        self.report.confidence.score = pass_rate
        if pass_rate >= 0.8:
            self.report.confidence.level = "High"
        elif pass_rate >= 0.5:
            self.report.confidence.level = "Medium"
        else:
            self.report.confidence.level = "Low"
        self.report.confidence.reasoning = (
            f"{'All' if pass_rate == 1.0 else f'{int(pass_rate * 100)}% of'} verification checks passed."
        )

        # ── Limitations ──
        if not result.get("doi_valid", True):
            self.report.limitations.unverifiable_items.append(
                Limitation("DOI Resolution", "DOI could not be resolved via Crossref", "high")
            )
        if not result.get("grounding_valid", True):
            self.report.limitations.unverifiable_items.append(
                Limitation("Evidence Grounding", "No explicit evidence grounding markers detected", "medium")
            )

        # ── Next steps ──
        self._add_standard_next_steps(result)

    def apply_venue_audit(self, venue_audit: dict | None):
        """Apply venue compliance audit results.

        Call this AFTER apply_verification_result() so the academic
        basis and confidence base are already set.
        """
        if not venue_audit:
            self.report.limitations.missing_data.append("No venue audit data available")
            return

        venue_info = venue_audit.get("venue_info", {})
        venue_name = venue_info.get("name", "Unknown")
        overall_score = venue_audit.get("overall_score", 0)

        # Add venue to standards (append to base set by apply_verification_result)
        if venue_name not in self.report.academic_basis.standards_used:
            self.report.academic_basis.standards_used.append(venue_name)
        if "FormatAuditorTool" not in self.report.academic_basis.verification_methods:
            self.report.academic_basis.verification_methods.append("Venue format audit")

        # Evidence items from venue audit
        checks = venue_audit.get("checks", [])
        for check in checks[:10]:
            severity = check.get("severity", "unknown")
            self.report.evidence.add(
                check_name=check.get("name", "Venue check"),
                finding=f"[{severity.upper()}] {check.get('message', '')}",
                source=f"FormatAuditor ({venue_name})",
                confidence="High" if severity in ("pass", "critical") else "Medium",
                status="pass" if severity == "pass" else ("fail" if severity == "critical" else "warning"),
            )

        # Update confidence based on venue score (only adjust if not already lowered)
        if self.report.confidence.score > 0.0 and overall_score < 50:
            self.report.confidence.score *= 0.8
            self.report.confidence.level = "Low"
            self.report.confidence.reasoning += f" Venue compliance score ({overall_score}%) is low."
            self.report.limitations.unverifiable_items.append(
                Limitation("Venue Compliance", f"Compliance score {overall_score}%", "high")
            )

        # Limitations from venue audit
        for check in checks:
            if check.get("severity") == "critical":
                self.report.limitations.unverifiable_items.append(
                    Limitation(
                        check.get("name", "Venue requirement"),
                        check.get("message", ""),
                        "high",
                    )
                )

        # Next steps from venue audit
        if overall_score < 80:
            self.report.next_steps.steps.append(f"Improve venue compliance: current score is {overall_score}%.")

    def apply_ontology_reasoning(self, reasoning: dict[str, list] | None):
        """Apply ontology-based reasoning results."""
        if not reasoning:
            return

        sota_claims = reasoning.get("sota_claims", [])
        conflicts = reasoning.get("conflicts", [])
        unsupported = reasoning.get("unsupported_assertions", [])

        for claim in sota_claims[:5]:
            stmt = claim.statement if hasattr(claim, "statement") else claim.get("statement", "")
            conf = claim.confidence if hasattr(claim, "confidence") else claim.get("confidence", 0)
            self.report.evidence.add(
                check_name="SOTA Detection",
                finding=f"🏆 {stmt}",
                source="OntologyReasoningEngine",
                confidence="High" if conf > 0.9 else "Medium",
                status="pass",
            )

        for conflict in conflicts[:3]:
            stmt = conflict.statement if hasattr(conflict, "statement") else conflict.get("statement", "")
            conf = conflict.confidence if hasattr(conflict, "confidence") else conflict.get("confidence", 0)
            self.report.evidence.add(
                check_name="Evidence Conflict",
                finding=f"⚡ {stmt}",
                source="OntologyReasoningEngine",
                confidence="High" if conf > 0.9 else "Medium",
                status="warning",
            )

        for assertion in unsupported[:3]:
            stmt = assertion.statement if hasattr(assertion, "statement") else assertion.get("statement", "")
            self.report.evidence.add(
                check_name="Unsupported Assertion",
                finding=f"❓ {stmt}",
                source="OntologyReasoningEngine",
                confidence="Medium",
                status="warning",
            )

    def apply_refutation(self, refutation_results: list | None, query: str = ""):
        """Apply adversarial refutation results."""
        if not refutation_results:
            return

        for counter in refutation_results[:5]:
            severity = counter.severity if hasattr(counter, "severity") else counter.get("severity", "moderate")
            angle = (
                counter.refutation_angle
                if hasattr(counter, "refutation_angle")
                else counter.get("refutation_angle", "")
            )
            challenge = (
                counter.counter_statement
                if hasattr(counter, "counter_statement")
                else counter.get("counter_statement", "")
            )
            experiment = (
                counter.suggested_experiment
                if hasattr(counter, "suggested_experiment")
                else counter.get("suggested_experiment", "")
            )

            self.report.evidence.add(
                check_name=f"Refutation ({angle})",
                finding=f"[{severity.upper()}] {challenge}",
                source="AdversarialRefutationEngine",
                confidence="High" if severity == "critical" else "Medium",
                status="warning" if severity == "critical" else "pass",
            )

            self.report.next_steps.steps.append(f"[Refutation] {experiment}")

    def apply_external_data(self, external_data: list, verify_status: str = "local_only"):
        """Apply external academic database findings."""
        if not external_data:
            self.report.limitations.missing_data.append(
                "No external academic data (OpenAlex/Crossref/Semantic Scholar)"
            )
            self.report.limitations.assumptions.append("Verification is based solely on local PDF content")
            return

        for ep in external_data[:3]:
            ep.get("doi", "") if isinstance(ep, dict) else getattr(ep, "doi", "")
            title = ep.get("title", "") if isinstance(ep, dict) else getattr(ep, "title", "")

            oa = ep.get("openalex", None) if isinstance(ep, dict) else getattr(ep, "openalex", None)
            cr = ep.get("crossref", None) if isinstance(ep, dict) else getattr(ep, "crossref", None)

            if cr:
                authors = cr.get("authors", []) if isinstance(cr, dict) else getattr(cr, "authors", [])
                journal = cr.get("journal", "") if isinstance(cr, dict) else getattr(cr, "journal", "")
                year = cr.get("year", "") if isinstance(cr, dict) else getattr(cr, "year", "")
                cite_count = cr.get("citation_count", 0) if isinstance(cr, dict) else getattr(cr, "citation_count", 0)
                self.report.evidence.add(
                    check_name="Crossref Validation",
                    finding=f"DOI resolved: {title} ({authors[:2] if authors else 'Unknown'}, {journal}, {year}, {cite_count} citations)",
                    source="Crossref",
                    confidence="High",
                    status="pass",
                )

            if oa:
                oa_cite = oa.get("citation_count", 0) if isinstance(oa, dict) else getattr(oa, "citation_count", 0)
                oa_year = (
                    oa.get("publication_year", "") if isinstance(oa, dict) else getattr(oa, "publication_year", "")
                )
                self.report.evidence.add(
                    check_name="OpenAlex Validation",
                    finding=f"Paper found in OpenAlex ({oa_cite} citations, {oa_year})",
                    source="OpenAlex",
                    confidence="High",
                    status="pass",
                )

    def apply_knowledge_graph(self, graph_context: str | None):
        """Apply knowledge graph context."""
        if graph_context and graph_context.strip() and len(graph_context) > 20:
            # Extract first meaningful line as evidence
            first_line = graph_context.strip().split("\n")[0][:120]
            self.report.evidence.add(
                check_name="Knowledge Graph",
                finding=first_line or "Entity relationships found in local knowledge graph",
                source="KnowledgeGraph (LocalSearch)",
                confidence="Medium",
                status="pass",
            )

    def get_report(self) -> VerifyReport:
        """Get the final pre-verified report."""
        return self.report

    def get_report_json(self) -> str:
        """Get the report as JSON for LLM formatting."""
        return self.report.to_json()

    def get_llm_formatting_prompt(self, lang: str = "vi") -> str:
        """Build minimal LLM prompt — format only, no analysis."""
        report_json = self.report.to_json()
        lang_instruction = "Trả lời bằng tiếng Việt." if lang == "vi" else "Reply in English."

        return f"""You are a language formatter for ResearchMind Academic Verifier.

Your ONLY job is to format the PRE-VERIFIED ACADEMIC AUDIT REPORT below into
well-structured natural language. You MUST follow these rules:

1. Do NOT add new findings — all evidence is already verified
2. Do NOT change the verdict — it is determined by rule engines
3. Do NOT change confidence levels — they are calculated by rule engines
4. Do NOT remove any evidence items — present all of them
5. Do NOT add analysis or interpretation beyond what is in the report
6. Do NOT ask the user for additional information

Format the report with these sections:
- **ACADEMIC VERDICT**: State the verdict and reason (1 line)
- **ACADEMIC BASIS**: List rules, methods, and standards used
- **EVIDENCE**: Present each finding with its source and confidence
- **LIMITATIONS**: List what could not be verified
- **CONFIDENCE**: State overall confidence level and why
- **NEXT STEPS**: List recommended actions

{lang_instruction}

## PRE-VERIFIED REPORT (JSON)
{report_json}

## YOUR OUTPUT
Format the above JSON into a readable academic audit report following exactly the sections above. Do not deviate from the data provided."""

    def _add_standard_next_steps(self, result: dict):
        """Add standard next steps based on verification gaps."""
        if not result.get("doi_valid", True):
            self.report.next_steps.steps.append("Verify DOI manually on Crossref (https://doi.org/)")
        if not result.get("citation_correctness", True):
            self.report.next_steps.steps.append("Review citation formatting against venue guidelines")
        if not result.get("reference_exists", True):
            self.report.next_steps.steps.append("Check that all references are complete and accessible")
        if not result.get("venue_compliant", True):
            self.report.next_steps.steps.append("Review manuscript against venue submission requirements")
