import asyncio
from fastapi import APIRouter, Body
from loguru import logger

from app_state import state
from config.settings import settings
from academic.paper_check import check_papers_ready

router = APIRouter(prefix="/api/insights", tags=["Insights"])


@router.post("/gap")
async def find_research_gap(body: dict = Body(...)):
    """
    Find research gaps across indexed papers.
    Uses RAG to retrieve relevant chunks, then LLM analyzes what's missing.
    """
    paper_ids = body.get("paper_ids")

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {
            "answer": paper_error,
            "citations": [],
            "model_used": "",
            "papers_used": [],
            "chunks_used": 0,
        }

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research methodology findings results limitations future work gaps unexplored areas weaknesses",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    gap_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và chỉ ra:

## 🔍 Research Gap Analysis

### 1. Lỗ hổng nghiên cứu chính (Main Research Gaps)
- Chỉ ra những vấn đề CHƯA được giải quyết hoặc giải quyết chưa tốt trong các paper.
- Với mỗi lỗ hổng, nêu rõ: vấn đề gì, tại sao chưa giải quyết được.

### 2. Điểm yếu chung (Common Weaknesses)
- Các hạn chế mà nhiều paper cùng gặp phải.
- Phương pháp nào còn thiếu sót?

### 3. Hướng nghiên cứu mới (New Research Directions)
- Đề xuất 2-3 hướng nghiên cứu mới dựa trên các lỗ hổng tìm được.
- Với mỗi hướng, giải thích tại sao đây là cơ hội tốt.

### 4. Cơ hội đóng góp (Contribution Opportunities)
- Cụ thể, một nghiên cứu sinh có thể đóng góp gì ngay bây giờ?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] khi cần. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=gap_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/conflict")
async def find_conflicts(body: dict = Body(...)):
    """
    Find contradictions and conflicts between papers.
    Uses RAG to retrieve diverse chunks, then LLM compares claims.
    """
    paper_ids = body.get("paper_ids")

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {
            "answer": paper_error,
            "citations": [],
            "model_used": "",
            "papers_used": [],
            "chunks_used": 0,
        }

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="findings conclusions results claims arguments methodology approach results show demonstrate suggest",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    conflict_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và chỉ ra:

## ⚠️ Conflict Analysis

### 1. Mâu thuẫn trực tiếp (Direct Contradictions)
- Paper nào đưa ra kết luận/trường phái đối lập nhau?
- Cụ thể: Paper A nói X, Paper B nói Y — mâu thuẫn ở điểm nào?

### 2. Khác biệt về phương pháp (Methodological Differences)
- Các paper sử dụng phương pháp khác nhau cho cùng vấn đề?
- Kết quả khác nhau do phương pháp hay do dữ liệu?

### 3. Kết quả mâu thuẫn (Conflicting Results)
- Cùng 1 vấn đề nhưng kết quả đo lường khác nhau?
- Giải thích nguyên nhân có thể.

### 4. Góc nhìn đa chiều (Diverse Perspectives)
- Các paper có cách tiếp cận vấn đề từ nhiều góc nhìn khác nhau?
- Góc nhìn nào mạnh/yếu?

### 5. Cơ hội nghiên cứu từ mâu thuẫn (Opportunities)
- Mâu thuẫn nào tạo cơ hội nghiên cứu tốt nhất?
- Nên ưu tiên giải quyết mâu thuẫn nào?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] cho mỗi claim. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=conflict_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/topic")
async def suggest_topics(body: dict = Body(...)):
    """
    Suggest research topics based on papers in the library.
    Uses RAG to retrieve diverse chunks, then LLM generates topic suggestions.
    """
    paper_ids = body.get("paper_ids")

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {
            "answer": paper_error,
            "citations": [],
            "model_used": "",
            "papers_used": [],
            "chunks_used": 0,
        }

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research topic methodology findings results future work direction novel approach innovative",
        paper_ids=paper_ids,
        top_k=15,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để đề xuất đề tài. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    topic_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và đề xuất:

## 💡 Research Topic Suggestions

### 1. Tổng quan lĩnh vực nghiên cứu (Research Landscape)
- Nhận xét nhanh về lĩnh vực/lĩnh vực con mà các paper đang tập trung.
- Xu hướng chính hiện tại là gì?

### 2. Đề xuất đề tài nghiên cứu (Suggested Topics)
Đề xuất 3-5 đề tài nghiên cứu cụ thể, mỗi đề tài bao gồm:
- **Tên đề tài** (gợi cảm hứng, rõ ràng)
- **Mô tả ngắn** (2-3 dòng giải thích đề tài)
- **Tại sao quan trọng** (cơ hội và tiềm năng đóng góp)
- **Gợi ý phương pháp tiếp cận** (cách triển khai sơ bộ)

### 3. Đề tài có tiềm năng cao nhất (Top Pick)
- Chọn 1 đề tài từ danh sách trên.
- Giải thích chi tiết hơn: tại sao đây là cơ hội vàng cho nghiên cứu sinh.
- Cần đọc thêm tài liệu nào để bắt đầu?

### 4. Gợi ý bước tiếp theo (Next Steps)
- Nên đọc thêm paper nào (dựa trên các paper hiện có)?
- Phương pháp nào nên tìm hiểu thêm?

Lưu ý: Đề xuất phải khả thi, cụ thể và dựa trên nội dung thực tế từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] khi cần. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=topic_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }


@router.post("/evolution")
async def find_evolution_map(body: dict = Body(...)):
    """
    Analyze research evolution across papers.
    Uses RAG to retrieve diverse chunks, then LLM maps the evolution of ideas.
    """
    paper_ids = body.get("paper_ids")

    paper_error = check_papers_ready(paper_ids)
    if paper_error:
        return {
            "answer": paper_error,
            "citations": [],
            "model_used": "",
            "papers_used": [],
            "chunks_used": 0,
        }

    retrieval = await asyncio.to_thread(
        state.retriever.retrieve,
        query="research evolution development history background methodology findings results improvement advancement novel approach future direction",
        paper_ids=paper_ids,
        top_k=20,
    )

    if not retrieval.context_text.strip():
        return {
            "answer": "Không đủ dữ liệu để phân tích evolution map. Hãy import thêm paper vào thư viện.",
            "citations": [],
            "model_used": "none",
            "papers_used": [],
            "chunks_used": 0,
        }

    evolution_prompt = f"""Dựa trên các đoạn văn sau từ nhiều paper khác nhau, hãy phân tích và vẽ bản đồ phát triển nghiên cứu.
Lưu ý: Sắp xếp các paper/giai đoạn theo thứ tự thời gian (cũ nhất → mới nhất) dựa trên năm xuất bản hoặc nội dung.

## 🧬 Evolution Map — Bản đồ phát triển nghiên cứu

### 1. Tổng quan xu hướng (Trend Overview)
- Nhận xét tổng quan về sự phát triển của lĩnh vực nghiên cứu trong các paper.
- Xu hướng chính theo thời gian là gì?

### 2. Dòng phát triển ý tưởng (Idea Evolution Chain)
Liệt kê theo thứ tự thời gian (cũ → mới):
- **Giai đoạn 1** (Paper cũ nhất): Ý tưởng ban đầu, nền tảng
- **Giai đoạn 2**: Phát triển tiếp, mở rộng hoặc cải tiến
- **Giai đoạn 3**: Đóng góp mới, bước ngoặt
- **Giai đoạn 4** (Paper mới nhất): Xu hướng hiện tại, tương lai

Với mỗi giai đoạn, nêu rõ:
- Paper nào đại diện (tên + năm nếu có)
- Ý tưởng chính của giai đoạn
- So với giai đoạn trước, có gì mới/khác?

### 3. Các bước ngoặt quan trọng (Key Milestones)
- Những phát hiện nào đã thay đổi hướng nghiên cứu?
- Phương pháp nào đã tạo đột phá?

### 4. Sơ đồ quan hệ (Relationship Map)
- Paper nào kế thừa/yếu tố từ paper nào?
- Có paper nào độc lập nhưng cùng chủ đề?

### 5. Dự đoán xu hướng tương lai (Future Trends)
- Dựa trên evolution map, xu hướng tiếp theo sẽ là gì?
- Researchers nên chuẩn bị kỹ năng/phương pháp gì?

Lưu ý: Phân tích dựa CHỈ trên thông tin từ các đoạn đã cung cấp. Trích dẫn nguồn [Tên Paper] cho mỗi giai đoạn. Trả lời bằng tiếng Việt.

Context từ tài liệu:\n{retrieval.context_text}"""

    generation = await asyncio.to_thread(
        state.generator.generate,
        query=evolution_prompt,
        context_text=retrieval.context_text,
    )

    return {
        "answer": generation.content,
        "citations": generation.citations,
        "model_used": generation.model_used,
        "papers_used": retrieval.papers_used,
        "chunks_used": retrieval.total_chunks,
    }
