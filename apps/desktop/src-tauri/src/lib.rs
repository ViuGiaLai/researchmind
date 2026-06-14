use log::info;
use memory_search::{SearchConfig, SearchQuery, SearchResult};
use memory_search::SearchEngine;
use std::sync::{Arc, Mutex};
use tauri::State;

/// Application state shared across commands.
struct AppState {
    db: memory_indexer::db::Database,
    search: SearchEngine,
}

/// Initialize the application database.
fn init_app() -> memory_indexer::db::Database {
    let db_path = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("memory-os")
        .join("memory-os.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    info!("Opening database at: {}", db_path.display());
    memory_indexer::db::Database::open(db_path.to_str().unwrap())
        .expect("Failed to open database")
}

/// Search command — full-text search across indexed files.
#[tauri::command]
fn search(
    query: SearchQuery,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<SearchResult>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.search.search_fts(state.db.connection(), &query))
}

/// Get file content preview.
#[tauri::command]
fn get_preview(file_id: String, state: State<'_, Arc<Mutex<AppState>>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state
        .search
        .get_preview(state.db.connection(), &file_id)
        .ok_or_else(|| "File not found".to_string())
}

/// Get search suggestions.
#[tauri::command]
fn get_suggestions(
    query: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.search.get_suggestions(state.db.connection(), &query))
}

/// Get index statistics.
#[tauri::command]
fn get_stats(state: State<'_, Arc<Mutex<AppState>>>) -> Result<memory_indexer::IndexStats, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let conn = state.db.connection();

    let total_files: i64 = conn
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .unwrap_or(0);

    let total_size: i64 = conn
        .query_row("SELECT COALESCE(SUM(size), 0) FROM files", [], |row| row.get(0))
        .unwrap_or(0);

    let indexed_files: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'indexed'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT extension, COUNT(*), COALESCE(SUM(size), 0) FROM files GROUP BY extension",
        )
        .map_err(|e| e.to_string())?;

    let file_types = stmt
        .query_map([], |row| {
            Ok(memory_indexer::FileTypeCount {
                extension: row.get(0)?,
                count: row.get(1)?,
                total_size: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let folders: String = conn
        .query_row(
            "SELECT value FROM config WHERE key = 'scanned_folders'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

    let last_scan: Option<String> = conn
        .query_row(
            "SELECT scanned_at FROM scan_log ORDER BY scanned_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(memory_indexer::IndexStats {
        total_files: total_files as u64,
        total_size: total_size as u64,
        indexed_files: indexed_files as u64,
        failed_files: (total_files - indexed_files) as u64,
        file_types,
        last_scan,
        folders: serde_json::from_str(&folders).unwrap_or_default(),
    })
}

/// Run the Tauri application.
pub fn run() {
    env_logger::init();
    info!("Starting MemoryOS Desktop v{}", env!("CARGO_PKG_VERSION"));

    let db = init_app();
    let search_config = SearchConfig::default();
    let search_engine = SearchEngine::new(search_config);

    let state = Arc::new(Mutex::new(AppState { db, search: search_engine }));

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            search,
            get_preview,
            get_suggestions,
            get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
