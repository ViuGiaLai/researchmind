pub mod db;
pub mod pipeline;

use serde::{Deserialize, Serialize};

/// Progress of the indexing process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    pub total_files: u64,
    pub indexed_files: u64,
    pub failed_files: u64,
    pub current_file: Option<String>,
    pub percentage: f64,
    pub is_running: bool,
}

/// Statistics about the index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    pub total_files: u64,
    pub total_size: u64,
    pub indexed_files: u64,
    pub failed_files: u64,
    pub file_types: Vec<FileTypeCount>,
    pub last_scan: Option<String>,
    pub folders: Vec<String>,
}

/// Count by file type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTypeCount {
    pub extension: String,
    pub count: u64,
    pub total_size: u64,
}
