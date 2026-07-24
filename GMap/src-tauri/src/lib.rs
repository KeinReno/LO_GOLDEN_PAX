//! GMap desktop launcher (P8.6) — starts Node host + embeds the table UI.

use serde::Serialize;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State,
};

const HOST_PORT: u16 = 4173;
const DEV_PORT: u16 = 5173;

struct HostState {
    child: Mutex<Option<Child>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HostStatus {
    running: bool,
    port: u16,
    url: String,
    view_url: String,
    root: String,
    pid: Option<u32>,
    desktop: bool,
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn find_gmap_root() -> PathBuf {
    if let Ok(p) = std::env::var("GMAP_ROOT") {
        let path = PathBuf::from(p);
        if path.join("package.json").is_file() {
            return path;
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("package.json").is_file() && cwd.join("server").is_dir() {
            return cwd;
        }
        if cwd.join("../package.json").is_file() {
            return cwd
                .join("..")
                .canonicalize()
                .unwrap_or_else(|_| cwd.join(".."));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut cur = exe.parent().map(Path::to_path_buf);
        for _ in 0..6 {
            if let Some(ref dir) = cur {
                if dir.join("package.json").is_file() && dir.join("server").is_dir() {
                    return dir.clone();
                }
                cur = dir.parent().map(Path::to_path_buf);
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn spawn_host(root: &Path) -> Result<Child, String> {
    let serve = root.join("server").join("serve.mjs");
    if !serve.is_file() {
        return Err(format!("serve.mjs not found at {}", serve.display()));
    }
    let mut cmd = Command::new("node");
    cmd.arg(&serve)
        .current_dir(root)
        .env("PORT", HOST_PORT.to_string())
        .env("HOST", "127.0.0.1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
        .map_err(|e| format!("Не удалось запустить node: {e}. Нужен Node.js в PATH."))
}

fn wait_port(port: u16, tries: u32) -> bool {
    for _ in 0..tries {
        if port_open(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

fn kill_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn open_url(url: &str) {
    #[cfg(windows)]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

fn build_status(state: &HostState) -> HostStatus {
    let root = find_gmap_root();
    let mut guard = state.child.lock().unwrap();
    let mut pid = None;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
            }
            Ok(None) => {
                pid = Some(child.id());
            }
            Err(_) => {}
        }
    }
    drop(guard);

    let (port, url) = if port_open(DEV_PORT) {
        (DEV_PORT, format!("http://127.0.0.1:{DEV_PORT}"))
    } else {
        (HOST_PORT, format!("http://127.0.0.1:{HOST_PORT}"))
    };
    HostStatus {
        running: port_open(port),
        port,
        url: url.clone(),
        view_url: format!("{url}/view"),
        root: root.display().to_string(),
        pid,
        desktop: true,
    }
}

fn ensure_prod_host(state: &HostState) -> Result<HostStatus, String> {
    if port_open(DEV_PORT) || port_open(HOST_PORT) {
        return Ok(build_status(state));
    }
    let root = find_gmap_root();
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            if child.try_wait().ok().flatten().is_none() {
                drop(guard);
                let _ = wait_port(HOST_PORT, 40);
                return Ok(build_status(state));
            }
        }
        let child = spawn_host(&root)?;
        *guard = Some(child);
    }
    if !wait_port(HOST_PORT, 40) {
        return Err("Хост не ответил на порту 4173 за ~10с".into());
    }
    Ok(build_status(state))
}

#[tauri::command]
fn is_desktop() -> bool {
    true
}

#[tauri::command]
fn host_status(state: State<'_, HostState>) -> HostStatus {
    build_status(&state)
}

#[tauri::command]
fn start_host(state: State<'_, HostState>) -> Result<HostStatus, String> {
    ensure_prod_host(&state)
}

#[tauri::command]
fn stop_host(state: State<'_, HostState>) -> Result<HostStatus, String> {
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        kill_child(&mut child);
    }
    drop(guard);
    Ok(build_status(&state))
}

#[tauri::command]
fn open_data_folder() -> Result<String, String> {
    let root = find_gmap_root();
    let data = root.join("data");
    if !data.is_dir() {
        std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(data.as_os_str())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&data)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&data)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(data.display().to_string())
}

fn stop_host_on_exit(app: &AppHandle) {
    if let Some(state) = app.try_state::<HostState>() {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() {
            kill_child(&mut child);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(HostState {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            is_desktop,
            host_status,
            start_host,
            stop_host,
            open_data_folder
        ])
        .setup(|app| {
            let show_i =
                MenuItem::with_id(app, "show", "Показать стол", true, None::<&str>)?;
            let view_i =
                MenuItem::with_id(app, "view", "Открыть /view", true, None::<&str>)?;
            let data_i = MenuItem::with_id(app, "data", "Папка data", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &view_i, &data_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("GMap — стол кампании")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "view" => {
                        let port = if port_open(DEV_PORT) {
                            DEV_PORT
                        } else {
                            HOST_PORT
                        };
                        open_url(&format!("http://127.0.0.1:{port}/view"));
                    }
                    "data" => {
                        let _ = open_data_folder();
                    }
                    "quit" => {
                        stop_host_on_exit(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            #[cfg(not(debug_assertions))]
            {
                let state = app.state::<HostState>();
                match ensure_prod_host(&state) {
                    Ok(st) => {
                        eprintln!("[gmap] host at {}", st.url);
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.eval(&format!(
                                "window.location.replace('{}')",
                                st.url
                            ));
                        }
                    }
                    Err(e) => eprintln!("[gmap] host start failed: {e}"),
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building GMap")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                stop_host_on_exit(app_handle);
            }
        });
}
