//! Viora-on-Tauri standalone test window.
//!
//! The hosting logic lives in Labeeb (`src-tauri/src/viora_host.rs`) and is shared
//! with it; this program is only a single window around that host, for trying
//! Viora on its own with an optional debugging port.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[path = "../../../src-tauri/src/viora_host.rs"]
mod viora_host;

use std::path::{Path, PathBuf};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Folder holding the copied Viora interface build (`app/`) and the bridge (`shim/`).
fn root() -> PathBuf {
    std::env::var_os("VIORA_PROTO_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let host = std::sync::Arc::new(viora_host::VioraHost::open(root(), &data.join("viora.sqlite")).map_err(std::io::Error::other)?);
            let mut builder = WebviewWindowBuilder::new(app, "viora", WebviewUrl::External("about:blank".parse().unwrap()))
                .title("Viora (Tauri prototype)")
                .inner_size(1280., 820.);
            // Keep the engine defaults Tauri normally applies and, for inspection only,
            // open a local debugging port when one is requested.
            let mut arguments = String::from("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required");
            if let Ok(port) = std::env::var("VIORA_PROTO_DEBUG_PORT") {
                if port.parse::<u16>().is_ok() { arguments.push_str(&format!(" --remote-debugging-port={port} --remote-allow-origins=*")); }
            }
            builder = builder.additional_browser_args(&arguments);
            let window = builder.build()?;
            #[cfg(windows)]
            window.with_webview(move |webview| unsafe {
                use windows::core::HSTRING;
                let result = (|| -> windows::core::Result<()> {
                    let core = webview.controller().CoreWebView2()?;
                    viora_host::mount(host.clone(), &core)?;
                    let start = std::env::var("VIORA_PROTO_START").unwrap_or_default();
                    core.Navigate(&HSTRING::from(format!("{}index.html{start}", viora_host::MOUNT)))
                })();
                if let Err(error) = result { eprintln!("viora prototype: could not mount interface: {error}"); }
            })?;
            #[cfg(not(windows))]
            let _ = (window, host);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Failed to start the Viora prototype");
}
