/// Configuration for the search engine.
#[derive(Debug, Clone)]
pub struct SearchConfig {
    /// Default number of results to return.
    pub default_limit: u32,
    /// Maximum number of results.
    pub max_limit: u32,
    /// BM25 weight when combining with vector scores.
    pub bm25_weight: f64,
    /// Vector search weight when combining with BM25 scores.
    pub vector_weight: f64,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            default_limit: 20,
            max_limit: 100,
            bm25_weight: 0.4,
            vector_weight: 0.6,
        }
    }
}
