use serde_json::{json, Value};
use std::{collections::VecDeque, fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};

const LIMIT: usize = 500;
const FILE_LIMIT: u64 = 1_048_576;
pub struct Diagnostics {
    path: PathBuf,
    session: String,
    inner: Mutex<(VecDeque<Value>, Option<String>)>,
}
pub fn origin(input: &str) -> String {
    url::Url::parse(input).ok().filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(|u| u.origin().ascii_serialization()).unwrap_or_else(|| "internal".into())
}
impl Diagnostics {
    pub fn new(path: PathBuf) -> Self {
        let mut entries = VecDeque::new();
        for file in [path.with_extension("previous.jsonl"), path.clone()] {
            if let Ok(text) = fs::read_to_string(file) {
                for line in text.lines() {
                    if let Ok(value) = serde_json::from_str::<Value>(line) {
                        entries.push_back(value);
                        if entries.len() > LIMIT { entries.pop_front(); }
                    }
                }
            }
        }
        let log = Self { path, session: uuid::Uuid::new_v4().to_string(), inner: Mutex::new((entries, None)) };
        log.record("session_started", "", json!({"version":env!("CARGO_PKG_VERSION")}));
        log
    }
    pub fn record(&self, event: &str, tab: &str, details: Value) {
        let value = json!({"time":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
            "session":self.session,"event":event,"tab":tab,"details":details});
        if let Ok(mut state) = self.inner.lock() {
            state.0.push_back(value.clone());
            if state.0.len() > LIMIT { state.0.pop_front(); }
            let result = (|| -> std::io::Result<()> {
                if fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0) >= FILE_LIMIT {
                    let previous = self.path.with_extension("previous.jsonl");
                    if previous.exists() { fs::remove_file(&previous)?; }
                    fs::rename(&self.path, previous)?;
                }
                let mut file = OpenOptions::new().create(true).append(true).open(&self.path)?;
                writeln!(file, "{}", value)?;
                Ok(())
            })();
            state.1 = result.err().map(|_| "Unable to persist diagnostic events".into());
        }
    }
    pub fn snapshot(&self) -> Value {
        match self.inner.lock() {
            Ok(state) => json!({"path":self.path,"error":state.1,"events":state.0.iter().rev().collect::<Vec<_>>()}),
            Err(_) => json!({"path":self.path,"error":"Diagnostics unavailable","events":[]}),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn strips_sensitive_url_components() {
        assert_eq!(origin("https://user:password@example.com/private/token?q=secret#secret"), "https://example.com");
        assert_eq!(origin("data:text/plain,secret"), "internal");
    }
    #[test] fn persists_bounds_and_rotates() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&dir).unwrap();
        let path = dir.join("events.jsonl");
        let log = Diagnostics::new(path.clone());
        for _ in 0..600 { log.record("test", "tab", json!({"origin":origin("https://example.com/secret")})); }
        assert_eq!(log.snapshot()["events"].as_array().unwrap().len(), LIMIT);
        assert!(!fs::read_to_string(&path).unwrap().contains("secret"));
        fs::write(&path, vec![b' '; FILE_LIMIT as usize]).unwrap();
        log.record("after_rotation", "tab", json!({}));
        assert!(path.with_extension("previous.jsonl").exists());
        assert!(fs::metadata(&path).unwrap().len() < FILE_LIMIT);
        assert_eq!(Diagnostics::new(path).snapshot()["events"][1]["event"], "after_rotation");
        fs::remove_dir_all(dir).unwrap();
    }
}
