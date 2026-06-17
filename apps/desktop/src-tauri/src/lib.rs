use log::{error, info};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Return the backend binary filename for the current platform.
fn backend_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "backend.exe"
    } else {
        "backend"
    }
}

/// Try to locate the backend executable.
/// Priority:
///   1. Backend binary next to Tauri binary (production bundle)
///   2. Backend binary in Tauri resource dir (bundled via `resources`)
///   3. python main.py via venv (development)
fn find_backend(app: Option<&tauri::AppHandle>) -> Option<(String, Vec<String>)> {
    let name = backend_binary_name();

    // 1. Check next to the app binary
    if let Ok(exe_dir) = std::env::current_exe().map(|p| {
        p.parent().unwrap_or(std::path::Path::new(".")).to_path_buf()
    }) {
        let bundled = exe_dir.join(name);
        if bundled.exists() {
            info!("Found bundled {} at: {:?}", name, bundled);
            return Some((bundled.to_string_lossy().to_string(), vec![]));
        }
    }

    // 2. Check Tauri resource directory
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let resource_path = res_dir.join(name);
            if resource_path.exists() {
                info!("Found {} in resource dir: {:?}", name, resource_path);
                return Some((resource_path.to_string_lossy().to_string(), vec![]));
            }
        }
    }

    // 3. Development: use python from venv
    let python_name = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };

    let python = {
        let venv = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.venv/Scripts/python.exe");
        if venv.exists() {
            venv.to_string_lossy().to_string()
        } else {
            python_name.to_string()
        }
    };

    let main_py = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../backend/main.py");

    if main_py.exists() {
        info!("Using development mode: {} -u {}", python, main_py.display());
        Some((python, vec!["-u".into(), main_py.to_string_lossy().to_string()]))
    } else {
        error!("No backend found ({} or backend/main.py)", name);
        None
    }
}

/// Shared backend process handle
struct BackendProcess(Mutex<Option<Child>>);

/// Try to spawn the backend (bundled exe or python main.py).
fn spawn_backend(app: &tauri::AppHandle) -> Option<Child> {
    let (program, args) = find_backend(Some(app))?;

    match Command::new(&program).args(&args).spawn() {
        Ok(child) => {
            info!("Backend started (PID: {})", child.id());
            Some(child)
        }
        Err(e) => {
            error!("Failed to start backend '{}': {}", program, e);
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

    tauri::Builder::default()
        .setup(|app| {
            // Spawn Python backend on startup
            let backend = spawn_backend(app.handle());
            app.manage(BackendProcess(Mutex::new(backend)));
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
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
