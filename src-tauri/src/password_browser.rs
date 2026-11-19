//! Password proposals from untrusted pages never authorize storage or release.
use crate::password_vault::{self, VaultEntry, VaultLocation};
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, Webview};
use zeroize::Zeroizing;
type Result<T> = std::result::Result<T, String>;

fn decode_packet(raw: &str) -> Option<Zeroizing<String>> {
    if raw.len() > 12000 { return None; }
    // WebMessageAsJson wraps a posted string in an outer JSON string.
    serde_json::from_str::<String>(raw).ok().map(Zeroizing::new)
}

pub fn tracing() -> bool {
    std::env::var("LABEEB_PASSWORD_TRACE").as_deref() == Ok("1")
}
fn trace(app: &AppHandle, tab: &str, code: &'static str) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNT: AtomicUsize = AtomicUsize::new(0);
    if tracing() && COUNT.fetch_add(1, Ordering::Relaxed) < 200 {
        crate::desktop::password_trace(app, tab, code);
    }
}

#[cfg(windows)]
pub unsafe fn probe(web: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2, app: AppHandle, tab: String) {
    if !tracing() { return; }
    let handler = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(move |result, json| {
        let code = if result.is_err() { "probe_execution_failed" } else {
            match json.as_str() {
                "\"bridge_missing\"" => "probe_bridge_missing",
                "\"script_missing\"" => "probe_script_missing",
                "\"script_present\"" => "probe_script_present",
                _ => "probe_unexpected_result",
            }
        };
        trace(&app, &tab, code);
        Ok(())
    }));
    // No DOM values, page text, URL, or account data are read by this probe.
    let script = "(() => { if (!window.chrome?.webview) return 'bridge_missing'; window.chrome.webview.postMessage('labeeb-password-probe'); return window.__labeebPasswordTraceReady === true ? 'script_present' : 'script_missing'; })()";
    let _ = web.ExecuteScript(&windows::core::HSTRING::from(script), &handler);
}

struct Proposal {
    id: String,
    tab: String,
    origin: String,
    username: String,
    secret: Zeroizing<String>,
    created: Instant,
}
#[derive(Default)]
pub struct PasswordBrowser {
    pending: Mutex<Option<Proposal>>,
    last: Mutex<Option<Instant>>,
}
#[derive(Serialize, Clone)]
pub struct Offer {
    id: String,
    tab: String,
    origin: String,
    username: String,
}
impl PasswordBrowser {
    pub fn clear(&self) {
        if let Ok(mut pending) = self.pending.lock() {
            *pending = None;
        }
    }
    fn discard(&self, id: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            if pending.as_ref().is_some_and(|p| p.id == id) {
                *pending = None;
            }
        }
    }
    fn take(&self, id: &str) -> Result<Proposal> {
        let mut pending = self.pending.lock().map_err(|_| "VAULT_STORAGE")?;
        if !pending.as_ref().is_some_and(|p| p.id == id) {
            return Err("VAULT_EXPIRED".into());
        }
        let proposal = pending.take().ok_or("VAULT_EXPIRED")?;
        if proposal.created.elapsed() > Duration::from_secs(120) {
            return Err("VAULT_EXPIRED".into());
        }
        Ok(proposal)
    }
}

#[cfg(windows)]
pub unsafe fn install(
    web: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
    app: AppHandle,
    tab: String,
) -> windows::core::Result<()> {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4, WebMessageReceivedEventHandler,
    };
    use windows::core::{Interface, HSTRING, PWSTR};
    // Never enable WebView2's password store, even when Labeeb saving is on.
    web.Settings()?
        .cast::<ICoreWebView2Settings4>()?
        .SetIsPasswordAutosaveEnabled(false)?;
    let mut token = 0;
    let last_discovery = Mutex::new(None::<Instant>);
    trace(&app, &tab, "native_installed");
    web.add_WebMessageReceived(
        &WebMessageReceivedEventHandler::create(Box::new(move |sender, args| {
            let (Some(web), Some(args)) = (sender, args) else {
                return Ok(());
            };
            let mut source = PWSTR::null();
            args.Source(&mut source)?;
            let source = webview2_com::take_pwstr(source);
            let Ok(site) = password_vault::origin(&source) else {
                return Ok(());
            };
            if crate::viora_host::is_mount_url(&source) {
                return Ok(());
            }
            let mut current = PWSTR::null();
            web.Source(&mut current)?;
            if webview2_com::take_pwstr(current) != source {
                trace(&app, &tab, "source_changed");
                return Ok(());
            }
            let mut raw = PWSTR::null();
            args.WebMessageAsJson(&mut raw)?;
            let raw = Zeroizing::new(webview2_com::take_pwstr(raw));
            if raw.as_str() == "\"labeeb-password-probe\"" {
                trace(&app, &tab, "native_string_probe_received");
                return Ok(());
            }
            let Some(payload) = decode_packet(&raw) else { return Ok(()); };
            #[derive(Deserialize)]
            struct Packet {
                kind: String,
                #[serde(default)]
                username: String,
                #[serde(default)]
                password: String,
                #[serde(default)]
                code: String,
            }
            let Ok(packet) = serde_json::from_str::<Packet>(&payload) else {
                return Ok(());
            };
            let secret = Zeroizing::new(packet.password);
            let enabled = crate::desktop::password_enabled(&app);
            if packet.kind == "labeeb-password-form" {
                if !crate::desktop::password_accepts_offer(&app, &tab) { return Ok(()); }
                if let Ok(mut last) = last_discovery.lock() {
                    if last.is_some_and(|time| time.elapsed() < Duration::from_secs(1)) { return Ok(()); }
                    *last = Some(Instant::now());
                } else { return Ok(()); }
                let handle = app.clone(); let target = tab.clone();
                tauri::async_runtime::spawn(async move { discover_login(handle, target, source).await; });
                return Ok(());
            }
            if packet.kind == "labeeb-password-trace" {
                // Only fixed codes are logged. Never log packet bodies, URLs,
                // account names, field contents, or arbitrary page strings.
                let code = match packet.code.as_str() {
                    "script_ready" => "script_ready",
                    "config_on" => "config_on",
                    "config_off" => "config_off",
                    "click" => "click",
                    "submit" => "submit",
                    "enter" => "enter",
                    "saving_off" => "saving_off",
                    "no_form" => "no_form",
                    "password_shape" => "password_shape",
                    "password_empty" => "password_empty",
                    "action_rejected" => "action_rejected",
                    "username_missing" => "username_missing",
                    "proposal_sent" => "proposal_sent",
                    "button_not_submit" => "button_not_submit",
                    "invalid_form" => "invalid_form",
                    _ => return Ok(()),
                };
                trace(&app, &tab, code);
                return Ok(());
            }
            if packet.kind == "labeeb-password-ready" {
                trace(&app, &tab, "native_ready_received");
                let config =
                    serde_json::json!({"kind":"labeeb-password-config", "enabled":enabled});
                web.PostWebMessageAsJson(&HSTRING::from(config.to_string()))?;
                return Ok(());
            }
            if packet.kind != "labeeb-password-save"
                || !enabled
                || !crate::desktop::password_accepts_offer(&app, &tab)
            {
                if packet.kind == "labeeb-password-save" { trace(&app, &tab, "native_offer_disabled_or_hidden"); }
                return Ok(());
            }
            let username = packet.username.trim();
            if username.is_empty()
                || username.len() > 512
                || secret.is_empty()
                || secret.len() > 1024
            {
                return Ok(());
            }
            let state = app.state::<PasswordBrowser>();
            let (Ok(mut pending), Ok(mut last)) = (state.pending.lock(), state.last.lock()) else {
                return Ok(());
            };
            if pending.is_some() || last.is_some_and(|t| t.elapsed() < Duration::from_secs(10)) {
                trace(&app, &tab, "native_offer_pending_or_throttled");
                return Ok(());
            }
            let id = uuid::Uuid::new_v4().to_string();
            let offer = Offer {
                id: id.clone(),
                tab: tab.clone(),
                origin: site.clone(),
                username: username.into(),
            };
            *pending = Some(Proposal {
                id: id.clone(),
                tab: tab.clone(),
                origin: site,
                username: username.into(),
                secret,
                created: Instant::now(),
            });
            *last = Some(Instant::now());
            drop(pending);
            drop(last);
            let expiry_app = app.clone();
            tauri::async_runtime::spawn(async move {
                // Keychain/SQLite work must not block WebView2's UI callback.
                let worker_app = expiry_app.clone();
                let worker_id = id.clone();
                let identical = tauri::async_runtime::spawn_blocking(move || {
                    let vault = worker_app.state::<VaultLocation>().open()?;
                    let state = worker_app.state::<PasswordBrowser>();
                    let pending = state.pending.lock().map_err(|_| "VAULT_STORAGE")?;
                    let proposal = pending.as_ref().filter(|p| p.id == worker_id).ok_or("VAULT_EXPIRED")?;
                    let (origin, username, secret) = (proposal.origin.clone(), proposal.username.clone(), proposal.secret.clone());
                    drop(pending);
                    vault.matches_login(&password_vault::WindowsSecrets, &origin, &username, &secret)
                }).await;
                if matches!(identical, Ok(Ok(true))) {
                    expiry_app.state::<PasswordBrowser>().discard(&id);
                    return;
                }
                // Do not offer storage when comparison failed or was cancelled.
                if !matches!(identical, Ok(Ok(false)))
                    || !crate::desktop::password_enabled(&expiry_app)
                    || !crate::desktop::password_active(&expiry_app, &offer.tab) {
                    expiry_app.state::<PasswordBrowser>().discard(&id);
                    return;
                }
                {
                let state = expiry_app.state::<PasswordBrowser>();
                let pending = state.pending.lock();
                if !pending.as_ref().is_ok_and(|p| p.as_ref().is_some_and(|p| p.id == id)) { return; }
                if expiry_app.emit_to("main", "password-offer", &offer).is_err() {
                    drop(pending);
                    state.discard(&id);
                    return;
                }
                drop(pending);
                }
                tokio::time::sleep(Duration::from_secs(120)).await;
                expiry_app.state::<PasswordBrowser>().discard(&id);
                let _ = expiry_app.emit_to("main", "password-offer-expired", &id);
            });
            Ok(())
        })),
        &mut token,
    )
}

pub fn configure_pages(app: &AppHandle, enabled: bool) {
    #[cfg(windows)]
    for (id, webview) in app.webviews() {
        if !id.starts_with("tab-") {
            continue;
        }
        let _ = webview.with_webview(move |native| unsafe {
            if let Ok(web) = native.controller().CoreWebView2() {
                let config =
                    serde_json::json!({"kind":"labeeb-password-config", "enabled":enabled});
                let _ = web.PostWebMessageAsJson(&windows::core::HSTRING::from(config.to_string()));
            }
        });
    }
    if !enabled {
        app.state::<PasswordBrowser>().clear();
        let _ = app.emit_to("main", "password-offer-cancelled", ());
    }
}

#[tauri::command]
pub fn password_offer_dismiss(w: Webview, app: AppHandle, id: String) -> Result<()> {
    crate::desktop::trusted(&w)?;
    app.state::<PasswordBrowser>().discard(&id);
    Ok(())
}
#[tauri::command]
pub async fn password_offer_save(w: Webview, app: AppHandle, id: String, ar: bool) -> Result<()> {
    crate::desktop::trusted(&w)?;
    let proposal = app.state::<PasswordBrowser>().take(&id)?;
    if !crate::desktop::password_enabled(&app)
        || !crate::desktop::password_active(&app, &proposal.tab)
    {
        return Err("VAULT_EXPIRED".into());
    }
    #[cfg(windows)]
    {
        let vault = app.state::<VaultLocation>().open()?;
        let _ = ar;
        if !crate::desktop::password_enabled(&app)
            || !crate::desktop::password_active(&app, &proposal.tab)
        {
            return Err("VAULT_EXPIRED".into());
        }
        let worker = vault.clone();
        tauri::async_runtime::spawn_blocking(move || {
            worker.save_login(
                &password_vault::WindowsSecrets,
                &proposal.origin,
                &proposal.username,
                &proposal.secret,
            )
        })
        .await
        .map_err(|_| "VAULT_STORAGE")?
    }
    #[cfg(not(windows))]
    {
        let _ = (proposal, ar);
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}

#[derive(Serialize)]
pub struct FillChoices {
    tab: String,
    url: String,
    entries: Vec<VaultEntry>,
}

// Page discovery is a hint only. The host chooses matching accounts, checks
// the current native URL, and never prompts for Windows verification here.
async fn discover_login(app: AppHandle, tab: String, url: String) {
    let Ok(origin) = password_vault::origin(&url) else { return; };
    let worker = app.clone(); let site = origin.clone();
    let Ok(Ok(entries)) = tauri::async_runtime::spawn_blocking(move || -> Result<_> {
        let vault = worker.state::<VaultLocation>().open()?;
        let entries: Vec<_> = vault.list()?.into_iter().filter(|entry| entry.origin == site).collect();
        Ok(entries)
    }).await else { return; };
    let still_current = || crate::desktop::password_accepts_offer(&app, &tab)
        && app.get_webview(&tab).and_then(|view| view.url().ok()).is_some_and(|current| current.as_str() == url);
    if entries.is_empty() || !still_current() { return; }
    if entries.len() == 1 {
        if let Some(shell) = app.get_webview("main") {
            if password_fill(shell, app.clone(), tab.clone(), url.clone(), entries[0].id.clone(), false, Some(true)).await.is_ok() { return; }
        }
    }
    // No recurring confirmation banner. Ambiguous accounts remain available
    // through the toolbar key; never pick an arbitrary account automatically.
}
#[tauri::command]
pub async fn password_fill_choices(w: Webview, app: AppHandle, tab: String) -> Result<FillChoices> {
    crate::desktop::trusted(&w)?;
    if !crate::desktop::password_active(&app, &tab) {
        return Err("VAULT_PAGE_CHANGED".into());
    }
    let url = app
        .get_webview(&tab)
        .ok_or("VAULT_PAGE_CHANGED")?
        .url()
        .map_err(|_| "VAULT_PAGE_CHANGED")?
        .to_string();
    let origin = password_vault::origin(&url)?;
    if crate::viora_host::is_mount_url(&url) {
        return Err("VAULT_INVALID_SITE".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let entries = app
            .state::<VaultLocation>()
            .open()?
            .list()?
            .into_iter()
            .filter(|e| e.origin == origin)
            .collect();
        Ok(FillChoices { tab, url, entries })
    })
    .await
    .map_err(|_| "VAULT_STORAGE")?
}

#[tauri::command]
pub async fn password_fill(
    w: Webview,
    app: AppHandle,
    tab: String,
    url: String,
    id: String,
    ar: bool,
    automatic: Option<bool>,
) -> Result<()> {
    crate::desktop::trusted(&w)?;
    #[cfg(windows)]
    {
        let origin = password_vault::origin(&url)?;
        if !crate::desktop::password_active(&app, &tab) {
            return Err("VAULT_PAGE_CHANGED".into());
        }
        let view = app.get_webview(&tab).ok_or("VAULT_PAGE_CHANGED")?;
        if view.url().map_err(|_| "VAULT_PAGE_CHANGED")?.as_str() != url {
            return Err("VAULT_PAGE_CHANGED".into());
        }
        let vault = app.state::<VaultLocation>().open()?;
        let entry = vault
            .list()?
            .into_iter()
            .find(|e| e.id == id && e.origin == origin)
            .ok_or("VAULT_NOT_FOUND")?;
        let _ = ar;
        if !crate::desktop::password_active(&app, &tab)
            || view.url().map_err(|_| "VAULT_PAGE_CHANGED")?.as_str() != url
        {
            return Err("VAULT_PAGE_CHANGED".into());
        }
        let worker = vault.clone();
        let secret = tauri::async_runtime::spawn_blocking(move || {
            worker.secret_for_site(&password_vault::WindowsSecrets, &id, &origin)
        })
        .await
        .map_err(|_| "VAULT_STORAGE")??;
        let expected_url = url.clone();
        let data = Zeroizing::new(
            serde_json::json!({"url":url,"username":entry.username,"password":secret.as_str(),"automatic":automatic.unwrap_or(false)})
                .to_string(),
        );
        let script =
            Zeroizing::new(include_str!("password-fill.js").replace("/*LOGIN_DATA*/", &data));
        let (tx, rx) = tokio::sync::oneshot::channel();
        view.with_webview(move |native| unsafe {
            use webview2_com::ExecuteScriptCompletedHandler;
            let handler = ExecuteScriptCompletedHandler::create(Box::new(move |result, json| {
                let ok = result.is_ok() && json == "true";
                let _ = tx.send(ok);
                Ok(())
            }));
            if let Ok(web) = native.controller().CoreWebView2() {
                let mut current = windows::core::PWSTR::null();
                if web.Source(&mut current).is_ok()
                    && webview2_com::take_pwstr(current) == expected_url
                {
                    let _ =
                        web.ExecuteScript(&windows::core::HSTRING::from(script.as_str()), &handler);
                }
            }
        })
        .map_err(|_| "VAULT_FILL_FAILED")?;
        if tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .ok()
            .and_then(|r| r.ok())
            == Some(true)
        {
            Ok(())
        } else {
            Err("VAULT_FILL_FAILED".into())
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, tab, url, id, ar, automatic);
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn string_transport_preserves_escaped_credentials_and_rejects_invalid_envelopes() {
        let packet = serde_json::json!({"kind":"labeeb-password-save", "username":"test", "password":"synthetic\\\"\nsecret"}).to_string();
        let envelope = serde_json::to_string(&packet).unwrap();
        assert_eq!(decode_packet(&envelope).unwrap().as_str(), packet);
        assert!(decode_packet(&packet).is_none());
        assert!(decode_packet("not JSON").is_none());
        assert!(decode_packet(&format!("\"{}\"", "x".repeat(12000))).is_none());
    }
    #[test]
    fn stale_and_wrong_proposals_cannot_be_saved() {
        let state = PasswordBrowser::default();
        *state.pending.lock().unwrap() = Some(Proposal {
            id: "one".into(),
            tab: "tab".into(),
            origin: "https://example.com".into(),
            username: "u".into(),
            secret: Zeroizing::new("test".into()),
            created: Instant::now() - Duration::from_secs(121),
        });
        assert!(state.take("wrong").is_err());
        assert!(state.take("one").is_err());
        assert!(state.pending.lock().unwrap().is_none());
    }
}
