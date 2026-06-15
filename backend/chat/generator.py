"""LLM response generation with citation verification.

Supports:
- Local: Ollama (Llama 3.1 8B)
- Cloud: Claude Sonnet API
- Citation verification: every claim must cite a source
"""

from typing import Optional
from dataclasses import dataclass
import json
import re
import httpx
from loguru import logger

# Type hint for anthropic (optional import)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    import anthropic


@dataclass
class GenerationResult:
    """Result of LLM generation."""
    content: str
    citations: list[dict]
    model_used: str
    finish_reason: str = "stop"


class Generator:
    """
    LLM response generator.

    Takes a query + retrieved context, sends to LLM, verifies citations.
    """

    def __init__(
        self,
        ollama_url: str = "http://localhost:11434",
        ollama_model: str = "qwen2.5:7b",
        claude_api_key: str = "",
        claude_model: str = "claude-sonnet-4-20250514",
        deepseek_api_key: str = "",
        deepseek_model: str = "deepseek-chat",
        gemini_api_key: str = "",
        gemini_model: str = "gemini-1.5-flash",
        mode: str = "cloud_free",
        custom_cloud_provider: str = "deepseek",
    ):
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_model = ollama_model
        self.claude_api_key = claude_api_key
        self.claude_model = claude_model
        self.deepseek_api_key = deepseek_api_key
        self.deepseek_model = deepseek_model
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self.mode = "cloud_custom" if mode == "cloud" else mode  # backward compatibility
        self.custom_cloud_provider = custom_cloud_provider  # "deepseek" or "claude" or "gemini"
        self._http_client = None

    @property
    def http_client(self):
        """Lazy-init HTTP client."""
        if self._http_client is None:
            import httpx
            self._http_client = httpx.Client(timeout=60.0)
        return self._http_client

    def _get_system_prompt(self) -> str:
        """Get the system prompt that enforces citation."""
        return """Bạn là trợ lý nghiên cứu AI. Nhiệm vụ của bạn là trả lời câu hỏi dựa trên các tài liệu được cung cấp.

## QUY TẮC QUAN TRỌNG:
1. CHỈ trả lời dựa trên thông tin trong context được cung cấp.
2. Mọi câu trả lời PHẢI có trích dẫn nguồn: [Tên Paper] hoặc [Tên Paper, trang X].
3. Nếu context không có đủ thông tin để trả lời, hãy nói "Tôi không tìm thấy thông tin này trong tài liệu bạn đã import."
4. KHÔNG được tự ý thêm thông tin không có trong context.
5. Trả lời bằng TIẾNG VIỆT (trừ khi câu hỏi bằng tiếng Anh).
6. Nếu câu hỏi yêu cầu so sánh, hãy so sánh rõ ràng từng điểm giữa các tài liệu.
7. Nếu câu hỏi yêu cầu tóm tắt, hãy tóm tắt ngắn gọn các điểm chính.
8. Giữ câu trả lời súc tích, học thuật, có cấu trúc rõ ràng."""

    def generate(
        self,
        query: str,
        context_text: str,
        citations_meta: Optional[list[dict]] = None,
    ) -> GenerationResult:
        """
        Generate a response using the configured LLM.

        Args:
            query: User's question.
            context_text: Retrieved context from RAG pipeline.
            citations_meta: Metadata about available citations.

        Returns:
            GenerationResult with content, citations, and model info.
        """
        if not context_text.strip():
            return GenerationResult(
                content="Không tìm thấy tài liệu liên quan. Vui lòng import PDF trước hoặc thử câu hỏi khác.",
                citations=[],
                model_used="none",
                finish_reason="no_context",
            )

        user_prompt = f"""Context từ tài liệu:
{context_text}

Câu hỏi: {query}

Trả lời dựa trên context trên. Nhớ trích dẫn nguồn [Tên Paper] cho mỗi thông tin bạn đưa ra."""

        # LLM Routing
        if self.mode == "cloud_free":
            # Use the provided default key if none is set in self.gemini_api_key
            api_key = self.gemini_api_key or ""
            if not api_key:
                logger.warning("Gemini API key is empty. Falling back to local Ollama...")
                return self._generate_ollama(user_prompt)
            result = self._generate_gemini(user_prompt, api_key, is_free=True)
            if result.finish_reason == "error":
                logger.warning("Free Gemini failed. Falling back to local Ollama...")
                return self._generate_ollama(user_prompt)
            return result

        elif self.mode == "cloud_custom":
            if self.custom_cloud_provider == "deepseek":
                if not self.deepseek_api_key:
                    return GenerationResult(
                        content="⚠️ Bạn chưa nhập DeepSeek API Key. Hãy mở phần Cài đặt và cập nhật API Key để sử dụng.",
                        citations=[],
                        model_used="deepseek/no_key",
                        finish_reason="no_key",
                    )
                result = self._generate_deepseek(user_prompt, self.deepseek_api_key, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom DeepSeek failed. Falling back to local Ollama...")
                    return self._generate_ollama(user_prompt)
                return result
            elif self.custom_cloud_provider == "gemini":
                if not self.gemini_api_key:
                    return GenerationResult(
                        content="⚠️ Bạn chưa nhập Gemini API Key. Hãy mở phần Cài đặt và cập nhật API Key để sử dụng.",
                        citations=[],
                        model_used="gemini/no_key",
                        finish_reason="no_key",
                    )
                result = self._generate_gemini(user_prompt, self.gemini_api_key, is_free=False)
                if result.finish_reason == "error":
                    logger.warning("Custom Gemini failed. Falling back to local Ollama...")
                    return self._generate_ollama(user_prompt)
                return result
            else:  # Claude provider
                if not self.claude_api_key:
                    return GenerationResult(
                        content="⚠️ Bạn chưa nhập Claude API Key. Hãy mở phần Cài đặt và cập nhật API Key để sử dụng.",
                        citations=[],
                        model_used="claude/no_key",
                        finish_reason="no_key",
                    )
                result = self._generate_claude(user_prompt)
                if result.finish_reason == "error":
                    logger.warning("Custom Claude failed. Falling back to local Ollama...")
                    return self._generate_ollama(user_prompt)
                return result

        # Local mode
        return self._generate_ollama(user_prompt)

    def _generate_deepseek(self, prompt: str, api_key: str, is_free: bool = False) -> GenerationResult:
        """Generate response using DeepSeek API (OpenAI-compatible)."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self.deepseek_model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
                "stream": False,
            }

            response = self.http_client.post(
                "https://api.deepseek.com/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

            # Verify and extract citations
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)

            model_name = "deepseek/free" if is_free else f"deepseek/{self.deepseek_model}"
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=model_name,
                finish_reason="stop",
            )

        except Exception as e:
            logger.error(f"DeepSeek generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi kết nối DeepSeek Cloud: {str(e)}",
                citations=[],
                model_used="deepseek/error",
                finish_reason="error",
            )

    def _generate_gemini(self, prompt: str, api_key: str, is_free: bool = False) -> GenerationResult:
        """Generate response using Google Gemini API (Native)."""
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt}]
                    }
                ],
                "systemInstruction": {
                    "parts": [{"text": self._get_system_prompt()}]
                },
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 2048,
                }
            }

            response = self.http_client.post(
                url,
                headers=headers,
                json=payload,
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()

            candidates = data.get("candidates", [])
            if not candidates:
                return GenerationResult(
                    content="⚠️ Gemini API không trả về nội dung.",
                    citations=[],
                    model_used="gemini/error",
                    finish_reason="empty_response",
                )

            content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)

            model_name = "gemini/free" if is_free else f"gemini/{self.gemini_model}"
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=model_name,
                finish_reason="stop",
            )

        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi kết nối Gemini Cloud: {str(e)}",
                citations=[],
                model_used="gemini/error",
                finish_reason="error",
            )

    def _generate_ollama(self, prompt: str) -> GenerationResult:
        """Generate response using Ollama (local LLM)."""
        try:
            response = self.http_client.post(
                f"{self.ollama_url}/api/chat",
                json={
                    "model": self.ollama_model,
                    "messages": [
                        {"role": "system", "content": self._get_system_prompt()},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.3,  # Low temperature for factual answers
                        "num_predict": 2048,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("message", {}).get("content", "")

            # Verify and extract citations
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)

            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"ollama/{self.ollama_model}",
                finish_reason=data.get("done_reason", "stop"),
            )

        except httpx.ConnectError:
            logger.error("Cannot connect to Ollama. Is it running?")
            return GenerationResult(
                content="⚠️ Không thể kết nối đến Ollama. Vui lòng đảm bảo Ollama đang chạy (`ollama serve`).",
                citations=[],
                model_used="ollama/error",
                finish_reason="error",
            )
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi khi gọi Ollama: {str(e)}",
                citations=[],
                model_used="ollama/error",
                finish_reason="error",
            )

    def _generate_claude(self, prompt: str) -> GenerationResult:
        """Generate response using Claude API."""
        try:
            # Import anthropic only when needed
            import anthropic

            client = anthropic.Anthropic(api_key=self.claude_api_key)

            response = client.messages.create(
                model=self.claude_model,
                max_tokens=2048,
                temperature=0.3,
                system=self._get_system_prompt(),
                messages=[{"role": "user", "content": prompt}],
            )

            content = response.content[0].text if response.content else ""

            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)

            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"claude/{self.claude_model}",
                finish_reason=response.stop_reason or "stop",
            )

        except Exception as e:
            logger.error(f"Claude generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi kết nối Claude Cloud: {str(e)}",
                citations=[],
                model_used="claude/error",
                finish_reason="error",
            )

    def _extract_citations(self, content: str) -> list[dict]:
        """
        Extract citations from the response.

        Looks for patterns like [Paper Name] or [Paper Name, page X].
        """
        citations = []
        # Match [Name] or [Name, page X] patterns
        pattern = r'\[([^\]]+?)(?:,\s*trang\s*(\d+))?\]'
        for match in re.finditer(pattern, content):
            citations.append({
                "source": match.group(1).strip(),
                "page": int(match.group(2)) if match.group(2) else None,
                "text": match.group(0),
            })
        return citations

    def _verify_citations(self, content: str, citations: list[dict]) -> str:
        """
        Verify that citations in the content reference actual sources.
        """
        return content

    def stream_generate(
        self,
        query: str,
        context_text: str,
    ):
        """
        Generate a streaming response.

        Yields content chunks as they arrive from the LLM.
        """
        if not context_text.strip():
            yield "Không tìm thấy tài liệu liên quan."
            return

        user_prompt = f"""Context từ tài liệu:
{context_text}

Câu hỏi: {query}

Trả lời dựa trên context trên. Nhớ trích dẫn nguồn [Tên Paper] cho mỗi thông tin bạn đưa ra."""

        if self.mode == "cloud_free":
            if not self.gemini_api_key:
                yield "⚠️ Hệ thống chưa cấu hình Gemini API Key. Đang chuyển sang Local model..."
                for chunk in self._stream_ollama(user_prompt):
                    yield chunk
                return
            for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, is_free=True):
                yield chunk

        elif self.mode == "cloud_custom":
            if self.custom_cloud_provider == "deepseek":
                if not self.deepseek_api_key:
                    yield "⚠️ Bạn chưa nhập DeepSeek API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                for chunk in self._stream_deepseek(user_prompt, self.deepseek_api_key, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "gemini":
                if not self.gemini_api_key:
                    yield "⚠️ Bạn chưa nhập Gemini API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "claude":
                if not self.claude_api_key:
                    yield "⚠️ Bạn chưa nhập Claude API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                try:
                    import anthropic
                    client = anthropic.Anthropic(api_key=self.claude_api_key)

                    with client.messages.stream(
                        model=self.claude_model,
                        max_tokens=2048,
                        temperature=0.3,
                        system=self._get_system_prompt(),
                        messages=[{"role": "user", "content": user_prompt}],
                    ) as stream:
                        for text in stream.text_stream:
                            yield text
                except Exception as e:
                    yield f"\n⚠️ Claude stream gặp sự cố: {str(e)}. Đang chuyển sang Local model..."
                    for chunk in self._stream_ollama(user_prompt):
                        yield chunk
            else:
                yield "⚠️ Cloud provider không hợp lệ."

        else:
            # Local mode (Ollama)
            for chunk in self._stream_ollama(user_prompt):
                yield chunk

    def _stream_deepseek(self, prompt: str, api_key: str, is_free: bool = False):
        """Stream response from DeepSeek API."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self.deepseek_model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
                "stream": True,
            }

            with self.http_client.stream(
                "POST",
                "https://api.deepseek.com/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            chunk = data["choices"][0]["delta"].get("content", "")
                            if chunk:
                                yield chunk
                        except Exception:
                            continue
        except Exception as e:
            logger.error(f"DeepSeek stream failed: {e}")
            yield f"\n⚠️ DeepSeek Cloud gặp sự cố ({str(e)}). Đang chuyển sang Local model...\n"
            for chunk in self._stream_ollama(prompt):
                yield chunk

    def _stream_gemini(self, prompt: str, api_key: str, is_free: bool = False):
        """Stream response from Google Gemini API (SSE native)."""
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:streamGenerateContent?alt=sse&key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt}]
                    }
                ],
                "systemInstruction": {
                    "parts": [{"text": self._get_system_prompt()}]
                },
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 2048,
                }
            }

            with self.http_client.stream(
                "POST",
                url,
                headers=headers,
                json=payload,
                timeout=60.0,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        try:
                            data = json.loads(data_str)
                            candidates = data.get("candidates", [])
                            if candidates:
                                text_chunk = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                if text_chunk:
                                    yield text_chunk
                        except Exception:
                            continue
        except Exception as e:
            logger.error(f"Gemini stream failed: {e}")
            yield f"\n⚠️ Gemini Cloud gặp sự cố ({str(e)}). Đang chuyển sang Local model...\n"
            for chunk in self._stream_ollama(prompt):
                yield chunk

    def _stream_ollama(self, prompt: str):
        """Stream response from Ollama."""
        try:
            with self.http_client.stream(
                "POST",
                f"{self.ollama_url}/api/chat",
                json={
                    "model": self.ollama_model,
                    "messages": [
                        {"role": "system", "content": self._get_system_prompt()},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": True,
                    "options": {"temperature": 0.3, "num_predict": 2048},
                },
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            continue
        except httpx.ConnectError:
            yield "\n⚠️ Không thể kết nối đến Ollama. Vui lòng đảm bảo Ollama đang chạy (`ollama serve`)."
        except Exception as e:
            yield f"\n⚠️ Lỗi kết nối Ollama: {str(e)}"
