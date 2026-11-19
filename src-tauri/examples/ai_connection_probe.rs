//! Explicit diagnostic: one tiny synthetic request using the locally saved OpenAI key.
//! Never prints credentials, request/response text, URLs supplied by users or raw errors.
use labeeb_core::ai_provider::{Connection, Provider};
#[tokio::main]
async fn main() {
    let connection = Connection::new(Provider::Openai, Some("gpt-6-luna".into()), None, None, None).unwrap();
    let key = match keyring::Entry::new("app.labeeb.browser", "openai-api-key").and_then(|entry| entry.get_password()) {
        Ok(key) => zeroize::Zeroizing::new(key),
        Err(_) => { println!("PROBE: SAVED_KEY_UNAVAILABLE"); return; }
    };
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).redirect(reqwest::redirect::Policy::none()).build().unwrap();
    let mut body = connection.body("Reply only OK.", "Reply OK.");
    body["max_completion_tokens"] = serde_json::json!(64);
    match connection.request(&client, key.as_str(), &body).send().await {
        Ok(response) => {
            let status = response.status();
            println!("PROBE: HTTP {}", status.as_u16());
            if status.is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(value) => println!("PROBE: VISIBLE_TEXT {}", connection.text(&value).is_ok()),
                    Err(_) => println!("PROBE: INVALID_RESPONSE"),
                }
            }
        }
        Err(_) => println!("PROBE: NETWORK_OR_TIMEOUT"),
    }
}
