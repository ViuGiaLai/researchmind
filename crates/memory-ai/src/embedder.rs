use crate::ollama::OllamaClient;
use log::error;

/// Generates vector embeddings for text chunks using a local model.
pub struct Embedder {
    client: OllamaClient,
}

impl Embedder {
    pub fn new(client: OllamaClient) -> Self {
        Self { client }
    }

    /// Generate an embedding vector for a text chunk.
    /// Falls back synchronously via tokio runtime if needed.
    pub fn embed(&self, text: &str) -> Result<Vec<f64>, String> {
        let text = text.to_string();
        let client_ref = &self.client;

        let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
        rt.block_on(async { client_ref.embed(&text).await })
    }

    /// Compute cosine similarity between two vectors.
    pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
        if a.len() != b.len() {
            return 0.0;
        }

        let dot: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
        let norm_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();

        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot / (norm_a * norm_b)
        }
    }
}
