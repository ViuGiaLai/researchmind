import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Matches the Rust ChatMessage struct. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  context_files?: string[] | null;
  created_at?: string | null;
}

/** Matches the Rust ChatResponse struct. */
interface ChatResponse {
  message: string;
  context_files: string[];
  processing_time_ms: number;
}

/** Hook for AI chat with context-aware search. */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep ref in sync
  messagesRef.current = messages;

  /** Load chat history from backend. */
  const loadHistory = useCallback(async () => {
    try {
      const history = await invoke<ChatMessage[]>("get_chat_history");
      setMessages(history);
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }, []);

  /** Send a message to the AI. */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await invoke<ChatResponse>("chat", {
        message: text,
        searchFirst: true,
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.message,
        context_files: response.context_files,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const errMsg = typeof e === "string" ? e : "Có lỗi xảy ra khi kết nối với AI.";
      setError(errMsg);

      // Add error as assistant message
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `❌ ${errMsg}\n\n> 💡 Cách khắc phục:\n> 1. Mở terminal và chạy: \`ollama serve\`\n> 2. Kiểm tra kết nối: \`ollama list\`\n> 3. Nếu chưa cài: https://ollama.com/download`,
        context_files: ["ollama_error"],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Clear all messages. */
  const clearMessages = useCallback(async () => {
    try {
      await invoke("clear_chat_history");
    } catch (e) {
      console.error("Failed to clear chat history:", e);
    }
    setMessages([]);
    setError(null);
  }, []);

  /** Retry the last user message (if there was an error). */
  const retryLastMessage = useCallback(async () => {
    const msgs = messagesRef.current;
    const lastUserIdx = msgs
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === "user")
      .pop()?.i;

    if (lastUserIdx === undefined) return;

    const lastUserMsg = msgs[lastUserIdx];
    // Remove the last assistant message (the error one) and retry
    setMessages((prev) => prev.slice(0, lastUserIdx));
    await sendMessage(lastUserMsg.content);
  }, [sendMessage]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    retryLastMessage,
    loadHistory,
  };
}
