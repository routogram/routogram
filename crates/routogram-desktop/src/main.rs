#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, State};

const DAEMON_PORT_START: u16 = 4040;
const DAEMON_PORT_END: u16 = 4050;

struct DaemonState {
    child: Mutex<Option<Child>>,
    daemon_url: String,
    port: u16,
    cli_entry: PathBuf,
    working_dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeInfo {
    is_desktop: bool,
    daemon_url: String,
    platform: String,
}

#[tauri::command]
fn desktop_runtime_info(state: State<'_, DaemonState>) -> DesktopRuntimeInfo {
    DesktopRuntimeInfo {
        is_desktop: true,
        daemon_url: state.daemon_url.clone(),
        platform: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
fn desktop_restart_daemon(state: State<'_, DaemonState>) -> bool {
    restart_daemon(&state)
}

fn restart_daemon(state: &DaemonState) -> bool {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child_proc) = guard.take() {
            let _ = child_proc.kill();
            let _ = child_proc.wait();
        }
    }

    std::thread::sleep(Duration::from_millis(100));
    let child = spawn_hono_daemon(&state.cli_entry, &state.working_dir, state.port);
    let ready = wait_for_daemon_ready(state.port, 2_500);
    if let Ok(mut guard) = state.child.lock() {
        *guard = child;
    }
    ready
}

#[tauri::command]
fn desktop_pick_directory() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                "POSIX path of (choose folder with prompt \"Select Workspace or src Folder\")",
            ])
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).is_dir() {
                return Some(path);
            }
        }
        None
    }
    #[cfg(target_os = "linux")]
    {
        for (program, args) in [
            (
                "zenity",
                vec!["--file-selection", "--directory", "--title=Select Workspace Folder"],
            ),
            (
                "kdialog",
                vec!["--getexistingdirectory", ".", "--title", "Select Workspace Folder"],
            ),
        ] {
            let Ok(output) = Command::new(program).args(args).output() else {
                continue;
            };
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && Path::new(&path).is_dir() {
                    return Some(path);
                }
            }
        }
        None
    }
    #[cfg(target_os = "windows")]
    {
        let script = [
            "Add-Type -AssemblyName System.Windows.Forms;",
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;",
            '$dialog.Description = "Select Workspace or src Folder";',
            "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
            "  Write-Output $dialog.SelectedPath",
            "}",
        ]
        .join(" ");
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .output()
            .ok()?;
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).is_dir() {
                return Some(path);
            }
        }
        None
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn repository_root() -> PathBuf {
    if let Ok(root) = std::env::var("ROUTOGRAM_REPO_ROOT") {
        return PathBuf::from(root);
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_daemon_entry(repo_root: &Path) -> Option<PathBuf> {
    if let Ok(entry) = std::env::var("ROUTOGRAM_DAEMON_ENTRY") {
        let path = PathBuf::from(entry);
        if path.exists() {
            return Some(path);
        }
    }

    let mut candidates = Vec::new();
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            candidates.push(parent.join("resources/daemon/dist/index.js"));
            candidates.push(parent.join("../Resources/daemon/dist/index.js"));
        }
    }
    candidates.push(repo_root.join("crates/routogram-desktop/resources/daemon/dist/index.js"));
    candidates.push(repo_root.join("packages/cli/dist/index.js"));

    candidates.into_iter().find(|path| path.exists())
}

fn allocate_port() -> u16 {
    for port in DAEMON_PORT_START..=DAEMON_PORT_END {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    DAEMON_PORT_START
}

fn wait_for_daemon_ready(port: u16, timeout_ms: u64) -> bool {
    let address = format!("127.0.0.1:{port}");
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &address.parse().expect("valid daemon address"),
            Duration::from_millis(200),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

fn spawn_hono_daemon(entry: &Path, working_dir: &Path, port: u16) -> Option<Child> {
    if !entry.exists() {
        return None;
    }

    Command::new("node")
        .arg(entry)
        .args([
            "start",
            "--no-open",
            "--no-canvas",
            "--port",
            &port.to_string(),
        ])
        .current_dir(working_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

fn main() {
    let repo_root = repository_root();
    let cli_entry = resolve_daemon_entry(&repo_root);
    let port = allocate_port();
    let daemon_url = format!("http://127.0.0.1:{port}");

    let child = cli_entry
        .as_deref()
        .and_then(|entry| spawn_hono_daemon(entry, &repo_root, port));
    if child.is_some() {
        let _ = wait_for_daemon_ready(port, 2_500);
    }

    let app = tauri::Builder::default()
        .manage(DaemonState {
            child: Mutex::new(child),
            daemon_url,
            port,
            cli_entry: cli_entry.unwrap_or_else(|| repo_root.join("packages/cli/dist/index.js")),
            working_dir: repo_root,
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_restart_daemon,
            desktop_pick_directory
        ])
        .build(tauri::generate_context!())
        .expect("error while building Routogram desktop application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<DaemonState>() {
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(mut child_proc) = guard.take() {
                        let _ = child_proc.kill();
                        let _ = child_proc.wait();
                    }
                }
            }
        }
    });
}
