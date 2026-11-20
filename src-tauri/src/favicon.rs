//! Site icons for the tab strip.
//!
//! The shell never loads anything from a website itself, so icons are fetched here, checked,
//! and handed over as `data:` URLs. Only the site's public root page and icon files are
//! requested, without cookies, from public addresses over HTTPS. The full address of the page
//! being viewed is never requested again, since it may carry a one-time token.
use base64::Engine;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
use url::Url;

const ICON_LIMIT: usize = 300 * 1024;
const PAGE_LIMIT: usize = 512 * 1024;
const MAX_AGE: Duration = Duration::from_secs(14 * 24 * 60 * 60);
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub struct Favicons {
    dir: PathBuf,
    /// `None` while a fetch is running, or after it failed (not retried until restart).
    icons: Mutex<HashMap<String, Option<Arc<str>>>>,
}

/// The cache key for a page: its host, for ordinary HTTPS sites on the default port.
pub fn site(page: &str) -> Option<String> {
    let u = Url::parse(page).ok()?;
    if u.scheme() != "https" || u.port().is_some() { return None; }
    match u.host()? {
        url::Host::Domain(d) if d.contains('.') && d.len() <= 253 => Some(d.to_ascii_lowercase()),
        _ => None,
    }
}

impl Favicons {
    pub fn new(dir: PathBuf) -> Arc<Self> {
        Arc::new(Self { dir, icons: Mutex::new(HashMap::new()) })
    }
    fn file(&self, site: &str) -> PathBuf {
        self.dir.join(format!("{:x}", Sha256::digest(site.as_bytes())))
    }
    pub fn get(&self, site: &str) -> Option<Arc<str>> {
        self.icons.lock().ok()?.get(site).cloned().flatten()
    }
    /// True when the icon is available. The first call for a site starts loading it and
    /// runs `loaded` once it arrives.
    pub fn ready(self: &Arc<Self>, site: &str, loaded: impl FnOnce() + Send + 'static) -> bool {
        let Ok(mut icons) = self.icons.lock() else { return false };
        if let Some(known) = icons.get(site) { return known.is_some(); }
        let path = self.file(site);
        let fresh = std::fs::metadata(&path).and_then(|m| m.modified()).ok()
            .and_then(|at| SystemTime::now().duration_since(at).ok()).is_some_and(|age| age < MAX_AGE);
        if fresh {
            if let Some(icon) = std::fs::read(&path).ok().and_then(|bytes| data_url(&bytes)) {
                icons.insert(site.to_owned(), Some(icon.into()));
                return true;
            }
        }
        icons.insert(site.to_owned(), None);
        drop(icons);
        let (this, site) = (self.clone(), site.to_owned());
        tauri::async_runtime::spawn(async move {
            let Some(bytes) = fetch_icon(&site).await else { return };
            let Some(icon) = data_url(&bytes) else { return };
            let _ = std::fs::create_dir_all(&this.dir);
            let _ = std::fs::write(this.file(&site), &bytes);
            if let Ok(mut icons) = this.icons.lock() { icons.insert(site, Some(icon.into())); }
            loaded();
        });
        false
    }
    /// Forgets every stored icon, since the files reveal which sites were visited.
    pub fn clear(&self) {
        if let Ok(mut icons) = self.icons.lock() { icons.clear(); }
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Recognises an image by its content, never by what the server claims it is.
fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 16 || bytes.len() > ICON_LIMIT { return None; }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) { return Some("image/png"); }
    if bytes.starts_with(&[0, 0, 1, 0]) { return Some("image/x-icon"); }
    if bytes.starts_with(b"GIF8") { return Some("image/gif"); }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) { return Some("image/jpeg"); }
    if bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" { return Some("image/webp"); }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]).to_ascii_lowercase();
    let head = head.trim_start_matches('\u{feff}').trim_start();
    if head.starts_with("<svg") || ((head.starts_with("<?xml") || head.starts_with("<!--")) && head.contains("<svg")) {
        return Some("image/svg+xml");
    }
    None
}
fn data_url(bytes: &[u8]) -> Option<String> {
    let kind = image_type(bytes)?;
    Some(format!("data:{kind};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower[from..].find(name) {
        let start = from + found;
        from = start + name.len();
        let boundary = lower[..start].chars().next_back().is_some_and(|c| c.is_ascii_whitespace() || c == '"' || c == '\'');
        let rest = tag[from..].trim_start();
        if !boundary || !rest.starts_with('=') { continue; }
        let value = rest[1..].trim_start();
        let value = match value.chars().next()? {
            quote @ ('"' | '\'') => value[1..].split(quote).next()?,
            _ => value.split(|c: char| c.is_ascii_whitespace() || c == '>').next()?,
        };
        return Some(value.trim().replace("&amp;", "&"));
    }
    None
}

/// Icon addresses a page declares, best for a tab first, then Apple touch icons.
fn declared_icons(html: &str, base: &Url) -> (Vec<Url>, Vec<Url>) {
    let lower = html.to_ascii_lowercase();
    let (mut icons, mut touch): (Vec<(u32, Url)>, Vec<Url>) = (vec![], vec![]);
    let mut from = 0;
    while let Some(found) = lower[from..].find("<link") {
        let start = from + found;
        let Some(end) = lower[start..].find('>') else { break };
        from = start + end;
        let tag = &html[start..from];
        let Some(rel) = attribute(tag, "rel") else { continue };
        let rel: Vec<String> = rel.to_ascii_lowercase().split_ascii_whitespace().map(str::to_owned).collect();
        let Some(target) = attribute(tag, "href").and_then(|href| base.join(&href).ok()) else { continue };
        if target.scheme() != "https" { continue; }
        if rel.iter().any(|r| r == "icon") {
            // A tab shows 16 points, 32 pixels on dense screens: prefer the closest size above that.
            let size = attribute(tag, "sizes").and_then(|s| s.to_ascii_lowercase().split('x').next()?.trim().parse::<u32>().ok()).unwrap_or(24);
            icons.push((if size >= 32 { size - 32 } else { 200 + 32 - size }, target));
        } else if rel.iter().any(|r| r.starts_with("apple-touch-icon")) {
            touch.push(target);
        }
    }
    icons.sort_by_key(|(distance, _)| *distance);
    (icons.into_iter().map(|(_, u)| u).take(3).collect(), touch.into_iter().take(1).collect())
}

/// Fetches one public HTTPS resource, following a few redirects that stay public.
async fn fetch(mut url: Url, limit: usize, page: bool) -> Option<(Url, Vec<u8>)> {
    for _ in 0..5 {
        let host = site(url.as_str())?;
        let addresses: Vec<_> = tokio::time::timeout(Duration::from_secs(5), tokio::net::lookup_host((host.as_str(), 443)))
            .await.ok()?.ok()?.collect();
        if addresses.is_empty() || addresses.iter().any(|a| !crate::policy::public_ip(a.ip())) { return None; }
        let client = reqwest::Client::builder()
            .no_proxy()
            .resolve_to_addrs(&host, &addresses)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(12))
            .user_agent(USER_AGENT)
            .build().ok()?;
        let mut response = client.get(url.clone())
            .header(reqwest::header::ACCEPT, if page { "text/html" } else { "image/*" })
            .send().await.ok()?;
        if response.status().is_redirection() {
            let next = response.headers().get(reqwest::header::LOCATION)?.to_str().ok()?;
            url = url.join(next).ok()?;
            continue;
        }
        if !response.status().is_success() { return None; }
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.ok()? {
            body.extend_from_slice(&chunk);
            if body.len() > limit {
                // Icons are declared in the head, so a long page is simply cut short.
                if !page { return None; }
                body.truncate(limit);
                break;
            }
            if page && chunk.windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>")) { break; }
        }
        return Some((url, body));
    }
    None
}

async fn fetch_icon(site: &str) -> Option<Vec<u8>> {
    let root = Url::parse(&format!("https://{site}/")).ok()?;
    let (mut candidates, mut touch) = (vec![], vec![]);
    let mut base = root.clone();
    if let Some((landed, html)) = fetch(root, PAGE_LIMIT, true).await {
        (candidates, touch) = declared_icons(&String::from_utf8_lossy(&html), &landed);
        base = landed;
    }
    candidates.extend(base.join("/favicon.ico").ok());
    candidates.extend(touch);
    for candidate in candidates {
        if let Some((_, bytes)) = fetch(candidate, ICON_LIMIT, false).await {
            if image_type(&bytes).is_some() { return Some(bytes); }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_public_https_sites_get_icons() {
        assert_eq!(site("https://Web.WhatsApp.com/x?y=1").as_deref(), Some("web.whatsapp.com"));
        for page in ["http://example.com/", "https://example.com:8443/", "https://127.0.0.1/", "https://localhost/", "about:blank", "https://[::1]/"] {
            assert_eq!(site(page), None, "{page}");
        }
    }
    #[test]
    fn images_are_recognised_by_content() {
        let mut png = vec![0x89, b'P', b'N', b'G'];
        png.resize(32, 0);
        assert!(data_url(&png).unwrap().starts_with("data:image/png;base64,"));
        assert_eq!(image_type(b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>"), Some("image/svg+xml"));
        assert_eq!(image_type(b"<!doctype html><html><body>Not found</body></html>"), None);
        assert_eq!(image_type(&[0x89; ICON_LIMIT + 1]), None);
    }
    #[test]
    fn declared_icons_are_ranked_for_a_tab() {
        let base = Url::parse("https://example.com/start/").unwrap();
        let html = r#"<head><LINK REL="shortcut icon" href="/small.ico">
            <link rel=icon sizes=192x192 href='big.png?a=1&amp;b=2'><link href="/tab.png" sizes="32x32" rel="icon">
            <link rel="mask-icon" href="/mask.svg"><link rel="apple-touch-icon" href="/touch.png">
            <link rel="icon" href="http://example.com/plain.ico"><link rel="stylesheet" href="/icon.css"></head>"#;
        let (icons, touch) = declared_icons(html, &base);
        let icons: Vec<_> = icons.iter().map(Url::as_str).collect();
        assert_eq!(icons, ["https://example.com/tab.png", "https://example.com/start/big.png?a=1&b=2", "https://example.com/small.ico"]);
        assert_eq!(touch[0].as_str(), "https://example.com/touch.png");
    }
}
