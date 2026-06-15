use log::{error, info};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// Path to the Python backend's main.py relative to the Tauri binary
const BACKEND_MAIN: &str = "../../../backend/main.py";

/// Path to the Python virtual environment's Python executable
const VENV_PYTHON: &str = "../../../.venv/Scripts/python.exe";

/// Shared backend process handle
struct BackendProcess(Mutex<Option<Child>>);

/// Try to spawn the Python FastAPI backend.
fn spawn_backend() -> Option<Child> {
    let python = if std::path::Path::new(VENV_PYTHON).exists() {
        VENV_PYTHON
    } else {
        "python"
    };

    match Command::new(python)
        .args(["-u", BACKEND_MAIN])
        .spawn()
    {
        Ok(child) => {
            info!("Python backend started (PID: {})", child.id());
            Some(child)
        }
        Err(e) => {
            error!("Failed to start Python backend: {}", e);
            None
        }
    }
}

/// Open a native folder picker dialog and return the selected path.
#[tauri::command]
fn select_folder(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    match app_handle.dialog().file().blocking_pick_folder() {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

/// Check if the Python backend is running by hitting the health endpoint.
#[tauri::command]
async fn check_backend_health() -> Result<bool, String> {
    match reqwest::get("http://127.0.0.1:8765/api/health").await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Kill the Python backend process.
#[tauri::command]
fn kill_backend(proc: State<'_, BackendProcess>) -> Result<(), String> {
    if let Ok(mut guard) = proc.0.lock() {
        if let Some(ref mut child) = *guard {
            info!("Killing Python backend (PID: {})", child.id());
            let _ = child.kill();
            let _ = child.wait();
            *guard = None;
        }
    }
    Ok(())
}

/// Run the Tauri application.
pub fn run() {
    env_logger::init();
    info!("Starting ResearchMind VN Desktop v{}", env!("CARGO_PKG_VERSION"));

    // Spawn Python backend on startup
    let backend = spawn_backend();
    let backend_state = BackendProcess(Mutex::new(backend));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(backend_state)
        .invoke_handler(tauri::generate_handler![
            select_folder,
            check_backend_health,
            kill_backend,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill backend when window is closed
                if let Some(backend) = window.try_state::<BackendProcess>() {
                    if let Ok(mut guard) = backend.0.lock() {
                        if let Some(ref mut child) = *guard {
                            info!("Shutting down Python backend...");
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
