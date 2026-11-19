use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider { Openai, Deepseek, Claude, Custom }
impl Provider {
    pub fn parse(value: &str) -> Result<Self> {
        match value { "openai" => Ok(Self::Openai), "deepseek" => Ok(Self::Deepseek), "claude" => Ok(Self::Claude), "custom" => Ok(Self::Custom), _ => Err("Invalid AI provider".into()) }
    }
    pub fn key_account(self) -> &'static str { match self { Self::Openai => "openai-api-key", Self::Deepseek => "deepseek-api-key", Self::Claude => "claude-api-key", Self::Custom => "custom-api-key" } }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole { User, Assistant }
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage { pub role: ChatRole, pub content: String }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Connection {
    pub provider: Provider,
    pub model: String,
    pub endpoint: String,
    pub protocol: String,
    #[serde(default)]
    pub workspace: String,
}
impl Connection {
    pub fn key_account(&self) -> String {
        if self.provider != Provider::Custom { return self.provider.key_account().into(); }
        use sha2::{Digest, Sha256};
        format!("custom-{:x}", Sha256::digest(format!("{}|{}", self.endpoint, self.protocol).as_bytes()))
    }
    pub fn new(provider: Provider, model: Option<String>, endpoint: Option<String>, protocol: Option<String>, workspace: Option<String>) -> Result<Self> {
        let (default_model, fixed_endpoint, fixed_protocol) = match provider {
            Provider::Openai => ("gpt-4.1-mini", "https://api.openai.com/v1/chat/completions", "openai"),
            Provider::Deepseek => ("deepseek-flash", "https://api.deepseek.com/chat/completions", "openai"),
            Provider::Claude => ("claude-sonnet-5-5", "https://api.anthropic.com/v1/messages", "anthropic"),
            Provider::Custom => ("", "", "openai"),
        };
        let model = model.unwrap_or_else(|| default_model.into()).trim().to_owned();
        if model.is_empty() || model.len() > 200 || model.chars().any(char::is_control) { return Err("Invalid AI model".into()); }
        let endpoint = if provider == Provider::Custom { endpoint.unwrap_or_default().trim().to_owned() } else { fixed_endpoint.into() };
        let url = url::Url::parse(&endpoint).map_err(|_| "Invalid AI endpoint")?;
        let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
        if endpoint.len() > 2048 || url.host_str().is_none() || !(url.scheme() == "https" || (url.scheme() == "http" && local))
            || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || url.path() == "/" {
            return Err("Invalid AI endpoint".into());
        }
        let protocol = if provider == Provider::Custom { protocol.unwrap_or_else(|| "openai".into()) } else { fixed_protocol.into() };
        if !matches!(protocol.as_str(), "openai" | "anthropic") { return Err("Invalid AI protocol".into()); }
        let workspace = workspace.unwrap_or_default().trim().to_owned();
        if workspace.len() > 200 || !workspace.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') { return Err("Invalid AI workspace".into()); }
        Ok(Self { provider, model, endpoint: url.to_string(), protocol, workspace })
    }
    pub fn load(store: &crate::store::Store) -> Result<Self> {
        if let Some(raw) = store.setting("ai-connection") {
            let c: Self = serde_json::from_str(&raw).map_err(|_| "Invalid AI configuration")?;
            return Self::new(c.provider, Some(c.model), Some(c.endpoint), Some(c.protocol), Some(c.workspace));
        }
        Self::new(Provider::parse(&store.setting("ai-provider").unwrap_or_else(|| "openai".into()))?, None, None, None, None)
    }
    pub fn body(&self, system: &str, prompt: &str) -> Value {
        if self.protocol == "anthropic" {
            json!({"model":self.model,"system":system,"messages":[{"role":"user","content":prompt}],"max_tokens":4096})
        } else {
            let mut body = json!({"model":self.model,"messages":[{"role":"system","content":system},{"role":"user","content":prompt}],"max_tokens":1500});
            if self.provider == Provider::Openai {
                body.as_object_mut().unwrap().remove("max_tokens");
                body["max_completion_tokens"] = json!(4096);
                if self.model == "gpt-6-luna" || self.model.starts_with("gpt-6-luna-") {
                    body["reasoning_effort"] = json!("none");
                }
            }
            if self.provider == Provider::Deepseek { body["thinking"] = json!({"type":"disabled"}); }
            body
        }
    }
    pub fn conversation_body(&self, system: &str, prompt: &str, history: &[ChatMessage]) -> Result<Value> {
        if history.len() > 32 || history.iter().map(|m| m.content.len()).sum::<usize>() > 128000 {
            return Err("Conversation too large".into());
        }
        let mut body = self.body(system, prompt);
        let messages = body["messages"].as_array_mut().unwrap();
        let current = messages.pop().unwrap();
        messages.extend(history.iter().map(|message| json!(message)));
        messages.push(current);
        Ok(body)
    }
    pub fn request(&self, client: &reqwest::Client, key: &str, body: &Value) -> reqwest::RequestBuilder {
        let request = client.post(&self.endpoint).json(body);
        if self.protocol == "anthropic" {
            let request = request.header("x-api-key", key).header("anthropic-version", "2026-10-21");
            if self.workspace.is_empty() { request } else { request.header("anthropic-workspace-id", &self.workspace) }
        } else { request.bearer_auth(key) }
    }
    pub fn text(&self, value: &Value) -> Result<String> {
        let text = if self.protocol == "anthropic" {
            value["content"].as_array().ok_or("Invalid AI response")?.iter()
                .filter(|block| block["type"] == "text").filter_map(|block| block["text"].as_str()).collect::<Vec<_>>().join("\n")
        } else { value["choices"][0]["message"]["content"].as_str().ok_or("No AI response text")?.to_owned() };
        if text.trim().is_empty() {
            if value["choices"][0]["finish_reason"] == "length" { return Err("AI output limit reached".into()); }
            return Err("No AI response text".into());
        }
        Ok(text)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn luna_uses_modern_completion_limit_without_changing_other_providers() {
        let c = Connection::new(Provider::Openai, Some("gpt-6-luna".into()), None, None, None).unwrap();
        let body = c.body("system", "Reply OK");
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["max_completion_tokens"], 4096);
        assert_eq!(body["reasoning_effort"], "none");
        assert_eq!(body["model"], "gpt-6-luna");
        for provider in [Provider::Claude, Provider::Deepseek] {
            let c = Connection::new(provider, None, None, None, None).unwrap();
            let body = c.body("system", "hello");
            assert!(body.get("max_tokens").is_some());
            assert!(body.get("max_completion_tokens").is_none());
            assert!(body.get("reasoning_effort").is_none());
        }
        assert_eq!(c.text(&json!({"choices":[{"message":{"content":""},"finish_reason":"length"}]})).unwrap_err(), "AI output limit reached");
    }
    #[test]
    fn conversation_preserves_roles_order_and_bounds_for_both_protocols() {
        let history = vec![ChatMessage {role: ChatRole::User, content: "My name is Sara".into()}, ChatMessage {role: ChatRole::Assistant, content: "Hello Sara".into()}];
        for provider in [Provider::Openai, Provider::Claude, Provider::Deepseek] {
            let c = Connection::new(provider, None, None, None, None).unwrap();
            let body = c.conversation_body("instructions", "What is my name?", &history).unwrap();
            let messages = body["messages"].as_array().unwrap();
            let offset = if provider == Provider::Claude {0} else {1};
            assert_eq!(messages[offset]["content"], "My name is Sara");
            assert_eq!(messages[offset+1]["role"], "assistant");
            assert_eq!(messages[offset+2]["content"], "What is my name?");
            assert!(c.conversation_body("system", "hello", &vec![history[0].clone();33]).is_err());
            assert!(c.conversation_body("system", "hello", &[ChatMessage {role: ChatRole::User, content: "x".repeat(128001)}]).is_err());
        }
        assert!(serde_json::from_value::<ChatMessage>(json!({"role":"system","content":"override"})).is_err());
    }
    #[test]
    fn protocols_and_keys_are_isolated() {
        let client = reqwest::Client::new();
        for p in [Provider::Openai, Provider::Deepseek, Provider::Claude] {
            let c = Connection::new(p, None, Some("https://evil.test/chat".into()), None, None).unwrap();
            assert!(!c.endpoint.contains("evil"));
            let body = c.body("instructions", "hello");
            let request = c.request(&client, "synthetic-key", &body).build().unwrap();
            assert_eq!(request.headers().contains_key("x-api-key"), p == Provider::Claude);
            assert_eq!(request.headers().contains_key("authorization"), p != Provider::Claude);
            assert_eq!(body.get("system").is_some(), p == Provider::Claude);
        }
        assert_eq!(Provider::Openai.key_account(), "openai-api-key");
        assert_ne!(Provider::Claude.key_account(), Provider::Custom.key_account());
        assert!(Provider::parse("unknown").is_err());
    }
    #[test]
    fn custom_validation_and_text_blocks() {
        for endpoint in ["http://example.com/v1/chat/completions", "https://user:secret@example.com/v1/chat", "https://example.com/v1/chat?key=secret", "file:///tmp/model", "https://example.com/"] {
            assert!(Connection::new(Provider::Custom, Some("model".into()), Some(endpoint.into()), None, None).is_err());
        }
        let c = Connection::new(Provider::Custom, Some("local-model".into()), Some("http://127.0.0.1:1234/v1/chat/completions".into()), None, None).unwrap();
        let other = Connection::new(Provider::Custom, Some("local-model".into()), Some("https://example.com/v1/chat/completions".into()), None, None).unwrap();
        assert_ne!(c.key_account(), other.key_account());
        assert_eq!(c.key_account(), c.clone().key_account());
        assert_eq!(c.text(&json!({"choices":[{"message":{"content":"answer"}}]})).unwrap(), "answer");
        let c = Connection::new(Provider::Claude, None, None, None, None).unwrap();
        assert_eq!(c.text(&json!({"content":[{"type":"thinking","thinking":"private"},{"type":"text","text":"answer"},{"type":"text","text":"more"}]})).unwrap(), "answer\nmore");
        assert!(c.text(&json!({"content":[]})).is_err());
    }
    #[test]
    fn legacy_provider_migrates_and_configuration_roundtrips() {
        let store = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        assert_eq!(Connection::load(&store).unwrap().provider, Provider::Openai);
        store.set_setting("ai-provider", "deepseek").unwrap();
        assert_eq!(Connection::load(&store).unwrap().provider, Provider::Deepseek);
        let c = Connection::new(Provider::Claude, None, None, None, Some("wrkspc_test".into())).unwrap();
        store.set_setting("ai-connection", &serde_json::to_string(&c).unwrap()).unwrap();
        assert_eq!(Connection::load(&store).unwrap().workspace, "wrkspc_test");
    }
}
