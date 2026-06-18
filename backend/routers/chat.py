import asyncio
import json
import re
import time as time_mod
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory

_GREETING_PATTERN = re.compile(
    r'^(chào|hello|hi|hey|chúc|hế lô|hế nhô|hallo|helo|xin chào|good morning|good afternoon|good evening|greetings|yo)\b',
    re.IGNORECASE
)

router = APIRouter(prefix="/api", tags=["Chat"])


# ─── Helpers ─────────────────────────────────────────────────────

def count_free_queries_today(session) -> int:
    """Count daily free queries logged in ChatHistory."""
    today_start = datetime.combine(datetime.today(), datetime.min.time())
    return session.query(ChatHistory).filter(
        ChatHistory.role == "assistant",
        ChatHistory.model_used == "gemini/free",
        ChatHistory.created_at >= today_start
    ).count()


def _stream_chat(query: str, context_text: str, session_id: str, paper_ids: list):
    """Stream chat response chunks and save to history once completed."""
    full_response = ""
    for chunk in state.generator.stream_generate(query, context_text):
        full_response += chunk
        yield f"data: {json.dumps({'chunk': chunk})}\n\n"

    model_used = state.generator.current_model
    db = get_session(state.engine)
    try:
        db.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))

        citations = []
        pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
        for match in re.finditer(pattern, full_response):
            citations.append({
                "source": match.group(1).strip(),
                "page": int(match.group(2)) if match.group(2) else None,
                "text": match.group(0),
            })

        db.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=full_response,
            context_papers="[]",
            citations=json.dumps(citations),
            model_used=model_used,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save streamed chat history: {e}")
    finally:
        db.close()

    yield f"data: {json.dumps({'done': True, 'model_used': model_used, 'citations': citations})}\n\n"


# ─── Chat ────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(request: dict = Body(...)):
    """Chat with selected papers using RAG pipeline."""
    t0 = time_mod.time()
    message = request.get("message", "")
    paper_ids = request.get("paper_ids")
    stream = request.get("stream", False)
    session_id = request.get("session_id", "default")

    if not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    is_greeting = bool(_GREETING_PATTERN.match(message.strip()))

    if not is_greeting and settings.llm_mode == "cloud_free":
        session = get_session(state.engine)
        try:
            used = count_free_queries_today(session)
            if used >= settings.free_cloud_daily_limit:
                raise HTTPException(
                    status_code=429,
                    detail=f"Bạn đã dùng hết {settings.free_cloud_daily_limit} câu hỏi miễn phí trong ngày. Vui lòng chuyển sang dùng API Key cá nhân hoặc Local mode."
                )
        finally:
            session.close()

    t1 = time_mod.time()
    retrieval = None
    if not is_greeting:
        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query=message,
            paper_ids=paper_ids,
            top_k=5,
        )
    t2 = time_mod.time()
    context_text = retrieval.context_text if retrieval else ""
    logger.info(f"TIMING: retrieve={t2-t1:.2f}s context_len={len(context_text)}")

    if stream:
        return StreamingResponse(
            _stream_chat(message, context_text, session_id, paper_ids),
            media_type="text/event-stream",
        )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=message,
        context_text=context_text,
    )
    t3 = time_mod.time()
    logger.info(f"TIMING: generate={t3-t2:.2f}s model={generation.model_used} total={t3-t0:.2f}s")

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=message,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save chat history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.get("/chat/history")
async def get_chat_history(session_id: str = Query(None), limit: int = Query(50)):
    """Get chat history."""
    db = get_session(state.engine)
    try:
        query = db.query(ChatHistory).order_by(ChatHistory.created_at.desc())
        if session_id:
            query = query.filter(ChatHistory.session_id == session_id)
        history = query.limit(limit).all()

        return {
            "history": [
                {
                    "id": h.id,
                    "role": h.role,
                    "content": h.content,
                    "citations": h.citations,
                    "model_used": h.model_used,
                    "created_at": str(h.created_at) if h.created_at else None,
                }
                for h in reversed(history)
            ]
        }
    finally:
        db.close()


@router.delete("/chat/history")
async def clear_chat_history():
    """Clear all chat history."""
    db = get_session(state.engine)
    try:
        db.query(ChatHistory).delete()
        db.commit()
        return {"status": "cleared"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.get("/chat/usage")
async def get_chat_usage():
    """Get daily free cloud usage stats."""
    session = get_session(state.engine)
    try:
        used = count_free_queries_today(session)
        return {
            "used": used,
            "limit": settings.free_cloud_daily_limit,
            "remaining": max(0, settings.free_cloud_daily_limit - used),
            "mode": settings.llm_mode,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


# ─── Review ──────────────────────────────────────────────────────

@router.post("/review")
async def review(request: dict = Body(...)):
    """Generate a structured literature review from selected papers."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "review")

    if not query:
        query = """Hãy viết một review nghiên cứu bằng tiếng Việt cho các tài liệu đã chọn.
Trả về kết quả với cấu trúc sau:

### 🔎 Literature Review
* **Background**: [Tóm tắt bối cảnh nghiên cứu]
* **Related Work**: [So sánh các công trình liên quan và nêu khác biệt]
* **Methods**: [Tóm tắt phương pháp chính của các paper]
* **Key Findings**: [Những kết quả quan trọng nhất]
* **Research Gaps**: [Những khoảng trống/chưa giải quyết]
* **Insights**: [Kết luận và đề xuất nghiên cứu tiếp theo]

Lưu ý: chỉ dùng thông tin từ các đoạn đã cung cấp, nêu rõ trích dẫn nguồn [Tên Paper] khi cần. Giữ văn phong học thuật, súc tích và dễ hiểu."""

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=query,
        context_text=retrieval.context_text,
    )

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save review history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


# ─── Critique ────────────────────────────────────────────────────

@router.post("/critique")
async def critique(request: dict = Body(...)):
    """Generate a critical review (AI Phản biện) that points out assumptions, weaknesses, missing data, and reproducibility issues."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "critique")

    critique_prompt = """Bạn là một chuyên gia phản biện học thuật. Dựa trên các đoạn trích được cung cấp từ những paper đã chọn, hãy:

1) Liệt kê các giả thiết (assumptions) mà paper dựa vào và đánh giá tính hợp lý của chúng (ngắn gọn).
2) Chỉ ra các thiếu sót về dữ liệu (ví dụ dataset thiếu, kích thước nhỏ, bias, không có baseline phù hợp).
3) Phân tích các hạn chế phương pháp (thiếu kiểm chứng, thiếu ablation, thiếu so sánh với state-of-the-art).
4) Nêu nguy cơ overclaim / kết luận vượt quá dữ liệu.
5) Kiểm tra tính khả thi lặp lại (reproducibility): thông tin thiếu, hyperparams, code/data không có.
6) Đưa ra 3 đề xuất cụ thể để cải thiện bài báo (nhỏ gọn, hành động được).

Trả về kết quả theo dạng gạch đầu dòng, mỗi điểm ngắn gọn, có trích dẫn [Tên Paper] cho các ví dụ hoặc chứng cứ. Viết bằng tiếng Việt, giọng phản biện, súc tích.
"""

    if query:
        full_query = f"{critique_prompt}\nUSER_REQUEST: {query}"
    else:
        full_query = critique_prompt

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=full_query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_query,
        context_text=retrieval.context_text,
    )

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=full_query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save critique history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


# ─── Debate ──────────────────────────────────────────────────────

@router.post("/debate")
async def debate(request: dict = Body(...)):
    """Generate a paired debate between two AI personas (AI A vs AI B) based on selected papers."""
    paper_ids = request.get("paper_ids")
    query = request.get("query", "").strip()
    session_id = request.get("session_id", "debate")

    debate_prompt = """Bạn là một trợ lý phân tích học thuật. Hãy tạo một cuộc tranh luận giữa hai persona AI: **AI A (Ủng hộ)** và **AI B (Phản biện)**, dựa chỉ trên các đoạn trích được cung cấp từ các paper đã chọn.

Yêu cầu bắt buộc về định dạng đầu ra (BẮT BUỘC):
- Phần phải gồm các tiêu đề và gạch đầu dòng chính xác theo thứ tự sau: `AI A (Ủng hộ):`, `AI B (Phản biện):`, `Kết luận:`, `3 Đề xuất:`.
- Mỗi bên (AI A / AI B) bao gồm 2 mục gạch đầu dòng: `• Luận điểm chính:` (1-2 câu) và `• Phản biện ngắn:` (1 câu trả lời/đáp lại bên kia).
- Luôn kèm trích dẫn nguồn ở những câu nêu bằng chứng theo định dạng `[Tên Paper]` hoặc `[Tên Paper, trang X]` nếu có, ngay sau câu chứng cứ.
- `Kết luận:` (1-2 câu) tóm tắt điểm khác biệt cốt lõi và khi nào mỗi quan điểm phù hợp.
- `3 Đề xuất:` liệt kê 3 hành động/kiểm chứng cụ thể, mỗi đề xuất 1 dòng.
- Toàn bộ output viết bằng tiếng Việt, ngắn gọn, dùng gạch đầu dòng, không thêm giới thiệu dài, không dùng markup khác ngoài gạch đầu dòng và tiêu đề bên trên.

Nếu user có thêm `USER_REQUEST`, hãy điều chỉnh chủ đề tranh luận theo yêu cầu đó, nhưng vẫn chỉ dùng thông tin từ `context_text` (các đoạn trích).

Ví dụ (mẫu bắt buộc, cho UI dễ parse):

AI A (Ủng hộ):
• Luận điểm chính: Transformer vượt trội vì khả năng song song và mô hình hóa phụ thuộc dài hạn hiệu quả hơn RNN (2 câu). [Võ et al. 2023]
• Phản biện ngắn: Tuy nhiên, chi phí tính toán cao có thể làm giảm lợi ích trong môi trường tài nguyên hạn chế. [Nguyen et al. 2022]

AI B (Phản biện):
• Luận điểm chính: RNN vẫn hiệu quả với dữ liệu chuỗi ngắn và tiêu tốn ít bộ nhớ, có lợi cho tác vụ nhúng trên thiết bị (2 câu). [Tran & Lê 2021]
• Phản biện ngắn: Transformer có thể được tinh chỉnh hoặc nén để giảm chi phí trong nhiều trường hợp. [Lâm et al. 2022]

Kết luận:
• Transformer thường tốt hơn cho phụ thuộc dài, RNN vẫn có chỗ dùng cho tài nguyên hạn chế.

3 Đề xuất:
1. Thử nghiệm trực tiếp: chạy benchmark trên cùng bộ dữ liệu A với các cấu hình Transformer/RNN và báo metric latency/accuracy. [Tên Paper liên quan]
2. Ablation: so sánh phiên bản Transformer đã nén/quantize với RNN để kiểm tra trade-off.
3. Kiểm tra robustness: đánh giá trên dữ liệu nhiễu để đo ảnh hưởng của overfitting.

Lưu ý: giữ output ngắn gọn và chỉ dùng chứng cứ từ các đoạn trích đã cung cấp.
"""

    if query:
        full_query = f"{debate_prompt}\nUSER_REQUEST: {query}"
    else:
        full_query = debate_prompt

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=full_query,
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    context_for_generation = retrieval.context_text
    if not context_for_generation.strip():
        context_for_generation = "[Không có tài liệu được chọn. Hãy tạo cuộc tranh luận dựa trên kiến thức chung.]"

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_query,
        context_text=context_for_generation,
    )

    session = get_session(state.engine)
    try:
        session.add(ChatHistory(
            session_id=session_id,
            role="user",
            content=full_query,
            context_papers=json.dumps(paper_ids or []),
            citations="[]",
            model_used="",
        ))
        session.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=generation.content,
            context_papers=json.dumps(retrieval.papers_used),
            citations=json.dumps(generation.citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save debate history: {e}")
    finally:
        session.close()

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }
