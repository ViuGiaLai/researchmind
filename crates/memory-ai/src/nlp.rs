use crate::{ParsedQuery, QueryIntent};

/// Parses natural language queries into structured search parameters.
pub struct NaturalLanguageParser;

impl NaturalLanguageParser {
    pub fn new() -> Self {
        Self
    }

    /// Parse a natural language query into a structured query.
    pub fn parse(&self, query: &str) -> ParsedQuery {
        let query_lower = query.to_lowercase();
        let keywords = self.extract_keywords(&query_lower);
        let file_type = self.detect_file_type(&query_lower);
        let date_range = self.detect_date_range(&query_lower);
        let folder = self.detect_folder(&query_lower);
        let intent = self.detect_intent(&query_lower);

        ParsedQuery {
            keywords,
            file_type,
            date_range,
            folder,
            intent,
        }
    }

    /// Extract meaningful keywords from the query.
    fn extract_keywords(&self, query: &str) -> Vec<String> {
        let stop_words = [
            "tìm", "tim", "file", "tài liệu", "tai lieu", "mà tôi", "ma toi",
            "của tôi", "cua toi", "đã", "da", "vào", "vao", "trong", "có",
            "co", "và", "va", "the", "a", "an", "of", "in", "to", "for",
            "with", "about", "my", "find", "search", "show", "get",
        ];

        query
            .split_whitespace()
            .filter(|word| !stop_words.contains(word))
            .map(|w| w.to_string())
            .collect()
    }

    /// Detect requested file type from the query.
    fn detect_file_type(&self, query: &str) -> Option<String> {
        let types = [
            ("pdf", "pdf"),
            ("docx", "docx"),
            ("word", "docx"),
            ("txt", "txt"),
            ("text", "txt"),
            ("markdown", "md"),
            ("md", "md"),
            ("ảnh", "jpg"),
            ("anh", "jpg"),
            ("image", "jpg"),
            ("picture", "jpg"),
        ];

        for (keyword, ext) in types {
            if query.contains(keyword) {
                return Some(ext.to_string());
            }
        }
        None
    }

    /// Detect date range references.
    fn detect_date_range(&self, query: &str) -> Option<(String, String)> {
        let today = chrono::Local::now();

        if query.contains("hôm qua") || query.contains("hom qua") || query.contains("yesterday")
        {
            let yesterday = (today - chrono::Duration::days(1)).format("%Y-%m-%d");
            return Some((yesterday.to_string(), today.format("%Y-%m-%d").to_string()));
        }

        if query.contains("tuần trước")
            || query.contains("tuan truoc")
            || query.contains("last week")
        {
            let start = (today - chrono::Duration::days(7)).format("%Y-%m-%d");
            return Some((start.to_string(), today.format("%Y-%m-%d").to_string()));
        }

        if query.contains("tháng trước")
            || query.contains("thang truoc")
            || query.contains("last month")
        {
            let start = (today - chrono::Duration::days(30)).format("%Y-%m-%d");
            return Some((start.to_string(), today.format("%Y-%m-%d").to_string()));
        }

        if query.contains("năm trước")
            || query.contains("nam truoc")
            || query.contains("last year")
        {
            let start = (today - chrono::Duration::days(365)).format("%Y-%m-%d");
            return Some((start.to_string(), today.format("%Y-%m-%d").to_string()));
        }

        None
    }

    /// Detect folder reference.
    fn detect_folder(&self, query: &str) -> Option<String> {
        // Simple folder detection - can be enhanced
        let folders = ["study", "học", "hoc", "work", "làm", "lam", "project"];

        for folder in folders {
            if query.contains(folder) {
                return Some(folder.to_string());
            }
        }
        None
    }

    /// Detect the user's intent.
    fn detect_intent(&self, query: &str) -> QueryIntent {
        if query.contains("tóm tắt")
            || query.contains("tom tat")
            || query.contains("summarize")
            || query.contains("summary")
        {
            return QueryIntent::Summarize;
        }

        if query.contains("timeline")
            || query.contains("dòng thời gian")
            || query.contains("dong thoi gian")
            || query.contains("khi nào")
            || query.contains("khi nao")
        {
            return QueryIntent::Timeline;
        }

        if query.contains("liên quan")
            || query.contains("lien quan")
            || query.contains("graph")
            || query.contains("kết nối")
            || query.contains("ket noi")
            || query.contains("related")
        {
            return QueryIntent::Graph;
        }

        if query.contains("tìm")
            || query.contains("tim")
            || query.contains("find")
            || query.contains("search")
            || query.contains("ở đâu")
            || query.contains("o dau")
            || query.contains("file")
        {
            return QueryIntent::Search;
        }

        QueryIntent::Chat
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_query() {
        let parser = NaturalLanguageParser::new();
        let result = parser.parse("Tìm file PDF về Docker tháng trước");

        assert!(result.keywords.contains(&"docker".to_string()));
        assert_eq!(result.file_type, Some("pdf".to_string()));
        assert!(result.date_range.is_some());
        assert_eq!(result.intent, QueryIntent::Search);
    }

    #[test]
    fn test_parse_summarize_query() {
        let parser = NaturalLanguageParser::new();
        let result = parser.parse("Tóm tắt nội dung file này");

        assert_eq!(result.intent, QueryIntent::Summarize);
    }

    #[test]
    fn test_extract_keywords_removes_stop_words() {
        let parser = NaturalLanguageParser::new();
        let result = parser.extract_keywords("tìm file pdf về docker");
        assert!(result.contains(&"docker".to_string()));
        assert!(!result.contains(&"tìm".to_string()));
    }
}
