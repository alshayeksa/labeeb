fn main() {
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let p = std::path::Path::new("binaries/sidecar-manifest.json");
    println!("cargo:rerun-if-changed={}", p.display());
    let pin = if cfg!(feature = "desktop") && p.exists() {
        let v: serde_json::Value =
            serde_json::from_slice(&std::fs::read(p).unwrap()).expect("Invalid manifest");
        assert_eq!(
            v["target"].as_str(),
            Some(std::env::var("TARGET").unwrap().as_str()),
            "Sidecar target mismatch"
        );
        let h = v["sha256"].as_str().expect("Missing hash");
        assert!(h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()));
        h.to_owned()
    } else {
        String::new()
    };
    std::fs::write(
        out.join("sidecar_pin.rs"),
        format!("pub const SIDECAR_SHA256: &str = {:?};", pin),
    )
    .unwrap();
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_snapshot",
            "tab_find",
            "download_retry",
            "video_start",
            "video_direct",
            "media_list",
            "media_thumbnail",
            "media_open",
            "video_cancel",
            "video_choose_folder",
            "diagnostics_snapshot",
            "tab_create",
            "tab_select",
            "tab_close",
            "tab_navigate",
            "tab_action",
            "tab_zoom",
            "tab_reopen",
            "browser_bounds",
            "bookmark_add",
            "bookmark_remove",
            "history_clear",
            "download_cancel",
            "approval_resolve",
            "settings_update",
            "ai_key_save",
            "ai_key_delete",
            "ai_ask",
            "automation_start",
            "automation_stop",
            "automation_navigate",
            "automation_input",
        ]),
    ))
    .expect("Invalid Tauri configuration");
}
