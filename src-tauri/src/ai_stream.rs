//! Bounded SSE decoder. Buffers raw bytes so split UTF-8 characters stay intact.
use serde_json::Value;

#[derive(Default)]
pub struct Decoder { bytes: Vec<u8>, data: Vec<String>, total: usize, pub done: bool }
impl Decoder {
    pub fn push(&mut self, chunk: &[u8], anthropic: bool) -> Result<Vec<String>, String> {
        self.total += chunk.len();
        if self.total > 2_000_000 { return Err("AI response too large".into()); }
        self.bytes.extend_from_slice(chunk);
        let mut out = Vec::new();
        while let Some(end) = self.bytes.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.bytes.drain(..=end).collect();
            let line = std::str::from_utf8(&line).map_err(|_| "Invalid AI response")?.trim_end_matches(['\r', '\n']);
            if line.is_empty() {
                let data = std::mem::take(&mut self.data).join("\n");
                if data.is_empty() { continue; }
                if data == "[DONE]" { self.done = true; continue; }
                let v: Value = serde_json::from_str(&data).map_err(|_| "Invalid AI response")?;
                if v.get("error").is_some() || v["type"] == "error" { return Err("AI stream failed".into()); }
                if anthropic {
                    if v["type"] == "message_stop" { self.done = true; }
                    if v["delta"]["stop_reason"] == "max_tokens" { return Err("AI output limit reached".into()); }
                    if v["type"] == "content_block_delta" && v["delta"]["type"] == "text_delta" {
                        if let Some(text) = v["delta"]["text"].as_str() { out.push(text.to_owned()); }
                    }
                } else {
                    if v["choices"][0]["finish_reason"] == "length" { return Err("AI output limit reached".into()); }
                    if let Some(text) = v["choices"][0]["delta"]["content"].as_str().or_else(|| v["choices"][0]["delta"]["refusal"].as_str()) { out.push(text.to_owned()); }
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data.push(data.strip_prefix(' ').unwrap_or(data).into());
            }
        }
        Ok(out)
    }
}

use std::{collections::HashMap, sync::{Mutex, OnceLock}};
use tokio::sync::watch;
fn requests() -> &'static Mutex<HashMap<String, watch::Sender<bool>>> {
    static REQUESTS: OnceLock<Mutex<HashMap<String, watch::Sender<bool>>>> = OnceLock::new();
    REQUESTS.get_or_init(Default::default)
}
pub struct Request(pub String);
impl Request {
    pub fn start(id: String) -> Result<(Self, watch::Receiver<bool>), String> {
        if id.len() > 80 || id.is_empty() { return Err("Invalid request ID".into()); }
        let mut requests = requests().lock().map_err(|_| "AI request lock")?;
        if requests.contains_key(&id) || requests.len() >= 4 { return Err("AI request already running".into()); }
        let (tx, rx) = watch::channel(false);
        requests.insert(id.clone(), tx);
        Ok((Self(id), rx))
    }
}
impl Drop for Request { fn drop(&mut self) { if let Ok(mut map) = requests().lock() { map.remove(&self.0); } } }
pub fn cancel(id: &str) { if let Ok(map) = requests().lock() { if let Some(tx) = map.get(id) { let _ = tx.send(true); } } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_utf8_crlf_and_done() {
        let data = "data: {\"choices\":[{\"delta\":{\"content\":\"مرحبا\"}}]}\r\n\r\ndata: [DONE]\n\n";
        let mut decoder = Decoder::default(); let mut text = String::new();
        for byte in data.as_bytes() { text.push_str(&decoder.push(&[*byte], false).unwrap().join("")); }
        assert_eq!(text, "مرحبا"); assert!(decoder.done);
    }
    #[test]
    fn anthropic_text_only_and_errors() {
        let mut d = Decoder::default();
        assert_eq!(d.push(b"data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\ndata: {\"type\":\"message_stop\"}\n\n", true).unwrap(), vec!["Hello"]);
        assert!(d.done);
        assert!(d.push(b"data: {\"type\":\"error\",\"error\":{}}\n\n", true).is_err());
        assert!(Decoder::default().push(&vec![b'x'; 2_000_001], false).is_err());
    }
    #[tokio::test]
    async fn cancellation_and_cleanup() {
        let (guard, mut rx) = Request::start("test-cancel".into()).unwrap();
        assert!(Request::start("test-cancel".into()).is_err());
        cancel("test-cancel"); rx.changed().await.unwrap(); assert!(*rx.borrow());
        drop(guard); assert!(Request::start("test-cancel".into()).is_ok());
    }
}
