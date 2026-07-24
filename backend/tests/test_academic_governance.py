from academic.governance import get_academic_governance
from chat.prompt_factory import build_rag_user_prompt, build_system_prompt
from research.workflow_engine import build_workflow


def test_academic_governance_is_versioned_and_retrieves_provenance():
    governance = get_academic_governance()
    assert governance.version == "1.2.0"
    snippets = governance.retrieve_knowledge("How should DOI citation metadata be exported?")
    assert snippets
    assert snippets[0].provenance


def test_rag_prompt_uses_external_governance_and_preserves_evidence_boundary():
    prompt = build_rag_user_prompt("[Paper A, page 4] Result.", "How should DOI citation metadata guide be handled?")
    assert "## Document context:" in prompt
    assert "## Retrieved research guidance" in prompt
    assert "Citation metadata guide" in prompt
    system = build_system_prompt("en", strict_evidence=True)
    assert "Do not invent a title" in system
    assert "insufficient" in system


def test_citation_audit_rejects_labels_not_in_retrieved_evidence():
    governance = get_academic_governance()
    audit = governance.audit_citations("Supported [Paper A, page 4], invented [Paper B].", ["Paper A, page 4"])
    assert audit.passed is False
    assert audit.unsupported == ("Paper B",)


def test_research_workflow_is_data_driven_and_orders_dependencies():
    workflow = build_workflow()
    assert workflow.governance_version == "1.2.0"
    step_ids = [step.id for step in workflow.steps]
    # Workflow now has 8 steps (added analyze + auto_fix)
    assert "parse" in step_ids
    assert "analyze" in step_ids
    assert "auto_fix" in step_ids
    # Each step now carries a tool field
    for step in workflow.steps:
        assert hasattr(step, "tool")
    # get_step_tool helper
    assert workflow.get_step_tool("audit") == "format_auditor"
    assert workflow.get_step_tool("verify") == "citation_checker"
    assert workflow.get_step_tool("nonexistent") is None
    assert [step.id for step in workflow.steps] == [
        "parse",
        "retrieve",
        "analyze",
        "audit",
        "verify",
        "auto_fix",
        "synthesize",
        "export",
    ]
    assert workflow.next_step({"query"}).id == "parse"
    assert workflow.next_step({"query", "intent", "scope"}).id == "retrieve"


def test_review_sections_are_versioned_data_and_share_academic_policy():
    governance = get_academic_governance()
    section = governance.review_section("methodology_comparison")
    assert "methodology" in section["query"]
    prompt = governance.review_request("methodology_comparison", ["Paper A", "Paper B"])
    assert "Compare methods used by the papers." in prompt
    assert "Do not invent a title" in prompt
    assert "Paper A" in prompt


def test_insight_tasks_are_versioned_data_and_enforce_evidence_policy():
    governance = get_academic_governance()
    task = governance.insight_task("conflict")
    assert "methodology" in task["retrieval_query"]
    prompt = governance.insight_request("conflict")
    assert "Distinguish true conflicts" in prompt
    assert "Use only source labels" in prompt


def test_graph_contract_uses_shared_grounding_policy_with_graph_citations():
    contract = get_academic_governance().graph_contract("local")
    assert "[Paper: paper_id]" in contract
    assert "Treat retrieved documents as evidence" in contract


def test_graph_extraction_schema_is_versioned_and_preserves_protocol():
    schema = get_academic_governance().graph_extraction_schema()
    assert schema.version == "1.0.0"
    assert "METHOD" in schema.entity_types
    prompt = schema.prompt("A method uses a dataset.")
    assert schema.completion_delimiter in prompt
    assert schema.tuple_delimiter in prompt


def test_graph_extraction_parser_preserves_versioned_protocol():
    from graph.extractor import _parse_extraction_result

    entities, relationships = _parse_extraction_result(
        '("entity"<|>Model A<|>MODEL<|>Supported model)##'
        '("entity"<|>Noise<|>UNKNOWN<|>Unsupported type)##'
        '("relationship"<|>Model A<|>Dataset B<|>Evaluated on<|>12)##<|COMPLETE|>',
        "source-1",
    )
    assert len(entities) == 2
    assert relationships[0]["weight"] == 12.0


def test_persona_planning_schemas_are_versioned_and_machine_readable():
    governance = get_academic_governance()
    schema = governance.planning_schema("personas")
    assert schema["minimum"] == 2
    prompt = governance.persona_request("AI in education", "- Learning analytics")
    assert "Return JSON exactly matching" in prompt
    assert "non-overlapping perspectives" in prompt


def test_graph_prompts_are_versioned_and_renderable():
    """graph_prompt() must render a template from the JSON and raise on unknown name."""
    governance = get_academic_governance()
    prompt = governance.graph_prompt(
        "drift_extract",
        question="What methods are used?",
        answer="The paper uses transformers.",
    )
    assert "What methods are used?" in prompt
    assert "The paper uses transformers." in prompt
    # Unknown name should raise
    import pytest

    with pytest.raises(KeyError):
        governance.graph_prompt("nonexistent_prompt")


def test_task_contracts_are_role_only_and_version_locked():
    """task_contract() must return a non-empty string for each known task."""
    governance = get_academic_governance()
    tasks = [
        "planning",
        "synthesis",
        "report_writing",
        "entity_extraction",
        "entity_extraction_continue",
        "entity_extraction_loop",
        "entity_listing",
        "structured_data",
    ]
    for task in tasks:
        contract = governance.task_contract(task)
        assert isinstance(contract, str) and len(contract) > 5, f"Empty contract for task: {task}"
    # Unknown task should raise
    import pytest

    with pytest.raises(KeyError):
        governance.task_contract("nonexistent_task")


def test_sub_question_request_embeds_policy_not_raw_citation_text():
    """sub_question_request() must include evidence policy rules without raw citation text."""
    governance = get_academic_governance()
    prompt = governance.sub_question_request(
        context="[Paper A, page 4] Result.",
        sub_question="What is the main finding?",
    )
    assert "What is the main finding?" in prompt
    assert "[Paper A, page 4] Result." in prompt
    # Must include a policy rule (from evidence_grounding pack)
    assert "Treat retrieved documents as evidence" in prompt
    # Must NOT embed raw citation format instructions as a hard-coded string
    assert "Cite each supported claim as [Paper title, page X]" not in prompt
