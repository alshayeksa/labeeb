//! Standalone benchmark adapter. Uses the production accelerator unchanged.
//! Does not include WebView2 handover or the UI's adaptive activation delay.
use labeeb_core::accelerator::{client, download, probe, Progress, Source};
use std::{path::PathBuf, sync::Arc};

#[tokio::main]
async fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(args.len(), 4, "URL OUTPUT CONNECTIONS");
    let connections: usize = args[3].parse().unwrap();
    let client = client().unwrap();
    let source = Source { url: args[1].clone(), ..Default::default() };
    let Some(plan) = probe(&client, &source, 1).await else {
        eprintln!("Ranges unsupported: native browser fallback required");
        std::process::exit(2);
    };
    // Same piece-size rule as desktop::accelerate.
    let piece = (plan.total / (connections as u64 * 6)).clamp(1024 * 1024, 8 * 1024 * 1024);
    if let Err(error) = download(&client, &source, &plan, &PathBuf::from(&args[2]), connections, piece, Arc::new(Progress::default())).await {
        eprintln!("{error}"); std::process::exit(1);
    }
}
