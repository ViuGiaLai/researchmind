use log::info;

/// Extracts relationships between files, topics, and entities.
pub struct RelationExtractor;

impl RelationExtractor {
    pub fn new() -> Self {
        Self
    }

    /// Extract relations from a file's content and filename.
    /// This creates the initial graph nodes and edges during indexing.
    pub fn extract(&self, file_id: &str, filename: &str, _content: &str) {
        // Extract topics from filename
        let topics = self.extract_topics_from_filename(filename);

        if !topics.is_empty() {
            info!(
                "Extracted {} topics from file {}",
                topics.len(),
                filename
            );
        }

        // Note: Actual graph creation happens in the pipeline
        // which has access to the database connection
    }

    /// Extract potential topics from a filename.
    fn extract_topics_from_filename(&self, filename: &str) -> Vec<String> {
        let name = filename.to_lowercase();
        let mut topics = Vec::new();

        // Remove extension
        let name = if let Some(dot) = name.rfind('.') {
            &name[..dot]
        } else {
            &name
        };

        // Split by common delimiters
        for part in name.split(&['-', '_', ' ', '.', '(', ')'][..]) {
            let part = part.trim();
            if part.len() > 2 && !self.is_stop_word(part) {
                topics.push(part.to_string());
            }
        }

        topics
    }

    /// Check if a word is a common stop word.
    fn is_stop_word(&self, word: &str) -> bool {
        let stops = [
            "the", "and", "for", "with", "from", "this", "that",
            "của", "và", "cho", "với", "từ", "các", "một",
            "new", "file", "doc", "document", "final", "draft",
        ];
        stops.contains(&word)
    }

    /// Suggest edges between files based on shared topics.
    pub fn suggest_connections(
        &self,
        file1_topics: &[String],
        file2_topics: &[String],
    ) -> f64 {
        if file1_topics.is_empty() || file2_topics.is_empty() {
            return 0.0;
        }

        let shared: usize = file1_topics
            .iter()
            .filter(|t| file2_topics.contains(t))
            .count();

        shared as f64 / (file1_topics.len() + file2_topics.len() - shared) as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_topics() {
        let extractor = RelationExtractor::new();
        let topics = extractor.extract_topics_from_filename("Docker-Compose-Guide.pdf");
        assert!(topics.contains(&"docker".to_string()));
        assert!(topics.contains(&"compose".to_string()));
        assert!(topics.contains(&"guide".to_string()));
    }

    #[test]
    fn test_suggest_connections() {
        let extractor = RelationExtractor::new();
        let topics1 = vec!["docker".to_string(), "kubernetes".to_string()];
        let topics2 = vec!["docker".to_string(), "compose".to_string()];
        let score = extractor.suggest_connections(&topics1, &topics2);
        assert!(score > 0.0);
        assert!(score <= 1.0);
    }
}
