use log::{error, info, warn};
use serde::Serialize;
use std::fs;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
struct BackendJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
unsafe impl Send for BackendJob {}

#[cfg(target_os = "windows")]
impl BackendJob {
    fn assign(child: &Child) -> Result<Self, std::io::Error> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(std::io::Error::last_os_error());
        }

        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(limits).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
        };
        let assigned = configured != 0
            && unsafe { AssignProcessToJobObject(handle, child.as_raw_handle() as _) } != 0;
        if !assigned {
            let error = std::io::Error::last_os_error();
            unsafe {
                CloseHandle(handle);
            }
            return Err(error);
        }

        Ok(Self(handle))
    }
}

#[cfg(target_os = "windows")]
impl Drop for BackendJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

struct BackendProcess {
    child: Child,
    #[cfg(target_os = "windows")]
    job: Option<BackendJob>,
}

impl BackendProcess {
    fn new(child: Child) -> Self {
        #[cfg(target_os = "windows")]
        let job = match BackendJob::assign(&child) {
            Ok(job) => Some(job),
            Err(error) => {
                warn!(
                    "Could not attach backend PID {} to a Windows Job Object: {}",
                    child.id(),
                    error
                );
                None
            }
        };

        Self {
            child,
            #[cfg(target_os = "windows")]
            job,
        }
    }

    fn id(&self) -> u32 {
        self.child.id()
    }

    fn has_exited(&mut self) -> Result<bool, std::io::Error> {
        Ok(self.child.try_wait()?.is_some())
    }

    fn terminate(&mut self) {
        #[cfg(target_os = "windows")]
        if self.job.take().is_none() {
            let _ = self.child.kill();
        }

        #[cfg(not(target_os = "windows"))]
        let _ = self.child.kill();

        let _ = self.child.wait();
    }
}
#[derive(Default, Serialize, Clone)]
struct BackendSpawnStatus {
    attempted: bool,
    spawned: bool,
    program: Option<String>,
    error: Option<String>,
}

struct BackendState {
    process: Mutex<Option<BackendProcess>>,
    spawn_status: Mutex<BackendSpawnStatus>,
    shutting_down: AtomicBool,
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
        if let Ok(resolver) = app
            .path()
            .resolve(name, tauri::path::BaseDirectory::Resource)
        {
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
            return Some((bundled.to_string_lossy().to_string(), vec![], cwd));
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
            info!(
                "Using development mode: {} -u {}",
                python,
                candidate.display()
            );
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

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn configure_backend_process(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(any(not(target_os = "windows"), debug_assertions))]
fn configure_backend_process(_command: &mut Command) {}

/// Try to spawn the backend (bundled exe or python main.py).
fn spawn_backend(
    app: &tauri::AppHandle,
    status: &BackendSpawnStatus,
) -> (Option<BackendProcess>, BackendSpawnStatus) {
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
    configure_backend_process(&mut command);
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
            (Some(BackendProcess::new(child)), status)
        }
        Err(e) => {
            let msg = format!("Không thể khởi chạy backend: {}", e);
            error!("{}", msg);
            status.error = Some(msg);
            (None, status)
        }
    }
}

fn start_backend_supervisor(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut restart_pending = false;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let state = app.state::<BackendState>();
            if state.shutting_down.load(Ordering::Acquire) {
                break;
            }

            if !restart_pending {
                restart_pending = match state.process.lock() {
                    Ok(mut guard) => {
                        match guard.as_mut() {
                            Some(backend) => match backend.has_exited() {
                                Ok(true) => {
                                    warn!("Backend process tree exited unexpectedly; scheduling restart");
                                    guard.take();
                                    true
                                }
                                Ok(false) => false,
                                Err(error) => {
                                    warn!("Could not inspect backend process state: {}", error);
                                    false
                                }
                            },
                            None => false,
                        }
                    }
                    Err(error) => {
                        error!("Backend supervisor lock failed: {}", error);
                        break;
                    }
                };
            }

            if !restart_pending {
                continue;
            }

            std::thread::sleep(Duration::from_millis(250));
            if state.shutting_down.load(Ordering::Acquire) {
                break;
            }

            let (replacement, spawn_status) = spawn_backend(&app, &BackendSpawnStatus::default());
            if let Ok(mut status) = state.spawn_status.lock() {
                *status = spawn_status;
            }

            let Some(mut replacement) = replacement else {
                if is_researchmind_backend_healthy() {
                    info!("Backend recovered through an existing healthy process");
                    restart_pending = false;
                } else {
                    warn!("Backend restart deferred; retrying in the background");
                }
                continue;
            };

            if state.shutting_down.load(Ordering::Acquire) {
                replacement.terminate();
                break;
            }

            let replacement_pid = replacement.id();
            match state.process.lock() {
                Ok(mut guard) => {
                    *guard = Some(replacement);
                    restart_pending = false;
                    info!("Backend restarted successfully (PID: {})", replacement_pid);
                }
                Err(error) => {
                    error!("Could not store restarted backend process: {}", error);
                    replacement.terminate();
                    break;
                }
            };
        }
    });
}

/// Read the one immutable bootstrap URL bundled with the desktop app.
/// All mutable public client settings are fetched from this Gateway at runtime.
#[tauri::command]
fn read_gateway_config(app: tauri::AppHandle) -> Result<String, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("gateway.json"));
        candidates.push(resource_dir.join("resources").join("gateway.json"));
    }
    if let Ok(path) = app
        .path()
        .resolve("gateway.json", tauri::path::BaseDirectory::Resource)
    {
        candidates.push(path);
    }

    for path in candidates {
        if path.is_file() {
            return fs::read_to_string(&path).map_err(|error| {
                format!(
                    "Could not read bundled gateway.json at {}: {}",
                    path.display(),
                    error
                )
            });
        }
    }
    Err("Bundled gateway.json was not found.".into())
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
    Ok(state
        .spawn_status
        .lock()
        .map_err(|e| e.to_string())?
        .clone())
}

/// Kill the Python backend process.
#[tauri::command]
fn kill_backend(state: State<'_, BackendState>) -> Result<(), String> {
    state.shutting_down.store(true, Ordering::Release);
    if let Ok(mut guard) = state.process.lock() {
        if let Some(mut backend) = guard.take() {
            info!(
                "Killing Python backend process tree (PID: {})",
                backend.id()
            );
            backend.terminate();
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
            let (backend, spawn_status) =
                spawn_backend(app.handle(), &BackendSpawnStatus::default());
            let supervise_backend = backend.is_some();
            app.manage(BackendState {
                process: Mutex::new(backend),
                spawn_status: Mutex::new(spawn_status),
                shutting_down: AtomicBool::new(false),
            });
            if supervise_backend {
                start_backend_supervisor(app.handle().clone());
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            select_folder,
            check_backend_health,
            get_backend_spawn_status,
            kill_backend,
            read_gateway_config,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(backend) = window.try_state::<BackendState>() {
                    backend.shutting_down.store(true, Ordering::Release);
                    if let Ok(mut guard) = backend.process.lock() {
                        if let Some(mut backend) = guard.take() {
                            info!("Shutting down Python backend process tree...");
                            backend.terminate();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
