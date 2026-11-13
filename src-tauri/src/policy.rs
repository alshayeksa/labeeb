use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::IpAddr,
    time::{Duration, Instant},
};
use url::Url;
pub fn navigation_url(input: &str) -> Result<Url, String> {
    let value = input.trim();
    if value.len() > 8192 {
        return Err("URL too long".into());
    }
    if value == "about:blank" {
        return Ok(Url::parse(value).unwrap());
    }
    if let Some((scheme, _)) = value.split_once(':') {
        if !["http", "https"].contains(&scheme.to_ascii_lowercase().as_str())
            && scheme.chars().all(|c| c.is_ascii_alphabetic())
        {
            return Err("Unsupported URL scheme".into());
        }
    }
    let parsed = if value.contains("://") {
        Url::parse(value)
    } else if value.contains('.') && !value.contains(char::is_whitespace) {
        Url::parse(&format!("https://{value}"))
    } else {
        let mut u = Url::parse("https://www.google.com/search").unwrap();
        u.query_pairs_mut().append_pair("q", value);
        Ok(u)
    }
    .map_err(|_| "Invalid URL")?;
    if !native_url_allowed(&parsed) {
        return Err("Only HTTP(S) without credentials is allowed".into());
    }
    Ok(parsed)
}
pub fn native_url_allowed(u: &Url) -> bool {
    u.as_str() == "about:blank"
        || (["https", "http"].contains(&u.scheme())
            && u.host_str().is_some()
            && u.username().is_empty()
            && u.password().is_none())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalView {
    pub id: String,
    pub kind: String,
    pub summary: String,
    pub origin: String,
    pub payload: String,
}
struct Pending<T> {
    view: ApprovalView,
    action: T,
    expires: Instant,
    generation: u64,
}
pub struct ApprovalQueue<T> {
    pending: HashMap<String, Pending<T>>,
}
impl<T> Default for ApprovalQueue<T> {
    fn default() -> Self {
        Self {
            pending: HashMap::new(),
        }
    }
}
impl<T> ApprovalQueue<T> {
    pub fn insert(
        &mut self,
        kind: &str,
        summary: &str,
        origin: &str,
        payload: &str,
        action: T,
        generation: u64,
    ) -> Result<String, String> {
        self.pending.retain(|_, p| p.expires > Instant::now());
        if self.pending.len() >= 32 {
            return Err("Too many pending approvals".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.pending.insert(
            id.clone(),
            Pending {
                view: ApprovalView {
                    id: id.clone(),
                    kind: kind.into(),
                    summary: summary.into(),
                    origin: origin.into(),
                    payload: payload.into(),
                },
                action,
                generation,
                expires: Instant::now() + Duration::from_secs(120),
            },
        );
        Ok(id)
    }
    pub fn list(&mut self) -> Vec<ApprovalView> {
        self.pending.retain(|_, p| p.expires > Instant::now());
        self.pending.values().map(|p| p.view.clone()).collect()
    }
    pub fn resolve(
        &mut self,
        id: &str,
        approved: bool,
        generation: u64,
    ) -> Result<Option<T>, String> {
        let p = self
            .pending
            .remove(id)
            .ok_or("Approval missing, expired, or already used")?;
        if !approved {
            return Ok(None);
        }
        if p.expires <= Instant::now() || p.generation != generation {
            return Err("Approval expired or page changed; request again".into());
        }
        Ok(Some(p.action))
    }
    pub fn clear(&mut self) {
        self.pending.clear();
    }
}
pub fn safe_filename(s: &str) -> String {
    let n: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || ['.', '-', '_'].contains(&c) {
                c
            } else {
                '_'
            }
        })
        .take(100)
        .collect();
    format!(
        "{}-{}",
        uuid::Uuid::new_v4(),
        if n.trim_matches('.').is_empty() {
            "download.bin"
        } else {
            n.trim_matches('.')
        }
    )
}
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_broadcast()
                && !v.is_documentation()
                && !v.is_unspecified()
                && !v.is_multicast()
                && v.octets()[0] != 0
                && v.octets()[0] < 224
                && !(v.octets()[0] == 100 && (64..=127).contains(&v.octets()[1]))
        }
        IpAddr::V6(v) => v
            .to_ipv4_mapped()
            .map(|v| public_ip(v.into()))
            .unwrap_or_else(|| {
                let s = v.segments();
                !v.is_loopback()
                    && !v.is_unspecified()
                    && !v.is_multicast()
                    && (s[0] & 0xfe00) != 0xfc00
                    && (s[0] & 0xffc0) != 0xfe80
                    && !(s[0] == 0x2001 && s[1] == 0xdb8)
            }),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsafe_urls_rejected() {
        for u in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,evil",
            "mailto:test@example.com",
            "about:config",
            "https://user:pass@example.com",
        ] {
            assert!(navigation_url(u).is_err(), "{u}");
            assert!(!native_url_allowed(&Url::parse(u).unwrap()));
        }
    }
    #[test]
    fn search_and_address() {
        assert!(navigation_url("مرحبا بالعالم")
            .unwrap()
            .as_str()
            .contains("q="));
        assert_eq!(navigation_url("example.com").unwrap().scheme(), "https");
    }
    #[test]
    fn approval_single_use() {
        let mut q = ApprovalQueue::default();
        let id = q.insert("input", "click", "x", "x", 42, 1).unwrap();
        assert_eq!(q.resolve(&id, true, 1).unwrap(), Some(42));
        assert!(q.resolve(&id, true, 1).is_err());
    }
    #[test]
    fn approval_stale_denied() {
        let mut q = ApprovalQueue::default();
        let id = q.insert("input", "click", "x", "x", 42, 1).unwrap();
        assert!(q.resolve(&id, true, 2).is_err());
        let id = q.insert("input", "click", "x", "x", 42, 1).unwrap();
        assert_eq!(q.resolve(&id, false, 1).unwrap(), None);
    }
    #[test]
    fn expired() {
        let mut q = ApprovalQueue::default();
        let id = q.insert("input", "click", "x", "x", 42, 1).unwrap();
        q.pending.get_mut(&id).unwrap().expires = Instant::now() - Duration::from_secs(1);
        assert!(q.resolve(&id, true, 1).is_err());
    }
    #[test]
    fn filename_safe() {
        let s = safe_filename("../../CON:/evil.exe");
        assert!(!s.contains('/'));
        assert!(!s.contains(':'));
        assert!(!s.starts_with('.'));
    }
    #[test]
    fn private_ranges() {
        for s in [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "100.64.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!public_ip(s.parse().unwrap()));
        }
    }
    #[test]
    fn public_ranges() {
        for s in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"] {
            assert!(public_ip(s.parse().unwrap()));
        }
    }
}
