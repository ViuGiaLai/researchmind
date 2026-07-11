"""Perspective/persona generation for deep research.

Adapted from STORM (MIT):
https://github.com/stanford-oval/storm

STORM discovers diverse perspectives by:
1. Finding related topics/papers
2. Extracting their structure (sections, themes)
3. Using these to generate expert personas
4. Each persona drives a separate research conversation
"""

from dataclasses import dataclass, field
from typing import Optional
from loguru import logger


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


PERSONA_GENERATION_PROMPT = """Bạn là chuyên gia lập kế hoạch nghiên cứu. Nhiệm vụ của bạn là xác định các góc nhìn (perspectives) khác nhau để nghiên cứu một chủ đề.

Chủ đề: "{query}"

Các bài báo/phần liên quan (để tham khảo cấu trúc):
{related_context}

Hướng dẫn:
1. Phân tích chủ đề và xác định 2-4 góc nhìn chuyên sâu khác nhau.
2. Mỗi góc nhìn đại diện cho một chuyên gia với chuyên môn riêng.
3. Các góc nhìn phải khác biệt rõ ràng, bao quát các khía cạnh khác nhau.
4. Mỗi góc nhìn cần có: tên ngắn gọn (2-5 từ), mô tả vai trò, và 2-3 lĩnh vực trọng tâm.

Ví dụ:
- Chủ đề: "Tác động của AI đến giáo dục đại học"
  - "Chuyên gia Công nghệ Giáo dục": Phân tích các công cụ AI đang được ứng dụng trong giảng dạy, tập trung vào hiệu quả và thách thức kỹ thuật. Trọng tâm: nền tảng học tập thích ứng, chấm điểm tự động.
  - "Nhà nghiên cứu Chính sách Giáo dục": Đánh giá tác động của AI đến chương trình giảng dạy và chính sách đào tạo. Trọng tâm: khung pháp lý, đạo đức AI trong giáo dục.
  - "Chuyên gia Tâm lý Học tập": Nghiên cứu ảnh hưởng của AI đến hành vi và kết quả học tập của sinh viên. Trọng tâm: tương tác người-máy, động lực học tập.

Trả về JSON:
{{
  "personas": [
    {{
      "name": "Tên góc nhìn",
      "description": "Mô tả chi tiết (2-3 câu)",
      "focus_areas": ["lĩnh vực 1", "lĩnh vực 2"]
    }}
  ]
}}

Chỉ trả về JSON, không thêm text khác.
Viết bằng {lang_name}."""


PERSPECTIVE_QUESTION_PROMPT = """Bạn là {persona_name}. {persona_description}.

Bạn đang nghiên cứu chủ đề sau: "{topic}"

Dựa trên chuyên môn của bạn, hãy đặt 2-3 câu hỏi nghiên cứu cụ thể mà bạn muốn tìm hiểu.
Các câu hỏi phải tập trung vào lĩnh vực trọng tâm của bạn: {focus_areas}.

Yêu cầu:
1. Mỗi câu hỏi phải cụ thể, có thể trả lời dựa trên tài liệu.
2. Các câu hỏi nên đi từ tổng quan đến chi tiết.
3. Câu hỏi phải khác biệt so với các góc nhìn khác.

Trả về JSON:
{{
  "questions": [
    "câu hỏi 1",
    "câu hỏi 2",
    "câu hỏi 3"
  ]
}}

Chỉ trả về JSON.
Viết bằng {lang_name}."""


def generate_personas(
    query: str,
    related_topics: Optional[list[str]] = None,
    lang: str = "vi",
) -> PerspectiveSet:
    """Generate diverse research perspectives for a query.

    Uses STORM-inspired approach: references related paper structures
    to discover what angles to explore.

    Args:
        query: The research query.
        related_topics: Optional list of related paper titles/sections for context.

    Returns:
        PerspectiveSet with generated personas.
    """
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        logger.error("Generator not initialized")
        return PerspectiveSet(query=query)

    related_context = ""
    if related_topics:
        related_context = "\n".join(f"- {t}" for t in related_topics[:5])
    else:
        related_context = "Không có tài liệu tham khảo cụ thể."

    from common.i18n import get_output_language_name
    lang_name = get_output_language_name(lang)
    prompt = PERSONA_GENERATION_PROMPT.format(query=query, related_context=related_context, lang_name=lang_name)
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt="Bạn là chuyên gia phân tích và lập kế hoạch nghiên cứu.",
            task_type="research",
        )
        import json
        data = json.loads(result)
        personas_data = data.get("personas", [])
        personas = [
            Persona(
                name=p.get("name", f"Perspective {i+1}"),
                description=p.get("description", ""),
                focus_areas=p.get("focus_areas", []),
            )
            for i, p in enumerate(personas_data)
        ]
        logger.info(f"Generated {len(personas)} personas for query: {query}")
        return PerspectiveSet(query=query, personas=personas)
    except Exception as e:
        logger.warning(f"Persona generation failed: {e}")
        return PerspectiveSet(query=query)


def generate_perspective_questions(
    topic: str,
    persona: Persona,
    lang: str = "vi",
) -> list[str]:
    """Generate research questions from a specific perspective.

    STORM-inspired: each persona asks focused questions from their angle.

    Args:
        topic: The research topic.
        persona: The persona/perspective to generate questions for.

    Returns:
        List of research questions.
    """
    from chat.generator import Generator
    from app_state import state

    generator: Generator = getattr(state, "generator", None)
    if not generator:
        return [f"{topic} (góc nhìn: {persona.name})"]

    from common.i18n import get_output_language_name
    focus_str = ", ".join(persona.focus_areas) if persona.focus_areas else "chuyên môn chính"
    lang_name = get_output_language_name(lang)
    prompt = PERSPECTIVE_QUESTION_PROMPT.format(
        persona_name=persona.name,
        persona_description=persona.description,
        topic=topic,
        focus_areas=focus_str,
        lang_name=lang_name,
    )
    try:
        result = generator.generate_direct(
            user_prompt=prompt,
            system_prompt=f"Bạn là {persona.name}. Đặt câu hỏi nghiên cứu từ góc nhìn của bạn.",
            task_type="research",
        )
        import json
        data = json.loads(result)
        questions = data.get("questions", [])
        logger.info(f"Generated {len(questions)} questions from {persona.name}")
        return questions
    except Exception as e:
        logger.warning(f"Question generation for {persona.name} failed: {e}")
        return [f"{topic} (góc nhìn: {persona.name})"]
