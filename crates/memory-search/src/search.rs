use crate::{SearchConfig, SearchFilters, SearchQuery, SearchResult};
use log::error;
use rusqlite::{params, Connection, Result};

/// Full-text and semantic search engine.
pub struct SearchEngine {
    config: SearchConfig,
}

impl SearchEngine {
    pub fn new(config: SearchConfig) -> Self {
        Self { config }
    }

    /// Execute a BM25 full-text search query.
    pub fn search_fts(
        &self,
        conn: &Connection,
        query: &SearchQuery,
    ) -> Vec<SearchResult> {
        let mut results = Vec::new();

        // Build SQL with filters
        let mut sql = String::from(
            "SELECT f.id, f.filename, f.path, f.extension, f.size, f.modified_at,
                    snippet(files_fts, 1, '<b>', '</b>', '...', 64) as snippet,
                    rank as score
             FROM files_fts
             JOIN files f ON f.id = (
                SELECT id FROM files WHERE rowid = files_fts.rowid
             )
             WHERE files_fts MATCH ?1",
        );

        let mut query_params: Vec<Box<dyn rusqlite::types::ToSql>> =
            vec![Box::new(query.text.clone())];

        if let Some(ref filters) = query.filters {
            if let Some(ref exts) = filters.extensions {
                if !exts.is_empty() {
                    let placeholders: Vec<String> =
                        (0..exts.len()).map(|i| format!("?{}", i + 2)).collect();
                    sql.push_str(&format!(
                        " AND f.extension IN ({})",
                        placeholders.join(",")
                    ));
                    for ext in exts {
                        query_params.push(Box::new(ext.clone()));
                    }
                }
            }

            if let Some(ref date_from) = filters.date_from {
                sql.push_str(&format!(" AND f.modified_at >= ?{}", query_params.len() + 1));
                query_params.push(Box::new(date_from.clone()));
            }

            if let Some(ref date_to) = filters.date_to {
                sql.push_str(&format!(" AND f.modified_at <= ?{}", query_params.len() + 1));
                query_params.push(Box::new(date_to.clone()));
            }

            if let Some(ref folder) = filters.folder {
                sql.push_str(&format!(
                    " AND f.path LIKE ?{}",
                    query_params.len() + 1
                ));
                query_params.push(Box::new(format!("{}%", folder)));
            }
        }

        sql.push_str(" ORDER BY rank LIMIT ?2 OFFSET ?3");
        let limit = if query.limit > 0 {
            query.limit
        } else {
            self.config.default_limit
        };
        query_params.push(Box::new(limit));
        query_params.push(Box::new(query.offset));

        let params_refs: Vec<&dyn rusqlite::types::ToSql> =
            query_params.iter().map(|p| p.as_ref()).collect();

        match conn.prepare(&sql) {
            Ok(mut stmt) => {
                match stmt.query_map(params_refs.as_slice(), |row| {
                    let score: f64 = row.get(6)?;
                    Ok(SearchResult {
                        file_id: row.get(0)?,
                        filename: row.get(1)?,
                        path: row.get(2)?,
                        extension: row.get(3)?,
                        size: row.get(4)?,
                        modified_at: row.get(5)?,
                        snippet: row.get::<_, String>(6).unwrap_or_default(),
                        score,
                    })
                }) {
                    Ok(rows) => {
                        for row in rows.flatten() {
                            results.push(row);
                        }
                    }
                    Err(e) => error!("Search query error: {}", e),
                }
            }
            Err(e) => error!("Failed to prepare search query: {}", e),
        }

        results
    }

    /// Get file content for preview.
    pub fn get_preview(&self, conn: &Connection, file_id: &str) -> Option<String> {
        conn.query_row(
            "SELECT content FROM file_contents WHERE file_id = ?1",
            params![file_id],
            |row| row.get(0),
        )
        .ok()
    }

    /// Get search suggestions based on partial input.
    pub fn get_suggestions(&self, conn: &Connection, query: &str) -> Vec<String> {
        let mut suggestions = Vec::new();

        let sql = format!(
            "SELECT DISTINCT filename FROM files
             WHERE filename LIKE ?1
             LIMIT 10"
        );

        if let Ok(mut stmt) = conn.prepare(&sql) {
            if let Ok(rows) = stmt.query_map(params![format!("%{}%", query)], |row| {
                row.get::<_, String>(0)
            }) {
                for row in rows.flatten() {
                    suggestions.push(row);
                }
            }
        }

        suggestions
    }

    /// Get count of documents matching a query.
    pub fn count_matches(&self, conn: &Connection, query: &str) -> u64 {
        conn.query_row(
            "SELECT COUNT(*) FROM files_fts WHERE files_fts MATCH ?1",
            params![query],
            |row| row.get(0),
        )
        .unwrap_or(0)
    }
}
