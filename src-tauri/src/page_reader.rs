//! Fixed read-only DOM adapter. No scripts or actions supplied by the model.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target { pub id: String, pub url: String }

pub fn validate_targets(targets: &[Target]) -> Result<(), String> {
    if targets.is_empty() || targets.len() > 2 { return Err("READER_SCOPE".into()); }
    let mut ids = std::collections::HashSet::new();
    for t in targets {
        let url = url::Url::parse(&t.url).map_err(|_| "READER_SCOPE")?;
        if t.id == "main" || t.id.is_empty() || !ids.insert(&t.id) || t.url.len() > 8192
            || !matches!(url.scheme(), "https" | "http") || url.host_str().is_none()
            || !url.username().is_empty() || url.password().is_some()
            || crate::viora_host::is_mount_url(&t.url) { return Err("READER_SCOPE".into()); }
    }
    Ok(())
}

pub async fn read(app: &AppHandle, target: &Target, selection_only: bool) -> Result<Value, String> {
    let view = app.get_webview(&target.id).ok_or("READER_UNSUPPORTED")?;
    if view.url().map_err(|_| "READER_PAGE_CHANGED")?.as_str() != target.url { return Err("READER_PAGE_CHANGED".into()); }
    let request = serde_json::json!({"url": target.url, "selectionOnly": selection_only});
    let script = include_str!("page-reader.js").replace("/*READER_REQUEST*/", &request.to_string());
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = std::sync::Mutex::new(Some(tx));
    view.eval_with_callback(script, move |result| { if let Ok(mut sender) = tx.lock() { if let Some(sender) = sender.take() { let _ = sender.send(result); } } })
        .map_err(|_| "READER_UNSUPPORTED")?;
    let raw = tokio::time::timeout(std::time::Duration::from_secs(5), rx).await
        .map_err(|_| "READER_TIMEOUT")?.map_err(|_| "READER_UNSUPPORTED")?;
    if view.url().map_err(|_| "READER_PAGE_CHANGED")?.as_str() != target.url { return Err("READER_PAGE_CHANGED".into()); }
    if raw.len() > 200000 { return Err("READER_TOO_LARGE".into()); }
    let value: Value = serde_json::from_str(&raw).map_err(|_| "READER_UNSUPPORTED")?;
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        return Err(match error { "READER_PAGE_CHANGED" => "READER_PAGE_CHANGED", "READER_NO_SELECTION" => "READER_NO_SELECTION", _ => "READER_UNSUPPORTED" }.into());
    }
    if !value.is_object() || !value["text"].is_string() || !value["tables"].is_array() { return Err("READER_UNSUPPORTED".into()); }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn scopes_are_bounded_and_exclude_shell_and_credentials() {
        let good = Target { id: "tab-1".into(), url: "https://example.com/".into() };
        assert!(validate_targets(&[good.clone()]).is_ok());
        assert!(validate_targets(&[]).is_err());
        assert!(validate_targets(&[good.clone(), good.clone()]).is_err());
        for url in ["file:///secret", "about:blank", "https://user:pass@example.com/"] {
            assert!(validate_targets(&[Target { url: url.into(), ..good.clone() }]).is_err());
        }
        assert!(validate_targets(&[Target { id: "main".into(), ..good }]).is_err());
    }
}
