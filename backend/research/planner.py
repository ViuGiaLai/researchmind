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

from typing import Optional
from dataclasses import dataclass, field
from loguru import logger

from research.persona_generator import (
    Persona,
    PerspectiveSet,
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


DECOMPOSITION_PROMPT = """Bạn là chuyên gia phân tích câu hỏi nghiên cứu. Nhiệm vụ của bạn là phân tích câu hỏi sau và chia nhỏ nó thành các câu hỏi phụ độc lập.

Câu hỏi gốc: "{query}"

Hướng dẫn:
1. Chia câu hỏi thành 2-5 câu hỏi phụ, mỗi câu tập trung vào một khía cạnh cụ thể.
2. Các câu hỏi phụ phải độc lập với nhau (có thể research riêng rẽ).
3. Mỗi câu hỏi phụ phải đủ cụ thể để có thể tìm kiếm và trả lời.
4. Nếu câu hỏi đơn giản (không cần chia nhỏ), chỉ trả về câu hỏi gốc.
5. Viết bằng TIẾNG VIỆT (trừ khi câu hỏi gốc bằng tiếng Anh).

Trả về JSON với format:
{{
  "brief": "Mô tả ngắn về mục tiêu nghiên cứu tổng thể",
  "sub_questions": ["câu hỏi phụ 1", "câu hỏi phụ 2", ...]
}}

Chỉ trả về JSON, không thêm text khác."""


COMPRESSION_PROMPT = """Bạn là chuyên gia tổng hợp thông tin. Dưới đây là kết quả nghiên cứu từ nhiều nguồn:

{findings}

Nhiệm vụ của bạn:
1. Tổng hợp thông tin từ tất cả các nguồn, loại bỏ trùng lặp.
2. Giữ lại tất cả thông tin quan trọng, số liệu, trích dẫn.
3. Sắp xếp theo chủ đề logic.
4. Đánh dấu các điểm còn mâu thuẫn hoặc thiếu thông tin.
5. Viết bằng TIẾNG VIỆT (trừ khi dữ liệu gốc bằng tiếng Anh).

Đầu ra phải chi tiết và đầy đủ, sẵn sàng để viết báo cáo cuối cùng."""


SYNTHESIS_PROMPT = """Bạn là chuyên gia viết báo cáo nghiên cứu. Dựa trên thông tin đã thu thập, hãy viết một câu trả lời toàn diện cho câu hỏi:

Câu hỏi: {query}

Thông tin thu thập được:
{findings}

Yêu cầu:
1. Câu trả lời có cấu trúc rõ ràng với các section (##) và subsection (###).
2. Trích dẫn nguồn cho mỗi thông tin quan trọng [Tên Paper].
3. Đưa ra phân tích cân bằng, đầy đủ.
4. Kết luận rõ ràng ở cuối.
5. Viết bằng TIẾNG VIỆT (trừ khi câu hỏi gốc bằng tiếng Anh).
6. KHÔNG đề cập đến quá trình research, chỉ viết báo cáo thuần túy.
"""


def decompose_query(query: str) -> ResearchPlan:
    """Break down a complex query into sub-questions using perspective-guided decomposition.

    STORM-inspired: generates diverse personas, each asks questions from their angle,
    then aggregates into a comprehensive research plan.
    """
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        msg = "Generator not initialized"
        logger.error(msg)
        return ResearchPlan(original_query=query, sub_questions=[query], brief=msg)

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
        prompt = DECOMPOSITION_PROMPT.format(query=query)
        try:
            result = generator.generate_direct(
                user_prompt=prompt,
                system_prompt="Bạn là chuyên gia phân tích câu hỏi. Trả về JSON thuần túy.",
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
    )


def decompose_query_simple(query: str) -> ResearchPlan:
    """Break down a complex query into sub-questions using standard LLM-based decomposition.

    Fallback method without perspective guidance.
    """
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        msg = "Generator not initialized"
        logger.error(msg)
        return ResearchPlan(original_query=query, sub_questions=[query], brief=msg)

    prompt = DECOMPOSITION_PROMPT.format(query=query)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Bạn là chuyên gia phân tích câu hỏi. Trả về JSON thuần túy.",
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
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return "\n\n".join(findings)

    combined = "\n\n---\n\n".join(findings)
    prompt = COMPRESSION_PROMPT.format(findings=combined)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Bạn là chuyên gia tổng hợp thông tin nghiên cứu.",
            task_type="synthesis",
        )
        return result
    except Exception as e:
        logger.warning(f"Compression failed: {e}")
        return combined


def synthesize_answer(query: str, findings: str) -> str:
    """Synthesize final answer from compressed findings."""
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return findings

    prompt = SYNTHESIS_PROMPT.format(query=query, findings=findings)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Bạn là chuyên gia viết báo cáo nghiên cứu học thuật.",
            task_type="synthesis",
        )
        return result
    except Exception as e:
        logger.warning(f"Synthesis failed: {e}")
        return findings
