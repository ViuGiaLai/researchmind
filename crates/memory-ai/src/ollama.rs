use log::error;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// Client for communicating with a local Ollama instance.
pub struct OllamaClient {
    client: Client,
    base_url: String,
    model: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: Message,
}

#[derive(Debug, Serialize)]
struct EmbedRequest {
    model: String,
    input: String,
}

#[derive(Debug, Deserialize)]
struct EmbedResponse {
    embedding: Vec<f64>,
}

impl OllamaClient {
    pub fn new(base_url: &str, model: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.to_string(),
            model: model.to_string(),
        }
    }

    /// Send a chat message and get a response.
    pub async fn chat(&self, system_prompt: &str, user_message: &str) -> Result<String, String> {
        let url = format!("{}/api/chat", self.base_url);

        let request = ChatRequest {
            model: self.model.clone(),
            messages: vec![
                Message {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                Message {
                    role: "user".to_string(),
                    content: user_message.to_string(),
                },
            ],
            stream: false,
        };

        match self.client.post(&url).json(&request).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<ChatResponse>().await {
                        Ok(chat_resp) => Ok(chat_resp.message.content),
                        Err(e) => {
                            error!("Failed to parse Ollama response: {}", e);
                            Err(format!("Failed to parse response: {}", e))
                        }
                    }
                } else {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    error!("Ollama API error: {} - {}", status, body);
                    Err(format!("Ollama API error: {} - {}", status, body))
                }
            }
            Err(e) => {
                error!("Failed to connect to Ollama: {}", e);
                Err(format!(
                    "Cannot connect to Ollama at {}. Is Ollama running?",
                    self.base_url
                ))
            }
        }
    }

    /// Generate an embedding vector for the given text.
    pub async fn embed(&self, text: &str) -> Result<Vec<f64>, String> {
        let url = format!("{}/api/embeddings", self.base_url);

        let request = EmbedRequest {
            model: self.model.clone(),
            input: text.to_string(),
        };

        match self.client.post(&url).json(&request).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    match response.json::<EmbedResponse>().await {
                        Ok(embed_resp) => Ok(embed_resp.embedding),
                        Err(e) => {
                            error!("Failed to parse embedding response: {}", e);
                            Err(format!("Failed to parse embedding: {}", e))
                        }
                    }
                } else {
                    let status = response.status();
                    Err(format!("Embedding API error: {}", status))
                }
            }
            Err(e) => {
                error!("Failed to connect to Ollama for embedding: {}", e);
                Err(format!("Cannot connect to Ollama: {}", e))
            }
        }
    }

    /// Check if Ollama is running and the model is available.
    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/api/tags", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
