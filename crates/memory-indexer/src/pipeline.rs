use crate::db::Database;
use crate::IndexProgress;
use log::{error, info};
use memory_ai::embedder::Embedder;
use memory_core::{ExtractionResult, FileInfo, FileScanner, ScanConfig, TextExtractor};
use memory_graph::{relation::RelationExtractor, timeline::TimelineEngine, KnowledgeGraph};
use memory_search::search::SearchEngine;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

/// Coordinates the full indexing pipeline.
pub struct IndexingPipeline {
    db: Arc<Database>,
    scanner: FileScanner,
    extractor: TextExtractor,
    search: SearchEngine,
    embedder: Option<Embedder>,
    graph: Option<KnowledgeGraph>,
    relation: Option<RelationExtractor>,
    timeline: Option<TimelineEngine>,
    running: Arc<AtomicBool>,
}

impl IndexingPipeline {
    pub fn new(db: Arc<Database>, search: SearchEngine) -> Self {
        let config = ScanConfig::default();
        Self {
            db,
            scanner: FileScanner::new(config),
            extractor: TextExtractor::new(),
            search,
            embedder: None,
            graph: None,
            relation: None,
            timeline: None,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn with_embedder(mut self, embedder: Embedder) -> Self {
        self.embedder = Some(embedder);
        self
    }

    pub fn with_graph(mut self, graph: KnowledgeGraph) -> Self {
        self.relation = Some(RelationExtractor::new());
        self.timeline = Some(TimelineEngine::new());
        self.graph = Some(graph);
        self
    }

    /// Start indexing the given folders.
    pub fn start_indexing(&self, folders: &[String]) -> Result<IndexProgress, String> {
        self.running.store(true, Ordering::SeqCst);
        let start = Instant::now();

        info!("Starting indexing for {} folders", folders.len());

        // Step 1: Scan files
        let files = self.scanner.scan_folders(folders);
        let total = files.len() as u64;
        let mut indexed = 0u64;
        let mut failed = 0u64;

        if total == 0 {
            self.running.store(false, Ordering::SeqCst);
            return Ok(IndexProgress {
                total_files: 0,
                indexed_files: 0,
                failed_files: 0,
                current_file: None,
                percentage: 100.0,
                is_running: false,
            });
        }

        // Step 2: Process each file
        for file in &files {
            if !self.running.load(Ordering::SeqCst) {
                info!("Indexing stopped by user");
                break;
            }

            let _progress = IndexProgress {
                total_files: total,
                indexed_files: indexed,
                failed_files: failed,
                current_file: Some(file.filename.clone()),
                percentage: (indexed as f64 / total as f64) * 100.0,
                is_running: true,
            };

            // Step 2a: Insert file metadata
            if let Err(e) = self.insert_file(file) {
                error!("Failed to insert file metadata {}: {}", file.path, e);
                failed += 1;
                continue;
            }

            // Step 2b: Extract text
            let result = self.extractor.extract(&file.id, &file.path);
            if result.success {
                // Step 2c: Store content
                if let Err(e) = self.store_content(&result) {
                    error!("Failed to store content for {}: {}", file.path, e);
                }

                // Step 2d: Index in FTS5
                if let Err(e) = self.index_fts(&file, &result.content) {
                    error!("Failed to index FTS for {}: {}", file.path, e);
                }

                // Step 2e: Generate embeddings
                if let Some(ref embedder) = self.embedder {
                    self.generate_embeddings(embedder, &file.id, &result.content);
                }

                // Step 2f: Extract relations for graph
                if let Some(ref relation) = self.relation {
                    relation.extract(&file.id, &file.filename, &result.content);
                }

                // Step 2g: Create timeline events
                if let Some(ref timeline) = self.timeline {
                    timeline.add_event(&file);
                }
            } else {
                failed += 1;
            }

            indexed += 1;
        }

        let duration = start.elapsed().as_millis() as i64;
        info!(
            "Indexing completed: {} files indexed, {} failed in {}ms",
            indexed, failed, duration
        );

        // Log scan
        for folder in folders {
            let _ = self.db.connection().execute(
                "INSERT INTO scan_log (folder, files_found, files_indexed, files_skipped, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![folder, total, indexed, failed, duration],
            );
        }

        self.running.store(false, Ordering::SeqCst);

        Ok(IndexProgress {
            total_files: total,
            indexed_files: indexed,
            failed_files: failed,
            current_file: None,
            percentage: 100.0,
            is_running: false,
        })
    }

    /// Stop the indexing process.
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    fn insert_file(&self, file: &FileInfo) -> Result<(), String> {
        self.db.connection().execute(
            "INSERT OR REPLACE INTO files (id, path, filename, extension, hash, size, created_at, modified_at, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'indexed')",
            rusqlite::params![
                file.id,
                file.path,
                file.filename,
                file.extension,
                file.hash,
                file.size,
                file.created_at,
                file.modified_at,
            ],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn store_content(&self, result: &ExtractionResult) -> Result<(), String> {
        self.db.connection().execute(
            "INSERT OR REPLACE INTO file_contents (file_id, content) VALUES (?1, ?2)",
            rusqlite::params![result.file_id, result.content],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn index_fts(&self, file: &FileInfo, content: &str) -> Result<(), String> {
        self.db.connection().execute(
            "INSERT INTO files_fts (rowid, filename, content) VALUES (
                (SELECT rowid FROM files WHERE id = ?1), ?2, ?3
            )",
            rusqlite::params![file.id, file.filename, content],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn generate_embeddings(&self, embedder: &Embedder, file_id: &str, content: &str) {
        const CHUNK_SIZE: usize = 512;
        let words: Vec<&str> = content.split_whitespace().collect();
        let chunks: Vec<String> = words
            .chunks(CHUNK_SIZE)
            .map(|c| c.join(" "))
            .collect();

        for (i, chunk) in chunks.iter().enumerate() {
            match embedder.embed(chunk) {
                Ok(vector) => {
                    let vector_json = serde_json::to_string(&vector).unwrap_or_default();
                    let _ = self.db.connection().execute(
                        "INSERT OR REPLACE INTO embeddings (file_id, chunk_index, chunk_text, embedding)
                         VALUES (?1, ?2, ?3, ?4)",
                        rusqlite::params![file_id, i, chunk, vector_json],
                    );
                }
                Err(e) => {
                    error!("Failed to embed chunk {} for file {}: {}", i, file_id, e);
                }
            }
        }
    }
}
