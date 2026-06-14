import React from "react";
import { IconBrain, IconUser, IconClip } from "../Icons";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  contextFiles?: string[] | null;
  isLoading?: boolean;
}

/** Formats message content: converts **bold** markers, handles URLs, line breaks. */
const formatMessage = (text: string): React.ReactNode[] => {
  // Split by **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    // Split by newlines
    return part.split("\n").map((line, j) => (
      <React.Fragment key={`${i}-${j}`}>
        {j > 0 && <br />}
        {line}
      </React.Fragment>
    ));
  });
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  contextFiles,
  isLoading,
}) => {
  const isUser = role === "user";

  return (
    <div className={`chat-msg ${isUser ? "chat-msg-user" : "chat-msg-assistant"}`}>
      <div className="chat-msg-avatar">
        {isUser ? <IconUser size={18} /> : <IconBrain size={18} />}
      </div>
      <div className="chat-msg-content">
        <div className="chat-msg-bubble">
          {isLoading ? (
            <div className="chat-typing">
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
            </div>
          ) : (
            <div className="chat-msg-text">{formatMessage(content)}</div>
          )}
        </div>

        {contextFiles && contextFiles.length > 0 && (
          <div className="chat-msg-context">
            <IconClip size={12} className="chat-msg-context-label" />
            <span>Đã tham khảo:</span>
            {contextFiles.map((f, i) => (
              <span key={i} className="chat-msg-context-file" title={f}>
                {f.split(/[\\/]/).pop() || f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
