pub mod search;
pub mod config;

pub use search::SearchEngine;
pub use config::SearchConfig;

use serde::{Deserialize, Serialize};

/// A single search result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file_id: String,
    pub filename: String,
    pub path: String,
    pub extension: String,
    pub snippet: String,
    pub score: f64,
    pub size: u64,
    pub modified_at: Option<String>,
}

/// Query parameters for search.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub text: String,
    pub limit: u32,
    pub offset: u32,
    pub filters: Option<SearchFilters>,
}

/// Filters to narrow search results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilters {
    pub extensions: Option<Vec<String>>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub folder: Option<String>,
}
