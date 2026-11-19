//! Hosts the Viora interface inside one WebView2 view.
//!
//! Viora's files are served at `https://www.youtube.com/__viora/…`, so the
//! interface runs with YouTube's own origin and its requests are ordinary
//! same-site requests: nothing is proxied and web security stays on.
//!
//! The same mount carries one small endpoint, `__api/store`, a document store
//! for the interface's settings, history, playlists and subscriptions. The page
//! has no Tauri commands; this endpoint is all it can reach, it needs the
//! per-run token given only to the interface's bridge script, and it accepts
//! only the six known collections.
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

pub const MOUNT: &str = "https://www.youtube.com/__viora/";
// Same hostname for BotGuard compatibility, separate origin for DOM/storage isolation.
// Every request on this origin is intercepted, and only these two static files exist.
const TOKEN_ORIGIN: &str = "https://www.youtube.com:444/";
const COLLECTIONS: [&str; 6] = ["settings", "history", "profiles", "playlists", "searchHistory", "subscriptionCache"];
const MAX_REQUEST: usize = 32 * 1024 * 1024;
const BLANK: &[u8] = b"<!DOCTYPE html><html lang=\"en\"><head><title></title></head><body></body></html>";

pub struct Reply {
    pub status: i32,
    pub mime: &'static str,
    pub body: Vec<u8>,
}
impl Reply {
    fn new(status: i32, mime: &'static str, body: impl Into<Vec<u8>>) -> Self { Self { status, mime, body: body.into() } }
    fn not_found() -> Self { Self::new(404, "text/plain; charset=utf-8", "Not found") }
    fn refused(reason: &str) -> Self { Self::new(403, "text/plain; charset=utf-8", reason) }
    fn json(value: Value) -> Self { Self::new(200, "application/json; charset=utf-8", value.to_string()) }
}

pub struct VioraHost {
    root: PathBuf,
    db: Mutex<Connection>,
    token: String,
}

/// The first folder that holds a prepared interface (`app/index.html`) and its bridge.
pub fn locate_root(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|dir| dir.join("app").join("index.html").is_file() && dir.join("shim").join("ftElectron.js").is_file()).cloned()
}

pub fn is_mount_url(url: &str) -> bool { url.starts_with(MOUNT) }

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" | "br" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn random_token() -> String {
    use std::hash::{BuildHasher, Hasher};
    (0..4).map(|i| { let mut h = std::collections::hash_map::RandomState::new().build_hasher(); h.write_u64(i); format!("{:016x}", h.finish()) }).collect()
}

impl VioraHost {
    pub fn open(root: PathBuf, database: &Path) -> Result<Self, String> {
        let db = Connection::open(database).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS docs(collection TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(collection,id)) WITHOUT ROWID;").map_err(|e| e.to_string())?;
        Ok(Self { root, db: Mutex::new(db), token: random_token() })
    }

    /// Answers one request under the mount point.
    pub fn respond(&self, method: &str, uri: &str, token: Option<&str>, body: &[u8]) -> Reply {
        if let Some(path) = uri.strip_prefix(TOKEN_ORIGIN) {
            if method != "GET" { return Reply::not_found(); }
            return match path {
                "__viora/__shim/token-helper.html" => self.file("__shim/token-helper.html"),
                "__viora/__shim/token-helper.js" => self.file("__shim/token-helper.js"),
                _ => Reply::not_found(),
            };
        }
        let Some(rest) = uri.strip_prefix(MOUNT) else { return Reply::not_found(); };
        let rest = rest.split(['?', '#']).next().unwrap_or("");
        if rest == "__api/store" {
            if method != "POST" { return Reply::new(405, "text/plain; charset=utf-8", "POST only"); }
            if token != Some(self.token.as_str()) { return Reply::refused("Missing or wrong token"); }
            return match self.store(body) { Ok(value) => Reply::json(value), Err(reason) => Reply::new(400, "text/plain; charset=utf-8", reason) };
        }
        if method != "GET" && method != "HEAD" { return Reply::new(405, "text/plain; charset=utf-8", "GET only"); }
        self.file(if rest.is_empty() { "index.html" } else { rest })
    }

    fn file(&self, rest: &str) -> Reply {
        let decoded = rest.replace("%20", " ");
        if decoded.contains('%') || decoded.split(['/', '\\']).any(|part| part.is_empty() || part == "." || part == ".." || part.contains(':')) { return Reply::not_found(); }
        if decoded == "blank.html" { return Reply::new(200, mime("x.html"), BLANK); }
        let path = match decoded.strip_prefix("__shim/") {
            Some(name) => self.root.join("shim").join(name),
            None => self.root.join("app").join(&decoded),
        };
        let Ok(mut body) = std::fs::read(&path) else { return Reply::not_found(); };
        if decoded == "index.html" {
            // The bridge loads first, as a preload script would, and is the only script handed the token.
            let boot = format!("<script>window.__vioraBoot={{token:\"{}\"}}</script><script src=\"__shim/ftElectron.js\"></script><script defer", self.token);
            body = String::from_utf8_lossy(&body).replacen("<script defer", &boot, 1).into_bytes();
        }
        Reply::new(200, mime(&decoded), body)
    }

    /// `{op, collection, docs?, ids?}` where each doc is `{id, body}`; ids and bodies are opaque to the host.
    fn store(&self, request: &[u8]) -> Result<Value, String> {
        let request: Value = serde_json::from_slice(request).map_err(|_| "Invalid JSON")?;
        let collection = request["collection"].as_str().filter(|name| COLLECTIONS.contains(name)).ok_or("Unknown collection")?;
        let mut db = self.db.lock().map_err(|_| "Store unavailable")?;
        let fail = |e: rusqlite::Error| e.to_string();
        let docs = || -> Result<Vec<(String, String)>, String> {
            request["docs"].as_array().ok_or("Missing docs")?.iter().map(|doc| {
                let id = doc["id"].as_str().filter(|id| !id.is_empty() && id.len() <= 512).ok_or("Invalid document id")?;
                if !doc["body"].is_object() { return Err("Invalid document body".to_string()); }
                Ok((id.to_owned(), doc["body"].to_string()))
            }).collect()
        };
        match request["op"].as_str().unwrap_or("") {
            "load" => {
                let mut statement = db.prepare("SELECT body FROM docs WHERE collection=?1").map_err(fail)?;
                let rows = statement.query_map([collection], |row| row.get::<_, String>(0)).map_err(fail)?;
                let mut out = Vec::new();
                for row in rows { if let Ok(value) = serde_json::from_str::<Value>(&row.map_err(fail)?) { out.push(value); } }
                Ok(Value::Array(out))
            }
            "put" => {
                let docs = docs()?;
                let tx = db.transaction().map_err(fail)?;
                for (id, body) in &docs { tx.execute("INSERT INTO docs(collection,id,body) VALUES(?1,?2,?3) ON CONFLICT(collection,id) DO UPDATE SET body=excluded.body", params![collection, id, body]).map_err(fail)?; }
                tx.commit().map_err(fail)?;
                Ok(json!({"ok":true}))
            }
            "delete" => {
                let ids: Vec<&str> = request["ids"].as_array().ok_or("Missing ids")?.iter().filter_map(Value::as_str).collect();
                let tx = db.transaction().map_err(fail)?;
                for id in ids { tx.execute("DELETE FROM docs WHERE collection=?1 AND id=?2", params![collection, id]).map_err(fail)?; }
                tx.commit().map_err(fail)?;
                Ok(json!({"ok":true}))
            }
            "replace" => {
                let docs = docs()?;
                let tx = db.transaction().map_err(fail)?;
                tx.execute("DELETE FROM docs WHERE collection=?1", [collection]).map_err(fail)?;
                for (id, body) in &docs { tx.execute("INSERT OR REPLACE INTO docs(collection,id,body) VALUES(?1,?2,?3)", params![collection, id, body]).map_err(fail)?; }
                tx.commit().map_err(fail)?;
                Ok(json!({"ok":true}))
            }
            _ => Err("Unknown operation".into()),
        }
    }
}

/// Attaches the mount to a view and removes any cookies left in its profile.
/// The caller navigates the view to a `MOUNT` address afterwards.
///
/// # Safety
/// Must be called on the thread that owns `core`.
#[cfg(windows)]
pub unsafe fn mount(host: std::sync::Arc<VioraHost>, core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) -> windows::core::Result<()> {
    use webview2_com::{take_pwstr, Microsoft::Web::WebView2::Win32::*, WebResourceRequestedEventHandler};
    use windows::core::{Interface, HSTRING, PWSTR};
    use windows::Win32::UI::Shell::SHCreateMemStream;
    let core2 = core.cast::<ICoreWebView2_2>()?;
    let environment = core2.Environment()?;
    // The interface never needs cookies; start every session without any.
    if let Ok(cookies) = core2.CookieManager() { let _ = cookies.DeleteAllCookies(); }
    // The legacy filter omits subresources of cross-origin frames. Use source
    // kinds so the helper's script is served locally too, never over port 444.
    let filters = core.cast::<ICoreWebView2_22>()?;
    for origin in [MOUNT, TOKEN_ORIGIN] {
        filters.AddWebResourceRequestedFilterWithRequestSourceKinds(
            &HSTRING::from(format!("{origin}*")), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL)?;
    }
    let mut token = 0;
    core.add_WebResourceRequested(&WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()); };
        let request = args.Request()?;
        let mut text = PWSTR::null();
        request.Uri(&mut text)?;
        let uri = take_pwstr(text);
        let mut text = PWSTR::null();
        request.Method(&mut text)?;
        let method = take_pwstr(text);
        let mut text = PWSTR::null();
        let sent_token = request.Headers().and_then(|headers| headers.GetHeader(&HSTRING::from("X-Viora-Token"), &mut text)).ok().map(|_| take_pwstr(text));
        let mut body = Vec::new();
        if method == "POST" {
            if let Ok(stream) = request.Content() {
                let mut chunk = vec![0u8; 64 * 1024];
                loop {
                    let mut read = 0u32;
                    let result = stream.Read(chunk.as_mut_ptr().cast(), chunk.len() as u32, Some(&mut read));
                    if result.is_err() || read == 0 { break; }
                    body.extend_from_slice(&chunk[..read as usize]);
                    if body.len() > MAX_REQUEST { break; }
                }
            }
        }
        let reply = if body.len() > MAX_REQUEST { Reply::new(413, "text/plain; charset=utf-8", "Too large") } else { host.respond(&method, &uri, sent_token.as_deref(), &body) };
        let stream = SHCreateMemStream(Some(&reply.body));
        let headers = format!("Content-Type: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nOrigin-Agent-Cluster: ?1", reply.mime);
        let reason = match reply.status { 200 => "OK", 403 => "Forbidden", 404 => "Not Found", 405 => "Method Not Allowed", 413 => "Payload Too Large", _ => "Bad Request" };
        let response = environment.CreateWebResourceResponse(stream.as_ref(), reply.status, &HSTRING::from(reason), &HSTRING::from(headers))?;
        args.SetResponse(&response)?;
        Ok(())
    })), &mut token)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn host() -> (tempfile::TempDir, VioraHost) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("app/static")).unwrap();
        std::fs::create_dir_all(dir.path().join("shim")).unwrap();
        std::fs::write(dir.path().join("app/index.html"), "<html><script defer=\"defer\" src=\"renderer.js\"></script></html>").unwrap();
        std::fs::write(dir.path().join("app/static/a.json"), "{}").unwrap();
        std::fs::write(dir.path().join("shim/ftElectron.js"), "//bridge").unwrap();
        std::fs::write(dir.path().join("secret.txt"), "secret").unwrap();
        assert_eq!(locate_root(&[dir.path().join("missing"), dir.path().to_path_buf()]).as_deref(), Some(dir.path()));
        let host = VioraHost::open(dir.path().to_path_buf(), &dir.path().join("viora.sqlite")).unwrap();
        (dir, host)
    }
    fn url(path: &str) -> String { format!("{MOUNT}{path}") }

    #[test]
    fn serves_only_interface_files_and_loads_the_bridge_first() {
        let (_dir, host) = host();
        for bad in ["../secret.txt", "..%2Fsecret.txt", "C:/Windows/win.ini", "static//a.json", "__shim/../secret.txt"] {
            assert_eq!(host.respond("GET", &url(bad), None, b"").status, 404, "{bad}");
        }
        assert_eq!(host.respond("GET", "https://www.youtube.com/watch?v=x", None, b"").status, 404);
        assert_eq!(host.respond("POST", &url("static/a.json"), None, b"").status, 405);
        assert_eq!(host.respond("GET", &url("static/a.json?x=1"), None, b"").status, 200);
        assert_eq!(host.respond("GET", &url("blank.html"), None, b"").status, 200);
        let index = host.respond("GET", &url("index.html#/watch/x"), None, b"");
        let html = String::from_utf8(index.body).unwrap();
        assert!(html.find("__vioraBoot").unwrap() < html.find("ftElectron.js").unwrap());
        assert!(html.find("ftElectron.js").unwrap() < html.find("renderer.js").unwrap());
    }

    #[test]
    fn token_origin_never_serves_the_interface_bridge_or_store() {
        let (dir, host) = host();
        for file in ["token-helper.html", "token-helper.js"] {
            std::fs::write(dir.path().join("shim").join(file), "helper").unwrap();
            let uri = format!("{TOKEN_ORIGIN}__viora/__shim/{file}");
            assert_eq!(host.respond("GET", &uri, None, b"").status, 200);
            assert_eq!(host.respond("POST", &uri, None, b"").status, 404);
        }
        for path in ["", "__viora/index.html", "__viora/__shim/ftElectron.js", "__viora/__api/store", "__viora/__shim/../ftElectron.js", "__viora/__shim/token-helper.js?extra=1"] {
            let uri = format!("{TOKEN_ORIGIN}{path}");
            for method in ["GET", "POST"] {
                assert_eq!(host.respond(method, &uri, Some(&host.token), b"{}").status, 404, "{method} {uri}");
            }
        }
    }

    #[test]
    fn store_needs_the_token_and_keeps_documents_per_collection() {
        let (dir, host) = host();
        let call = |host: &VioraHost, token: Option<&str>, body: Value| host.respond("POST", &url("__api/store"), token, body.to_string().as_bytes());
        let token = host.token.clone();
        assert_eq!(call(&host, None, json!({"op":"load","collection":"history"})).status, 403);
        assert_eq!(call(&host, Some("wrong"), json!({"op":"load","collection":"history"})).status, 403);
        assert_eq!(host.respond("GET", &url("__api/store"), Some(&token), b"").status, 405);
        assert_eq!(call(&host, Some(&token), json!({"op":"load","collection":"sqlite_master"})).status, 400);
        assert_eq!(call(&host, Some(&token), json!({"op":"put","collection":"history","docs":[{"id":"","body":{}}]})).status, 400);
        assert_eq!(call(&host, Some(&token), json!({"op":"put","collection":"history","docs":[{"id":"a","body":{"videoId":"a","title":"عنوان"}},{"id":"b","body":{"videoId":"b"}}]})).status, 200);
        assert_eq!(call(&host, Some(&token), json!({"op":"put","collection":"history","docs":[{"id":"a","body":{"videoId":"a","title":"new"}}]})).status, 200);
        assert_eq!(call(&host, Some(&token), json!({"op":"put","collection":"settings","docs":[{"id":"a","body":{"_id":"a","value":1}}]})).status, 200);
        let load = |host: &VioraHost, name: &str| serde_json::from_slice::<Value>(&call(host, Some(&host.token.clone()), json!({"op":"load","collection":name})).body).unwrap();
        assert_eq!(load(&host, "history").as_array().unwrap().len(), 2);
        assert!(load(&host, "history").to_string().contains("new"));
        assert_eq!(call(&host, Some(&token), json!({"op":"delete","collection":"history","ids":["b"]})).status, 200);
        assert_eq!(load(&host, "history").as_array().unwrap().len(), 1);
        assert_eq!(load(&host, "settings").as_array().unwrap().len(), 1);
        assert_eq!(call(&host, Some(&token), json!({"op":"replace","collection":"history","docs":[]})).status, 200);
        assert!(load(&host, "history").as_array().unwrap().is_empty());
        // Documents survive a restart; the token does not.
        drop(host);
        let reopened = VioraHost::open(dir.path().to_path_buf(), &dir.path().join("viora.sqlite")).unwrap();
        assert_ne!(reopened.token, token);
        assert_eq!(load(&reopened, "settings")[0]["value"], 1);
    }
}
