//! Live Viora playback in a temporary WebView2 profile; never reads user data.
#[cfg(windows)]
use tauri::Manager;
#[cfg(windows)]
async fn eval(view: &tauri::Webview, script: &str) -> Result<String,String> {
    let (tx,rx)=tokio::sync::oneshot::channel();
    let tx=std::sync::Mutex::new(Some(tx));
    view.eval_with_callback(script,move |value| {if let Some(tx)=tx.lock().unwrap().take(){let _=tx.send(value);}}).map_err(|e|e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(5),rx).await.map_err(|_|"eval timeout")?.map_err(|_|"eval closed".into())
}

#[cfg(not(windows))]
fn main() {
    eprintln!("The Viora playback probe requires Windows and WebView2.");
    std::process::exit(1);
}

#[cfg(windows)]
fn main() {
    let profile = tempfile::tempdir().unwrap();
    let root = profile.path().to_owned();
    tauri::Builder::default().setup(move |app| {
        let window = tauri::WebviewWindowBuilder::new(app, "viora-probe", tauri::WebviewUrl::External("about:blank".parse().unwrap()))
            .visible(false).data_directory(root.join("profile")).build()?;
        let host = std::sync::Arc::new(labeeb_core::viora_host::VioraHost::open(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../viora-tauri"), &root.join("store.sqlite")).unwrap());
        window.with_webview(move |native| unsafe {
            let core = native.controller().CoreWebView2().unwrap();
            labeeb_core::viora_host::mount(host, &core).unwrap();
            core.Navigate(&windows::core::HSTRING::from("https://www.youtube.com/__viora/index.html#/watch/eJdZeevjh7U")).unwrap();
        })?;
        let handle = app.handle().clone();
        let watchdog = handle.clone();
        std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_secs(110)); watchdog.exit(2); });
        tauri::async_runtime::spawn(async move {
            let result: Result<(), String> = async {
                let view = handle.get_webview("viora-probe").ok_or("missing view")?;
                for _ in 0..90 {
                    let status = eval(&view, "JSON.stringify({tokens:window.__vioraProto?.poTokens||0,error:window.__vioraProto?.lastPoTokenError,video:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,time:v.currentTime,error:v.error?.code}))})").await?;
                    let encoded: String = serde_json::from_str(&status).map_err(|e|e.to_string())?;
                    let state: serde_json::Value = serde_json::from_str(&encoded).map_err(|e|e.to_string())?;
                    if state["tokens"].as_u64().unwrap_or(0)>0 && state["video"][0]["ready"].as_u64().unwrap_or(0)>=3 {
                        eval(&view, "document.querySelector('video').muted=true;document.querySelector('video').play().catch(()=>{});true").await?;
                        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                        let played=eval(&view,"document.querySelector('video').currentTime > 0").await?;
                        println!("native playback: {encoded}; time advanced: {played}");
                        return if played=="true" { Ok(()) } else { Err("video did not advance".into()) };
                    }
                    if state["error"].is_string() { return Err(format!("token error: {}",state["error"])); }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
                Err("playback timeout".into())
            }.await;
            println!("Viora native probe: {result:?}");
            handle.exit(if result.is_ok(){0}else{1});
        });
        Ok(())
    }).run(tauri::generate_context!()).expect("probe runtime");
    drop(profile);
}
