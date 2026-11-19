use std::net::IpAddr;
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
