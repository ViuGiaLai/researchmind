use crate::ollama::OllamaClient;
use crate::{ChatMessage, ChatResponse};
use log::info;
use std::time::Instant;

/// Manages AI chat conversations with context from indexed files.
pub struct ChatManager {
    client: OllamaClient,
    system_prompt: String,
    history: Vec<ChatMessage>,
    max_history: usize,
}

impl ChatManager {
    pub fn new(client: OllamaClient) -> Self {
        let system_prompt = String::from(
            "Bạn là MemoryOS, một trợ lý trí nhớ cá nhân. \
             Bạn giúp người dùng tìm kiếm và phân tích dữ liệu trên máy tính của họ. \
             Trả lời bằng tiếng Việt, ngắn gọn, chính xác. \
             Khi tìm thấy file, hãy hiển thị tên file và đường dẫn. \
             Nếu không chắc chắn, hãy nói không tìm thấy."
        );

        Self {
            client,
            system_prompt,
            history: Vec::new(),
            max_history: 20,
        }
    }

    /// Send a message and get a response with context from search results.
    pub async fn chat_with_context(
        &mut self,
        user_message: &str,
        context: &str,
    ) -> Result<ChatResponse, String> {
        let start = Instant::now();

        // Build the full prompt with context
        let full_message = if context.is_empty() {
            user_message.to_string()
        } else {
            format!(
                "{}\n\nDữ liệu liên quan từ máy tính:\n{}",
                user_message, context
            )
        };

        // Get response from AI
        let response = self
            .client
            .chat(&self.system_prompt, &full_message)
            .await?;

        // Store in history
        self.history.push(ChatMessage {
            role: "user".to_string(),
            content: user_message.to_string(),
            context_files: None,
            created_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        });

        self.history.push(ChatMessage {
            role: "assistant".to_string(),
            content: response.clone(),
            context_files: None,
            created_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        });

        // Trim history
        if self.history.len() > self.max_history {
            self.history.remove(0);
            self.history.remove(0);
        }

        let elapsed = start.elapsed().as_millis() as u64;
        info!("Chat response generated in {}ms", elapsed);

        Ok(ChatResponse {
            message: response,
            context_files: Vec::new(),
            processing_time_ms: elapsed,
        })
    }

    /// Get chat history.
    pub fn get_history(&self) -> &[ChatMessage] {
        &self.history
    }

    /// Clear chat history.
    pub fn clear_history(&mut self) {
        self.history.clear();
    }
}
