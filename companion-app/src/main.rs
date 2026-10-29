// Puddle's menu bar app: the tray icon with today's time, the popover, the onboarding and settings windows, and Me.
// The screens are the helper's pages (companion/public); the helper itself is the Node engine bundled with the app
// (companion/server.js), started here and started again if it stops (the watchdog below).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

/// Puddle Dev (built with JOULE_DEV=1, see scripts/dev-app.mjs): a second Puddle beside the real one for
/// testing every change before it ships. Its own ports and folder, talks to the local website (:4500),
/// never touches Claude Code's settings, never registers to open at login.
const DEV: bool = option_env!("JOULE_DEV").is_some();
const API: &str = if DEV { "127.0.0.1:4610" } else { "127.0.0.1:4600" };
const POPOVER: (f64, f64) = (300.0, 440.0);
/// The personal dashboard ("Me"): the team view's UI, built only from this device.
const ME: &str = if DEV { "http://127.0.0.1:4611/" } else { "http://127.0.0.1:4601/" };
/// Where this Puddle keeps its sign-in and history copy.
fn joule_dir() -> Option<std::path::PathBuf> {
    std::env::var("JOULE_DIR").map(std::path::PathBuf::from).ok()
        .or_else(|| std::env::var("HOME").ok().map(|h| std::path::Path::new(&h).join(if DEV { ".joule-dev" } else { ".joule" })))
}

/// The theme every Puddle screen uses (auto | light | dark, in ~/.joule/theme): Light/Dark, or None to follow macOS.
/// The window frames follow it, so they match the page inside.
fn theme_now() -> Option<tauri::Theme> {
    let t = joule_dir().and_then(|d| std::fs::read_to_string(d.join("theme")).ok()).unwrap_or_default();
    match t.trim() { "light" => Some(tauri::Theme::Light), "dark" => Some(tauri::Theme::Dark), _ => None }
}

/// The website inside Puddle's window changed the theme: save it as Puddle's setting (the watcher themes the windows).
fn set_theme(mode: &str) {
    if !["auto", "light", "dark"].contains(&mode) { return; }
    if let Some(d) = joule_dir() { let _ = std::fs::create_dir_all(&d); let _ = std::fs::write(d.join("theme"), mode); }
}

/// Keep every window in Puddle's theme: checks the setting once a second (any screen can change it) and, when it
/// changes, themes the window frames, and lets Puddle's own pages re-read it.
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
            });
        }
    });
}

/// Minimal HTTP to the local API (localhost only, no TLS, tiny bodies).
fn local(method: &str, path: &str) -> Option<String> {
    http(API, method, path, "")
}

/// Plain HTTP for 127.0.0.1 services. The cloud (https) will need a real client.
/// HTTP/1.0 on purpose: servers then send the body as-is instead of chunked.
fn http(host: &str, method: &str, path: &str, extra_headers: &str) -> Option<String> {
    let mut s = TcpStream::connect_timeout(&host.parse().ok()?, Duration::from_secs(2)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(20))).ok()?;
    write!(s, "{method} {path} HTTP/1.0\r\nHost: {host}\r\nx-joule: 1\r\n{extra_headers}Content-Length: 0\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = String::new();
    s.read_to_string(&mut buf).ok()?;
    let (head, body) = buf.split_once("\r\n\r\n")?;
    let ok = head.split(' ').nth(1).is_some_and(|code| code.starts_with('2'));
    if !ok { eprintln!("joule: {method} {path} -> {}", head.lines().next().unwrap_or("")); }
    ok.then(|| body.to_string())
}

/// The local side (onboarding, popover API, Me) runs on the Node copy bundled inside Puddle.app,
/// from the app's own resources: testers need nothing installed. Development builds fall back to
/// the repo's `scripts/up.mjs`. Returns the child process to stop when Puddle quits.
fn ensure_services(app: &AppHandle) -> Option<std::process::Child> {
    if local("GET", "/api/choices").is_some() {
        return None; // already running (e.g. `npm run up` while developing)
    }
    let res = app.path().resource_dir().ok().map(|d| d.join("app"));
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));
    if let (Some(res), Some(exe_dir)) = (res, exe_dir) {
        let server = res.join("companion").join("server.js");
        let node = exe_dir.join("node");
        if server.exists() && node.exists() {
            // the plugin script (switching tracking on) also finds this Node first on PATH
            let path = format!("{}:{}", exe_dir.display(), std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into()));
            let log = joule_dir();
            if let Some(l) = &log { let _ = std::fs::create_dir_all(l); }
            let out = log.and_then(|l| std::fs::OpenOptions::new().create(true).append(true).open(l.join("companion.log")).ok());
            let mut cmd = std::process::Command::new(&node);
            cmd.arg("--disable-warning=ExperimentalWarning").arg(&server)
                .env("PATH", path)
                .env("JOULE_PLUGIN_BIN", res.join("plugin").join("bin").join("joule"))
                .current_dir(&res);
            if DEV {
                // its own ports and folder, hands off Claude Code's settings, and the local website when this checkout
                // has one (service/, not in the public repository: without it, Puddle Dev works on this Mac only)
                if let Some(d) = joule_dir() { cmd.env("JOULE_DIR", d); }
                cmd.env("PORT", "4610").env("JOULE_DEV", "1");
                if std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../service/server.js").exists() { cmd.env("JOULE_SERVICE_URL", "http://localhost:4500"); }
            }
            if let Some(f) = out { if let Ok(f2) = f.try_clone() { cmd.stdout(f).stderr(f2); } }
            match cmd.spawn() {
                Ok(child) => {
                    for _ in 0..40 { if local("GET", "/api/choices").is_some() { break; } std::thread::sleep(Duration::from_millis(150)); }
                    return Some(child);
                }
                Err(e) => eprintln!("joule: couldn't start the local side: {e}"),
            }
            return None;
        }
    }
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/up.mjs");
    // apps launched from Finder get a bare PATH: look where Node usually lives too
    let path = format!("/opt/homebrew/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default());
    match std::process::Command::new("node").arg(&script).env("PATH", path).output() {
        Ok(o) => eprintln!("joule: started services: {}", String::from_utf8_lossy(&o.stdout).trim()),
        Err(e) => eprintln!("joule: couldn't start services ({e}); run `npm run up`"),
    }
    None
}

/// joule://pair?code=…&url=… from "Get Puddle": open onboarding at the consent step.
/// The companion checks the address is one of Puddle's own before using the code.
/// Run window work after the current event callback returns. On macOS, opening or creating a
/// window *inside* a link, tray or menu callback deadlocks the event loop (Puddle froze when a
/// joule:// link arrived while it was running). A thread posts it back to the main thread, queued.
fn later(app: &AppHandle, f: impl FnOnce(AppHandle) + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || {
        let h = app.clone();
        let _ = app.run_on_main_thread(move || f(h));
    });
}

fn handle_link(app: &AppHandle, link: &str) {
    let Ok(u) = tauri::Url::parse(link) else { return };
    if u.scheme() != (if DEV { "joule-dev" } else { "joule" }) { return; }
    let get = |k: &str| u.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned()).unwrap_or_default();
    let enc = |v: String| v.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
    match u.host_str() {
        Some("pair") => show_main(app, &format!("/?app&pair={}&url={}", enc(get("code")), enc(get("url")))),
        // an invite opened from the browser: Puddle asks what the team may see and joins (no browser sign-in)
        Some("join") => show_main(app, &format!("/?app&join={}", enc(get("code")))),
        _ => {}
    }
}

fn url(path: &str) -> WebviewUrl {
    WebviewUrl::External(format!("http://{API}{path}").parse().expect("valid url"))
}

/// The screens ask the app to do things by navigating to /__joule/<action>.
/// The app catches that and cancels the navigation, so no IPC permissions are
/// involved (pages from 127.0.0.1 count as remote content to Tauri).
fn on_action(app: &AppHandle) -> impl Fn(&tauri::Url) -> bool + Send + 'static {
    let app = app.clone();
    move |url: &tauri::Url| {
        let Some(action) = url.path().strip_prefix("/__joule/") else { return true };
        eprintln!("joule: action {action}");
        let app = app.clone();
        let action = action.to_string();
        // window calls must not run inside the navigation callback itself
        let _ = app.clone().run_on_main_thread(move || match action.as_str() {
            "onboarding_done" => onboarding_done(app),
            "open_settings" => open_settings(app),
            // the one Settings (account, sharing, teams) in the Puddle window, signed in by Puddle
            "open_account" => open_view(&app, &format!("{ME}go?to=%2Fsettings")),
            "open_dashboard" => open_dashboard(app),
            "open_me" => open_me(&app),
            "connect" => connect_in_browser(),
            t if t.starts_with("theme_") => set_theme(&t[6..]),
            "quit" => app.exit(0),
            _ => eprintln!("joule: unknown action"),
        });
        false
    }
}

fn main_window(app: &AppHandle) -> WebviewWindow {
    if let Some(w) = app.get_webview_window("main") {
        return w;
    }
    let w = WebviewWindowBuilder::new(app, "main", url("/?app"))
        .on_navigation(on_action(app))
        .title("Puddle")
        .theme(theme_now())
        .inner_size(440.0, 760.0)
        .resizable(true)
        .build()
        .expect("main window");
    // closing only hides it: Puddle keeps running in the menu bar
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
    // a transparent window: the page paints Puddle's own rounded card (no frosted material, which showed as a
    // light rim in dark mode and a dark one in light mode)
    let w = WebviewWindowBuilder::new(app, "popover", url("/?popover"))
        .on_navigation(on_action(app))
        .inner_size(POPOVER.0, POPOVER.1)
        .theme(theme_now())
        .transparent(true)
        .shadow(true)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .expect("popover window");
    // like a real menu bar popover: it goes away when you click elsewhere
    let me = w.clone();
    w.on_window_event(move |e| {
        if let WindowEvent::Focused(false) = e {
            let _ = me.hide();
        }
    });
    w
}

/// Open the popover centred under the tray icon (or hide it if it's open).
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
    let _ = w.set_position(PhysicalPosition::new((pos.x + size.width / 2.0 - width / 2.0).max(0.0), pos.y + size.height + 4.0));
    let _ = w.eval("window.jouleRefresh && window.jouleRefresh()");
    let _ = w.show();
    let _ = w.set_focus();
}

/// Onboarding finished: close it and open the person's own dashboard, so setup lands somewhere.
fn onboarding_done(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    set_open_at_login(&app, true); // always on: Puddle belongs in the menu bar after a restart too
    open_me(&app);
    update_title(&app);
}

/// "Me" in its own window, so it can sit next to the team view.
/// One Puddle window for Me and the team: Me (this Mac's history) and the website's team pages share a
/// menu bar and switch in place. The popover's buttons just open it at the right page.
fn open_view(app: &AppHandle, url: &str) {
    if let Some(p) = app.get_webview_window("popover") {
        let _ = p.hide();
    }
    let Ok(target) = url.parse::<tauri::Url>() else { return };
    let w = match app.get_webview_window("view") {
        Some(w) => { let _ = w.navigate(target); w }
        None => match WebviewWindowBuilder::new(app, "view", WebviewUrl::External(target))
            .on_navigation(on_action(app)) // signing in from here talks to the app like the setup window does
            .title("Puddle")
            .theme(theme_now())
            .inner_size(1240.0, 860.0)
            .min_inner_size(420.0, 500.0)
            .build()
        {
            Ok(w) => w,
            Err(e) => { eprintln!("joule: window: {e}"); return; }
        },
    };
    let _ = w.show();
    let _ = w.set_focus();
}

fn open_me(app: &AppHandle) { open_view(app, ME); }


/// The team view, in the same window: Me's helper signs the window in with this Mac's device key
/// (a one-time link from the service) and lands on the first team dashboard, or Settings without a team.
fn open_dashboard(app: AppHandle) { open_view(&app, &format!("{ME}go?to=team")); }

/// "Connect" on a fresh install: the website (where the person is signed in) makes a one-time
/// joule://pair link and sends the browser straight back to this app.
fn connect_in_browser() {
    let service = local("GET", "/api/status")
        .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
        .and_then(|v| v["service"].as_str().map(str::to_string))
        .filter(|u| u.starts_with("https://") || u.starts_with("http://127.0.0.1:") || u.starts_with("http://localhost:"));
    let Some(service) = service else { eprintln!("joule: no service address to connect to"); return };
    let _ = std::process::Command::new("open").arg(format!("{}/get?connect=1", service.trim_end_matches('/'))).spawn();
}

/// Settings → This Mac, in the same window as the rest of Settings (the website's pages), never the small setup window
fn open_settings(app: AppHandle) {
    open_view(&app, &format!("{ME}mac"));
}

/// Today's agent time next to the icon, e.g. "5:12".
fn update_title(app: &AppHandle) {
    let title = local("GET", "/api/today")
        .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
        .and_then(|v| v["label"].as_str().map(str::to_string));
    if let Some(tray) = app.tray_by_id("joule") {
        let t = title.unwrap_or_else(|| "–".into());
        let _ = tray.set_title(Some(if DEV { format!("DEV {t}") } else { t }));
    }
}

/// "Open at login" (a LaunchAgent), switched on after onboarding and toggled from the menu.
struct LoginItem(CheckMenuItem<tauri::Wry>);

/// The app was renamed (Joule.app → Puddle.app): the login item under the old name points at an app that's gone,
/// so it's removed and the same choice made again under the new name.
fn moved_login_item(app: &AppHandle) {
    let name = app.package_info().name.clone();
    if DEV || name == "Joule" { return; }
    let Some(home) = std::env::var_os("HOME") else { return };
    let old = std::path::Path::new(&home).join("Library/LaunchAgents/Joule.plist");
    if old.exists() && std::fs::remove_file(&old).is_ok() { set_open_at_login(app, true); }
}

fn set_open_at_login(app: &AppHandle, on: bool) {
    use tauri_plugin_autostart::ManagerExt;
    if DEV { return; } // Puddle Dev is started by hand (scripts/dev-app.mjs), never at login
    // a copy run straight from Downloads lives in a temporary folder: never register that
    let on = on && !std::env::current_exe().map(|p| p.to_string_lossy().contains("/AppTranslocation/")).unwrap_or(false);
    let r = if on { app.autolaunch().enable() } else { app.autolaunch().disable() };
    if let Err(e) = r { eprintln!("joule: open at login: {e}"); }
    let now = app.autolaunch().is_enabled().unwrap_or(false);
    if let Some(item) = app.try_state::<LoginItem>() { let _ = item.0.set_checked(now); }
}

struct Companion(std::sync::Mutex<Option<std::process::Child>>);

/// Is any Puddle window on screen (Me / team, setup, the popover)? An update only installs by itself when none is.
fn any_window_visible(app: &AppHandle) -> bool {
    ["view", "main", "popover"].iter().any(|l| app.get_webview_window(l).and_then(|w| w.is_visible().ok()).unwrap_or(false))
}

/// "Install update" in the menu: added (and announced once) when the helper sees a newer published Puddle.
struct UpdateMenu { menu: Menu<tauri::Wry>, item: MenuItem<tauri::Wry>, shown: std::sync::Mutex<Option<String>> }

fn check_update(app: &AppHandle) {
    let Some(v) = local("GET", "/api/update").and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok()) else { return };
    if !v["available"].as_bool().unwrap_or(false) { return; }
    // offered for a day and nobody installed it: install now if Puddle isn't in use (no window open, popover closed)
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
    tauri::Builder::default()
        // a second launch (e.g. a joule:// link while Puddle runs) hands its link to this one
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // links for this build's scheme (Puddle Dev: joule-dev://), handled like the deep-link events
            let scheme = if DEV { "joule-dev://" } else { "joule://" };
            let links: Vec<String> = argv.into_iter().filter(|a| a.starts_with(scheme)).collect();
            later(app, move |app| for a in &links { handle_link(&app, a); });
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // menu bar only, no Dock icon
            watch_theme(app.handle()); // windows and the popover follow Puddle's theme setting

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
            let reset = MenuItem::with_id(app, "reset", "Reset onboarding (dev)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Puddle", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&me, &dash, &PredefinedMenuItem::separator(app)?, &open, &login, &reset, &PredefinedMenuItem::separator(app)?, &quit])?;
            let upd = MenuItem::with_id(app, "update", "Install update…", true, None::<&str>)?;
            app.manage(UpdateMenu { menu: menu.clone(), item: upd, shown: std::sync::Mutex::new(None) });

            TrayIconBuilder::with_id("joule")
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .title("…")
                .tooltip("Puddle")
                .menu(&menu)
                .show_menu_on_left_click(false) // left click: popover; right click: menu
                .on_menu_event(|app, e| {
                    let id = e.id.as_ref().to_string();
                    later(app, move |app| match id.as_str() {
                        "me" => open_me(&app),
                        "dash" => open_dashboard(app.clone()),
                        "open" => open_settings(app.clone()),
                        "reset" => show_main(&app, "/?app&reset"),
                        "login" => {
                            use tauri_plugin_autostart::ManagerExt;
                            let on = app.autolaunch().is_enabled().unwrap_or(false);
                            set_open_at_login(&app, !on);
                        }
                        "quit" => app.exit(0),
                        // the helper downloads, checks and swaps in the new Puddle, then restarts it
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
            // The engine kept alive: started once at launch, it could stop (killed from outside, 22 Oct 2026) and stay
            // gone until Puddle itself restarted, while the menu bar icon looked fine. Every 30 s: if the engine this
            // app started has exited, it's started again. One that's only busy (a long catch-up, a Mac waking) is
            // left alone, never a second copy beside it.
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
                    eprintln!("joule: the engine stopped; starting it again");
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
                // launched by a link: it arrives as the "current" URL
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for u in urls { handle_link(app.handle(), u.as_str()); }
                }
            }
            let handle = app.handle().clone();
            popover(&handle); // load it early so the first click is instant
            // first run: nothing chosen yet, so open onboarding
            // first run, not connected yet (unless used alone on purpose), or run from Downloads: open the window
            let fresh = local("GET", "/api/status")
                .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok())
                .map_or(true, |v| v["needsSetup"].as_bool().unwrap_or(true) || v["translocated"].as_bool().unwrap_or(false));
            if fresh {
                show_main(&handle, "/?app");
            }
            // dev self-test: drive the real Done path in the real window, report what happened
            if std::env::var("JOULE_SELFTEST").as_deref() == Ok("team") {
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
            } else if std::env::var("JOULE_SELFTEST").is_ok() {
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
                std::thread::sleep(Duration::from_secs(20)); // after the helper's first check (10 s after start)
                check_update(&h_upd);
                std::thread::sleep(Duration::from_secs(10 * 60));
            });
            std::thread::spawn(move || loop {
                update_title(&handle);
                std::thread::sleep(Duration::from_secs(30));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Puddle")
        .run(|app, event| {
            // quitting Puddle stops its local side too
            if let tauri::RunEvent::Exit = event {
                if let Some(c) = app.try_state::<Companion>() {
                    if let Some(mut child) = c.0.lock().ok().and_then(|mut g| g.take()) { let _ = child.kill(); }
                }
            }
        });
}
