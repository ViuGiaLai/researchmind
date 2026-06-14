import React, { useEffect, useRef } from "react";
import { IconBrain, IconTrash, IconRefresh, IconFileText, IconDocker, IconClock } from "../Icons";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage as ChatMessageType } from "../../hooks/useChat";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  onRetry: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSend,
  onClear,
  onRetry,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <h2 className="chat-header-title"><IconBrain size={22} className="icon-gradient" style={{ verticalAlign: "middle", marginRight: 6 }} /> Hỏi AI</h2>
          <span className="chat-header-desc">
            {messages.length > 0
              ? `${messages.length} tin nhắn`
              : "Hỏi về dữ liệu đã index"}
          </span>
        </div>
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button className="chat-header-btn" onClick={onClear} title="Xóa lịch sử">
              <IconTrash size={16} />
            </button>
          )}
          {messages.filter((m) => m.content.includes("❌")).length > 0 && (
            <button className="chat-header-btn" onClick={onRetry} title="Thử lại">
              <IconRefresh size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon"><IconBrain size={56} className="icon-gradient" /></div>
            <h3>MemoryOS AI</h3>
            <p>
              Hỏi tôi bất kỳ điều gì về dữ liệu trên máy tính của bạn.
              <br />
              Tôi sẽ tìm kiếm và phân tích để trả lời.
            </p>
            <div className="chat-suggestions">
              <button
                className="chat-suggestion-btn"
                onClick={() => onSend("Tóm tắt những file PDF trong thư mục Documents")}
              >
                <IconFileText size={16} style={{ marginRight: 6 }} /> Tóm tắt PDF
              </button>
              <button
                className="chat-suggestion-btn"
                onClick={() => onSend("Tìm file về Docker")}
              >
                <IconDocker size={16} style={{ marginRight: 6 }} /> Tìm về Docker
              </button>
              <button
                className="chat-suggestion-btn"
                onClick={() => onSend("Có file nào mới sửa gần đây không?")}
              >
                <IconClock size={16} style={{ marginRight: 6 }} /> File mới nhất
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role}
            content={msg.content}
            contextFiles={msg.context_files}
            isLoading={isLoading && i === messages.length - 1 && msg.role === "user"}
          />
        ))}
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} disabled={isLoading} />
    </div>
  );
};
