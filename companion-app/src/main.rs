#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

const DEV: bool = option_env!("PUDDLE_DEV").is_some() || option_env!("JOULE_DEV").is_some();
const CHECKOUT: &str = if DEV || cfg!(debug_assertions) { env!("CARGO_MANIFEST_DIR") } else { "" };
const API: &str = if DEV { "127.0.0.1:4610" } else { "127.0.0.1:4600" };
const POPOVER: (f64, f64) = (328.0, 560.0);
const POPOVER_MARGIN: f64 = 14.0;
const ME: &str = if DEV { "http://127.0.0.1:4611/" } else { "http://127.0.0.1:4601/" };
const DATA: (&str, &str) = if DEV { (".puddle-dev", ".joule-dev") } else { (".puddle", ".joule") };
fn data_dir() -> Option<std::path::PathBuf> {
    std::env::var("PUDDLE_DIR").or_else(|_| std::env::var("JOULE_DIR")).map(std::path::PathBuf::from).ok()
        .or_else(|| std::env::var("HOME").ok().map(|h| {
            let (new, old) = (std::path::Path::new(&h).join(DATA.0), std::path::Path::new(&h).join(DATA.1));
            if new.exists() || !old.exists() { new } else { old }
        }))
}

fn move_data_dir() {
    if std::env::var_os("PUDDLE_DIR").is_some() || std::env::var_os("JOULE_DIR").is_some() { return; }
    let Some(home) = std::env::var_os("HOME") else { return };
    let (new, old) = (std::path::Path::new(&home).join(DATA.0), std::path::Path::new(&home).join(DATA.1));
    let real = std::fs::symlink_metadata(&old).map(|m| m.is_dir()).unwrap_or(false);
    if !real || new.exists() { return; }
    match std::fs::rename(&old, &new) {
        Ok(()) => { if let Err(e) = std::os::unix::fs::symlink(DATA.0, &old) { eprintln!("puddle: moved {} but couldn't link it back: {e}", DATA.1); } }
        Err(e) => eprintln!("puddle: couldn't move {} to {} ({e}): staying there", DATA.1, DATA.0),
    }
}

fn theme_now() -> Option<tauri::Theme> {
    let t = data_dir().and_then(|d| std::fs::read_to_string(d.join("theme")).ok()).unwrap_or_default();
    match t.trim() { "light" => Some(tauri::Theme::Light), "dark" => Some(tauri::Theme::Dark), _ => None }
}

fn is_dark() -> bool {
    match theme_now() {
        Some(t) => t == tauri::Theme::Dark,
        None => std::process::Command::new("defaults").args(["read", "-g", "AppleInterfaceStyle"]).output().map(|o| o.status.success()).unwrap_or(false),
    }
}
fn page_color(dark: bool) -> tauri::window::Color {
    if dark { tauri::window::Color(0x17, 0x15, 0x1a, 255) } else { tauri::window::Color(0xf7, 0xf2, 0xe9, 255) }
}
fn paint_bg(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("view") { let _ = w.set_background_color(Some(page_color(is_dark()))); }
}

fn set_theme(mode: &str) {
    if !["auto", "light", "dark"].contains(&mode) { return; }
    if let Some(d) = data_dir() { let _ = std::fs::create_dir_all(&d); let _ = std::fs::write(d.join("theme"), mode); }
}

fn mac_dark() -> bool {
    std::process::Command::new("defaults").args(["read", "-g", "AppleInterfaceStyle"]).output().map(|o| o.status.success()).unwrap_or(false)
}
fn tray_icon(dark: bool) -> Image<'static> {
    if dark { Image::from_bytes(include_bytes!("../icons/tray-dark.png")).expect("tray icon") } else { Image::from_bytes(include_bytes!("../icons/tray-light.png")).expect("tray icon") }
}
#[cfg(target_os = "macos")]
fn bar_dark(app: &AppHandle) -> Option<bool> {
    use objc2_app_kit::{NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua};
    use objc2_foundation::{MainThreadMarker, NSArray};
    let tray = app.tray_by_id("puddle")?;
    tray.with_inner_tray_icon(|t| {
        let mtm = MainThreadMarker::new()?;
        let button = t.ns_status_item()?.button(mtm)?;
        let names = unsafe { NSArray::from_slice(&[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]) };
        let best = button.effectiveAppearance().bestMatchFromAppearancesWithNames(&names)?;
        Some(unsafe { best.isEqualToString(NSAppearanceNameDarkAqua) })
    }).ok().flatten()
}
#[cfg(not(target_os = "macos"))]
fn bar_dark(_: &AppHandle) -> Option<bool> { None }
fn watch_menu_bar(app: &AppHandle) {
    use std::sync::atomic::{AtomicU8, Ordering};
    static SHOWN: AtomicU8 = AtomicU8::new(2);
    let app = app.clone();
    std::thread::spawn(move || {
        let mut first = true;
        loop {
            std::thread::sleep(if first { Duration::from_millis(400) } else { Duration::from_secs(2) });
            first = false;
            let a = app.clone();
            let _ = app.run_on_main_thread(move || {
                let dark = bar_dark(&a).unwrap_or_else(mac_dark);
                if SHOWN.swap(dark as u8, Ordering::Relaxed) == dark as u8 { return; }
                if let Some(tray) = a.tray_by_id("puddle") { let _ = tray.set_icon(Some(tray_icon(dark))); let _ = tray.set_icon_as_template(false); }
            });
        }
    });
}
fn watch_theme(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut last = theme_now();
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let now = theme_now();
            if now == last { continue; }
            last = now;
            let a = app.clone();
            let _ = app.run_on_main_thread(move || {
                for w in a.webview_windows().values() {
                    let _ = w.set_theme(now);
                    let _ = w.eval("document.dispatchEvent(new Event('visibilitychange'))");
                }
                paint_bg(&a);
            });
        }
    });
}

fn local(method: &str, path: &str) -> Option<String> {
    http(API, method, path, "")
}

fn http(host: &str, method: &str, path: &str, extra_headers: &str) -> Option<String> {
    let mut s = TcpStream::connect_timeout(&host.parse().ok()?, Duration::from_secs(2)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(20))).ok()?;
    write!(s, "{method} {path} HTTP/1.0\r\nHost: {host}\r\nx-puddle: 1\r\n{extra_headers}Content-Length: 0\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = String::new();
    s.read_to_string(&mut buf).ok()?;
    let (head, body) = buf.split_once("\r\n\r\n")?;
    let ok = head.split(' ').nth(1).is_some_and(|code| code.starts_with('2'));
    if !ok { eprintln!("puddle: {method} {path} -> {}", head.lines().next().unwrap_or("")); }
    ok.then(|| body.to_string())
}

fn ensure_services(app: &AppHandle) -> Option<std::process::Child> {
    if local("GET", "/api/choices").is_some() {
        return None;
    }
    let res = app.path().resource_dir().ok().map(|d| d.join("app"));
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));
    if let (Some(res), Some(exe_dir)) = (res, exe_dir) {
        let server = res.join("companion").join("server.js");
        let node = exe_dir.join("node");
        if server.exists() && node.exists() {
            let path = format!("{}:{}", exe_dir.display(), std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into()));
            let log = data_dir();
            if let Some(l) = &log { let _ = std::fs::create_dir_all(l); }
            let out = log.and_then(|l| std::fs::OpenOptions::new().create(true).append(true).open(l.join("companion.log")).ok());
            let mut cmd = std::process::Command::new(&node);
            cmd.arg("--disable-warning=ExperimentalWarning").arg(&server)
                .env("PATH", path)
                .env("PUDDLE_PLUGIN_BIN", res.join("plugin").join("bin").join("puddle"))
                .current_dir(&res);
            if let Some(d) = data_dir() { cmd.env("PUDDLE_DIR", d); }
            if DEV {
                cmd.env("PORT", "4610").env("PUDDLE_DEV", "1");
                if !CHECKOUT.is_empty() && std::path::Path::new(CHECKOUT).join("../service/server.js").exists() { cmd.env("PUDDLE_SERVICE_URL", "http://localhost:4500"); }
            }
            if let Some(f) = out { if let Ok(f2) = f.try_clone() { cmd.stdout(f).stderr(f2); } }
            match cmd.spawn() {
                Ok(child) => {
                    for _ in 0..40 { if local("GET", "/api/choices").is_some() { break; } std::thread::sleep(Duration::from_millis(150)); }
                    return Some(child);
                }
                Err(e) => eprintln!("puddle: couldn't start the local side: {e}"),
            }
            return None;
        }
    }
    if CHECKOUT.is_empty() { eprintln!("puddle: the bundled helper is missing"); return None; }
    let script = std::path::Path::new(CHECKOUT).join("../scripts/up.mjs");
    let path = format!("/opt/homebrew/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default());
    match std::process::Command::new("node").arg(&script).env("PATH", path).output() {
        Ok(o) => eprintln!("puddle: started services: {}", String::from_utf8_lossy(&o.stdout).trim()),
        Err(e) => eprintln!("puddle: couldn't start services ({e}); run `npm run up`"),
    }
    None
}

fn later(app: &AppHandle, f: impl FnOnce(AppHandle) + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || {
        let h = app.clone();
        let _ = app.run_on_main_thread(move || f(h));
    });
}

const SCHEMES: [&str; 2] = if DEV { ["puddle-dev", "joule-dev"] } else { ["puddle", "joule"] };

fn handle_link(app: &AppHandle, link: &str) {
    let Ok(u) = tauri::Url::parse(link) else { return };
    if !SCHEMES.contains(&u.scheme()) { return; }
    let get = |k: &str| u.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned()).unwrap_or_default();
    let enc = |v: String| v.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
    match u.host_str() {
        Some("pair") => show_main(app, &format!("/?app&pair={}&url={}", enc(get("code")), enc(get("url")))),
        Some("join") => show_main(app, &format!("/?app&join={}", enc(get("code")))),
        _ => {}
    }
}

static SPLASHED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
fn splash(b: WebviewWindowBuilder<'_, tauri::Wry, AppHandle>) -> WebviewWindowBuilder<'_, tauri::Wry, AppHandle> {
    if SPLASHED.swap(true, std::sync::atomic::Ordering::Relaxed) { return b; }
    let svg = |s: &str| serde_json::to_string(s).unwrap_or_default();
    let opened = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    b.initialization_script(format!("{}({}, {}, {opened});", include_str!("../splash.js").trim_end(),
            svg(include_str!("../../assets/logo/logo-light.svg")), svg(include_str!("../../assets/logo/logo-dark.svg"))))
}

fn just_updated(app: &AppHandle) -> bool {
    let built = app.path().resource_dir().ok().and_then(|d| std::fs::read_to_string(d.join("app/companion/BUILT")).ok()).unwrap_or_default();
    let Some(seen) = data_dir().map(|d| d.join("started-build")) else { return false };
    let last = std::fs::read_to_string(&seen).ok();
    let _ = std::fs::write(&seen, built.trim());
    last.map_or(true, |l| l.trim() != built.trim())
}

fn url(path: &str) -> WebviewUrl {
    WebviewUrl::External(format!("http://{API}{path}").parse().expect("valid url"))
}

fn on_action(app: &AppHandle) -> impl Fn(&tauri::Url) -> bool + Send + 'static {
    let app = app.clone();
    move |url: &tauri::Url| {
        let Some(action) = url.path().strip_prefix("/__joule/") else { return true };
        eprintln!("puddle: action {action}");
        let app = app.clone();
        let action = action.to_string();
        let _ = app.clone().run_on_main_thread(move || match action.as_str() {
            "onboarding_done" => onboarding_done(app),
            "open_settings" => open_settings(app),
            "open_account" => open_view(&app, &format!("{ME}go?to=%2Fsettings")),
            "open_dashboard" => open_dashboard(app),
            "open_me" => open_me(&app),
            "connect" => connect_in_browser(),
            t if t.starts_with("theme_") => set_theme(&t[6..]),
            "splash_done" => paint_bg(&app),
            "quit" => app.exit(0),
            "uninstall" => { set_open_at_login(&app, false); app.exit(0) }
            "close_main" => if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); },
            "hide_popover" => if let Some(w) = app.get_webview_window("popover") { let _ = w.hide(); },
            _ => eprintln!("puddle: unknown action"),
        });
        false
    }
}

fn main_window(app: &AppHandle) -> WebviewWindow {
    if let Some(w) = app.get_webview_window("main") {
        return w;
    }
    let w = splash(WebviewWindowBuilder::new(app, "main", url("/?app")))
        .on_navigation(on_action(app))
        .title("Puddle")
        .theme(theme_now())
        .inner_size(440.0, 760.0)
        .resizable(true)
        .build()
        .expect("main window");
    let hide = w.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::CloseRequested { api, .. } = e {
            api.prevent_close();
            let _ = hide.hide();
        }
    });
    w
}

fn show_main(app: &AppHandle, path: &str) {
    let w = main_window(app);
    if path != "/?app" {
        let _ = w.navigate(format!("http://{API}{path}").parse().expect("valid url"));
    }
    let _ = w.show();
    let _ = w.set_focus();
}

fn popover(app: &AppHandle) -> WebviewWindow {
    if let Some(w) = app.get_webview_window("popover") {
        return w;
    }
    let w = WebviewWindowBuilder::new(app, "popover", WebviewUrl::External(format!("{ME}popover?app").parse().expect("valid url")))
        .on_navigation(on_action(app))
        .inner_size(POPOVER.0, POPOVER.1)
        .theme(theme_now())
        .transparent(true)
        .shadow(false)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .expect("popover window");
    let me = w.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::Focused(false) = e {
            let _ = me.hide();
        }
    });
    w
}

fn toggle_popover(app: &AppHandle, rect: Rect) {
    let w = popover(app);
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    let scale = w.scale_factor().unwrap_or(2.0);
    let pos = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    let width = POPOVER.0 * scale;
    let _ = w.set_position(PhysicalPosition::new((pos.x + size.width / 2.0 - width / 2.0).max(0.0), pos.y + size.height + (4.0 - POPOVER_MARGIN) * scale));
    let _ = w.eval("window.puddleRefresh && window.puddleRefresh()");
    let _ = w.show();
    let _ = w.set_focus();
}

fn onboarding_done(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    set_open_at_login(&app, true);
    open_me(&app);
    update_title(&app);
}

fn read_place() -> Option<serde_json::Value> {
    std::fs::read_to_string(data_dir()?.join("window.json")).ok().and_then(|s| serde_json::from_str(&s).ok())
}
fn save_place(w: &WebviewWindow, open: bool) {
    let Some(file) = data_dir().map(|d| d.join("window.json")) else { return };
    let mut v = read_place().filter(|v| v.is_object()).unwrap_or_else(|| serde_json::json!({}));
    if open {
        if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
            v["x"] = p.x.into(); v["y"] = p.y.into(); v["w"] = s.width.into(); v["h"] = s.height.into();
        }
    }
    v["open"] = open.into();
    let _ = std::fs::write(file, v.to_string());
}
fn restore_place(w: &WebviewWindow) {
    let Some(v) = read_place() else { return };
    let (Some(x), Some(y), Some(width), Some(height)) = (v["x"].as_i64(), v["y"].as_i64(), v["w"].as_u64(), v["h"].as_u64()) else { return };
    let on_screen = w.available_monitors().unwrap_or_default().iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        x + 40 >= p.x as i64 && x + 40 < p.x as i64 + s.width as i64 && y + 10 >= p.y as i64 && y + 10 < p.y as i64 + s.height as i64
    });
    let _ = w.set_size(tauri::PhysicalSize::new(width as u32, height as u32));
    if on_screen { let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32)); }
}

fn open_view(app: &AppHandle, url: &str) {
    if let Some(p) = app.get_webview_window("popover") {
        let _ = p.hide();
    }
    let Ok(target) = url.parse::<tauri::Url>() else { return };
    let w = match app.get_webview_window("view") {
        Some(w) => { let _ = w.navigate(target); w }
        None => match splash(WebviewWindowBuilder::new(app, "view", WebviewUrl::External(target)).background_color(page_color(is_dark())))
            .on_navigation(on_action(app))
            .title("Puddle")
            .theme(theme_now())
            .inner_size(1240.0, 860.0)
            .min_inner_size(420.0, 500.0)
            .visible(false)
            .build()
        {
            Ok(w) => {
                restore_place(&w);
                let me = w.clone();
                w.on_window_event(move |e| match e {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => save_place(&me, true),
                    WindowEvent::CloseRequested { .. } => save_place(&me, false),
                    WindowEvent::ThemeChanged(_) => { let _ = me.set_background_color(Some(page_color(is_dark()))); }
                    _ => {}
                });
                w
            }
            Err(e) => { eprintln!("puddle: window: {e}"); return; }
        },
    };
    let _ = w.show();
    let _ = w.set_focus();
    save_place(&w, true);
}

fn open_me(app: &AppHandle) { open_view(app, ME); }


fn open_dashboard(app: AppHandle) { open_view(&app, &format!("{ME}go?to=team")); }

fn connect_in_browser() {
    let service = local("GET", "/api/status")
        .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
        .and_then(|v| v["service"].as_str().map(str::to_string))
        .filter(|u| u.starts_with("https://") || u.starts_with("http://127.0.0.1:") || u.starts_with("http://localhost:"));
    let Some(service) = service else { eprintln!("puddle: no service address to connect to"); return };
    let _ = std::process::Command::new("open").arg(format!("{}/get?connect=1", service.trim_end_matches('/'))).spawn();
}

fn open_settings(app: AppHandle) {
    open_view(&app, &format!("{ME}mac"));
}

fn update_title(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("puddle") {
        let _ = tray.set_title(if DEV { Some("DEV") } else { None });
    }
}

struct LoginItem(CheckMenuItem<tauri::Wry>);

fn moved_login_item(app: &AppHandle) {
    let name = app.package_info().name.clone();
    if DEV || name == "Joule" { return; }
    let Some(home) = std::env::var_os("HOME") else { return };
    let old = std::path::Path::new(&home).join("Library/LaunchAgents/Joule.plist");
    if old.exists() && std::fs::remove_file(&old).is_ok() { set_open_at_login(app, true); }
}

fn set_open_at_login(app: &AppHandle, on: bool) {
    use tauri_plugin_autostart::ManagerExt;
    if DEV { return; }
    let on = on && !std::env::current_exe().map(|p| p.to_string_lossy().contains("/AppTranslocation/")).unwrap_or(false);
    let r = if on { app.autolaunch().enable() } else { app.autolaunch().disable() };
    if let Err(e) = r { eprintln!("puddle: open at login: {e}"); }
    let now = app.autolaunch().is_enabled().unwrap_or(false);
    if let Some(item) = app.try_state::<LoginItem>() { let _ = item.0.set_checked(now); }
}

struct Companion(std::sync::Mutex<Option<std::process::Child>>);

fn any_window_visible(app: &AppHandle) -> bool {
    ["view", "main", "popover"].iter().any(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false))
}

struct UpdateMenu { menu: Menu<tauri::Wry>, item: MenuItem<tauri::Wry>, shown: std::sync::Mutex<Option<String>> }

fn check_update(app: &AppHandle) {
    let Some(v) = local("GET", "/api/update").and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok()) else { return };
    if !v["available"].as_bool().unwrap_or(false) { return; }
    if v["autoDue"].as_bool().unwrap_or(false) && !any_window_visible(app) {
        std::thread::spawn(|| { local("POST", "/api/update/install"); });
        return;
    }
    let latest = v["latest"].as_str().unwrap_or("").to_string();
    let Some(st) = app.try_state::<UpdateMenu>() else { return };
    let mut shown = st.shown.lock().unwrap();
    if shown.as_deref() == Some(latest.as_str()) { return; }
    let first = shown.is_none();
    *shown = Some(latest);
    drop(shown);
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        let st = h.state::<UpdateMenu>();
        if first { let _ = st.menu.insert(&st.item, 0); }
        use tauri_plugin_notification::NotificationExt;
        let _ = h.notification().builder().title("A new Puddle is ready")
            .body("Click ✱ in the menu bar, then Install. It takes a minute.").show();
    });
}

fn main() {
    move_data_dir();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let links: Vec<String> = argv.into_iter().filter(|a| SCHEMES.iter().any(|s| a.starts_with(&format!("{s}://")))).collect();
            later(app, move |app| for a in &links { handle_link(&app, a); });
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            watch_theme(app.handle());
            watch_menu_bar(app.handle());

            moved_login_item(app.handle());
            let me = MenuItem::with_id(app, "me", "Me", true, None::<&str>)?;
            let dash = MenuItem::with_id(app, "dash", "Team dashboard", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Settings…", true, None::<&str>)?;
            let at_login = {
                use tauri_plugin_autostart::ManagerExt;
                app.autolaunch().is_enabled().unwrap_or(false)
            };
            let login = CheckMenuItem::with_id(app, "login", "Open at login", true, at_login, None::<&str>)?;
            app.manage(LoginItem(login.clone()));
            let remove = MenuItem::with_id(app, "remove", "Remove Puddle…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Puddle", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = if DEV {
                let reset = MenuItem::with_id(app, "reset", "Reset onboarding (dev)", true, None::<&str>)?;
                Menu::with_items(app, &[&me, &dash, &sep, &open, &login, &reset, &PredefinedMenuItem::separator(app)?, &remove, &quit])?
            } else {
                Menu::with_items(app, &[&me, &dash, &sep, &open, &login, &PredefinedMenuItem::separator(app)?, &remove, &quit])?
            };
            let upd = MenuItem::with_id(app, "update", "Install update…", true, None::<&str>)?;
            app.manage(UpdateMenu { menu: menu.clone(), item: upd, shown: std::sync::Mutex::new(None) });

            TrayIconBuilder::with_id("puddle")
                .icon(tray_icon(mac_dark()))
                .icon_as_template(false)
                .title(if DEV { "DEV" } else { "" })
                .tooltip("Puddle")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| {
                    let id = e.id.as_ref().to_string();
                    later(app, move |app| match id.as_str() {
                        "me" => open_me(&app),
                        "dash" => open_dashboard(app.clone()),
                        "open" => open_settings(app.clone()),
                        "reset" => show_main(&app, "/?app&reset"),
                        "remove" => show_main(&app, "/?app&remove"),
                        "login" => {
                            use tauri_plugin_autostart::ManagerExt;
                            let on = app.autolaunch().is_enabled().unwrap_or(false);
                            set_open_at_login(&app, !on);
                        }
                        "quit" => app.exit(0),
                        "update" => {
                            if let Some(st) = app.try_state::<UpdateMenu>() { let _ = st.item.set_text("Installing update…"); let _ = st.item.set_enabled(false); }
                            std::thread::spawn(|| { local("POST", "/api/update/install"); });
                        }
                        _ => {}
                    });
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = e {
                        later(tray.app_handle(), move |app| toggle_popover(&app, rect));
                    }
                })
                .build(app)?;

            let child = ensure_services(app.handle());
            app.manage(Companion(std::sync::Mutex::new(child)));
            {
                let h = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(30));
                    let Some(state) = h.try_state::<Companion>() else { continue };
                    let exited = match state.0.lock() {
                        Ok(mut g) => match g.as_mut() { Some(c) => matches!(c.try_wait(), Ok(Some(_))), None => false },
                        Err(_) => false,
                    };
                    if !exited || local("GET", "/api/choices").is_some() { continue; }
                    eprintln!("puddle: the engine stopped; starting it again");
                    let fresh = ensure_services(&h);
                    if let Ok(mut g) = state.0.lock() { *g = fresh; };
                });
            }
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let links: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                    later(&h, move |app| for u in &links { handle_link(&app, u); });
                });
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for u in urls { handle_link(app.handle(), u.as_str()); }
                }
            }
            let handle = app.handle().clone();
            popover(&handle);
            let fresh = local("GET", "/api/status")
                .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
                .map_or(true, |v| v["needsSetup"].as_bool().unwrap_or(true) || v["translocated"].as_bool().unwrap_or(false));
            if fresh {
                show_main(&handle, "/?app");
            } else {
                let updated = just_updated(&handle);
                if read_place().and_then(|v| v["open"].as_bool()).unwrap_or(!updated) { open_me(&handle); }
            }
            if std::env::var("PUDDLE_SELFTEST").as_deref() == Ok("team") {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    eprintln!("selftest: menu bar title = {:?}", local("GET", "/api/today").and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok()).and_then(|v| v["label"].as_str().map(str::to_string)));
                    let h2 = h.clone();
                    let _ = h.run_on_main_thread(move || open_dashboard(h2));
                    std::thread::sleep(Duration::from_secs(5));
                    let h3 = h.clone();
                    let _ = h.run_on_main_thread(move || {
                        eprintln!("selftest: team window at {:?}, visible = {:?}", h3.get_webview_window("view").and_then(|w| w.url().ok()).map(|u| u.path().to_string()), h3.get_webview_window("view").map(|w| w.is_visible()));
                    });
                });
            } else if std::env::var("PUDDLE_SELFTEST").is_ok() {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(5));
                    let h2 = h.clone();
                    let _ = h.run_on_main_thread(move || {
                        let w = main_window(&h2);
                        eprintln!("selftest: main visible before = {:?}", w.is_visible());
                        let _ = w.eval("location.href = '/__joule/onboarding_done'");
                    });
                    std::thread::sleep(Duration::from_secs(3));
                    let h3 = h.clone();
                    let _ = h.run_on_main_thread(move || {
                        eprintln!("selftest: main visible after = {:?}, me visible = {:?}", h3.get_webview_window("main").map(|w| w.is_visible()), h3.get_webview_window("view").map(|w| w.is_visible()));
                    });
                });
            }
            let h_upd = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(20));
                check_update(&h_upd);
                std::thread::sleep(Duration::from_secs(10 * 60));
            });
            update_title(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Puddle")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(c) = app.try_state::<Companion>() {
                    if let Some(mut child) = c.0.lock().ok().and_then(|mut g| g.take()) { let _ = child.kill(); }
                }
            }
        });
}
