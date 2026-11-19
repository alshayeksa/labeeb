//! Isolated WebView2 integration probe. Uses synthetic local HTML, no user profile or keys.
use std::io::{Read, Write};
use tauri::Manager;
fn main() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://127.0.0.1:{}/", listener.local_addr().unwrap().port());
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let _ = stream.read(&mut [0; 4096]);
                let html = "<!doctype html><title>Reader fixture</title><main><h1>Native reader</h1><p>Visible fixture</p><input value='PRIVATE_INPUT'><span hidden>PRIVATE_HIDDEN</span><table><tr><td>Name</td><td>Value</td></tr><tr><td>A</td><td>42</td></tr></table></main>";
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", html.len(), html);
                let _ = stream.write_all(response.as_bytes());
            }
        }
    });
    let profile = tempfile::tempdir().unwrap();
    let profile_path = profile.path().to_owned();
    let target_url = url.clone();
    tauri::Builder::default().setup(move |app| {
        let watchdog = app.handle().clone();
        std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_secs(20)); watchdog.exit(2); });
        tauri::WebviewWindowBuilder::new(app, "reader-fixture", tauri::WebviewUrl::External(url.parse().unwrap()))
            .visible(false).data_directory(profile_path)
            .on_page_load(move |view, payload| {
                if payload.event() != tauri::webview::PageLoadEvent::Finished { return; }
                let app = view.app_handle().clone(); let url = target_url.clone();
                tauri::async_runtime::spawn(async move {
                    let target = labeeb_core::page_reader::Target { id: "reader-fixture".into(), url };
                    let result = labeeb_core::page_reader::read(&app, &target, false).await;
                    match result {
                        Ok(value) => {
                            let text = value.to_string();
                            let ok = text.contains("Visible fixture") && !text.contains("PRIVATE_") && value["tables"][0][1][1] == "42";
                            println!("Native reader fixture: {}", if ok { "PASS" } else { "FAIL" });
                            app.exit(if ok { 0 } else { 1 });
                        }
                        Err(error) => { eprintln!("Native reader fixture: {error}"); app.exit(1); }
                    }
                });
            }).build()?;
        Ok(())
    }).run(tauri::generate_context!()).expect("probe runtime");
    drop(profile);
}
