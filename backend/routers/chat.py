import asyncio
import json
import re
import time as time_mod
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from loguru import logger

from academic.paper_check import check_papers_ready
from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory, CollectionPaper, Paper

router = APIRouter(prefix="/api", tags=["Chat"])

_chat_response_cache: dict[str, dict] = {}
_chat_response_cache_max = 128


def _chat_cache_key(message: str, paper_ids, scope: str, collection_id: str | None) -> str:
    normalized_papers = sorted(paper_ids or [])
    return json.dumps(
        {
            "message": message.strip().lower(),
            "paper_ids": normalized_papers,
            "scope": scope or "current",
            "collection_id": collection_id or "",
        },
        ensure_ascii=False,
        sort_keys=True,
    )


def _put_chat_cache(key: str, value: dict) -> None:
    if len(_chat_response_cache) >= _chat_response_cache_max:
        oldest = next(iter(_chat_response_cache))
        _chat_response_cache.pop(oldest, None)
    _chat_response_cache[key] = value


def _stream_cached_chat(cached: dict):
    yield f"data: {json.dumps({'status': 'Trả lời từ cache...'})}\n\n"
    yield f"data: {json.dumps({'chunk': cached.get('answer', '')})}\n\n"
    yield f"data: {json.dumps({
        'done': True,
        'model_used': cached.get('model_used', 'cache'),
        'citations': cached.get('citations', []),
        'modified_content': cached.get('modified_content', cached.get('answer', '')),
    })}\n\n"


def _resolve_collection_paper_ids(collection_id: str | None) -> list[str]:
    if not collection_id:
        return []
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


def _build_paper_title_map(paper_ids: list[str] | None) -> dict[str, str]:
    """Build a mapping from paper title/filename → paper_id for lookups."""
    if not paper_ids:
        return {}
    session = get_session(state.engine)
    try:
        papers = session.query(Paper.id, Paper.title, Paper.filename).filter(
            Paper.id.in_(paper_ids)
        ).all()
        mapping = {}
        for pid, title, filename in papers:
            if title:
                mapping[title.strip().lower()] = pid
            if filename:
                mapping[filename.strip().lower()] = pid
            mapping[pid] = pid  # also map id→id for direct use
        return mapping
    finally:
        session.close()


def _build_chunk_map(context_text: str) -> dict[tuple[str, int | None], dict]:
    """Parse context_text to build (source, page) → {text_snippet, paper_title}."""
    chunk_map: dict[tuple[str, int | None], dict] = {}
    lines = context_text.split("\n")

    current_source = None
    current_page: int | None = None
    current_title = None
    current_lines: list[str] = []

    def flush():
        if current_source is not None:
            text = "\n".join(current_lines).strip()
            key = (current_source, current_page)
            if text and key not in chunk_map:
                entry = {
                    "text_snippet": text[:500],
                    "paper_title": current_title or current_source,
                }
                chunk_map[key] = entry
                # Also index by UUID part if source starts with UUID
                uuid_m = re.match(r'^([0-9a-f-]{36})', current_source)
                if uuid_m:
                    uuid_key = (uuid_m.group(1), current_page)
                    if uuid_key not in chunk_map:
                        chunk_map[uuid_key] = entry

    for line in lines:
        # Section header: ### 📄 Paper Title
        title_match = re.match(r'^###\s+.*?\b(.+)$', line)
        if title_match:
            current_title = title_match.group(1).strip()
            # Strip leading icon if any
            current_title = re.sub(r'^[^\w]+', '', current_title).strip()
            continue

        # Citation entry: [Source] or [Source] (trang N)
        cite_match = re.match(r'^\[([^\]]+?)\](?:\s*\(trang\s*(\d+)\))?$', line.strip())
        if cite_match:
            flush()
            current_source = cite_match.group(1).strip()
            current_page = int(cite_match.group(2)) if cite_match.group(2) else None
            current_lines = []
            continue

        # Skip separators and empty lines
        if line.startswith("---") or line.startswith("Dưới đây"):
            continue

        if current_source is not None and line.strip():
            current_lines.append(line)

    flush()
    return chunk_map


def _is_likely_citation(
    source: str, page: int | None,
    chunk_map: dict, paper_title_map: dict,
) -> bool:
    """Heuristic filter: is this [source] actually a paper citation, not a false positive?"""
    if page is not None:
        return True
    if (source, page) in chunk_map:
        return True
    if source.lower() in paper_title_map or source in paper_title_map:
        return True
    if re.match(r'^[0-9a-f-]{36}', source):
        return True
    # Exclude obvious non-citations
    if source.upper() in ("REDACTED", "DONE", "OBJECT", "ARRAY"):
        return False
    return False


def _process_citations(
    full_response: str,
    citations: list[dict],
    paper_title_map: dict[str, str] | None = None,
    chunk_map: dict[tuple[str, int | None], dict] | None = None,
) -> tuple[str, list[dict]]:
    """Number citations, deduplicate, replace inline [Source, trang X] with [N].

    Returns:
        Tuple of (modified_response, deduplicated_citations_with_ref_id).
    """
    paper_title_map = paper_title_map or {}
    chunk_map = chunk_map or {}

    # Filter out false-positive citations (error messages, etc.)
    citations = [
        c for c in citations
        if _is_likely_citation(c.get("source", "").strip(), c.get("page"), chunk_map, paper_title_map)
    ]

    # First pass: deduplicate, assign ref_id, resolve paper_id
    seen: dict[tuple[str, int | None], int] = {}
    unique_citations: list[dict] = []

    for c in citations:
        source = c.get("source", "").strip()
        page = c.get("page")
        key = (source, page)

        if key not in seen:
            ref_id = len(unique_citations) + 1
            seen[key] = ref_id

            # Resolve paper_id: try full source → UUID prefix → direct match
            paper_id = paper_title_map.get(source.lower()) or paper_title_map.get(source, "")
            uuid_m = re.match(r'^([0-9a-f-]{36})', source)
            if uuid_m:
                extracted_uuid = uuid_m.group(1)
                if not paper_id:
                    paper_id = paper_title_map.get(extracted_uuid, "")
                # Also look up chunk data by UUID-prefixed key
                uuid_key = (extracted_uuid, page)
                if uuid_key in chunk_map and key not in chunk_map:
                    key = uuid_key

            chunk_data = chunk_map.get(key, {})
            text_snippet = chunk_data.get("text_snippet", "")
            paper_title = chunk_data.get("paper_title", "")

            # If paper_title still empty, derive clean display name from source
            if not paper_title:
                # Try filename part after UUID
                if uuid_m:
                    paper_title = source[len(uuid_m.group(1)):].lstrip("_- ")
                else:
                    paper_title = source

            unique_citations.append({
                "source": source,
                "page": page,
                "text": c.get("text", ""),
                "ref_id": ref_id,
                "paper_id": paper_id,
                "paper_title": paper_title,
                "text_snippet": text_snippet,
            })
        else:
            ref_id = seen[key]

        c["ref_id"] = ref_id

    # Second pass: replace [Source, trang X] with [N] (longest first)
    sorted_cites = sorted(citations, key=lambda x: len(x.get("text", "")), reverse=True)
    modified_response = full_response
    for c in sorted_cites:
        old_text = c.get("text", "")
        if old_text:
            modified_response = modified_response.replace(old_text, f"[{c['ref_id']}]", 1)

    return modified_response, unique_citations


_SIMPLE_QUESTION_MAX_LEN = 100
_SIMPLE_QUESTION_KEYWORDS = {"là gì", "khác nhau", "so sánh", "tại sao", "thế nào",
                            "cách", "bao nhiêu", "khi nào", "ở đâu", "ai"}


def _is_simple_question(message: str) -> bool:
    """Quick check: bỏ qua external_search nếu câu hỏi đơn giản, model tự trả lời."""
    msg = message.strip().lower()
    if len(msg) > _SIMPLE_QUESTION_MAX_LEN:
        return False
    if any(kw in msg for kw in _SIMPLE_QUESTION_KEYWORDS):
        return True
    # Yes/no, greeting, short definition
    return len(msg.split()) <= 15


# ─── Helpers ─────────────────────────────────────────────────────

def count_free_queries_today(session) -> int:
    """Count daily free queries logged in ChatHistory."""
    today_start = datetime.combine(datetime.today(), datetime.min.time())
    return session.query(ChatHistory).filter(
        ChatHistory.role == "assistant",
        ChatHistory.model_used == "gemini/free",
        ChatHistory.created_at >= today_start
    ).count()


async def _stream_chat(req: Request, query: str, context_text: str, session_id: str, paper_ids: list, timing=None, cache_key: str | None = None, reasoning_mode: str = "fast", task_type: str = "chat", paper_title_map: dict[str, str] | None = None, chunk_map: dict[tuple[str, int | None], dict] | None = None):
    """Stream chat response chunks and save to history once completed."""
    timing = timing or {}
    stream_start = time_mod.time()
    first_token_at = None
    full_response = ""
    yield f"data: {json.dumps({'status': 'Dang ket noi model...'})}\n\n"
    for chunk in state.generator.stream_generate(query, context_text, reasoning_mode=reasoning_mode, task_type=task_type):
        if await req.is_disconnected():
            logger.info("CHAT_STREAM: client disconnected, aborting LLM generation")
            break
        if first_token_at is None:
            first_token_at = time_mod.time()
            logger.info(
                "CHAT_TTFT "
                f"ttft={first_token_at - timing.get('start', stream_start):.2f}s "
                f"retrieve={timing.get('retrieve', 0.0):.2f}s "
                f"context_len={len(context_text)}"
            )
        full_response += chunk
        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        await asyncio.sleep(0.001)  # Yield execution control back to the event loop so Starlette can check socket disconnect state

    model_used = state.generator.current_model
    router_reason = state.generator.current_router_reason
    token_count = state.generator.current_token_count
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

        # Process citations: number them, replace inline text, resolve paper_ids
        modified_content, processed_citations = _process_citations(
            full_response, citations, paper_title_map, chunk_map
        )

        db.add(ChatHistory(
            session_id=session_id,
            role="assistant",
            content=full_response,
            context_papers="[]",
            citations=json.dumps(processed_citations),
            model_used=model_used,
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save streamed chat history: {e}")
    finally:
        db.close()

    yield f"data: {json.dumps({'done': True, 'model_used': model_used, 'router_reason': router_reason, 'token_count': token_count, 'citations': processed_citations, 'modified_content': modified_content})}\n\n"
    if cache_key:
        _put_chat_cache(cache_key, {
            "answer": full_response,
            "modified_content": modified_content,
            "citations": processed_citations,
            "model_used": model_used,
            "papers_used": paper_ids or [],
            "chunks_used": timing.get("chunks_used", 0) if timing else 0,
        })
    logger.info(
        "CHAT_STREAM_TIMING "
        f"stream_generate={time_mod.time() - stream_start:.2f}s "
        f"total={time_mod.time() - timing.get('start', stream_start):.2f}s "
        f"model={model_used}"
    )


# ─── Chat ────────────────────────────────────────────────────────

@router.post("/chat/suggest-questions")
async def suggest_questions(body: dict = Body(...)):
    """
    Generate 3 quick suggested questions.
    - external → simple prompt, no context
    - paper scopes → use paper titles only (no RAG), fast & light
    """
    scope = body.get("scope", "current")
    paper_ids = body.get("paper_ids")
    collection_id = body.get("collection_id")

    if collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(collection_id)
        if not paper_ids:
            return {"questions": []}

    # Build paper context from titles only (fast, no RAG)
    paper_titles: list[str] = []
    if paper_ids or scope == "library":
        session = get_session(state.engine)
        try:
            q = session.query(Paper.title).filter(Paper.id.in_(paper_ids)) if paper_ids else session.query(Paper.title)
            paper_titles = [row[0] for row in q.all() if row[0]]
        finally:
            session.close()

    if scope == "external" or not paper_titles:
        prompt = (
            "Đưa ra 3 câu hỏi tiếng Việt, mỗi câu 1 dòng bắt đầu bằng '- '. "
            "Câu hỏi về AI/ML cho người mới. Ví dụ:\n"
            "- Transformer là gì?\n"
            "- Sự khác nhau giữa CNN và RNN?\n"
            "- Các xu hướng AI năm 2026?"
        )
        context = "__EXTERNAL_KNOWLEDGE__"
    else:
        titles_str = "\n".join(f"- {t}" for t in paper_titles[:10])
        prompt = (
            "Dựa vào các paper sau, đưa ra 3 câu hỏi nghiên cứu tiếng Việt "
            "mà người dùng muốn hỏi nhất. Mỗi câu 1 dòng, bắt đầu bằng '- '.\n\n"
            f"Papers:\n{titles_str}"
        )
        context = ""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=prompt,
        context_text=context,
        task_type="chat",
    )

    questions: list[str] = []
    for line in generation.content.strip().split("\n"):
        line = line.strip()
        if line.startswith("- "):
            q = line[2:].strip()
            if q:
                questions.append(q)
        elif line and not line.startswith("#"):
            questions.append(line)
        if len(questions) >= 3:
            break

    return {"questions": questions[:3]}


@router.post("/chat")
async def chat(req: Request, request: dict = Body(...)):
    """Chat with selected papers using RAG pipeline."""
    t0 = time_mod.time()
    message = request.get("message", "")
    paper_ids = request.get("paper_ids")
    stream = request.get("stream", False)
    session_id = request.get("session_id", "default")
    collection_id = request.get("collection_id")
    reasoning_mode = request.get("reasoning_mode", "fast")

    if not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    if paper_ids:
        paper_error = check_papers_ready(paper_ids)
        if paper_error:
            return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}
    elif collection_id:
        paper_ids = _resolve_collection_paper_ids(collection_id)
        if not paper_ids:
            return {"answer": "Collection này chưa có tài liệu để chat.", "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}
        paper_error = check_papers_ready(paper_ids)
        if paper_error:
            return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}

    if settings.llm_mode == "cloud_free":
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

    scope = request.get("scope", "current")
    collection_id = request.get("collection_id")

    if scope == "collection" and collection_id:
        session = get_session(state.engine)
        try:
            paper_ids = [
                row.paper_id
                for row in session.query(CollectionPaper.paper_id)
                .filter(CollectionPaper.collection_id == collection_id)
                .all()
            ]
        finally:
            session.close()
        if not paper_ids:
            return {
                "answer": "Collection này chưa có tài liệu để chat.",
                "citations": [],
                "model_used": "",
                "papers_used": [],
                "chunks_used": 0,
            }
        paper_error = check_papers_ready(paper_ids)
        if paper_error:
            return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}

    cache_key = _chat_cache_key(message, paper_ids, scope, collection_id)
    cached = _chat_response_cache.get(cache_key)
    if cached:
        logger.info(f"CHAT_CACHE hit total={time_mod.time() - t0:.3f}s")
        if stream:
            return StreamingResponse(_stream_cached_chat(cached), media_type="text/event-stream")
        return cached

    if scope == "external":
        from types import SimpleNamespace
        if _is_simple_question(message):
            logger.info(f"TIMING: external_search skipped (simple question)")
            retrieval = SimpleNamespace(
                context_text="__EXTERNAL_KNOWLEDGE__",
                total_chunks=0,
                papers_used=[],
            )
            retrieve_time = 0.0
        else:
            from academic.external_search import search_external
            t1 = time_mod.time()
            ext_context = await search_external(message, top_k=5)
            t2 = time_mod.time()
            retrieval = SimpleNamespace(
                context_text=ext_context or "__EXTERNAL_KNOWLEDGE__",
                total_chunks=ext_context.count("**") // 2 if ext_context else 0,
                papers_used=[],
            )
            retrieve_time = t2 - t1
            logger.info(f"TIMING: external_search={t2-t1:.2f}s context_len={len(ext_context)}")
    else:
        t1 = time_mod.time()
        retrieval = await asyncio.to_thread(
            state.retriever.retrieve,
            query=message,
            paper_ids=paper_ids,
            top_k=5,
        )
        t2 = time_mod.time()
        retrieve_time = t2 - t1
        logger.info(f"TIMING: retrieve={t2-t1:.2f}s context_len={len(retrieval.context_text)} chunks={retrieval.total_chunks}")

    # Phân biệt: có context paper → RAG (gemini), không context → chat đơn giản (github)
    has_paper_context = (
        retrieval.context_text
        and retrieval.context_text != "__EXTERNAL_KNOWLEDGE__"
        and len(retrieval.context_text.strip()) >= 50
    )
    actual_task_type = "rag" if has_paper_context else "chat"

    paper_title_map = _build_paper_title_map(paper_ids)
    chunk_map = _build_chunk_map(retrieval.context_text)

    if stream:
        return StreamingResponse(
            _stream_chat(
                req,
                message,
                retrieval.context_text,
                session_id,
                paper_ids,
                {"start": t0, "retrieve": retrieve_time, "chunks_used": retrieval.total_chunks},
                cache_key,
                reasoning_mode,
                actual_task_type,
                paper_title_map,
                chunk_map,
            ),
            media_type="text/event-stream",
        )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=message,
        context_text=retrieval.context_text,
        reasoning_mode=reasoning_mode,
        task_type=actual_task_type,
    )
    t3 = time_mod.time()
    logger.info(f"TIMING: generate={t3-t2:.2f}s model={generation.model_used} total={t3-t0:.2f}s")

    # Process citations for non-streaming path too
    citations = generation.citations or []
    chunk_map = _build_chunk_map(retrieval.context_text)
    modified_content, processed_citations = _process_citations(
        generation.content, citations, paper_title_map, chunk_map
    )

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
            citations=json.dumps(processed_citations),
            model_used=generation.model_used,
        ))
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to save chat history: {e}")
    finally:
        session.close()

    response = {
        "answer": modified_content,
        "modified_content": modified_content,
        "citations": processed_citations,
        "model_used": generation.model_used,
        "router_reason": generation.router_reason,
        "router_token_count": generation.router_token_count,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }
    _put_chat_cache(cache_key, response)
    return response


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
    collection_id = request.get("collection_id")

    if collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(collection_id)

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

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}

    search_query = query[:200] if not request.get("query") else request.get("query", "")[:200]
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=search_query or "literature review",
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=query,
        context_text=retrieval.context_text,
        task_type="review",
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
    collection_id = request.get("collection_id")

    if collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(collection_id)

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

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}

    search_query = query or "critique"
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=search_query[:200],
        paper_ids=paper_ids,
        top_k=settings.top_k_retrieval,
    )

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=full_query,
        context_text=retrieval.context_text,
        task_type="critique",
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
    collection_id = request.get("collection_id")

    if collection_id and not paper_ids:
        paper_ids = _resolve_collection_paper_ids(collection_id)

    debate_prompt = """Bạn là trợ lý phân tích học thuật. Tạo tranh luận giữa AI A (Ủng hộ) và AI B (Phản biện) dựa trên các đoạn trích.

Định dạng output BẮT BUỘC (UI parse chính xác):
AI A (Ủng hộ):
• Luận điểm chính: <1-2 câu> [Tên Paper]
• Phản biện ngắn: <1 câu> [Tên Paper]

AI B (Phản biện):
• Luận điểm chính: <1-2 câu> [Tên Paper]  
• Phản biện ngắn: <1 câu> [Tên Paper]

Kết luận:
• <tóm tắt khác biệt cốt lõi>

3 Đề xuất:
1. <hành động kiểm chứng> [Tên Paper]
2. <hành động kiểm chứng>
3. <hành động kiểm chứng>

Viết tiếng Việt, chỉ dùng thông tin từ context. Giữ ngắn gọn, gạch đầu dòng.
"""

    if query:
        full_query = f"{debate_prompt}\nUSER_REQUEST: {query}"
    else:
        full_query = debate_prompt

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {"answer": paper_error, "citations": [], "model_used": "", "papers_used": [], "chunks_used": 0}

    search_query = query or " ".join(debate_prompt.split()[:50])
    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query=search_query,
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
        task_type="debate",
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
