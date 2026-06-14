use crate::{ExtractionResult, FileType};
use log::{error, warn};
use std::fs;
use std::path::Path;

/// Extracts text content from various file types.
pub struct TextExtractor;

impl TextExtractor {
    pub fn new() -> Self {
        Self
    }

    /// Extract text from a file based on its extension.
    pub fn extract(&self, file_id: &str, path: &str) -> ExtractionResult {
        let file_path = Path::new(path);
        let ext = file_path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let file_type = FileType::from_extension(&ext);

        match file_type {
            FileType::Pdf => self.extract_pdf(file_id, path),
            FileType::Docx => self.extract_docx(file_id, path),
            FileType::Txt | FileType::Md => self.extract_plain_text(file_id, path),
            FileType::Unknown => ExtractionResult {
                file_id: file_id.to_string(),
                content: String::new(),
                success: false,
                error: Some(format!("Unsupported file type: {}", ext)),
            },
        }
    }

    /// Extract text from PDF.
    fn extract_pdf(&self, file_id: &str, path: &str) -> ExtractionResult {
        match pdf_extract::extract_text(path) {
            Ok(text) => ExtractionResult {
                file_id: file_id.to_string(),
                content: text,
                success: true,
                error: None,
            },
            Err(e) => {
                error!("Failed to extract PDF {}: {}", path, e);
                ExtractionResult {
                    file_id: file_id.to_string(),
                    content: String::new(),
                    success: false,
                    error: Some(format!("PDF extraction failed: {}", e)),
                }
            }
        }
    }

    /// Extract text from DOCX.
    fn extract_docx(&self, file_id: &str, path: &str) -> ExtractionResult {
        match docx_rs::read_docx(path) {
            Ok(doc) => {
                let content = doc
                    .document
                    .children
                    .iter()
                    .filter_map(|child| {
                        if let docx_rs::DocumentChild::Paragraph(p) = child {
                            Some(
                                p.children
                                    .iter()
                                    .filter_map(|run| {
                                        if let docx_rs::ParagraphChild::Run(r) = run {
                                            Some(r.text.clone())
                                        } else {
                                            None
                                        }
                                    })
                                    .collect::<Vec<_>>()
                                    .join(""),
                            )
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                ExtractionResult {
                    file_id: file_id.to_string(),
                    content,
                    success: true,
                    error: None,
                }
            }
            Err(e) => {
                error!("Failed to extract DOCX {}: {:?}", path, e);
                ExtractionResult {
                    file_id: file_id.to_string(),
                    content: String::new(),
                    success: false,
                    error: Some(format!("DOCX extraction failed: {:?}", e)),
                }
            }
        }
    }

    /// Extract text from plain text / markdown files.
    fn extract_plain_text(&self, file_id: &str, path: &str) -> ExtractionResult {
        match fs::read_to_string(path) {
            Ok(text) => ExtractionResult {
                file_id: file_id.to_string(),
                content: text,
                success: true,
                error: None,
            },
            Err(e) => {
                error!("Failed to read text file {}: {}", path, e);
                ExtractionResult {
                    file_id: file_id.to_string(),
                    content: String::new(),
                    success: false,
                    error: Some(format!("Failed to read file: {}", e)),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_extract_txt() {
        let mut tmp = NamedTempFile::new().unwrap();
        writeln!(tmp, "Hello, MemoryOS!").unwrap();
        let path = tmp.path().to_string_lossy().to_string();

        let extractor = TextExtractor::new();
        let result = extractor.extract("test-id", &path);
        assert!(result.success);
        assert!(result.content.contains("Hello, MemoryOS!"));
    }

    #[test]
    fn test_extract_md() {
        let mut tmp = NamedTempFile::new().unwrap();
        writeln!(tmp, "# Markdown Title\n\nSome content.").unwrap();
        // Rename to .md for test
        let md_path = tmp.path().with_extension("md");
        fs::rename(tmp.path(), &md_path).unwrap();
        let path = md_path.to_string_lossy().to_string();

        let extractor = TextExtractor::new();
        let result = extractor.extract("test-id", &path);
        assert!(result.success);
        assert!(result.content.contains("Markdown Title"));
    }

    #[test]
    fn test_extract_unsupported() {
        let extractor = TextExtractor::new();
        let result = extractor.extract("test-id", "test.exe");
        assert!(!result.success);
        assert!(result.error.unwrap().contains("Unsupported"));
    }
}
