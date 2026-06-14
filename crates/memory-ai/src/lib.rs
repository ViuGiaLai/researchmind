pub mod ollama;
pub mod nlp;
pub mod embedder;
pub mod chat;

use serde::{Deserialize, Serialize};

/// A chat message in the conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,  // "user" or "assistant"
    pub content: String,
    pub context_files: Option<Vec<String>>,
    pub created_at: Option<String>,
}

/// Response from the AI chat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: String,
    pub context_files: Vec<String>,
    pub processing_time_ms: u64,
}

/// Parsed intent from natural language query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedQuery {
    pub keywords: Vec<String>,
    pub file_type: Option<String>,
    pub date_range: Option<(String, String)>,
    pub folder: Option<String>,
    pub intent: QueryIntent,
}

/// The type of intent detected from natural language.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum QueryIntent {
    Search,
    Summarize,
    Chat,
    Timeline,
    Graph,
    Unknown,
}
