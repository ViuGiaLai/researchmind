use log::{error, info};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

fn backend_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "backend.exe"
    } else {
        "backend"
    }
}

/// Check if a file is valid (exists and non-empty).
fn is_valid_executable(path: &std::path::Path) -> bool {
    path.exists() && path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

/// Try to locate the backend executable.
/// Priority:
///   1. Backend binary next to Tauri binary (production bundle)
///   2. Backend binary in Tauri resource dir (bundled via `resources`)
///   3. python main.py via venv (development)
fn find_backend(app: Option<&tauri::AppHandle>) -> Option<(String, Vec<String>, Option<PathBuf>)> {
    let name = backend_binary_name();

    // 1. Check next to the app binary
    if let Ok(exe_dir) = std::env::current_exe().map(|p| {
        p.parent().unwrap_or(std::path::Path::new(".")).to_path_buf()
    }) {
        let bundled = exe_dir.join(name);
        if is_valid_executable(&bundled) {
            info!("Found bundled {} at: {:?}", name, bundled);
            return Some((bundled.to_string_lossy().to_string(), vec![], Some(exe_dir)));
        }
    }

    // 2. Check Tauri resource directory
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let resource_path = res_dir.join(name);
            if is_valid_executable(&resource_path) {
                info!("Found {} in resource dir: {:?}", name, resource_path);
                return Some((resource_path.to_string_lossy().to_string(), vec![], Some(res_dir)));
            }
        }
    }

    // 3. Development: use python from venv or PATH
    let python_name = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };

    // Find python: prefer venv, then PATH
    let cargo_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let python = {
        let venv = cargo_dir.join("../../.venv/Scripts/python.exe");
        if venv.exists() {
            info!("Using venv python at: {:?}", venv);
            venv.to_string_lossy().to_string()
        } else {
            info!("Venv not found, using '{}' from PATH", python_name);
            python_name.to_string()
        }
    };

    // Try multiple candidate paths for main.py
    let candidates = [
        cargo_dir.join("../../backend/main.py"),                    // manifest dir
        PathBuf::from("backend/main.py"),                           // current working dir
        PathBuf::from("../backend/main.py"),                        // one level up
    ];

    let mut main_py = None;
    for candidate in &candidates {
        info!("Checking backend path: {} (exists: {})", candidate.display(), candidate.exists());
        if candidate.exists() {
            main_py = Some(candidate.to_path_buf());
            break;
        }
    }

    if let Some(path) = main_py {
        info!("Using development mode: {} -u {}", python, path.display());
        let cwd = path.parent().map(|p| p.to_path_buf());
        Some((python, vec!["-u".into(), path.to_string_lossy().to_string()], cwd))
    } else {
        error!(
            "No backend found. Checked: {}",
            candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
        );
        None
    }
}

/// Shared backend process handle
struct BackendProcess(Mutex<Option<Child>>);

/// Try to spawn the backend (bundled exe or python main.py).
fn spawn_backend(app: &tauri::AppHandle) -> Option<Child> {
    let (program, args, cwd) = find_backend(Some(app))?;

    let mut command = Command::new(&program);
    command.args(&args).env("RESEARCHMIND_BACKEND_RELOAD", "0");
    if let Some(cwd) = cwd {
        info!("Starting backend with working directory: {:?}", cwd);
        command.current_dir(cwd);
    }

    match command.spawn() {
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
