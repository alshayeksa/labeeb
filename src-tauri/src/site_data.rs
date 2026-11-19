use tauri::{AppHandle, Manager, Webview};

#[cfg(windows)]
async fn clear_profile(view: Webview) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    view.with_webview(move |native| unsafe {
        use windows::core::Interface;
        use webview2_com::{ClearBrowsingDataCompletedHandler, Microsoft::Web::WebView2::Win32::{ICoreWebView2_13, ICoreWebView2Profile2}};
        let sender = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
        let completed = sender.clone();
        let result = (|| -> windows::core::Result<()> {
            native.controller().CoreWebView2()?.cast::<ICoreWebView2_13>()?.Profile()?.cast::<ICoreWebView2Profile2>()?
                .ClearBrowsingDataAll(&ClearBrowsingDataCompletedHandler::create(Box::new(move |status| {
                    if let Some(tx) = completed.lock().unwrap().take() {
                        let _ = tx.send(status.map_err(|_| "Could not clear browser profile".to_string()));
                    }
                    Ok(())
                })))
        })();
        if result.is_err() {
            if let Some(tx) = sender.lock().unwrap().take() { let _ = tx.send(Err("Could not start clearing browser profile".into())); }
        }
    }).map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(60), rx).await
        .map_err(|_| "Clearing browser data timed out".to_string())?
        .map_err(|_| "Browser profile closed before clearing finished".to_string())?
}

pub async fn clear(app: &AppHandle, viora_profile: std::path::PathBuf) -> Result<(), String> {
    let main = app.get_webview("main").ok_or("Shell unavailable")?;
    #[cfg(windows)]
    {
        clear_profile(main).await?;
        if !viora_profile.exists() { return Ok(()); }
        // Select by the actual data directory, not the current document URL.
        // This also clears a persistent profile when its last tab is closed.
        let label = format!("clear-viora-{}", uuid::Uuid::new_v4());
        let (tx, rx) = tokio::sync::oneshot::channel();
        let handle = app.clone();
        let name = label.clone();
        app.run_on_main_thread(move || {
            let result = tauri::WebviewWindowBuilder::new(&handle, &name, tauri::WebviewUrl::External("about:blank".parse().unwrap()))
                .visible(false).data_directory(viora_profile).build().map_err(|e| e.to_string());
            let _ = tx.send(result);
        }).map_err(|e| e.to_string())?;
        let window = rx.await.map_err(|_| "Could not open isolated browser profile")??;
        let result = match app.get_webview(&label) {
            Some(view) => clear_profile(view).await,
            None => Err("Isolated browser profile unavailable".into()),
        };
        let _ = window.close();
        result
    }
    #[cfg(not(windows))]
    {
        let _ = viora_profile; // Embedded Viora is currently Windows-only.
        main.clear_all_browsing_data().map_err(|e| e.to_string())
    }
}
