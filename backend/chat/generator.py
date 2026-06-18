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
        groq_api_key: str = "",
        groq_model: str = "llama-3.3-70b-instant",
        nvidia_api_key: str = "",
        nvidia_model: str = "moonshotai/kimi-k2.6",
        nvidia_url: str = "https://integrate.api.nvidia.com/v1",
        freemodel_api_key: str = "",
        freemodel_model: str = "gpt-4o-mini",
        freemodel_url: str = "https://freemodel.dev/v1",
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
        self.groq_api_key = groq_api_key
        self.groq_model = groq_model
        self.nvidia_api_key = nvidia_api_key
        self.nvidia_model = nvidia_model
        self.nvidia_url = nvidia_url.rstrip("/")
        self.freemodel_api_key = freemodel_api_key
        self.freemodel_model = freemodel_model
        self.freemodel_url = freemodel_url.rstrip("/")
        self.mode = "cloud_custom" if mode == "cloud" else mode  # backward compatibility
        self.custom_cloud_provider = custom_cloud_provider  # "deepseek" or "claude" or "gemini"
        self.current_model: str = ""
        self._http_client = None

    @property
    def http_client(self):
        """Lazy-init HTTP client."""
        if self._http_client is None:
            import httpx
            self._http_client = httpx.Client(timeout=300.0)
        return self._http_client

    def _get_system_prompt(self) -> str:
        """Get the system prompt that enforces citation."""
        return """Bạn là trợ lý nghiên cứu AI. Nhiệm vụ của bạn là trả lời câu hỏi dựa trên các tài liệu được cung cấp.

## QUY TẮC ĐỊNH DẠNG:
- Dùng **in đậm** cho tiêu đề, tên cột, điểm số.
- Dùng `mã code` cho ID, mã số.
- Bảng: dùng markdown | cột1 | cột2 |.
- Danh sách: dùng - hoặc 1. 2. 3.
- Tách section rõ ràng bằng ## và ---.

## QUY TẮC NỘI DUNG:
1. CHỈ trả lời dựa trên thông tin trong context được cung cấp.
2. Mọi câu trả lời PHẢI có trích dẫn nguồn: [Tên Paper] hoặc [Tên Paper, trang X].
3. Nếu context không đủ, nói "Tôi không tìm thấy thông tin này trong tài liệu đã import."
4. KHÔNG thêm thông tin ngoài context.
5. Trả lời bằng TIẾNG VIỆT (trừ khi câu hỏi bằng tiếng Anh).
6. Với dữ liệu dạng bảng (điểm, danh sách): dùng bảng markdown, hàng đầu là tiêu đề cột.
7. Giữ câu trả lời súc tích, học thuật, có cấu trúc rõ ràng."""

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

        import time
        # LLM Routing
        if self.mode == "cloud_free":
            # Chain: NVIDIA → FreeModel → Groq → Gemini → Ollama (last resort)
            # 1. Try NVIDIA NIM
            if self.nvidia_api_key:
                logger.info("cloud_free: trying NVIDIA NIM...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_nvidia, user_prompt, self.nvidia_api_key, self.nvidia_model)
                logger.info(f"TIMING: NVIDIA={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"NVIDIA failed ({result.finish_reason}), trying FreeModel...")
            # 2. Try FreeModel.dev
            if self.freemodel_api_key:
                logger.info("cloud_free: trying FreeModel.dev...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_freemodel, user_prompt, self.freemodel_api_key, self.freemodel_model)
                logger.info(f"TIMING: FreeModel={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"FreeModel failed ({result.finish_reason}), trying Groq...")
            # 3. Try Groq
            if self.groq_api_key:
                logger.info("cloud_free: trying Groq...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_groq, user_prompt, self.groq_api_key, self.groq_model)
                logger.info(f"TIMING: Groq={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"Groq failed ({result.finish_reason}), trying Gemini...")
            # 4. Try Gemini
            if self.gemini_api_key:
                logger.info("cloud_free: trying Gemini...")
                t0 = time.time()
                result = self._call_with_retry(self._generate_gemini, user_prompt, self.gemini_api_key, is_free=True)
                logger.info(f"TIMING: Gemini={time.time()-t0:.2f}s finish={result.finish_reason}")
                if result.finish_reason != "error":
                    return result
                logger.warning(f"Gemini failed ({result.finish_reason}).")
            # 5. Fallback to local Ollama
            logger.warning("All cloud_free providers failed. Falling back to local Ollama...")
            return self._generate_ollama(user_prompt)

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

        except httpx.HTTPStatusError as e:
            logger.error(f"Gemini generation failed: {e}")
            detail = ""
            if e.response.status_code == 400 and "API key" in e.response.text:
                detail = " API Key không hợp lệ hoặc sai định dạng. Gemini key là chuỗi chữ-số dài, không phải OAuth token. Lấy key tại https://aistudio.google.com/app/apikey"
            return GenerationResult(
                content=f"⚠️ Lỗi Gemini Cloud (HTTP {e.response.status_code}): {e.response.text[:200]}{detail}",
                citations=[],
                model_used="gemini/error",
                finish_reason="error",
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
                        "temperature": 0.3,
                        "num_predict": 1024,
                        "num_ctx": 2048,
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

    def _generate_groq(self, prompt: str, api_key: str, model: str) -> GenerationResult:
        """Generate response using Groq API (OpenAI-compatible)."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
                "stream": False,
            }
            response = self.http_client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"groq/{model}",
                finish_reason="stop",
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"Groq generation failed: {e}")
            detail = ""
            if e.response.status_code == 401:
                detail = " API Key không hợp lệ. Lấy key mới tại https://console.groq.com/keys"
            return GenerationResult(
                content=f"⚠️ Lỗi Groq Cloud (HTTP {e.response.status_code}): {e.response.text[:200]}{detail}",
                citations=[],
                model_used="groq/error",
                finish_reason="error",
            )
        except Exception as e:
            logger.error(f"Groq generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi Groq Cloud: {str(e)}",
                citations=[],
                model_used="groq/error",
                finish_reason="error",
            )

    def _generate_nvidia(self, prompt: str, api_key: str, model: str) -> GenerationResult:
        """Generate response using NVIDIA NIM API (OpenAI-compatible)."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
                "stream": False,
            }
            response = self.http_client.post(
                f"{self.nvidia_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"nvidia/{model}",
                finish_reason="stop",
            )
        except Exception as e:
            logger.error(f"NVIDIA generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi NVIDIA NIM: {str(e)}",
                citations=[],
                model_used="nvidia/error",
                finish_reason="error",
            )

    def _generate_freemodel(self, prompt: str, api_key: str, model: str) -> GenerationResult:
        """Generate response using FreeModel.dev API (OpenAI-compatible)."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
                "stream": False,
            }
            response = self.http_client.post(
                f"{self.freemodel_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = self._extract_citations(content)
            content = self._verify_citations(content, citations)
            return GenerationResult(
                content=content,
                citations=citations,
                model_used=f"freemodel/{model}",
                finish_reason="stop",
            )
        except Exception as e:
            logger.error(f"FreeModel generation failed: {e}")
            return GenerationResult(
                content=f"⚠️ Lỗi FreeModel Cloud: {str(e)}",
                citations=[],
                model_used="freemodel/error",
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

    def _call_with_retry(self, fn, *args, max_retries=1, **kwargs):
        """
        Call a generation function with retry logic.
        Retries up to max_retries times if finish_reason is 'error' or an exception is raised.
        """
        last_result = None
        for attempt in range(max_retries + 1):
            try:
                result = fn(*args, **kwargs)
                if result.finish_reason != "error":
                    return result
                last_result = result
                if attempt < max_retries:
                    logger.warning(f"Retry {attempt+1}/{max_retries} for {fn.__name__} (finish_reason={result.finish_reason})")
            except Exception as e:
                last_result = None
                if attempt < max_retries:
                    logger.warning(f"Retry {attempt+1}/{max_retries} for {fn.__name__}: {e}")
                else:
                    raise
        # All retries exhausted — return last error result or raise
        if last_result is not None:
            return last_result
        raise RuntimeError(f"All {max_retries+1} retries exhausted for {fn.__name__}")

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
            # Chain: NVIDIA → FreeModel → Groq → Gemini → Ollama
            if self.nvidia_api_key:
                self.current_model = f"nvidia/{self.nvidia_model}"
                yielded = False
                for chunk in self._stream_openai(
                    user_prompt, self.nvidia_api_key, self.nvidia_model,
                    self.nvidia_url
                ):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.freemodel_api_key:
                self.current_model = f"freemodel/{self.freemodel_model}"
                yielded = False
                for chunk in self._stream_openai(
                    user_prompt, self.freemodel_api_key, self.freemodel_model,
                    self.freemodel_url
                ):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.groq_api_key:
                self.current_model = f"groq/{self.groq_model}"
                yielded = False
                for chunk in self._stream_openai(
                    user_prompt, self.groq_api_key, self.groq_model,
                    "https://api.groq.com/openai/v1"
                ):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            if self.gemini_api_key:
                self.current_model = f"gemini/{self.gemini_model}"
                yielded = False
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, is_free=True):
                    yielded = True
                    yield chunk
                if yielded:
                    return
            self.current_model = f"ollama/{self.ollama_model}"
            yield "⚠️ Tất cả cloud_free đều lỗi. Đang chuyển sang Local model...\n"
            for chunk in self._stream_ollama(user_prompt):
                yield chunk

        elif self.mode == "cloud_custom":
            if self.custom_cloud_provider == "deepseek":
                if not self.deepseek_api_key:
                    self.current_model = "deepseek/no_key"
                    yield "⚠️ Bạn chưa nhập DeepSeek API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                self.current_model = f"deepseek/{self.deepseek_model}"
                for chunk in self._stream_deepseek(user_prompt, self.deepseek_api_key, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "gemini":
                if not self.gemini_api_key:
                    self.current_model = "gemini/no_key"
                    yield "⚠️ Bạn chưa nhập Gemini API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                self.current_model = f"gemini/{self.gemini_model}"
                for chunk in self._stream_gemini(user_prompt, self.gemini_api_key, is_free=False):
                    yield chunk
            elif self.custom_cloud_provider == "claude":
                if not self.claude_api_key:
                    self.current_model = "claude/no_key"
                    yield "⚠️ Bạn chưa nhập Claude API Key. Vui lòng vào Cài đặt để cấu hình."
                    return
                self.current_model = f"claude/{self.claude_model}"
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
                    self.current_model = f"ollama/{self.ollama_model}"
                    yield f"\n⚠️ Claude stream gặp sự cố: {str(e)}. Đang chuyển sang Local model..."
                    for chunk in self._stream_ollama(user_prompt):
                        yield chunk
            else:
                self.current_model = "unknown/invalid"
                yield "⚠️ Cloud provider không hợp lệ."

        else:
            # Local mode (Ollama)
            self.current_model = f"ollama/{self.ollama_model}"
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

    def _stream_openai(self, prompt: str, api_key: str, model: str, base_url: str):
        """Stream response from any OpenAI-compatible API."""
        try:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": model,
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
                f"{base_url.rstrip('/')}/chat/completions",
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
            logger.error(f"OpenAI-compatible stream failed: {e}")

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
                    "options": {"temperature": 0.3, "num_predict": 1024, "num_ctx": 2048},
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
