pub mod scanner;
pub mod extractor;

pub use scanner::FileScanner;
pub use extractor::TextExtractor;

use serde::{Deserialize, Serialize};

/// Represents a scanned file with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub hash: String,
    pub size: u64,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
}

/// Supported file types for text extraction.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FileType {
    Pdf,
    Docx,
    Txt,
    Md,
    Unknown,
}

impl FileType {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "pdf" => FileType::Pdf,
            "docx" => FileType::Docx,
            "txt" => FileType::Txt,
            "md" => FileType::Md,
            _ => FileType::Unknown,
        }
    }

    pub fn is_supported(ext: &str) -> bool {
        matches!(
            ext.to_lowercase().as_str(),
            "pdf" | "docx" | "txt" | "md"
        )
    }
}

/// Result of text extraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub file_id: String,
    pub content: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Configuration for scanning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanConfig {
    pub max_file_size_mb: u64,
    pub include_extensions: Vec<String>,
    pub exclude_hidden: bool,
    pub exclude_system: bool,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            max_file_size_mb: 100,
            include_extensions: vec![
                "pdf".to_string(),
                "docx".to_string(),
                "txt".to_string(),
                "md".to_string(),
            ],
            exclude_hidden: true,
            exclude_system: true,
        }
    }
}
