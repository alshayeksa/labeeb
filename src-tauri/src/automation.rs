//! Authenticated CDP adapter for a pinned, managed Obscura render sidecar.
//! The frontend receives neither tokens nor arbitrary CDP/JavaScript execution.
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    net::TcpStream,
    process::{Child, Command},
    time::{sleep, timeout, Instant},
};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig, Message},
    MaybeTlsStream, WebSocketStream,
};
use uuid::Uuid;
const WIDTH: u32 = 1280;
const HEIGHT: u32 = 720;
const MAX_MESSAGE: usize = 8 * 1024 * 1024;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(20);
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn verify_authentication(
    client: &reqwest::Client,
    http: &str,
    token: &str,
) -> Result<(), String> {
    // The Windows sidecar may reset denied connections instead of returning 401.
    // Require a positive authenticated probe as well, so an unavailable service
    // cannot pass the negative probes alone.
    for invalid_token in [None, Some("invalid-launch-token")] {
        let mut request = client.get(http);
        if let Some(value) = invalid_token {
            request = request.bearer_auth(value);
        }
        match request.send().await {
            Ok(response) if response.status() != reqwest::StatusCode::UNAUTHORIZED => {
                return Err("Sidecar did not reject an unauthorized control request".into());
            }
            Err(error) if error.is_timeout() || error.is_connect() => {
                return Err("Cannot verify sidecar authentication".into());
            }
            _ => {}
        }
    }
    let authenticated = client
        .get(http)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Sidecar authentication probe failed".to_string())?;
    if !authenticated.status().is_success() {
        return Err("Sidecar rejected its launch token".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InputAction {
    Click { x: f64, y: f64 },
    Text { text: String },
    Key { key: String },
    Scroll { delta_y: f64 },
}
impl InputAction {
    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::Click { x, y }
                if x.is_finite()
                    && y.is_finite()
                    && *x >= 0.0
                    && *y >= 0.0
                    && *x < WIDTH as f64
                    && *y < HEIGHT as f64 =>
            {
                Ok(())
            }
            Self::Text { text }
                if !text.is_empty() && text.len() <= 16_000 && !text.contains('\0') =>
            {
                Ok(())
            }
            Self::Key { key } if key_code(key).is_some() => Ok(()),
            Self::Scroll { delta_y } if delta_y.is_finite() && delta_y.abs() <= 2000.0 => Ok(()),
            _ => Err("Invalid or unsupported automation input".into()),
        }
    }
}
fn key_code(key: &str) -> Option<u32> {
    Some(match key {
        "Backspace" => 8,
        "Tab" => 9,
        "Enter" => 13,
        "Escape" => 27,
        "End" => 35,
        "Home" => 36,
        "ArrowLeft" => 37,
        "ArrowUp" => 38,
        "ArrowRight" => 39,
        "ArrowDown" => 40,
        "Delete" => 46,
        _ => return None,
    })
}
#[derive(Deserialize)]
struct Ready {
    pid: u32,
    host: String,
    port: u16,
    websocket_path: String,
}
struct ReadyCleanup(PathBuf);
impl Drop for ReadyCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
pub struct Automation {
    child: Child,
    socket: Socket,
    session: String,
    sequence: u64,
    last_frame: Option<String>,
    preview_running: bool,
    ready_path: PathBuf,
    faulted: bool,
    current_url: String,
    navigation_epoch: u64,
}
impl Automation {
    pub async fn start(
        binary: &Path,
        expected_sha256: &str,
        runtime_dir: &Path,
    ) -> Result<Self, String> {
        if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Sidecar manifest does not contain a valid SHA-256".into());
        }
        let bytes = tokio::fs::read(binary)
            .await
            .map_err(|_| "Verified Obscura sidecar is not installed".to_string())?;
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if actual != expected_sha256.to_lowercase() {
            return Err("Obscura executable checksum mismatch".into());
        }
        drop(bytes);
        tokio::fs::create_dir_all(runtime_dir)
            .await
            .map_err(|_| "Cannot create sidecar runtime directory".to_string())?;
        let ready_path = runtime_dir.join(format!("obscura-{}.json", Uuid::new_v4()));
        let _ready_cleanup = ReadyCleanup(ready_path.clone());
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let mut command = Command::new(binary);
        command.env_clear();
        // Only OS bootstrap paths; do not inherit keys, proxies, or CDP settings.
        for name in ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "HOME"] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        command
            .env("OBSCURA_CDP_TOKEN", &token)
            .args([
                "serve",
                "--host",
                "127.0.0.1",
                "--port",
                "0",
                "--workers",
                "1",
                "--max-connections",
                "2",
                "--ready-file",
            ])
            .arg(&ready_path)
            .arg("--quiet")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|_| "Unable to launch Obscura sidecar".to_string())?;
        let started = Instant::now();
        let ready = loop {
            if child
                .try_wait()
                .map_err(|_| "Cannot inspect sidecar process".to_string())?
                .is_some()
            {
                return Err("Obscura exited before it became ready".into());
            }
            if let Ok(bytes) = tokio::fs::read(&ready_path).await {
                if bytes.len() > 4096 {
                    return Err("Invalid sidecar readiness record".into());
                }
                break serde_json::from_slice::<Ready>(&bytes)
                    .map_err(|_| "Malformed sidecar readiness record".to_string())?;
            }
            if started.elapsed() > Duration::from_secs(30) {
                return Err("Obscura startup timed out".into());
            }
            sleep(Duration::from_millis(50)).await;
        };
        if ready.host != "127.0.0.1"
            || ready.port == 0
            || Some(ready.pid) != child.id()
            || ready.websocket_path != "/devtools/browser"
        {
            return Err("Sidecar readiness identity or loopback check failed".into());
        }
        let _ = tokio::fs::remove_file(&ready_path).await;
        let address = format!("127.0.0.1:{}", ready.port);
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| "Cannot initialize loopback client".to_string())?;
        let http = format!("http://{address}/json/version");
        verify_authentication(&client, &http, &token).await?;
        let mut request = format!("ws://{address}{}", ready.websocket_path)
            .into_client_request()
            .map_err(|_| "Invalid loopback websocket".to_string())?;
        request.headers_mut().insert(
            "Authorization",
            format!("Bearer {token}")
                .parse()
                .map_err(|_| "Invalid launch token".to_string())?,
        );
        let config = WebSocketConfig::default()
            .max_message_size(Some(MAX_MESSAGE))
            .max_frame_size(Some(MAX_MESSAGE));
        let (socket, _) = timeout(
            Duration::from_secs(5),
            connect_async_with_config(request, Some(config), true),
        )
        .await
        .map_err(|_| "Sidecar handshake timed out".to_string())?
        .map_err(|_| "Sidecar authenticated handshake failed".to_string())?;
        let mut this = Self {
            child,
            socket,
            session: String::new(),
            sequence: 0,
            last_frame: None,
            preview_running: false,
            ready_path,
            faulted: false,
            current_url: "about:blank".into(),
            navigation_epoch: 0,
        };
        let target = this
            .request("Target.createTarget", json!({"url":"about:blank"}), false)
            .await?;
        let target_id = target
            .get("targetId")
            .and_then(Value::as_str)
            .ok_or("Obscura did not return a target")?;
        let attached = this
            .request(
                "Target.attachToTarget",
                json!({"targetId":target_id,"flatten":true}),
                false,
            )
            .await?;
        this.session = attached
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or("Obscura did not attach a session")?
            .to_owned();
        this.request("Page.enable", json!({}), true).await?;
        this.request(
            "Emulation.setDeviceMetricsOverride",
            json!({"width":WIDTH,"height":HEIGHT,"deviceScaleFactor":1,"mobile":false}),
            true,
        )
        .await?;
        Ok(this)
    }
    pub fn status(&mut self) -> String {
        if self.faulted {
            return "faulted".into();
        }
        match self.child.try_wait() {
            Ok(None) => "running".into(),
            _ => {
                self.faulted = true;
                "stopped".into()
            }
        }
    }
    pub fn context(&self) -> (u64, &str) {
        (self.navigation_epoch, &self.current_url)
    }
    /// Flush earlier events and query native page identity before approval checks.
    pub async fn sync_context(&mut self) -> Result<(u64, String), String> {
        let tree = self.request("Page.getFrameTree", json!({}), true).await?;
        let url = tree
            .pointer("/frameTree/frame/url")
            .and_then(Value::as_str)
            .ok_or("Obscura did not return the current page URL")?;
        if self.current_url != url {
            self.current_url = url.chars().take(8192).collect();
            self.navigation_epoch += 1;
        }
        Ok((self.navigation_epoch, self.current_url.clone()))
    }
    /// Fresh native-rendered pixels, never a cached screencast. Animations may invalidate approval.
    /// This is a conservative check, not an atomic site-side transaction.
    pub async fn approval_context(&mut self) -> Result<(u64, String, String), String> {
        let (epoch, url) = self.sync_context().await?;
        let image = self
            .request("Page.captureScreenshot", json!({"format":"png"}), true)
            .await?;
        let data = image
            .get("data")
            .and_then(Value::as_str)
            .ok_or("No fresh approval screenshot")?;
        if data.len() > 6 * 1024 * 1024 {
            return Err("Approval screenshot exceeds size limit".into());
        }
        let decoded = STANDARD
            .decode(data)
            .map_err(|_| "Invalid approval screenshot".to_string())?;
        if !decoded.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("Approval screenshot is not PNG".into());
        }
        let hash = format!("{:x}", Sha256::digest(&decoded));
        let current = self.sync_context().await?;
        if current != (epoch, url.clone()) {
            return Err("Page navigated while preparing approval".into());
        }
        Ok((epoch, url, hash))
    }
    pub async fn stop(&mut self) -> Result<(), String> {
        self.faulted = true;
        let _ = timeout(Duration::from_secs(1), self.socket.close(None)).await;
        if self
            .child
            .try_wait()
            .map_err(|_| "Cannot inspect sidecar".to_string())?
            .is_none()
        {
            self.child
                .kill()
                .await
                .map_err(|_| "Cannot stop sidecar".to_string())?;
        }
        let _ = self.child.wait().await;
        let _ = tokio::fs::remove_file(&self.ready_path).await;
        Ok(())
    }
    pub async fn navigate(&mut self, input: &str) -> Result<(), String> {
        let url = url::Url::parse(input).map_err(|_| "Invalid automation URL".to_string())?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("Automation accepts only HTTP(S) URLs without credentials".into());
        }
        self.last_frame = None;
        self.navigation_epoch += 1;
        self.current_url = url.to_string();
        let result = self
            .request("Page.navigate", json!({"url":url.as_str()}), true)
            .await?;
        if let Some(message) = result.get("errorText").and_then(Value::as_str) {
            return Err(format!(
                "Navigation failed: {}",
                message.chars().take(300).collect::<String>()
            ));
        }
        Ok(())
    }
    /// Caller must consume exact one-shot approval, bound to fresh approval_context, first.
    pub async fn approved_input(&mut self, action: InputAction) -> Result<(), String> {
        action.validate()?;
        match action {
            InputAction::Click { x, y } => {
                self.request(
                    "Input.dispatchMouseEvent",
                    json!({"type":"mousePressed","x":x,"y":y,"button":"left","clickCount":1}),
                    true,
                )
                .await?;
                self.request(
                    "Input.dispatchMouseEvent",
                    json!({"type":"mouseReleased","x":x,"y":y,"button":"left","clickCount":1}),
                    true,
                )
                .await?;
            }
            InputAction::Text { text } => {
                self.request("Input.insertText", json!({"text":text}), true)
                    .await?;
            }
            InputAction::Key { key } => {
                let code = key_code(&key).ok_or("Unsupported key")?;
                self.request(
                    "Input.dispatchKeyEvent",
                    json!({"type":"keyDown","key":key,"code":key,"windowsVirtualKeyCode":code}),
                    true,
                )
                .await?;
                self.request(
                    "Input.dispatchKeyEvent",
                    json!({"type":"keyUp","key":key,"code":key,"windowsVirtualKeyCode":code}),
                    true,
                )
                .await?;
            }
            InputAction::Scroll { delta_y } => {
                self.request(
                    "Input.dispatchMouseEvent",
                    json!({"type":"mouseWheel","x":640,"y":360,"deltaX":0,"deltaY":delta_y}),
                    true,
                )
                .await?;
            }
        }
        Ok(())
    }
    pub async fn read_text(&mut self) -> Result<String, String> {
        let value = self.request("Runtime.evaluate", json!({
            "expression":"(function(){return String(document.body ? document.body.innerText : '').slice(0,12000)})()",
            "returnByValue":true}), true).await?;
        if value.get("exceptionDetails").is_some() {
            return Err("Unable to read page text".into());
        }
        Ok(value
            .pointer("/result/value")
            .and_then(Value::as_str)
            .unwrap_or("")
            .chars()
            .take(12000)
            .collect())
    }
    pub async fn set_preview(&mut self, enabled: bool) -> Result<(), String> {
        if self.preview_running == enabled { return Ok(()); }
        if enabled {
            self.request("Page.startScreencast", json!({"format":"jpeg","quality":70,"maxWidth":WIDTH,"maxHeight":HEIGHT,"everyNthFrame":1}), true).await?;
        } else {
            self.request("Page.stopScreencast", json!({}), true).await?;
            self.last_frame = None;
        }
        self.preview_running = enabled;
        Ok(())
    }
    pub async fn frame(&mut self) -> Result<Option<String>, String> {
        if self.status() != "running" {
            return Err("Automation is not running".into());
        }
        self.set_preview(true).await?;
        for _ in 0..32 {
            match timeout(Duration::from_millis(10), self.socket.next()).await {
                Err(_) => break,
                Ok(Some(Ok(message))) => {
                    match timeout(Duration::from_secs(1), self.accept_message(message)).await {
                        Ok(Ok(())) => {}
                        Ok(Err(error)) => {
                            self.faulted = true;
                            return Err(error);
                        }
                        Err(_) => {
                            self.faulted = true;
                            return Err("Screencast processing timed out".into());
                        }
                    }
                }
                _ => {
                    self.faulted = true;
                    return Err("Automation connection closed".into());
                }
            }
        }
        Ok(self.last_frame.clone())
    }
    async fn request(
        &mut self,
        method: &str,
        params: Value,
        targeted: bool,
    ) -> Result<Value, String> {
        if self.faulted {
            return Err("Automation session requires restart".into());
        }
        self.sequence += 1;
        let id = self.sequence;
        let mut value = json!({"id":id,"method":method,"params":params});
        if targeted {
            value["sessionId"] = self.session.clone().into();
        }
        let result = timeout(COMMAND_TIMEOUT, async {
            self.socket
                .send(Message::Text(value.to_string().into()))
                .await
                .map_err(|_| "CDP send failed".to_string())?;
            loop {
                match self.socket.next().await {
                    Some(Ok(Message::Text(text))) => {
                        let response: Value = serde_json::from_str(&text)
                            .map_err(|_| "Malformed CDP response".to_string())?;
                        if response.get("id").and_then(Value::as_u64) == Some(id) {
                            if let Some(error) = response.get("error") {
                                return Err(format!(
                                    "Obscura command rejected: {}",
                                    error.to_string().chars().take(300).collect::<String>()
                                ));
                            }
                            return Ok(response.get("result").cloned().unwrap_or(json!({})));
                        }
                        self.accept_event(response).await?;
                    }
                    Some(Ok(message)) => self.accept_message(message).await?,
                    _ => return Err("CDP connection closed".into()),
                }
            }
        })
        .await;
        match result {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(error)) => {
                self.faulted = true;
                Err(error)
            }
            Err(_) => {
                self.faulted = true;
                Err("CDP command timed out; restart session before retrying".into())
            }
        }
    }
    async fn accept_message(&mut self, message: Message) -> Result<(), String> {
        match message {
            Message::Text(text) => {
                let value: Value =
                    serde_json::from_str(&text).map_err(|_| "Malformed CDP event".to_string())?;
                self.accept_event(value).await
            }
            Message::Ping(data) => self
                .socket
                .send(Message::Pong(data))
                .await
                .map_err(|_| "CDP heartbeat failed".to_string()),
            Message::Close(_) => {
                self.faulted = true;
                Err("CDP connection closed".into())
            }
            _ => Ok(()),
        }
    }
    async fn accept_event(&mut self, value: Value) -> Result<(), String> {
        if value.get("sessionId").and_then(Value::as_str) != Some(self.session.as_str()) {
            return Ok(());
        }
        match value.get("method").and_then(Value::as_str) {
            Some("Page.frameNavigated") => {
                if let Some(frame) = value.pointer("/params/frame") {
                    if frame.get("parentId").is_none() {
                        if let Some(url) = frame.get("url").and_then(Value::as_str) {
                            self.current_url = url.chars().take(8192).collect();
                            self.navigation_epoch += 1; // Same-URL reloads also invalidate approvals.
                        }
                    }
                }
            }
            Some("Page.screencastFrame") => {
                if let (Some(data), Some(session_id)) = (
                    value.pointer("/params/data").and_then(Value::as_str),
                    value.pointer("/params/sessionId").and_then(Value::as_u64),
                ) {
                    if data.len() > 6 * 1024 * 1024 {
                        return Err("Screencast frame exceeds size limit".into());
                    }
                    let decoded = STANDARD
                        .decode(data)
                        .map_err(|_| "Invalid screencast encoding".to_string())?;
                    if !decoded.starts_with(&[0xff, 0xd8, 0xff]) {
                        return Err("Screencast frame is not JPEG".into());
                    }
                    self.last_frame = Some(data.to_owned());
                    self.sequence += 1;
                    let ack = json!({"id":self.sequence,"method":"Page.screencastFrameAck","sessionId":self.session,"params":{"sessionId":session_id}});
                    self.socket
                        .send(Message::Text(ack.to_string().into()))
                        .await
                        .map_err(|_| "Frame acknowledgement failed".to_string())?;
                }
            }
            _ => {}
        }
        Ok(())
    }
}
impl Drop for Automation {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
        let _ = std::fs::remove_file(&self.ready_path);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    async fn probe_fixture(statuses: Vec<Option<u16>>) -> Result<(), String> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/json/version", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            for status in statuses {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buffer = [0u8; 4096];
                let _ = stream.read(&mut buffer).await;
                if let Some(code) = status {
                    let response = format!(
                        "HTTP/1.1 {code} Test\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    );
                    stream.write_all(response.as_bytes()).await.unwrap();
                }
            }
        });
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let result = verify_authentication(&client, &url, "fixture-token").await;
        server.abort();
        result
    }
    #[tokio::test]
    async fn auth_requires_denial_and_positive_token_probe() {
        assert!(probe_fixture(vec![Some(401), Some(401), Some(200)])
            .await
            .is_ok());
        assert!(probe_fixture(vec![None, None, Some(200)]).await.is_ok());
        assert!(probe_fixture(vec![Some(200)]).await.is_err());
        assert!(probe_fixture(vec![Some(401), Some(200)]).await.is_err());
        assert!(probe_fixture(vec![None, None, None]).await.is_err());
        assert!(probe_fixture(vec![Some(401), Some(401), Some(401)])
            .await
            .is_err());
    }
    #[test]
    fn validates_actions_fail_closed() {
        assert!(InputAction::Click {
            x: 1279.0,
            y: 719.0
        }
        .validate()
        .is_ok());
        assert!(InputAction::Click {
            x: f64::NAN,
            y: 0.0
        }
        .validate()
        .is_err());
        assert!(InputAction::Click { x: 1280.0, y: 0.0 }.validate().is_err());
        assert!(InputAction::Text {
            text: "مرحبا".into()
        }
        .validate()
        .is_ok());
        assert!(InputAction::Text {
            text: "x".repeat(16001)
        }
        .validate()
        .is_err());
        assert!(InputAction::Key { key: "F12".into() }.validate().is_err());
        assert!(InputAction::Key {
            key: "Enter".into()
        }
        .validate()
        .is_ok());
        assert!(InputAction::Scroll {
            delta_y: f64::INFINITY
        }
        .validate()
        .is_err());
    }
    #[tokio::test]
    async fn refuses_checksum_mismatch_before_launch() {
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join("unverified");
        std::fs::write(&binary, b"not an executable").unwrap();
        let error = Automation::start(&binary, &"0".repeat(64), dir.path())
            .await
            .err()
            .unwrap();
        assert!(error.contains("checksum mismatch"));
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[tokio::test]
    #[ignore = "requires an explicitly supplied verified Obscura render release"]
    async fn real_sidecar_lifecycle() {
        let path = std::env::var("OBSCURA_TEST_BIN").expect("OBSCURA_TEST_BIN");
        let hash = std::env::var("OBSCURA_TEST_SHA256").expect("OBSCURA_TEST_SHA256");
        let dir = tempfile::tempdir().unwrap();
        let mut engine = Automation::start(Path::new(&path), &hash, dir.path())
            .await
            .unwrap();
        assert_eq!(engine.status(), "running");
        assert!(!engine.preview_running);
        assert_eq!(engine.sync_context().await.unwrap().1, "about:blank");
        assert_eq!(engine.read_text().await.unwrap(), "");
        let approved_context = engine.approval_context().await.unwrap();
        assert_eq!(approved_context, engine.approval_context().await.unwrap());
        let mut frame = None;
        for _ in 0..20 {
            frame = engine.frame().await.unwrap();
            if frame.is_some() {
                break;
            }
            sleep(Duration::from_millis(20)).await;
        }
        assert!(frame.is_some());
        engine.set_preview(false).await.unwrap();
        assert!(!engine.preview_running);
        assert!(engine.last_frame.is_none());
        engine.set_preview(true).await.unwrap();
        assert!(engine.preview_running);
        assert!(engine.navigate("file:///etc/passwd").await.is_err());
        engine.stop().await.unwrap();
        assert_ne!(engine.status(), "running");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }
}
