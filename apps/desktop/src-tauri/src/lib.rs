use log::{error, info};
use memory_ai::chat::ChatManager;
use memory_ai::ollama::OllamaClient;
use memory_ai::ChatMessage;
use memory_graph::{TimelineData, TimelineFileEntry, TimelineSummary};
use memory_indexer::pipeline::IndexingPipeline;
use memory_indexer::IndexProgress;
use memory_search::{SearchConfig, SearchEngine, SearchQuery, SearchResult};
use rusqlite::params;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::Mutex as AsyncMutex;

/// Get the database directory path.
fn db_dir() -> PathBuf {
    dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("memory-os")
}

/// Get the full database file path.
fn db_path() -> PathBuf {
    db_dir().join("memory-os.db")
}

/// Application state shared across commands.
struct AppState {
    db: memory_indexer::db::Database,
    search: SearchEngine,
    /// Shared running flag — new clones passed to background scan threads
    running: Arc<AtomicBool>,
    /// Shared scan progress — updated by background thread, read by frontend
    scan_progress: Arc<Mutex<IndexProgress>>,
    /// AI chat manager (tokio::sync::Mutex for use across .await)
    chat_manager: Arc<AsyncMutex<ChatManager>>,
}

/// Initialize the application database.
fn init_app() -> memory_indexer::db::Database {
    let path = db_path();

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    info!("Opening database at: {}", path.display());
    memory_indexer::db::Database::open(path.to_str().unwrap())
        .expect("Failed to open database")
}

/// Helper to load folders from the config table.
fn load_folders(state: &AppState) -> Vec<String> {
    let folders_json: String = state
        .db
        .connection()
        .query_row(
            "SELECT value FROM config WHERE key = 'scanned_folders'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());
    serde_json::from_str(&folders_json).unwrap_or_default()
}

/// Helper to save folders to the config table.
fn save_folders(state: &AppState, folders: &[String]) {
    let json = serde_json::to_string(folders).unwrap_or_else(|_| "[]".to_string());
    let _ = state.db.connection().execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES ('scanned_folders', ?1)",
        params![json],
    );
}

/// Open native folder dialog and add the selected folder.
#[tauri::command]
fn add_folder(
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<String>, String> {
    let dialog = app_handle.dialog();

    let result = dialog
        .file()
        .blocking_pick_folder();

    let state = state.lock().map_err(|e| e.to_string())?;
    let mut folders = load_folders(&state);

    if let Some(path) = result {
        let path_str = path.to_string();
        if !folders.contains(&path_str) {
            folders.push(path_str);
        }
        save_folders(&state, &folders);
    }

    Ok(folders)
}

/// Get the list of selected folders.
#[tauri::command]
fn get_folders(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<String>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(load_folders(&state))
}

/// Remove a folder from the list.
#[tauri::command]
fn remove_folder(
    folder: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<String>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let mut folders = load_folders(&state);
    folders.retain(|f| f != &folder);
    save_folders(&state, &folders);
    Ok(folders)
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
fn get_preview(
    file_id: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
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
fn get_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<memory_indexer::IndexStats, String> {
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

/// Start scanning selected folders on a background thread.
#[tauri::command]
fn start_scan(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let (folders, running, progress) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let folders = load_folders(&s);
        if folders.is_empty() {
            return Err("Chưa có thư mục nào được chọn. Vui lòng chọn thư mục trước.".to_string());
        }

        // Reset progress
        *s.scan_progress.lock().map_err(|e| e.to_string())? = IndexProgress {
            total_files: 0,
            indexed_files: 0,
            failed_files: 0,
            current_file: Some("Đang khởi tạo...".to_string()),
            percentage: 0.0,
            is_running: true,
        };

        s.running.store(true, Ordering::SeqCst);

        (folders, s.running.clone(), s.scan_progress.clone())
    };

    let db_path_clone = db_path().to_str().unwrap_or("memory-os.db").to_string();

    // Spawn a background thread that opens its own DB connection
    std::thread::spawn(move || {
        info!("Scanning folders: {:?}", folders);

        // Open a separate DB connection for this thread
        let thread_db = match memory_indexer::db::Database::open(&db_path_clone) {
            Ok(db) => Arc::new(db),
            Err(e) => {
                error!("Failed to open database in scan thread: {}", e);
                if let Ok(mut p) = progress.lock() {
                    *p = IndexProgress {
                        total_files: 0,
                        indexed_files: 0,
                        failed_files: 0,
                        current_file: Some(format!("Lỗi DB: {}", e)),
                        percentage: 0.0,
                        is_running: false,
                    };
                }
                return;
            }
        };

        // Create pipeline with shared running flag
        let search_config = SearchConfig::default();
        let search_engine = SearchEngine::new(search_config);
        let pipeline =
            IndexingPipeline::new_with_running(thread_db, search_engine, running);

        match pipeline.start_indexing(&folders) {
            Ok(prog) => {
                if let Ok(mut p) = progress.lock() {
                    *p = prog;
                }
            }
            Err(e) => {
                error!("Scan failed: {}", e);
                if let Ok(mut p) = progress.lock() {
                    *p = IndexProgress {
                        total_files: 0,
                        indexed_files: 0,
                        failed_files: 0,
                        current_file: Some(format!("Lỗi: {}", e)),
                        percentage: 0.0,
                        is_running: false,
                    };
                }
            }
        }
    });

    Ok(())
}

/// Stop the scanning process.
#[tauri::command]
fn stop_scan(state: State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.running.store(false, Ordering::SeqCst);

    if let Ok(mut p) = state.scan_progress.lock() {
        p.is_running = false;
        p.current_file = Some("Đã dừng.".to_string());
    }

    Ok(())
}

/// Build a context string from search results for the AI.
fn format_context(results: &[SearchResult]) -> String {
    if results.is_empty() {
        return String::new();
    }

    let mut ctx = String::from("Dưới đây là các file liên quan đến câu hỏi:\n\n");
    for (i, r) in results.iter().enumerate() {
        ctx.push_str(&format!(
            "{}. {} ({}) - {}KB\n   Đường dẫn: {}\n   Trích dẫn: {}\n\n",
            i + 1,
            r.filename,
            r.extension,
            r.size / 1024,
            r.path,
            r.snippet.replace("<b>", "").replace("</b>", "")
        ));
    }
    ctx
}

/// Chat with AI — searches indexed files for context, then asks Ollama.
#[tauri::command]
async fn chat(
    message: String,
    search_first: bool,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<memory_ai::ChatResponse, String> {
    // Step 1: Search for relevant context if requested
    let context = if search_first {
        let s = state.lock().map_err(|e| e.to_string())?;
        let query = SearchQuery {
            text: message.clone(),
            limit: 5,
            offset: 0,
            filters: None,
        };
        let results = s.search.search_fts(s.db.connection(), &query);
        drop(s);
        format_context(&results)
    } else {
        String::new()
    };

    // Step 2: Get AI response via ChatManager
    let chat_manager_arc = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.chat_manager.clone()
    };

    let mut cm = chat_manager_arc.lock().await;
    let response = cm.chat_with_context(&message, &context).await?;

    Ok(response)
}

/// Get chat history.
#[tauri::command]
async fn get_chat_history(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<ChatMessage>, String> {
    let chat_manager_arc = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.chat_manager.clone()
    };
    let cm = chat_manager_arc.lock().await;
    Ok(cm.get_history().to_vec())
}

/// Clear chat history.
#[tauri::command]
async fn clear_chat_history(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    let chat_manager_arc = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.chat_manager.clone()
    };
    let mut cm = chat_manager_arc.lock().await;
    cm.clear_history();
    Ok(())
}

/// Check if Ollama is running and the configured model is available.
/// Accepts optional url/model overrides so the UI can test draft values
/// before saving them to the database.
#[tauri::command]
async fn check_ollama_health(
    url: Option<String>,
    model: Option<String>,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<serde_json::Value, String> {
    let (check_url, check_model) = if let (Some(u), Some(m)) = (&url, &model) {
        (u.clone(), m.clone())
    } else {
        let s = state.lock().map_err(|e| e.to_string())?;
        let u = s
            .db
            .connection()
            .query_row(
                "SELECT value FROM config WHERE key = 'ollama_url'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "http://localhost:11434".to_string());
        let m = s
            .db
            .connection()
            .query_row(
                "SELECT value FROM config WHERE key = 'ollama_model'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "qwen2.5:7b".to_string());
        (u, m)
    };

    let client = OllamaClient::new(&check_url, &check_model);
    let is_running = client.health_check().await.unwrap_or(false);

    Ok(serde_json::json!({
        "running": is_running,
        "url": check_url,
        "model": check_model,
        }))
}

/// Get current Ollama configuration (URL and model name).
#[tauri::command]
fn get_ollama_config(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<serde_json::Value, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let url = s
        .db
        .connection()
        .query_row(
            "SELECT value FROM config WHERE key = 'ollama_url'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "http://localhost:11434".to_string());
    let model = s
        .db
        .connection()
        .query_row(
            "SELECT value FROM config WHERE key = 'ollama_model'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "qwen2.5:7b".to_string());

    Ok(serde_json::json!({
        "url": url,
        "model": model,
    }))
}

/// Update Ollama configuration and recreate the ChatManager with new settings.
#[tauri::command]
async fn update_ollama_config(
    url: String,
    model: String,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    // Save to database
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.db
            .connection()
            .execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES ('ollama_url', ?1)",
                params![url],
            )
            .map_err(|e| e.to_string())?;
        s.db
            .connection()
            .execute(
                "INSERT OR REPLACE INTO config (key, value) VALUES ('ollama_model', ?1)",
                params![model],
            )
            .map_err(|e| e.to_string())?;
    }

    // Recreate ChatManager with new settings
    let new_client = OllamaClient::new(&url, &model);
    let new_manager = ChatManager::new(new_client);

    // Clone chat_manager Arc BEFORE any .await to avoid holding a non-Send MutexGuard
    let chat_manager_arc = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.chat_manager.clone()
    };
    let mut cm = chat_manager_arc.lock().await;
    *cm = new_manager;
    // cm and chat_manager_arc dropped here, no longer holding anything

    info!("Ollama config updated: {} / {}", url, model);
    Ok(())
}

/// Get timeline data — files grouped by modification date + monthly summary.
#[tauri::command]
fn get_timeline(
    from: Option<String>,
    to: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<TimelineData, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let conn = s.db.connection();

    let limit = limit.unwrap_or(200);

    // Always include date placeholders so params count matches SQL
    let sql = String::from(
        "SELECT modified_at, id, filename, path, extension, size
         FROM files
         WHERE modified_at IS NOT NULL
           AND modified_at >= ?1
           AND modified_at <= ?2
         ORDER BY modified_at DESC LIMIT ?3"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let from_val = from.as_deref().unwrap_or("1900-01-01");
    let to_val = to.as_deref().unwrap_or("2100-01-01");

    let files = stmt
        .query_map(
            rusqlite::params![from_val, to_val, limit],
            |row| {
                Ok(TimelineFileEntry {
                    date: row.get::<_, String>(0).unwrap_or_default(),
                    file_id: row.get(1)?,
                    filename: row.get(2)?,
                    path: row.get(3)?,
                    extension: row.get(4)?,
                    size: row.get(5)?,
                    event_type: "modified".to_string(),
                })
            },
        )
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    // Get monthly summary from files table
    let mut stmt2 = conn
        .prepare(
            "SELECT strftime('%Y-%m', modified_at) as period,
                    COUNT(*) as count,
                    COALESCE(SUM(size), 0) as total_size
             FROM files
             WHERE modified_at IS NOT NULL
             GROUP BY period
             ORDER BY period DESC
             LIMIT 24",
        )
        .map_err(|e| e.to_string())?;

    let summaries = stmt2
        .query_map([], |row| {
            Ok(TimelineSummary {
                period: row.get(0)?,
                count: row.get(1)?,
                total_size: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Calculate total days spanned (no chrono dependency needed)
    let total_days = {
        if files.len() >= 2 {
            let parse_date = |s: &str| -> Option<(i32, u32, u32)> {
                let parts: Vec<&str> = s[..10].split('-').collect();
                if parts.len() == 3 {
                    Some((
                        parts[0].parse().ok()?,
                        parts[1].parse().ok()?,
                        parts[2].parse().ok()?,
                    ))
                } else {
                    None
                }
            };
            let days_from_epoch = |y: i32, m: u32, d: u32| -> i64 {
                // Simple Julian Day approximation
                let a = (14 - m as i32) / 12;
                let y2 = y + 4800 - a;
                let m2 = m as i32 + 12 * a - 3;
                let jd = d as i64
                    + (153 * m2 + 2) as i64 / 5
                    + 365 * y2 as i64
                    + y2 as i64 / 4
                    - y2 as i64 / 100
                    + y2 as i64 / 400
                    - 32045;
                jd
            };
            if let (Some(s), Some(e)) = (
                parse_date(&files.last().unwrap().date),
                parse_date(&files[0].date),
            ) {
                let diff = days_from_epoch(e.0, e.1, e.2) - days_from_epoch(s.0, s.1, s.2);
                diff.max(1)
            } else {
                files.len() as i64
            }
        } else if files.len() == 1 {
            1
        } else {
            0
        }
    };

    let total_files = files.len() as i64;
    let total_size: i64 = files.iter().map(|f| f.size).sum();

    Ok(TimelineData {
        files,
        summary: summaries,
        total_days,
        total_files,
        total_size,
    })
}

/// Get current scan progress.
#[tauri::command]
fn get_scan_progress(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<IndexProgress, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let progress = state.scan_progress.lock().map_err(|e| e.to_string())?;
    Ok(progress.clone())
}

/// Run the Tauri application.
pub fn run() {
    env_logger::init();
    info!("Starting MemoryOS Desktop v{}", env!("CARGO_PKG_VERSION"));

    let db = init_app();
    let search_config = SearchConfig::default();
    let search_engine = SearchEngine::new(search_config);

    let running = Arc::new(AtomicBool::new(false));
    let scan_progress = Arc::new(Mutex::new(IndexProgress {
        total_files: 0,
        indexed_files: 0,
        failed_files: 0,
        current_file: None,
        percentage: 0.0,
        is_running: false,
    }));

    // Read Ollama config from database
    let ollama_url = db
        .connection()
        .query_row(
            "SELECT value FROM config WHERE key = 'ollama_url'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "http://localhost:11434".to_string());
    let ollama_model = db
        .connection()
        .query_row(
            "SELECT value FROM config WHERE key = 'ollama_model'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "qwen2.5:7b".to_string());

    info!("Ollama config: {} / {}", ollama_url, ollama_model);
    let ollama_client = OllamaClient::new(&ollama_url, &ollama_model);
    let chat_manager = Arc::new(AsyncMutex::new(ChatManager::new(ollama_client)));

    let state = Arc::new(Mutex::new(AppState {
        db,
        search: search_engine,
        running,
        scan_progress,
        chat_manager,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            search,
            get_preview,
            get_suggestions,
            get_stats,
            get_timeline,
            add_folder,
            get_folders,
            remove_folder,
            start_scan,
            stop_scan,
            get_scan_progress,
            chat,
            get_chat_history,
            clear_chat_history,
            check_ollama_health,
            get_ollama_config,
            update_ollama_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
