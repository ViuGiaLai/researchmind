import json as _json
import re
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from app_state import state
from config.settings import settings
from db.database import get_session
from db.models import ChatHistory, Paper

router = APIRouter(prefix="/api/personal", tags=["Personal"])

_daily_cache: dict = {"data": None, "date": ""}


# ─── Personalized Knowledge Brain ────────────────────────────────

@router.get("/brain")
async def get_personal_brain():
    """
    Personalized Knowledge Brain: analyzes the user's library and reading
    patterns to provide personalized insights.
    """
    session = get_session(state.engine)
    try:
        all_papers = session.query(Paper).filter(Paper.status == "indexed").all()
        total_papers = len(all_papers)

        read_papers = [p for p in all_papers if p.read_status == "read"]
        reading_papers = [p for p in all_papers if p.read_status == "reading"]
        unread_papers = [p for p in all_papers if p.read_status == "unread"]
        starred_papers = [p for p in all_papers if p.starred]

        languages = Counter(p.language for p in all_papers)
        total_pages = sum(p.page_count or 0 for p in all_papers)

        reading_stats = {
            "total_papers": total_papers,
            "read_count": len(read_papers),
            "reading_count": len(reading_papers),
            "unread_count": len(unread_papers),
            "starred_count": len(starred_papers),
            "total_pages": total_pages,
            "languages": dict(languages),
            "read_percentage": round(len(read_papers) / total_papers * 100, 1) if total_papers > 0 else 0,
        }

        all_tags = []
        for p in all_papers:
            try:
                tags = _json.loads(p.tags or "[]")
                all_tags.extend(tags)
            except Exception:
                pass

        tag_counts = Counter(all_tags)
        top_topics = tag_counts.most_common(10)

        title_words = []
        stop_words = set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'were', 'by', 'with', 'from', 'that', 'this', 'it', 'its', 'as', 'not', 'but', 'can', 'has', 'have', 'been', 'we', 'our', 'their', 'they', 'he', 'she', 'than', 'if', 'when', 'which', 'what', 'how', 'all', 'each', 'every', 'more', 'most', 'no', 'other', 'some', 'such', 'than', 'too', 'very', 'may', 'will', 'also', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'then', 'once', 'here', 'there', 'why', 'both', 'few', 'own', 'same', 'so', 'while', 'only', 'now', 'over', 'such', 'just', 'any', 'new', 'one', 'two', 'first', 'based', 'using', 'approach', 'method', 'model', 'using', 'via', 'study', 'paper', 'analysis', 'using', 'data', 'method', 'methods', 'approach', 'approaches', 'performance', 'result', 'results', 'present', 'propose', 'proposed', 'introduce', 'introduced', 'develop', 'developed', 'providing', 'provide'])

        for p in all_papers:
            if p.title:
                words = re.findall(r'[a-zA-Z]{3,}', p.title.lower())
                title_words.extend([w for w in words if w not in stop_words and len(w) > 3])

        word_counts = Counter(title_words)
        top_keywords = word_counts.most_common(15)

        user_queries = session.query(ChatHistory.content).filter(
            ChatHistory.role == "user"
        ).limit(100).all()

        query_words = []
        for (content,) in user_queries:
            words = re.findall(r'[a-zA-ZÀ-ỹ]{3,}', content.lower())
            query_words.extend([w for w in words if w not in stop_words and len(w) > 3])

        query_word_counts = Counter(query_words)
        top_query_topics = query_word_counts.most_common(10)

        topic_interests = {
            "top_tags": [{"topic": t, "count": c} for t, c in top_topics],
            "top_keywords": [{"keyword": w, "count": c} for w, c in top_keywords],
            "top_query_topics": [{"topic": t, "count": c} for t, c in top_query_topics],
        }

        all_authors = []
        for p in all_papers:
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    all_authors.extend([a.strip() for a in authors if a.strip()])
            except Exception:
                pass

        author_counts = Counter(all_authors)
        top_authors = author_counts.most_common(10)

        author_preferences = {
            "top_authors": [{"author": a, "count": c} for a, c in top_authors],
        }

        timeline = []
        month_counts = Counter()
        for p in all_papers:
            if p.created_at:
                month_key = p.created_at.strftime("%Y-%m")
                month_counts[month_key] += 1

        for month in sorted(month_counts.keys(), reverse=True)[:6]:
            timeline.append({"month": month, "count": month_counts[month]})

        recent_chats = session.query(ChatHistory).filter(
            ChatHistory.role == "user"
        ).order_by(ChatHistory.created_at.desc()).limit(10).all()

        recent_activity = []
        for ch in recent_chats:
            recent_activity.append({
                "type": "chat",
                "content": ch.content[:100],
                "date": str(ch.created_at) if ch.created_at else None,
            })

        insights = []

        if total_papers == 0:
            insights.append({
                "type": "info",
                "title": "Bắt đầu hành trình nghiên cứu",
                "description": "Hãy import PDF đầu tiên để xây dựng thư viện nghiên cứu của bạn.",
                "action": "Import PDF",
            })
        else:
            if len(unread_papers) > 0:
                insights.append({
                    "type": "action",
                    "title": f"{len(unread_papers)} paper chưa đọc",
                    "description": f"Bạn có {len(unread_papers)} paper chờ xử lý. Hãy bắt đầu với paper quan trọng nhất.",
                    "action": "Xem thư viện",
                })

            if len(read_papers) > 0 and total_papers > 0:
                pct = round(len(read_papers) / total_papers * 100)
                insights.append({
                    "type": "progress",
                    "title": f"Tiến độ đọc: {pct}%",
                    "description": f"Bạn đã đọc {len(read_papers)}/{total_papers} paper. {'Tuyệt vời!' if pct > 70 else 'Cố gắng lên!' if pct > 30 else 'Hãy đọc thêm paper nhé!'}",
                })

            if top_topics:
                top_topic = top_topics[0][0]
                insights.append({
                    "type": "insight",
                    "title": f"Chủ đề quan tâm nhất: {top_topic}",
                    "description": f"Bạn đang tập trung nhiều vào '{top_topic}'. Hãy tìm thêm paper liên quan để mở rộng kiến thức.",
                })

            if len(languages) > 1:
                langs = ", ".join([f"{lang}: {count}" for lang, count in languages.most_common(3)])
                insights.append({
                    "type": "info",
                    "title": "Ngôn ngữ đa dạng",
                    "description": f"Thư viện của bạn có nhiều ngôn ngữ: {langs}. Điều này cho thấy bạn tiếp cận nghiên cứu từ nhiều nguồn.",
                })

            if len(starred_papers) > 0:
                starred_titles = [p.title or p.filename for p in starred_papers[:3]]
                insights.append({
                    "type": "insight",
                    "title": f"{len(starred_papers)} paper yêu thích",
                    "description": f"Các paper được yêu thích: {', '.join(starred_titles[:2])}{'...' if len(starred_titles) > 2 else ''}. Đây có thể là hướng nghiên cứu chính của bạn.",
                })

            if total_papers >= 3 and len(read_papers) < total_papers // 2:
                insights.append({
                    "type": "action",
                    "title": "Tạo Literature Review",
                    "description": "Với nhiều paper chưa đọc, hãy để AI tóm tắt và review giúp bạn.",
                    "action": "Tạo Review",
                })

        return {
            "reading_stats": reading_stats,
            "topic_interests": topic_interests,
            "author_preferences": author_preferences,
            "timeline": timeline,
            "recent_activity": recent_activity,
            "insights": insights,
        }
    finally:
        session.close()


# ─── Daily AI Reader ─────────────────────────────────────────────

@router.get("/daily-reader")
async def get_daily_reader():
    """
    Daily AI Reader: suggests papers to read each day based on user's
    interests, reading history, and paper metadata.
    """
    session = get_session(state.engine)
    try:
        all_papers = session.query(Paper).filter(Paper.status == "indexed").all()

        unread_papers = [p for p in all_papers if p.read_status == "unread"]
        reading_papers = [p for p in all_papers if p.read_status == "reading"]
        read_papers = [p for p in all_papers if p.read_status == "read"]

        all_tags = []
        for p in all_papers:
            try:
                tags = _json.loads(p.tags or "[]")
                all_tags.extend(tags)
            except Exception:
                pass

        tag_counts = Counter(all_tags)
        top_interests = [t for t, c in tag_counts.most_common(5)]

        recent_queries = session.query(ChatHistory.content).filter(
            ChatHistory.role == "user"
        ).order_by(ChatHistory.created_at.desc()).limit(20).all()

        query_text = " ".join([q[0] for q in recent_queries]) if recent_queries else ""

        paper_summaries = []
        for p in all_papers:
            summary = {
                "id": p.id,
                "title": p.title or p.filename,
                "authors": "",
                "year": p.year,
                "language": p.language,
                "read_status": p.read_status,
                "tags": [],
                "pages": p.page_count or 0,
                "auto_summary": "",
            }
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    summary["authors"] = ", ".join(authors[:3])
            except Exception:
                pass
            try:
                summary["tags"] = _json.loads(p.tags or "[]")
            except Exception:
                pass
            if p.auto_summary:
                summary["auto_summary"] = p.auto_summary[:200]
            paper_summaries.append(summary)

        daily_suggestion = None

        if len(all_papers) > 0:
            today = datetime.now().strftime("%Y-%m-%d")
            if _daily_cache["date"] == today and _daily_cache["data"] is not None:
                daily_suggestion = _daily_cache["data"]
            else:
                papers_context = _json.dumps(paper_summaries[:30], ensure_ascii=False, indent=1)
                interests_context = f"Top interests: {', '.join(top_interests)}" if top_interests else "No tags yet"
                recent_context = f"Recent chat topics: {query_text[:500]}" if query_text else "No recent chat"

                daily_prompt = f"""Bạn là trợ lý nghiên cứu cá nhân. Dựa trên thư viện paper và sở thích của người dùng, hãy gợi ý paper nên đọc HÔM NAY.

## Thư viện paper:
{papers_context}

## Sở thích:
{interests_context}

## Hoạt động gần đây:
{recent_context}

## YÊU CẦU:
Hãy chọn 2-3 paper phù hợp nhất để đọc hôm nay. Với mỗi paper, hãy:
1. Giải thích TẠI SAO paper này phù hợp với sở thích của người dùng
2. Đọc paper này sẽ giúp ích gì cho nghiên cứu của họ
3. Gợi ý đọc paper nào TIẾP THEO sau khi đọc xong

Trả lời bằng tiếng Việt, ngắn gọn, súc tích. Dùng markdown với headings.

Nếu không có paper nào phù hợp, hãy gợi ý:
- Nên import thêm paper về chủ đề nào
- Hoặc nên bắt đầu đọc paper chưa đọc nào trước"""

                try:
                    generation = state.generator.generate(
                        query=daily_prompt,
                        context_text=papers_context,
                    )
                    if generation and generation.content:
                        daily_suggestion = {
                            "suggestion": generation.content,
                            "model_used": generation.model_used,
                        }
                except Exception as e:
                    logger.warning(f"Daily reader AI suggestion failed, using fallback: {e}")

                if daily_suggestion is None:
                    fallback_titles = [
                        p.title or p.filename
                        for p in (unread_papers or reading_papers or all_papers)[:3]
                    ]
                    if fallback_titles:
                        daily_suggestion = {
                            "suggestion": "## Gợi ý đọc hôm nay\n\n" + "\n".join(
                                f"- {title}" for title in fallback_titles
                            ),
                            "model_used": "local-fallback",
                        }

                _daily_cache["data"] = daily_suggestion
                _daily_cache["date"] = today

        def paper_priority(p):
            score = 0
            if p.starred:
                score += 100
            if p.auto_summary:
                score += 50
            try:
                paper_tags = _json.loads(p.tags or "[]")
                overlap = len(set(paper_tags) & set(top_interests))
                score += overlap * 30
            except Exception:
                pass
            pages = p.page_count or 10
            if pages < 10:
                score += 20
            elif pages < 20:
                score += 10
            return score

        prioritized_unread = sorted(unread_papers, key=paper_priority, reverse=True)

        unread_list = []
        for p in prioritized_unread[:10]:
            tags = []
            try:
                tags = _json.loads(p.tags or "[]")
            except Exception:
                pass
            entry = {
                "paper_id": p.id,
                "title": p.title or p.filename,
                "authors": "",
                "year": p.year,
                "pages": p.page_count or 0,
                "tags": tags,
                "starred": bool(p.starred),
                "has_summary": bool(p.auto_summary),
            }
            try:
                authors = _json.loads(p.authors or "[]")
                if isinstance(authors, list):
                    entry["authors"] = ", ".join(authors[:3])
            except Exception:
                pass
            unread_list.append(entry)

        today = datetime.today().date()
        streak = 0
        for days_back in range(30):
            check_date = today - timedelta(days=days_back)
            day_start = datetime.combine(check_date, datetime.min.time())
            day_end = datetime.combine(check_date, datetime.max.time())
            has_activity = session.query(ChatHistory).filter(
                ChatHistory.created_at >= day_start,
                ChatHistory.created_at <= day_end
            ).count() > 0
            if has_activity:
                if days_back == streak:
                    streak += 1
                else:
                    break
            elif days_back > 0:
                break

        return {
            "daily_suggestion": daily_suggestion,
            "unread_papers": unread_list,
            "reading_streak": streak,
            "stats": {
                "total": len(all_papers),
                "unread": len(unread_papers),
                "reading": len(reading_papers),
                "read": len(read_papers),
            },
        }
    finally:
        session.close()
