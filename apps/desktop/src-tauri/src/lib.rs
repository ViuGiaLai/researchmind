use log::{error, info, warn};
use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Default, Serialize, Clone)]
struct BackendSpawnStatus {
    attempted: bool,
    spawned: bool,
    program: Option<String>,
    error: Option<String>,
}

struct BackendState {
    process: Mutex<Option<Child>>,
    spawn_status: Mutex<BackendSpawnStatus>,
}

fn backend_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "backend.exe"
    } else {
        "backend"
    }
}

/// Check if a file is valid (exists and non-empty).
fn is_valid_executable(path: &Path) -> bool {
    path.exists() && path.metadata().map(|m| m.len() > 1024).unwrap_or(false)
}

fn is_backend_port_open() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8765));
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

fn is_researchmind_backend_healthy() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .and_then(|client| client.get("http://127.0.0.1:8765/api/ping").send())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn use_external_backend() -> bool {
    std::env::var("RESEARCHMIND_EXTERNAL_BACKEND")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

#[cfg(unix)]
fn ensure_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o755);
            if let Err(e) = std::fs::set_permissions(path, perms) {
                warn!("Could not chmod backend binary {:?}: {}", path, e);
            } else {
                info!("Set executable permission on {:?}", path);
            }
        }
    }
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) {}

fn push_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.iter().any(|p| p == &path) {
        candidates.push(path);
    }
}

fn bundled_backend_candidates(app: Option<&tauri::AppHandle>) -> Vec<PathBuf> {
    let name = backend_binary_name();
    let mut candidates = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            push_candidate(&mut candidates, exe_dir.join(name));
            push_candidate(&mut candidates, exe_dir.join("resources").join(name));
            // Linux .deb: binary in /usr/bin, resources in /usr/lib/<app>/
            if let Some(parent) = exe_dir.parent() {
                push_candidate(&mut candidates, parent.join("lib").join(name));
                push_candidate(
                    &mut candidates,
                    parent.join("lib").join("resources").join(name),
                );
                push_candidate(
                    &mut candidates,
                    parent
                        .join("lib")
                        .join("ResearchMind VN")
                        .join("resources")
                        .join(name),
                );
                push_candidate(
                    &mut candidates,
                    parent
                        .join("lib")
                        .join("researchmind-desktop")
                        .join("resources")
                        .join(name),
                );
            }
        }
    }

    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            push_candidate(&mut candidates, res_dir.join(name));
        }
        if let Ok(resolver) = app.path().resolve(name, tauri::path::BaseDirectory::Resource) {
            push_candidate(&mut candidates, resolver);
        }
    }

    candidates
}

/// Try to locate the backend executable.
/// Priority:
///   1. Backend binary in bundle / resource paths (production)
///   2. python main.py via venv (development)
fn find_backend(app: Option<&tauri::AppHandle>) -> Option<(String, Vec<String>, Option<PathBuf>)> {
    for bundled in bundled_backend_candidates(app) {
        info!(
            "Checking bundled backend: {} (exists: {}, size: {:?})",
            bundled.display(),
            bundled.exists(),
            bundled.metadata().map(|m| m.len()).ok()
        );
        if is_valid_executable(&bundled) {
            ensure_executable(&bundled);
            let cwd = bundled.parent().map(|p| p.to_path_buf());
            info!("Using bundled backend at: {:?}", bundled);
            return Some((
                bundled.to_string_lossy().to_string(),
                vec![],
                cwd,
            ));
        }
    }

    // Development: use python from venv or PATH
    let python_name = if cfg!(target_os = "windows") {
        "python.exe"
    } else {
        "python3"
    };

    let cargo_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let python = {
        let venv_win = cargo_dir.join("../../../.venv/Scripts/python.exe");
        let venv_unix = cargo_dir.join("../../../.venv/bin/python3");
        if venv_win.exists() {
            info!("Using venv python at: {:?}", venv_win);
            venv_win.to_string_lossy().to_string()
        } else if venv_unix.exists() {
            info!("Using venv python at: {:?}", venv_unix);
            venv_unix.to_string_lossy().to_string()
        } else {
            info!("Venv not found, using '{}' from PATH", python_name);
            python_name.to_string()
        }
    };

    let candidates = [
        cargo_dir.join("../../../backend/main.py"),
        cargo_dir.join("../../backend/main.py"),
        PathBuf::from("backend/main.py"),
        PathBuf::from("../backend/main.py"),
    ];

    for candidate in &candidates {
        info!(
            "Checking backend path: {} (exists: {})",
            candidate.display(),
            candidate.exists()
        );
        if candidate.exists() {
            info!("Using development mode: {} -u {}", python, candidate.display());
            let cwd = candidate.parent().map(|p| p.to_path_buf());
            return Some((
                python,
                vec!["-u".into(), candidate.to_string_lossy().to_string()],
                cwd,
            ));
        }
    }

    error!(
        "No backend found. Checked bundled paths and: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );
    None
}

fn apply_backend_env(command: &mut Command, cwd: Option<&Path>) {
    command
        .env("RESEARCHMIND_BACKEND_RELOAD", "0")
        .env("RESEARCHMIND_BUNDLED", "1")
        .env("PYTHONUNBUFFERED", "1");

    if let Some(dir) = cwd {
        command.env("RESEARCHMIND_RESOURCE_DIR", dir);
        let env_file = dir.join(".env");
        if env_file.exists() {
            command.env("RESEARCHMIND_ENV_FILE", &env_file);
            info!("Backend will load .env from {:?}", env_file);
        }
    }
}

/// Try to spawn the backend (bundled exe or python main.py).
fn spawn_backend(app: &tauri::AppHandle, status: &BackendSpawnStatus) -> (Option<Child>, BackendSpawnStatus) {
    let mut status = status.clone();

    if use_external_backend() {
        info!("RESEARCHMIND_EXTERNAL_BACKEND=1; using external backend at http://127.0.0.1:8765");
        return (None, status);
    }

    if is_backend_port_open() {
        if is_researchmind_backend_healthy() {
            info!("ResearchMind backend already running on http://127.0.0.1:8765");
            return (None, status);
        }
        warn!("Port 8765 is in use but /api/ping did not respond — attempting to spawn bundled backend");
    }

    status.attempted = true;

    let Some((program, args, cwd)) = find_backend(Some(app)) else {
        status.error = Some(
            "Không tìm thấy backend trong bản cài đặt. Vui lòng tải lại installer hoặc báo lỗi cho nhà phát triển.".into(),
        );
        return (None, status);
    };

    status.program = Some(program.clone());
    let spawn_started = Instant::now();

    let mut command = Command::new(&program);
    command.args(&args);
    apply_backend_env(&mut command, cwd.as_deref());
    if let Some(cwd) = cwd {
        info!("Starting backend with working directory: {:?}", cwd);
        command.current_dir(cwd);
    }

    match command.spawn() {
        Ok(child) => {
            status.spawned = true;
            info!(
                "Backend started (PID: {}) spawn_time_ms={}",
                child.id(),
                spawn_started.elapsed().as_millis()
            );
            (Some(child), status)
        }
        Err(e) => {
            let msg = format!("Không thể khởi chạy backend: {}", e);
            error!("{}", msg);
            status.error = Some(msg);
            (None, status)
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
    match reqwest::get("http://127.0.0.1:8765/api/ping").await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn get_backend_spawn_status(state: State<'_, BackendState>) -> Result<BackendSpawnStatus, String> {
    Ok(state.spawn_status.lock().map_err(|e| e.to_string())?.clone())
}

/// Kill the Python backend process.
#[tauri::command]
fn kill_backend(state: State<'_, BackendState>) -> Result<(), String> {
    if let Ok(mut guard) = state.process.lock() {
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
    info!(
        "Starting ResearchMind VN Desktop v{}",
        env!("CARGO_PKG_VERSION")
    );

    tauri::Builder::default()
        .setup(|app| {
            let (backend, spawn_status) = spawn_backend(app.handle(), &BackendSpawnStatus::default());
            app.manage(BackendState {
                process: Mutex::new(backend),
                spawn_status: Mutex::new(spawn_status),
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            select_folder,
            check_backend_health,
            get_backend_spawn_status,
            kill_backend,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(backend) = window.try_state::<BackendState>() {
                    if let Ok(mut guard) = backend.process.lock() {
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
