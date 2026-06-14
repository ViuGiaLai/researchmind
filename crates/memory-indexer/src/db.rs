use rusqlite::{Connection, Result, params};
use log::info;

/// Manages the SQLite database connection and schema.
pub struct Database {
    conn: Connection,
}

impl Database {
    /// Open or create the database at the given path.
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Self { conn };
        db.create_tables()?;
        Ok(db)
    }

    /// Create all tables if they don't exist.
    fn create_tables(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            -- File metadata
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                extension TEXT NOT NULL,
                hash TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT,
                modified_at TEXT,
                indexed_at TEXT DEFAULT (datetime('now')),
                status TEXT DEFAULT 'pending'
            );

            -- Full text content
            CREATE TABLE IF NOT EXISTS file_contents (
                file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                extracted_at TEXT DEFAULT (datetime('now'))
            );

            -- Full-text search index (FTS5)
            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                filename,
                content,
                tokenize='unicode61'
            );

            -- Vector embeddings
            CREATE TABLE IF NOT EXISTS embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding BLOB,
                model TEXT DEFAULT 'bge-small-en-v1.5',
                UNIQUE(file_id, chunk_index)
            );

            -- Knowledge Graph nodes
            CREATE TABLE IF NOT EXISTS graph_nodes (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                file_id TEXT REFERENCES files(id),
                created_at TEXT DEFAULT (datetime('now'))
            );

            -- Knowledge Graph edges
            CREATE TABLE IF NOT EXISTS graph_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL REFERENCES graph_nodes(id),
                target_id TEXT NOT NULL REFERENCES graph_nodes(id),
                relation TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            -- Timeline events
            CREATE TABLE IF NOT EXISTS timeline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                file_id TEXT REFERENCES files(id),
                event_type TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            -- Chat history
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                context_files TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            -- Application configuration
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Scan history log
            CREATE TABLE IF NOT EXISTS scan_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder TEXT NOT NULL,
                files_found INTEGER,
                files_indexed INTEGER,
                files_skipped INTEGER,
                duration_ms INTEGER,
                scanned_at TEXT DEFAULT (datetime('now'))
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
            CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
            CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_at);
            CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(file_id);
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON graph_nodes(label);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_relation ON graph_edges(relation);
            CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline(date);
            ",
        )?;

        // Insert default config values if not exist
        self.insert_default_config()?;

        info!("Database tables created successfully");
        Ok(())
    }

    fn insert_default_config(&self) -> Result<()> {
        let defaults = [
            ("scanned_folders", "[]"),
            ("max_file_size_mb", "100"),
            ("ollama_model", "qwen2.5:7b"),
            ("ollama_url", "http://localhost:11434"),
            ("embedding_model", "bge-small-en-v1.5"),
            ("encryption_enabled", "false"),
            ("theme", "light"),
            ("schema_version", "1"),
        ];

        for (key, value) in defaults {
            self.conn.execute(
                "INSERT OR IGNORE INTO config (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }
        Ok(())
    }

    /// Get the underlying connection.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Clear all indexed data.
    pub fn clear_all(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            DELETE FROM files_fts;
            DELETE FROM embeddings;
            DELETE FROM graph_edges;
            DELETE FROM graph_nodes;
            DELETE FROM timeline;
            DELETE FROM chat_history;
            DELETE FROM file_contents;
            DELETE FROM files;
            DELETE FROM scan_log;
            ",
        )?;
        info!("All indexed data cleared");
        Ok(())
    }

    /// Delete all data including tables (for complete reset).
    pub fn reset_database(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            DROP TABLE IF EXISTS files_fts;
            DROP TABLE IF EXISTS embeddings;
            DROP TABLE IF EXISTS graph_edges;
            DROP TABLE IF EXISTS graph_nodes;
            DROP TABLE IF EXISTS timeline;
            DROP TABLE IF EXISTS chat_history;
            DROP TABLE IF EXISTS file_contents;
            DROP TABLE IF EXISTS scan_log;
            DROP TABLE IF EXISTS config;
            DROP TABLE IF EXISTS files;
            ",
        )?;
        self.create_tables()?;
        info!("Database reset complete");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_creation() {
        let db = Database::open(":memory:").unwrap();
        // Verify tables exist
        let tables: Vec<String> = db
            .conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tables.contains(&"files".to_string()));
        assert!(tables.contains(&"files_fts".to_string()));
    }

    #[test]
    fn test_default_config() {
        let db = Database::open(":memory:").unwrap();
        let value: String = db
            .conn
            .query_row(
                "SELECT value FROM config WHERE key = ?1",
                params!["max_file_size_mb"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "100");
    }
}
