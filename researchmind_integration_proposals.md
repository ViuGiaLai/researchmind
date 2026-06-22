# 📦 Đề xuất Tích hợp & Cải tiến ResearchMind VN

> Phiên bản cập nhật sau khi nghiên cứu 8 GitHub repos mã nguồn mở.
> Đã triển khai: ModelScope Mirror (embedder.py), DeepSeek-R1 Thinking UI (generator.py + MarkdownRenderer.tsx)

---

## ✅ Đã triển khai xong

| Proposal | File | Trạng thái |
|---|---|---|
| ModelScope Fallback Mirror | `backend/ingestion/embedder.py:63-78` | ✅ Hoàn thành |
| DeepSeek-R1 Thinking UI (stream reasoning_content) | `backend/chat/generator.py:1072-1130` | ✅ Hoàn thành |
| DeepSeek-R1 Thinking Block (frontend) | `apps/desktop/src/components/chat/MarkdownRenderer.tsx:1-75` | ✅ Hoàn thành |

---

## 🧠 Đề xuất 1: Nâng cấp lên Qwen3 (Local CPU) + Thinking Mode

### Lý do
Dự án hiện dùng `Qwen3-4B-Q4_K_M.gguf` (settings.py:67). **Qwen3** đã ra mắt (04/2025, cập nhật 2507 vào 07/2025) với nhiều cải tiến vượt trội.

### Những gì Qwen3 mang lại
- **Thinking mode**: Qwen3-Thinking tự động sinh `<think>...</think>` giống DeepSeek-R1, tương thích hoàn toàn với ThinkingBlock UI đã có
- **Non-thinking mode**: Chuyển nhanh cho câu hỏi đơn giản, tiết kiệm token
- **MoE variants**: `Qwen3-30B-A3B` chỉ active 3B tham số mỗi token → chạy CPU được!
- **Tiếng Việt**: Hỗ trợ 100+ ngôn ngữ, tiếng Việt tốt hơn Qwen2.5
- **GGUF có sẵn**: llama.cpp support đầy đủ

### Cách tích hợp
```python
# settings.py - Đổi model mặc định
local_model: str = "Qwen3-4B-Q4_K_M.gguf"  # thay vì Qwen2.5-3B
# Hoặc: Qwen3-8B-Q4_K_M.gguf cho máy khá, Qwen3-30B-A3B-Q4_K_M.gguf cho MoE

# generator.py - Thêm enable_thinking vào prompt
# Khi gọi local model, thêm thinking mode cho Critique/Debate
full_prompt = "<think>\n" + self._apply_chat_template(sp, prompt)
```

### Llama.cpp CLI tối ưu cho Qwen3
```bash
./llama-server -hf Qwen/Qwen3-8B-GGUF:Q8_0 \
  --jinja --reasoning-format deepseek \
  -ngl 99 -fa -sm row \
  --temp 0.6 --top-k 20 --top-p 0.95 \
  -c 40960 -n 32768
```

### Files cần sửa
- `backend/config/settings.py` — Đổi local_model mặc định
- `backend/chat/generator.py` — Thêm `--reasoning-format deepseek` flag, xử lý `<think>` từ local
- `VERSION/VERSION_v0.5.md`, `VERSION_v0.6.md` — Cập nhật roadmap

### Ưu tiên: **P0** (dễ làm, impact lớn, tận dụng UI Thinking có sẵn)

---

## 📄 Đề xuất 2: Layout-Aware PDF Parsing (lấy từ RAGFlow deepdoc)

### Lý do
Parser hiện tại (`parser.py`) dùng PyMuPDF đọc text tuần tự → **vỡ hoàn toàn** với PDF 2 cột, bảng biểu, hình vẽ. RAGFlow deepdoc là giải pháp tốt nhất mã nguồn mở (Apache 2.0).

### Logic cần lấy từ RAGFlow

#### 2a. Layout Detection (YOLOv10 ONNX)
```python
# Lấy từ deepdoc/vision/layout_recognizer.py
# Phát hiện 10 loại vùng: Text, Title, Figure, Table, Header, Footer, Reference, Equation
labels = ["_background_", "Text", "Title", "Figure", "Figure caption",
          "Table", "Table caption", "Header", "Footer", "Reference", "Equation"]

# Model layout.onnx tự động tải về, chạy ONNX Runtime
```

#### 2b. Multi-Column Detection (K-Means + Silhouette)
```python
# Lấy từ deepdoc/parser/pdf_parser.py:_assign_column()
# 1. Gom x0 của các text boxes
# 2. K-Means với k=1..4, chọn k tối ưu bằng Silhouette Score
# 3. Global column count = majority vote across pages
# 4. Gán col_id cho mỗi box → đọc theo cột trước, hết cột 1 mới sang cột 2
```

#### 2c. Table Structure Recognition
```python
# Lấy từ deepdoc/vision/table_structure_recognizer.py
# Model tsr.onnx phát hiện: table, table column, table row, table column header
# Hàm construct_table() → output HTML table hoặc natural language
```

### Cách tích hợp (không cần copy toàn bộ)
```bash
pip install onnxruntime opencv-python scikit-learn xgboost huggingface_hub
```

Tạo file mới `backend/ingestion/layout_parser.py`:
```python
class LayoutParser:
    def __init__(self):
        from deepdoc.vision import LayoutRecognizer
        self.layout_recognizer = LayoutRecognizer("layout")  # auto-downloads model

    def parse_page(self, image: np.ndarray):
        # Returns [(box, label, text)] with layout type
        ...
```

**Không copy code**, import thư viện RAGFlow qua pip.

### Files cần tạo/sửa
- `backend/ingestion/layout_parser.py` — MỚI: Layout-aware parser
- `backend/ingestion/parser.py` — Tích hợp `_extract_pdf` gọi LayoutParser nếu text quá ngắn hoặc có ít text/page

### Ưu tiên: **P1** (impact lớn, effort trung bình)

---

## 🖼️ Đề xuất 3: Vision-RAG với InternVL (đọc figure/table)

### Lý do
95% phát kiến khoa học nằm ở hình vẽ, đồ thị, bảng số liệu. Parser hiện tại bỏ qua hoàn toàn.

### Cách tích hợp
```python
# Dùng InternVL2.5-1B hoặc 4B (đủ nhẹ, MIT license)
from transformers import AutoModel, AutoTokenizer

model = AutoModel.from_pretrained(
    "OpenGVLab/InternVL2_5-1B",
    torch_dtype="bfloat16",
    trust_remote_code=True,
).eval()

# Hỏi về nội dung hình vẽ
response = model.chat(tokenizer, image, question="Figure này nói về gì?")
```

### Luồng xử lý
1. Layout Parser (Đề xuất 2) phát hiện vùng `Figure` + `Figure caption`
2. Crop ảnh từ PDF page
3. Lưu `{paper_id}_figure_{n}.png` + caption text
4. Khi user hỏi *"Hình 3 trong paper này nói gì?"* → InternVL trả lời

### Files cần tạo/sửa
- `backend/ingestion/vision_rag.py` — MỚI: Figure extractor + captioner
- `backend/routers/papers.py` — Thêm endpoint `/api/papers/{id}/figures`
- `apps/desktop/src/components/...` — UI hiển thị hình trong chat

### Ưu tiên: **P1** (tính năng khác biệt, độc đáo cho ResearchMind)

---

## 🎤 Đề xuất 4: Audio Abstract với CosyVoice (TTS) + SenseVoice (STT)

### Lý do
Researcher muốn nghe tóm tắt paper khi lái xe/chạy bộ. Ghi âm ý tưởng nhanh hơn gõ bàn phím.

### Cách tích hợp
```python
# CosyVoice - TTS (Apache 2.0)
from cosyvoice.cli.cosyvoice import CosyVoice
cosyvoice = CosyVoice('pretrained_models/CosyVoice-300M')
for i, j in enumerate(cosyvoice.inference_sft("Tóm tắt...", "default")):
    torchaudio.save(f"output_{i}.wav", j['tts_speech'], 22050)

# SenseVoice - STT (Apache 2.0)
from funasr import AutoModel
model = AutoModel(model="iic/SenseVoiceSmall")
result = model.generate(input="voice.wav", language="vi")
```

### Files cần tạo/sửa
- `backend/routers/audio.py` — MỚI: Endpoint TTS/STT
- `apps/desktop/src/components/audio/` — MỚI: Record button, audio player

### Ưu tiên: **P2** (nice-to-have)

---

## ⚡ Đề xuất 5: Tối ưu Generator - thêm NVIDIA DeepSeek V4 + Qwen3 clone cho cloud_free chain

### Lý do
Generator hiện có chain `Groq → NVIDIA Kimi → NVIDIA DeepSeek → Gemini → local`. DeepSeek-V4-Pro là model mạnh nhất từ NVIDIA; Qwen3 cũng có API endpoint.

### Cách sửa
```python
# settings.py
nvidia_deepseek_model: str = "deepseek-ai/deepseek-v4-pro"  # đã có
# Thêm: nvidia_qwen_model: str = "qwen/qwen3-235b-a22b"

# generator.py - _stream_chain()
# Thêm Qwen3 vào chain sau DeepSeek
if self.nvidia_qwen_api_key:
    ...
```

### Ưu tiên: **P2**

---

## 🔄 Đề xuất 6: Thêm DeepSeek-R1 Distill models cho local mode

### Lý do
Dự án đã có code xử lý `reasoning_content` từ DeepSeek API. Có thể chạy **local** với R1-Distill models qua llama-server.

### Các model có sẵn (MIT license)
| Model | Params | Yêu cầu RAM |
|---|---|---|
| DeepSeek-R1-Distill-Qwen-1.5B | 1.5B | ~4GB |
| DeepSeek-R1-Distill-Qwen-7B | 7B | ~8GB |
| DeepSeek-R1-Distill-Qwen-14B | 14B | ~16GB |
| DeepSeek-R1-Distill-Qwen-32B | 32B | ~24GB |

### Cách tích hợp
```python
# settings.py - Thêm option
local_reasoning_model: str = "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf"

# generator.py - _generate_local()
# Nếu là reasoning model, prompt có thêm <think> enforce:
full_prompt = "<think>\n" + self._apply_chat_template(sp, prompt)
```

### Files cần sửa
- `backend/config/settings.py` — Thêm setting local_reasoning_model
- `backend/chat/generator.py` — Phân biệt local vs reasoning model ở `_generate_local` và `_stream_local`

### Ưu tiên: **P1** (tận dụng code Thinking UI có sẵn)

---

## 📋 Tổng quan lộ trình triển khai

| Thứ tự | Đề xuất | Độ khó | Impact | Dependency |
|---|---|---|---|---|
| 1 | **Qwen3** (local + thinking) | Dễ | 🔥🔥🔥🔥 | Không |
| 2 | **DeepSeek-R1 Distill local** | Dễ | 🔥🔥🔥🔥 | Đề xuất 1 |
| 3 | **Layout PDF Parsing** (RAGFlow deepdoc) | Trung bình | 🔥🔥🔥🔥🔥 | Không |
| 4 | **Vision-RAG** (InternVL) | Trung bình | 🔥🔥🔥 | Đề xuất 3 |
| 5 | **Audio** (CosyVoice/SenseVoice) | Khó | 🔥🔥 | Không |
| 6 | **NVIDIA Qwen3 trong chain** | Dễ | 🔥🔥 | Không |

### Khuyến nghị: Làm theo thứ tự 1 → 2 → 3
- **1 (Qwen3)**: 1-2h, impact tức thì, tận dụng code thinking có sẵn
- **2 (R1 Distill)**: 1-2h thêm, cho user có GPU chạy reasoning local
- **3 (Layout PDF)**: ~1 tuần, thay đổi lớn nhất về chất lượng RAG
