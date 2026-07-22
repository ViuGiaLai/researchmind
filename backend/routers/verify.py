"""
POST /api/verify â€” Academic Verification endpoint.
Káº¿t há»£p Local RAG + OpenAlex + Crossref + Semantic Scholar.
Cung cáº¥p: metadata verification, citation analysis, related research, evolution.
"""

import asyncio
import json
import re
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory, Paper
from loguru import logger

from academic.openalex import OpenAlexWork, get_work_by_doi, get_work_by_title, get_recent_citing_works
from academic.crossref import CrossrefWork, get_work_by_doi as crossref_get_work
from academic.semantic_scholar import S2Paper, get_paper_by_doi as s2_get_by_doi, get_citations as s2_get_citations, get_recommendations as s2_get_recommendations
from academic.doi_extractor import extract_doi_from_paper, extract_multiple_dois
from academic.paper_check import check_papers_ready
from common.rag_ready import rag_unavailable_message
from common.i18n import t, get_language
from academic.context_builder import ExternalPaperData
from academic.cache import cache_get, cache_set, TTL_OPENALEX, TTL_CROSSREF
from academic.tools.format_auditor import FormatAuditorTool
from academic.verification_engine import AcademicVerificationEngine
from academic.reasoning_engine import AcademicReasoningEngine
from academic.ontology import AcademicOntologyGraph, ClaimEntity, ExperimentEntity
from academic.knowledge_engine import knowledge_engine as ke
from academic.ontology_populator import populate_verify_ontology
from academic.refutation_engine import AdversarialRefutationEngine
from graph.local_search import build_local_context
from graph.linker import infer_venue_from_doi
from academic.verify_report_builder import VerifyReportBuilder

router = APIRouter(prefix="/api/verify", tags=["verify"])


class VerifyRequest(BaseModel):
    message: str
    paper_ids: list[str] = []
    collection_id: Optional[str] = None
    session_id: Optional[str] = None
    stream: bool = False


def _resolve_collection_paper_ids(collection_id: str | None) -> list[str]:
    if not collection_id:
        return []
    from db.models import CollectionPaper

    session = get_session(state.engine)
    try:
        return [
            row.paper_id
            for row in session.query(CollectionPaper.paper_id)
            .filter(CollectionPaper.collection_id == collection_id)
            .all()
        ]
    finally:
        session.close()


@router.post("")
async def verify_research(http_request: Request, body: VerifyRequest = Body(...)):
    import time as time_mod
    t0 = time_mod.time()
    lang = get_language(http_request)

    if not body.message:
        raise HTTPException(400, t("error.message_empty", lang))

    query = body.message
    paper_ids = body.paper_ids
    if body.collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(body.collection_id)
    session_id = body.session_id or "verify"
    do_stream = body.stream

    rag_error = rag_unavailable_message(lang)
    if rag_error:
        return {"answer": rag_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0, "external_sources": [], "verify_status": "local_only"}

    paper_error = check_papers_ready(paper_ids, lang)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0, "external_sources": [], "verify_status": "local_only"}

    t_retrieve = time_mod.time()
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=query,
        paper_ids=paper_ids,
        top_k=5,
        task_type="verify",
    )
    t_retrieve = time_mod.time() - t_retrieve

    t_doi = time_mod.time()
    papers_meta = await asyncio.to_thread(_get_papers_metadata, paper_ids)

    # --- Extract DOIs ---
    dois_to_lookup = []
    for paper in papers_meta:
        doi = await extract_doi_from_paper(
            pdf_path=paper.get("file_path"),
            title=paper.get("title"),
            authors=paper.get("authors", []),
            context_text=retrieval.context_text
        )
        if doi:
            dois_to_lookup.append((doi, paper.get("title", "")))

    extra_dois = extract_multiple_dois(retrieval.context_text)
    for doi in extra_dois:
        if doi not in [d for d, _ in dois_to_lookup]:
            dois_to_lookup.append((doi, ""))
    t_doi = time_mod.time() - t_doi

    # --- Lookup ALL sources ---
    external_data = []
    verify_status = "local_only"

    t_lookup = 0.0
    cache_status_by_doi: dict[str, dict[str, str]] = {}

    if dois_to_lookup:
        for doi, _ in dois_to_lookup[:3]:
            cache_status_by_doi[doi] = {
                "oa": "hit" if cache_get(f"oa:{doi}", TTL_OPENALEX) else "miss",
                "cr": "hit" if cache_get(f"cr:{doi}", TTL_CROSSREF) else "miss",
            }

        t_lookup = time_mod.time()
        tasks = [_full_lookup(doi, title) for doi, title in dois_to_lookup[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, ExternalPaperData):
                external_data.append(result)

        if external_data:
            has_full_meta = any(
                ep.openalex is not None and ep.crossref is not None
                for ep in external_data
            )
            has_any = any(
                ep.openalex is not None or ep.crossref is not None or ep.semantic_scholar is not None
                for ep in external_data
            )
            verify_status = "full" if has_full_meta else ("partial" if has_any else "local_only")

        t_lookup = time_mod.time() - t_lookup

        # Log cache hit/miss for each DOI
        for doi, _ in dois_to_lookup[:3]:
            cache_status = cache_status_by_doi.get(doi, {"oa": "miss", "cr": "miss"})
            logger.info(f"VERIFY_CACHE doi={doi} oa={cache_status['oa']} cr={cache_status['cr']}")

    external_sources_json = [_serialize_external(ep) for ep in external_data]

    # --- Run venue-specific format audit ---
    venue_audit = await asyncio.to_thread(
        _run_venue_audit,
        papers_meta=papers_meta,
        context_text=retrieval.context_text,
    )

    # --- Run 5-point Academic Verification Engine ---
    verification_result = None
    if papers_meta:
        first = papers_meta[0]
        t_verif = time_mod.time()
        try:
            verif_engine = AcademicVerificationEngine()
            v_result = await asyncio.to_thread(
                verif_engine.verify_manuscript,
                text_content=retrieval.context_text or "",
                title=first.get("title", "Untitled"),
                venue_id=venue_audit.get("venue_info", {}).get("venue_code", "ieee_trans") if venue_audit else "ieee_trans",
                citations=None,
                doi=first.get("doi", "") or "",
            )
            verification_result = {
                "is_valid": v_result.is_valid,
                "citation_correctness": v_result.citation_correctness,
                "grounding_valid": v_result.grounding_valid,
                "doi_valid": v_result.doi_valid,
                "reference_exists": v_result.reference_exists,
                "venue_compliant": v_result.venue_compliant,
                "errors": v_result.errors[:5],
                "warnings": v_result.warnings[:5],
            }
            logger.info(f"VERIFY_5POINT is_valid={v_result.is_valid} "
                        f"citations={v_result.citation_correctness} "
                        f"grounding={v_result.grounding_valid} "
                        f"doi={v_result.doi_valid} "
                        f"references={v_result.reference_exists} "
                        f"venue={v_result.venue_compliant} "
                        f"elapsed={time_mod.time()-t_verif:.2f}s")
        except Exception as e:
            logger.warning(f"AcademicVerificationEngine failed: {e}")

    # --- Build rich academic prompt ---
    combined_context = await _build_academic_context(
        local_context=retrieval.context_text,
        external_data=external_data,
        papers_meta=papers_meta,
        venue_audit=venue_audit,
        verification_result=verification_result,
        query=query,
    )

    if do_stream:
        return StreamingResponse(
            _stream_verify_response(
                query=query,
                combined_context=combined_context,
                external_sources_json=external_sources_json,
                verify_status=verify_status,
                venue_audit=venue_audit,
                papers_used=retrieval.papers_used,
                session_id=session_id,
                lang=lang,
                timing={
                    "start": t0,
                    "retrieve": t_retrieve,
                    "doi_extract": t_doi,
                    "lookup": t_lookup,
                },
            ),
            media_type="text/event-stream",
        )

    t_generate = time_mod.time()
    generation = await asyncio.to_thread(
        state.generator.generate_verify,
        query=query,
        context_text=combined_context,
        external_data_text="",
        task_type="verify",
        lang=lang,
    )
    t_generate = time_mod.time() - t_generate

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id, role="user",
            content=query, context_papers=json.dumps(paper_ids),
            citations="[]", model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id, role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save verify history: {e}")
    finally:
        session.close()

    t_total = time_mod.time() - t0
    logger.info(f"VERIFY_TIMING retrieve={t_retrieve:.2f}s doi_extract={t_doi:.2f}s lookup={t_lookup:.2f}s generate={t_generate:.2f}s total={t_total:.2f}s status={verify_status}")

    # --- Build structured VerifyReport ---
    verify_report = _build_verify_report(
        query=query,
        paper_ids=paper_ids,
        verification_result=verification_result,
        venue_audit=venue_audit,
        external_data=external_data,
        verify_status=verify_status,
        local_context=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "external_sources": external_sources_json,
        "verify_status": verify_status,
        "venue_audit": venue_audit,
        "verify_report": verify_report,
    }


def _build_verify_report(
    query: str,
    paper_ids: list[str],
    verification_result: dict | None,
    venue_audit: dict | None,
    external_data: list,
    verify_status: str,
    local_context: str = "",
) -> dict:
    """Build structured VerifyReport from rule engine outputs.
    
    LLM only formats this report into natural language.
    The content is determined by rule engines, not by the LLM.
    """
    try:
        builder = VerifyReportBuilder()
        builder.set_query(query)
        builder.set_papers(paper_ids)
        builder.apply_verification_result(verification_result)
        builder.apply_venue_audit(venue_audit)
        builder.apply_external_data(external_data, verify_status)

        # Build ontology reasoning if we have enough context
        try:
            if hasattr(state, 'retriever') and state.retriever:
                ontology = AcademicOntologyGraph()
                populate_verify_ontology(ontology, local_context, query, _verify_reasoning_engine, external_data)
                reasoning = _verify_reasoning_engine.run_full_reasoning_cycle()
                builder.apply_ontology_reasoning(reasoning)
        except Exception as e:
            logger.warning(f"VerifyReport ontology reasoning failed: {e}")

        # Add refutation analysis
        try:
            counters = _refutation_engine.generate_counter_arguments(
                claim_statement=query[:200] if query else "The proposed method achieves strong results.",
                method_name="Proposed Method",
            )
            builder.apply_refutation(counters, query)
        except Exception as e:
            logger.warning(f"VerifyReport refutation failed: {e}")

        return builder.get_report().to_dict()
    except Exception as e:
        logger.warning(f"VerifyReportBuilder failed: {e}")
        return {
            "academic_verdict": {"verdict": "inconclusive", "reason": "Report builder failed", "determined_by": "error"},
            "academic_basis": {"rules_applied": [], "verification_methods": [], "standards_used": []},
            "evidence": [],
            "limitations": {"unverifiable_items": [], "missing_data": ["Report builder error"], "assumptions": []},
            "confidence": {"level": "Low", "reasoning": "Report builder encountered an error.", "score": 0.0},
            "next_steps": ["Check backend logs for details"],
        }


async def _build_academic_context(
    local_context: str,
    external_data: list[ExternalPaperData],
    papers_meta: list[dict],
    venue_audit: dict | None = None,
    verification_result: dict | None = None,
    query: str = "",
) -> str:
    return await _build_clean_academic_context(local_context, external_data, papers_meta, venue_audit, verification_result, query)


async def _build_clean_academic_context(
    local_context: str,
    external_data: list[ExternalPaperData],
    papers_meta: list[dict],
    venue_audit: dict | None = None,
    verification_result: dict | None = None,
    query: str = "",
) -> str:
    """Build a provider-neutral context; output language is controlled separately.
    Note: async because it awaits KnowledgeEngine.get_paper_knowledge().
    """
    sections = ["=== USER DOCUMENTS (LOCAL) ===\n" + local_context]
    if papers_meta:
        meta_lines = []
        for paper in papers_meta:
            title = paper.get("title", "Unknown")
            authors = ", ".join(paper.get("authors", [])[:3]) or "N/A"
            meta_lines.append(f"- {title} (authors: {authors})")
        if meta_lines:
            sections.append("=== PAPERS UNDER ANALYSIS ===\n" + "\n".join(meta_lines))

    # ── VENUE AUDIT SECTION ────────────────────────────────────────
    if venue_audit:
        venue_info = venue_audit.get("venue_info", {})
        venue_name = venue_info.get("name", "Unknown Venue")
        overall_score = venue_audit.get("overall_score", 0)
        counts = venue_audit.get("counts", {})
        checks = venue_audit.get("checks", [])

        audit_lines = [
            f"Venue: {venue_name}",
            f"Compliance Score: {overall_score}%",
            f"Pass: {counts.get('pass', 0)}, Warnings: {counts.get('warning', 0)}, "
            f"Critical: {counts.get('critical', 0)}, Suggestions: {counts.get('suggestion', 0)}",
            "",
            "=== VENUE COMPLIANCE CHECKLIST (Rule-by-Rule) ===",
        ]
        for check in checks:
            name = check.get("name", "Unknown check")
            severity = check.get("severity", "unknown")
            message = check.get("message", "")
            priority = check.get("priority", "required")
            icon = {"pass": "✓", "critical": "✗", "warning": "⚠", "suggestion": "·"}.get(severity, "?")
            audit_lines.append(f"{icon} [{severity.upper()}] {name}: {message}")

        sections.append("=== VENUE AUDIT RESULTS ===\n" + "\n".join(audit_lines))

    # ── 5-POINT ACADEMIC VERIFICATION SECTION ───────────────────────
    if verification_result:
        verif_lines = [
            "=== ACADEMIC VERIFICATION (5-Point Rule-based) ===",
            f"Overall Valid: {'YES' if verification_result.get('is_valid') else 'NO'}",
            f"  ✓ Citation correctness:   {'PASS' if verification_result.get('citation_correctness') else 'FAIL'}",
            f"  ✓ Evidence grounding:     {'PASS' if verification_result.get('grounding_valid') else 'FAIL'}",
            f"  ✓ DOI resolution:         {'PASS' if verification_result.get('doi_valid') else 'FAIL'}",
            f"  ✓ Reference completeness: {'PASS' if verification_result.get('reference_exists') else 'FAIL'}",
            f"  ✓ Venue compliance:       {'PASS' if verification_result.get('venue_compliant') else 'FAIL'}",
        ]
        if verification_result.get("errors"):
            verif_lines.append("  Errors:")
            for err in verification_result["errors"]:
                verif_lines.append(f"    ✗ {err}")
        if verification_result.get("warnings"):
            verif_lines.append("  Warnings:")
            for warn in verification_result["warnings"]:
                verif_lines.append(f"    ⚠ {warn}")
        sections.append("\n".join(verif_lines))

    # ── ONTOLOGY REASONING SECTION ──────────────────────────────────────
    try:
        ontology = AcademicOntologyGraph()
        populate_verify_ontology(ontology, local_context, query, _verify_reasoning_engine, external_data)
        reasoning = _verify_reasoning_engine.run_full_reasoning_cycle()
        has_any = any(v for v in reasoning.values())
        if has_any:
            re_lines = ["=== ONTOLOGY REASONING (Rule-based) ==="]
            sota = reasoning.get("sota_claims", [])
            if sota:
                re_lines.append(f"  SOTA Claims ({len(sota)}):")
                for f in sota[:5]:
                    re_lines.append(f"    \U0001f3c6 [conf={f.confidence:.0%}] {f.statement}")
            conflicts = reasoning.get("conflicts", [])
            if conflicts:
                re_lines.append(f"  Evidence Conflicts ({len(conflicts)}):")
                for f in conflicts[:5]:
                    re_lines.append(f"    \u26a1 [conf={f.confidence:.0%}] {f.statement}")
            unsupported = reasoning.get("unsupported_assertions", [])
            if unsupported:
                re_lines.append(f"  Unsupported Assertions ({len(unsupported)}):")
                for f in unsupported[:5]:
                    re_lines.append(f"    \u2753 [conf={f.confidence:.0%}] {f.statement}")
            sections.append("\n".join(re_lines))
    except Exception as e:
        logger.warning(f"Verify ReasoningEngine failed: {e}")

    # ── KNOWLEDGE ENGINE SECTION ─────────────────────────────────────────
    if papers_meta:
        try:
            ke_papers = []
            for paper in papers_meta:
                title = paper.get("title", "")
                doi = paper.get("doi", "")
                if title:
                    knowledge = await ke.get_paper_knowledge(title, doi or None)
                    ke_papers.append(knowledge)
            if ke_papers:
                sota_context = ke.build_sota_prompt_context(ke_papers)
                if sota_context:
                    sections.append(sota_context)
        except Exception as e:
            logger.warning(f"Verify KnowledgeEngine failed: {e}")

    # ── KNOWLEDGE GRAPH SECTION ───────────────────────────────────────────
    try:
        graph_store = getattr(state, "_graph_store", None)
        if graph_store and graph_store.graph and graph_store.graph.entities:
            graph_context = build_local_context(
                query=query if isinstance(query, str) else "",
                graph=graph_store.graph,
                top_k_entities=5,
                top_k_relationships=10,
                include_community_reports=True,
                embedder=None,
            )
            if graph_context and graph_context.strip():
                sections.append(
                    "=== KNOWLEDGE GRAPH CONTEXT (Entity Relationships) ===\n"
                    + graph_context
                )
    except Exception as e:
        logger.warning(f"Verify KnowledgeGraph failed: {e}")

    # ── REFUTATION ANALYSIS SECTION ─────────────────────────────────────────
    try:
        refutation_lines = ["=== REFUTATION ANALYSIS (Red-Teaming) ==="]

        # Extract claim-like sentences from the user query and local context
        import re as _re
        all_text = f"{query}\n{local_context}"
        # Heuristic: sentences containing claim indicators (avoid 'best'/'first' — too many false positives)
        claim_indicators = r'\b(outperforms|improves|achieves|sota|state-of-the-art|superior|highest|novel|outperform|our method|we propose|we demonstrate|we show|results demonstrate|significantly better)\b'
        found_claims = []
        # Split on sentence boundaries, but avoid splitting after decimal numbers (e.g., "95.0")
        for sent in _re.split(r'(?<!\d)[.!?]\s+', all_text[:3000]):
            sent = sent.strip()
            if len(sent) > 20 and _re.search(claim_indicators, sent, _re.I):
                found_claims.append(sent[:200])

        if found_claims:
            for claim in found_claims[:5]:
                method_match = _re.search(r'\b([A-Z][A-Za-z0-9_-]*(?:Net|Former|GAN|BERT|Transformer|CNN|RNN|LSTM|ViT|GPT|Diffusion))\b', claim)
                method_name = method_match.group(1) if method_match else "Proposed Method"

                counters = _refutation_engine.generate_counter_arguments(
                    claim_statement=claim,
                    method_name=method_name,
                )

                refutation_lines.append(f"\nClaim: \"{claim}\"")
                for c in counters:
                    icon = {"critical": "🔴", "moderate": "🟡", "minor": "🟢"}.get(c.severity, "⚪")
                    refutation_lines.append(
                        f"  {icon} [{c.severity.upper()}] [{c.refutation_angle}]",
                    )
                    refutation_lines.append(f"     Challenge: {c.counter_statement}")
                    refutation_lines.append(f"     Suggestion: {c.suggested_experiment}")
        else:
            # Fallback: use the user query as the claim
            counters = _refutation_engine.generate_counter_arguments(
                claim_statement=query[:200] if query else "The proposed method achieves strong results.",
                method_name="Proposed Method",
            )
            refutation_lines.append(f"\nClaim: {query[:200] if query else 'Paper results'}")
            for c in counters:
                icon = {"critical": "🔴", "moderate": "🟡", "minor": "🟢"}.get(c.severity, "⚪")
                refutation_lines.append(f"  {icon} [{c.severity.upper()}] [{c.refutation_angle}]")
                refutation_lines.append(f"     Challenge: {c.counter_statement}")
                refutation_lines.append(f"     Suggestion: {c.suggested_experiment}")

        sections.append("\n".join(refutation_lines))
    except Exception as e:
        logger.warning(f"RefutationAnalysis failed: {e}")

    external_sections = [_format_clean_external(item) for item in external_data]
    external_sections = [section for section in external_sections if section]
    if external_sections:
        sections.append(
            "=== EXTERNAL ACADEMIC DATA (OpenAlex + Crossref + Semantic Scholar) ===\n"
            + "\n\n".join(external_sections)
        )
    else:
        sections.append(
            "=== EXTERNAL ACADEMIC DATA ===\n"
            "No DOI or external academic data was found for these papers. "
            "Answer from the local documents and clearly state when evidence is insufficient."
        )
    return "\n\n".join(sections)


def _format_clean_external(ep: ExternalPaperData) -> str:
    lines = [f"[PAPER: {ep.title or ep.doi}]", f"DOI: {ep.doi}"]
    if ep.crossref and ep.crossref.is_valid:
        crossref = ep.crossref
        if crossref.authors:
            suffix = " et al." if len(crossref.authors) > 3 else ""
            lines.append(f"Authors: {', '.join(crossref.authors[:3])}{suffix}")
        if crossref.journal:
            lines.append(f"Journal: {crossref.journal}")
        if crossref.year:
            lines.append(f"Year: {crossref.year}")
        lines.append(f"Citations (Crossref): {crossref.citation_count}")
    if ep.openalex:
        lines.append(f"Citations (OpenAlex): {ep.openalex.citation_count}")
        lines.append(f"Related papers: {len(ep.openalex.related_work_ids)}")
        if ep.openalex.publication_year:
            lines.append(f"Publication year: {ep.openalex.publication_year}")
    if ep.semantic_scholar:
        lines.append(f"Citations (Semantic Scholar): {ep.semantic_scholar.citation_count}")
        lines.append(f"Influential citations: {ep.semantic_scholar.influential_citation_count}")
        if ep.semantic_scholar.venue:
            lines.append(f"Venue: {ep.semantic_scholar.venue}")
    if ep.recent_citing:
        lines.append("\nRecent studies (since 2022) citing this paper:")
        for index, work in enumerate(ep.recent_citing[:5], 1):
            doi = work.get("doi", "")
            suffix = f" -- doi:{doi}" if doi else ""
            lines.append(f"  {index}. {work.get('title', 'Unknown')} ({work.get('publication_year', '?')}){suffix}")
    if ep.s2_citations:
        lines.append("\nCiting papers (Semantic Scholar, top 5):")
        for index, cite in enumerate(ep.s2_citations[:5], 1):
            lines.append(f"  {index}. {cite.title} ({cite.year or '?'}) -- {cite.citation_count} citations")
    if ep.s2_recommendations:
        lines.append("\nRecommended similar papers:")
        for index, recommendation in enumerate(ep.s2_recommendations[:3], 1):
            lines.append(f"  {index}. {recommendation.title} ({recommendation.year or '?'}) -- {recommendation.citation_count} citations")
    return "\n".join(lines)

def _format_rich_external(ep: ExternalPaperData) -> str:
    return _format_clean_external(ep)

    # Legacy mojibake implementation below is intentionally inactive.
    lines = []
    title = ep.title or ep.doi
    lines.append(f"[PAPER: {title}]")
    lines.append(f"DOI: {ep.doi}")

    # Crossref metadata
    if ep.crossref and ep.crossref.is_valid:
        cr = ep.crossref
        if cr.authors:
            lines.append(f"Authors: {', '.join(cr.authors[:3])}" + (" et al." if len(cr.authors) > 3 else ""))
        if cr.journal:
            lines.append(f"Journal: {cr.journal}")
        if cr.year:
            lines.append(f"Year: {cr.year}")
        lines.append(f"Citations (Crossref): {cr.citation_count}")

    # OpenAlex data
    if ep.openalex:
        oa = ep.openalex
        lines.append(f"Citations (OpenAlex): {oa.citation_count}")
        lines.append(f"Related papers: {len(oa.related_work_ids)}")
        if oa.publication_year:
            lines.append(f"Publication year: {oa.publication_year}")

    # Semantic Scholar data
    if ep.semantic_scholar:
        ss = ep.semantic_scholar
        lines.append(f"Citations (Semantic Scholar): {ss.citation_count}")
        lines.append(f"Influential citations: {ss.influential_citation_count}")
        if ss.venue:
            lines.append(f"Venue: {ss.venue}")

    # Recent citing works (evolution)
    if ep.recent_citing:
        lines.append("\nRecent studies citing this paper since 2022:")
        for i, work in enumerate(ep.recent_citing[:5], 1):
            r_title = work.get("title", "Unknown")
            r_year = work.get("publication_year", "?")
            r_doi = work.get("doi", "")
            lines.append(f"  {i}. {r_title} ({r_year})" + (f" -- doi:{r_doi}" if r_doi else ""))

    # Semantic Scholar citations
    if ep.s2_citations:
        lines.append("\nCiting papers (Semantic Scholar, top 5):")
        for i, cite in enumerate(ep.s2_citations[:5], 1):
            lines.append(f"  {i}. {cite.title} ({cite.year or '?'}) -- {cite.citation_count} citations")

    # Semantic Scholar recommendations
    if ep.s2_recommendations:
        lines.append("\nRecommended similar papers:")
        for i, rec in enumerate(ep.s2_recommendations[:3], 1):
            lines.append(f"  {i}. {rec.title} ({rec.year or '?'}) -- {rec.citation_count} citations")

    return "\n".join(lines)


async def _full_lookup(doi: str, fallback_title: str) -> ExternalPaperData:
    """Lookup paper across OpenAlex + Crossref + Semantic Scholar."""
    oa_cached = _openalex_from_cache(cache_get(f"oa:{doi}", TTL_OPENALEX))
    cr_cached = _crossref_from_cache(cache_get(f"cr:{doi}", TTL_CROSSREF))

    oa_task = _cached_or_fetch(oa_cached, get_work_by_doi(doi))
    cr_task = _cached_or_fetch(cr_cached, crossref_get_work(doi))
    s2_task = _cached_or_fetch(None, s2_get_by_doi(doi))

    oa_result, cr_result, s2_result = await asyncio.gather(oa_task, cr_task, s2_task, return_exceptions=True)

    oa_result = oa_result if not isinstance(oa_result, BaseException) else None
    cr_result = cr_result if not isinstance(cr_result, BaseException) else None
    s2_result = s2_result if not isinstance(s2_result, BaseException) else None

    if oa_result is None and fallback_title:
        oa_result = await get_work_by_title(fallback_title)

    # Recent citing from OpenAlex
    recent_citing = []
    if oa_result and oa_result.openalex_id:
        recent_citing = await get_recent_citing_works(oa_result.openalex_id, since_year=2022, limit=5)

    # Semantic Scholar citations + recommendations
    s2_citations = []
    s2_recommendations = []
    if s2_result and s2_result.paper_id:
        cite_task = s2_get_citations(s2_result.paper_id, limit=10)
        rec_task = s2_get_recommendations(s2_result.paper_id, limit=5)
        s2_cite_res, s2_rec_res = await asyncio.gather(cite_task, rec_task, return_exceptions=True)
        if not isinstance(s2_cite_res, BaseException):
            s2_citations = s2_cite_res
        if not isinstance(s2_rec_res, BaseException):
            s2_recommendations = s2_rec_res

    # Cache
    if oa_result:
        cache_set(f"oa:{doi}", "openalex", {
            "openalex_id": oa_result.openalex_id,
            "doi": oa_result.doi,
            "title": oa_result.title,
            "publication_year": oa_result.publication_year,
            "citation_count": oa_result.citation_count,
            "related_work_ids": oa_result.related_work_ids,
            "referenced_work_ids": oa_result.referenced_work_ids,
        })
    if cr_result:
        cache_set(f"cr:{doi}", "crossref", {
            "doi": cr_result.doi,
            "title": cr_result.title,
            "authors": cr_result.authors,
            "journal": cr_result.journal,
            "year": cr_result.year,
            "publisher": cr_result.publisher,
            "citation_count": cr_result.citation_count,
            "is_valid": cr_result.is_valid,
        })

    title = (cr_result.title if cr_result else None) or fallback_title or doi

    return ExternalPaperData(
        doi=doi,
        title=title,
        openalex=oa_result,
        crossref=cr_result,
        semantic_scholar=s2_result,
        recent_citing=recent_citing,
        s2_citations=s2_citations,
        s2_recommendations=s2_recommendations,
    )


async def _cached_or_fetch(cached, coro):
    if cached is not None:
        coro.close()
        return cached
    try:
        return await asyncio.wait_for(coro, timeout=5.0)
    except (asyncio.TimeoutError, Exception):
        return None


def _openalex_from_cache(data: dict | None) -> OpenAlexWork | None:
    if not data:
        return None
    return OpenAlexWork(
        openalex_id=data.get("openalex_id", ""),
        doi=data.get("doi"),
        title=data.get("title", ""),
        publication_year=data.get("publication_year"),
        citation_count=data.get("citation_count", 0),
        related_work_ids=data.get("related_work_ids", []),
        referenced_work_ids=data.get("referenced_work_ids", []),
        recent_citing_works=data.get("recent_citing_works", []),
    )


def _crossref_from_cache(data: dict | None) -> CrossrefWork | None:
    if not data:
        return None
    return CrossrefWork(
        doi=data.get("doi", ""),
        title=data.get("title", ""),
        authors=data.get("authors", []),
        journal=data.get("journal"),
        year=data.get("year"),
        publisher=data.get("publisher"),
        citation_count=data.get("citation_count", 0),
        is_valid=data.get("is_valid", True),
    )


def _serialize_external(ep: ExternalPaperData) -> dict:
    result = {
        "doi": ep.doi,
        "title": ep.title,
        "openalex": None,
        "crossref": None,
        "semantic_scholar": None,
        "recent_citing": ep.recent_citing,
        "s2_citations": [],
        "s2_recommendations": [],
    }
    if ep.openalex:
        result["openalex"] = {
            "citation_count": ep.openalex.citation_count,
            "publication_year": ep.openalex.publication_year,
            "related_count": len(ep.openalex.related_work_ids),
            "openalex_id": ep.openalex.openalex_id,
        }
    if ep.crossref:
        result["crossref"] = {
            "authors": ep.crossref.authors,
            "journal": ep.crossref.journal,
            "year": ep.crossref.year,
            "publisher": ep.crossref.publisher,
            "citation_count": ep.crossref.citation_count,
            "is_valid": ep.crossref.is_valid,
        }
    if ep.semantic_scholar:
        result["semantic_scholar"] = {
            "paper_id": ep.semantic_scholar.paper_id,
            "citation_count": ep.semantic_scholar.citation_count,
            "influential_citation_count": ep.semantic_scholar.influential_citation_count,
            "venue": ep.semantic_scholar.venue,
        }
    if ep.s2_citations:
        result["s2_citations"] = [
            {"title": c.title, "year": c.year, "citation_count": c.citation_count}
            for c in ep.s2_citations[:5]
        ]
    if ep.s2_recommendations:
        result["s2_recommendations"] = [
            {"title": r.title, "year": r.year, "citation_count": r.citation_count}
            for r in ep.s2_recommendations[:3]
        ]
    return result


def _stream_verify_response(query, combined_context, external_sources_json, verify_status, papers_used, session_id, venue_audit=None, lang="vi", timing=None):
    import time as time_mod
    t_stream = time_mod.time()
    timing = timing or {}
    full_response = ""
    model_used = ""

    yield f"data: {json.dumps({'type': 'academic', 'data': external_sources_json, 'verify_status': verify_status})}\n\n"

    # Send venue audit data immediately if available
    if venue_audit:
        yield f"data: {json.dumps({'type': 'venue_audit', 'data': venue_audit})}\n\n"

    for chunk in state.generator.stream_generate_verify(query, combined_context, task_type="verify", lang=lang):
        full_response += chunk
        yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

    model_used = state.generator.current_model

    citations = []
    pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
    for match in re.finditer(pattern, full_response):
        citations.append({
            "source": match.group(1).strip(),
            "page": int(match.group(2)) if match.group(2) else None,
            "text": match.group(0),
        })

    db = get_session(state.engine)
    try:
        db.add(ChatHistory(
            session_id=session_id, role="user",
            content=query, context_papers=json.dumps(papers_used),
            citations="[]", model_used="",
        ))
        db.add(ChatHistory(
            session_id=session_id, role="assistant",
            content=full_response,
            context_papers=json.dumps(papers_used),
            citations=json.dumps(citations),
            model_used=model_used,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save streamed verify history: {e}")
    finally:
        db.close()

    yield f"data: {json.dumps({'type': 'done', 'model_used': model_used, 'citations': citations, 'external_sources': external_sources_json, 'verify_status': verify_status, 'venue_audit': venue_audit})}\n\n"

    stream_generate = time_mod.time() - t_stream
    total = time_mod.time() - timing["start"] if timing.get("start") else stream_generate
    logger.info(
        "VERIFY_TIMING "
        f"retrieve={timing.get('retrieve', 0.0):.2f}s "
        f"doi_extract={timing.get('doi_extract', 0.0):.2f}s "
        f"lookup={timing.get('lookup', 0.0):.2f}s "
        f"stream_generate={stream_generate:.2f}s "
        f"total={total:.2f}s "
        f"status={verify_status}"
    )


def _get_papers_metadata(paper_ids: list[str]) -> list[dict]:
    if not paper_ids:
        return []
    session = get_session(state.engine)
    try:
        papers = session.query(Paper).filter(Paper.id.in_(paper_ids)).all()
        return [
            {
                "file_path": p.file_path,
                "title": p.title,
                "authors": p.authors.split(",") if p.authors else [],
                "year": p.year,
                "doi": p.doi,
            }
            for p in papers
        ]
    finally:
        session.close()


_verify_reasoning_engine = AcademicReasoningEngine()
_refutation_engine = AdversarialRefutationEngine()


# _populate_verify_ontology moved to academic/ontology_populator.py


def _run_venue_audit(
    papers_meta: list[dict],
    context_text: str,
) -> dict | None:
    """
    Run venue-specific format audit on the paper content.

    Uses publishing.auditor.audit_manuscript() to check the manuscript
    against venue rules (venue_rules.json).

    Returns structured audit result dict or None if no paper to audit.
    """
    if not papers_meta:
        return None

    first = papers_meta[0]
    title = first.get("title", "Untitled")
    doi = first.get("doi", "")
    authors = first.get("authors", [])
    author_name = authors[0] if authors else ""

    # Infer venue from DOI, default to IEEE
    venue_id = "ieee_trans"
    if doi:
        inferred = infer_venue_from_doi(doi)
        if inferred:
            venue_id = inferred.lower()

    # Build manuscript text from RAG context
    text_content = context_text or f"## Abstract\nPaper content for {title}\n\n"

    try:
        format_auditor = FormatAuditorTool()
        result = format_auditor.run(
            title=title,
            text_content=text_content,
            venue_id=venue_id,
            author_name=author_name,
        )

        audit_data = result.data if result.data else {}

        return {
            "venue_info": audit_data.get("venue_info", {}),
            "overall_score": audit_data.get("overall_score", 0),
            "category_scores": audit_data.get("category_scores", {}),
            "counts": audit_data.get("counts", {"pass": 0, "critical": 0, "warning": 0, "suggestion": 0}),
            "checks": audit_data.get("checks", []),
        }
    except Exception as e:
        logger.warning(f"Venue audit failed: {e}")
        return None
