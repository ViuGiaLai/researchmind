import React, { useState, useRef, useEffect } from "react";
import { api, ChatResponse } from "../../lib/api";
import {
  IconBrain,
  IconUser,
  IconTrash,
  IconSend,
  IconSpinner,
  IconBulb,
  IconFileText,
} from "../Icons";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: { source: string; page: number | null; text: string }[];
  model_used?: string;
}

export const ChatView: React.FC<{ initialPaperIds?: string[] }> = ({ initialPaperIds }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paperIds] = useState<string[]>(initialPaperIds || []);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res: ChatResponse = await api.chat(text, paperIds.length > 0 ? paperIds : undefined);
      const assistantMsg: Message = {
        role: "assistant",
        content: res.answer,
        citations: res.citations,
        model_used: res.model_used,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const errMsg: Message = {
        role: "assistant",
        content: `❌ Lỗi: ${e instanceof Error ? e.message : "Không thể kết nối đến backend"}\n\n> 💡 Đảm bảo FastAPI backend đang chạy: \`cd backend && uvicorn main:app --reload --port 8765\``,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const suggestedQuestions = [
    "Tóm tắt các paper trong thư viện",
    "So sánh phương pháp trong các paper đã chọn",
    "Những xu hướng nghiên cứu chính trong các paper này?",
  ];

  const formatContent = (text: string) => {
    return text.split("\n").map((line, i) => (
      <React.Fragment key={i}>
        {i > 0 && <br />}
        {line}
      </React.Fragment>
    ));
  };

  return (
    <div className="chat-view">
      <div className="chat-view-header">
        <h2 className="chat-view-title">
          <IconBrain size={22} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 8 }} />
          Chat với Paper
        </h2>
        <div className="chat-view-header-actions">
          {paperIds.length > 0 && (
            <span className="chat-view-papers-badge">
              <IconFileText size={14} /> {paperIds.length} papers
            </span>
          )}
          {messages.length > 0 && (
            <button className="chat-view-clear-btn" onClick={clearChat}>
              <IconTrash size={16} /> Xoá
            </button>
          )}
        </div>
      </div>

      <div className="chat-view-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-view-empty">
            <IconBrain size={56} className="icon-gradient" />
            <h3>Hỏi về research của bạn</h3>
            <p>Chọn paper trong thư viện hoặc hỏi tất cả. AI sẽ trả lời có trích dẫn nguồn.</p>
            <div className="chat-view-suggestions">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  className="chat-view-suggestion-btn"
                  onClick={() => {
                    setInput(q);
                  }}
                >
                  <IconBulb size={14} style={{ marginRight: 4 }} />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-view-msg ${msg.role === "user" ? "msg-user" : "msg-assistant"}`}>
            <div className="chat-view-avatar">
              {msg.role === "user" ? <IconUser size={18} /> : <IconBrain size={18} />}
            </div>
            <div className="chat-view-bubble">
              <div className="chat-view-text">{formatContent(msg.content)}</div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="chat-view-citations">
                  <strong>📚 Nguồn:</strong>
                  {msg.citations.map((c, j) => (
                    <span key={j} className="chat-view-citation">
                      [{c.source}]{c.page ? ` (trang ${c.page})` : ""}
                    </span>
                  ))}
                </div>
              )}
              {msg.model_used && (
                <div className="chat-view-model">🤖 {msg.model_used}</div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-view-msg msg-assistant">
            <div className="chat-view-avatar"><IconBrain size={18} /></div>
            <div className="chat-view-bubble">
              <div className="chat-typing">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-view-input">
        <textarea
          className="chat-view-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Hỏi về research của bạn..."
          rows={2}
          disabled={loading}
        />
        <button
          className="chat-view-send-btn"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? <IconSpinner size={20} /> : <IconSend size={20} />}
        </button>
      </div>
    </div>
  );
};
