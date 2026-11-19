//! Accelerated downloads: one file fetched over several connections at once.
//!
//! The file is split into fixed-size pieces. A handful of workers each take the
//! next piece and request just that byte range, so the transfer is not held to
//! the speed of a single connection. A piece that fails is resumed from where it
//! stopped. This only works when the server supports byte ranges and reports the
//! file's size; `probe` checks that first and the caller keeps its ordinary
//! single-connection download when it does not.
use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode, Url};
use std::{
    collections::VecDeque,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

/// The HTTP client for accelerated downloads. It uses the operating system's own
/// TLS implementation, the same one other Windows programs use: on some networks
/// connections made with a bundled TLS library are cut off while these are not.
pub fn client() -> Result<Client, String> {
    // Browser cookies are supplied for one URL only. Let WebView2 handle redirects
    // with its cookie and referrer policies instead of replaying credentials.
    Client::builder().use_native_tls().redirect(reqwest::redirect::Policy::none()).referer(false).connect_timeout(Duration::from_secs(20)).read_timeout(Duration::from_secs(45)).build().map_err(|e| e.to_string())
}

/// What the browser knows about the download the page started.
#[derive(Clone, Default)]
pub struct Source {
    pub url: String,
    pub cookie: Option<String>,
    pub user_agent: Option<String>,
}

/// A download confirmed to support ranges.
#[derive(Clone, Debug)]
pub struct Plan {
    /// Address after redirects; pieces are requested from here directly.
    pub url: Url,
    pub total: u64,
    /// Strong validator; with it the server refuses ranges if the file changed.
    validator: Option<String>,
    /// Cookies belong to the site that set them, not to a host it redirected to.
    send_cookie: bool,
}

#[derive(Default)]
pub struct Progress {
    pub received: AtomicU64,
    pub cancel: AtomicBool,
    /// Connections currently at work. It drops when the server limits parallel requests.
    pub connections: AtomicU64,
}

fn request(client: &Client, source: &Source, url: &Url, send_cookie: bool) -> reqwest::RequestBuilder {
    let mut builder = client.get(url.clone()).header(header::ACCEPT, "*/*").header(header::ACCEPT_ENCODING, "identity");
    if let Some(agent) = &source.user_agent { builder = builder.header(header::USER_AGENT, agent); }
    if send_cookie { if let Some(cookie) = source.cookie.as_ref().filter(|c| !c.is_empty()) { builder = builder.header(header::COOKIE, cookie); } }
    builder
}

/// "bytes 0-0/1234" → 1234
fn total_from_content_range(value: &str) -> Option<u64> {
    value.trim().strip_prefix("bytes ")?.rsplit_once('/')?.1.trim().parse().ok()
}

/// Asks for the first byte only. A server fit for acceleration answers 206 and
/// states the full size; anything else means "use the ordinary download".
pub async fn probe(client: &Client, source: &Source, minimum: u64) -> Option<Plan> {
    let first = Url::parse(&source.url).ok()?;
    if !matches!(first.scheme(), "http" | "https") { return None; }
    let response = request(client, source, &first, true).header(header::RANGE, "bytes=0-0").send().await.ok()?;
    if response.status() != StatusCode::PARTIAL_CONTENT { return None; }
    let total = total_from_content_range(response.headers().get(header::CONTENT_RANGE)?.to_str().ok()?)?;
    if total < minimum { return None; }
    let validator = response.headers().get(header::ETAG).and_then(|v| v.to_str().ok()).filter(|v| !v.starts_with("W/")).map(str::to_owned)
        .or_else(|| response.headers().get(header::LAST_MODIFIED).and_then(|v| v.to_str().ok()).map(str::to_owned));
    let url = response.url().clone();
    let send_cookie = url.host_str() == first.host_str() && url.scheme() == first.scheme();
    Some(Plan { url, total, validator, send_cookie })
}

/// Measures how fast the server delivers when two ranges are fetched at once,
/// in bytes per second, reading for about `window`. `None` means the server did
/// not serve both ranges, so parallel fetching is not available.
///
/// The caller compares this with the speed of its ordinary single-connection
/// download. More connections only help when the server limits each connection;
/// when the line itself is the limit they add nothing, and a server that rejects
/// parallel requests would make things slower. Measuring first avoids both.
pub async fn measure_parallel(client: &Client, source: &Source, plan: &Plan, window: Duration) -> Option<u64> {
    if plan.total < 4 * 1024 * 1024 { return None; }
    let counted = Arc::new(AtomicU64::new(0));
    let started = std::time::Instant::now();
    let requests = [plan.total / 2, plan.total / 4 * 3].map(|start| {
        let mut builder = request(client, source, &plan.url, plan.send_cookie).header(header::RANGE, format!("bytes={}-{}", start, plan.total - 1));
        if let Some(validator) = &plan.validator { builder = builder.header(header::IF_RANGE, validator); }
        let counted = counted.clone();
        async move {
            let Ok(response) = builder.send().await else { return false; };
            if response.status() != StatusCode::PARTIAL_CONTENT { return false; }
            let mut stream = response.bytes_stream();
            while started.elapsed() < window {
                match tokio::time::timeout(window.saturating_sub(started.elapsed()), stream.next()).await {
                    Ok(Some(Ok(chunk))) => { counted.fetch_add(chunk.len() as u64, Ordering::Relaxed); }
                    Ok(Some(Err(_))) => return false,
                    Ok(None) | Err(_) => break,
                }
            }
            true
        }
    });
    if !futures_util::future::join_all(requests).await.into_iter().all(|ok| ok) { return None; }
    let seconds = started.elapsed().as_secs_f64().max(0.001);
    Some((counted.load(Ordering::Relaxed) as f64 / seconds) as u64)
}

/// Downloads the planned file into `part` using up to `connections` workers.
/// `part` is created at full size and filled in place; the caller renames it
/// when this returns `Ok`.
pub async fn download(client: &Client, source: &Source, plan: &Plan, part: &Path, connections: usize, piece: u64, progress: Arc<Progress>) -> Result<(), String> {
    let piece = piece.max(64 * 1024);
    let file = tokio::fs::OpenOptions::new().write(true).create(true).truncate(true).open(part).await.map_err(|_| "Cannot create the download file")?;
    file.set_len(plan.total).await.map_err(|_| "Not enough disk space for this download")?;
    drop(file);
    let mut pieces = VecDeque::new();
    let mut start = 0;
    while start < plan.total {
        let end = (start + piece).min(plan.total) - 1;
        pieces.push_back((start, end));
        start = end + 1;
    }
    let queue = Arc::new(Mutex::new(pieces));
    let failure: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let mut workers = Vec::new();
    let connections = connections.clamp(1, 16);
    progress.connections.store(connections as u64, Ordering::Relaxed);
    for _ in 0..connections {
        let (client, source, plan, part) = (client.clone(), source.clone(), plan.clone(), part.to_owned());
        let (queue, failure, progress) = (queue.clone(), failure.clone(), progress.clone());
        workers.push(tokio::spawn(async move {
            let Ok(mut file) = tokio::fs::OpenOptions::new().write(true).open(&part).await else {
                failure.lock().unwrap().get_or_insert("Cannot open the download file".into());
                return;
            };
            loop {
                if progress.cancel.load(Ordering::Relaxed) || failure.lock().unwrap().is_some() { break; }
                let Some((mut position, end)) = queue.lock().unwrap().pop_front() else { break; };
                let mut attempts = 0u32;
                while position <= end {
                    if progress.cancel.load(Ordering::Relaxed) { break; }
                    let before = position;
                    match fetch_range(&client, &source, &plan, &mut file, &mut position, end, &progress).await {
                        Ok(()) => {}
                        Err(Fatal(reason)) => {
                            if !progress.cancel.load(Ordering::Relaxed) { failure.lock().unwrap().get_or_insert(reason); }
                            break;
                        }
                        Err(Retry(reason, limited)) => {
                            // Progress since the last attempt earns a fresh set of retries.
                            attempts = if position > before { 1 } else { attempts + 1 };
                            // The server is limiting parallel requests, or keeps dropping this
                            // connection: hand the rest of the piece back and retire this worker,
                            // as long as another one remains to finish the job.
                            if (limited || attempts >= 3) && retire(&progress.connections, 1) {
                                queue.lock().unwrap().push_front((position, end));
                                return;
                            }
                            if attempts > 10 { failure.lock().unwrap().get_or_insert(reason); break; }
                            tokio::time::sleep(Duration::from_millis((500 * u64::from(attempts)).min(5000))).await;
                        }
                    }
                }
                if position <= end { break; }
            }
            retire(&progress.connections, 0);
        }));
    }
    for worker in workers { let _ = worker.await; }
    if progress.cancel.load(Ordering::Relaxed) { return Err("Cancelled".into()); }
    if let Some(reason) = failure.lock().unwrap().take() { return Err(reason); }
    if progress.received.load(Ordering::Relaxed) != plan.total { return Err("Download ended incomplete".into()); }
    Ok(())
}

/// `Retry` carries whether the server said it is being asked too much at once.
/// Takes one connection out of the count, unless that would leave fewer than `keep`.
fn retire(connections: &AtomicU64, keep: u64) -> bool {
    let mut current = connections.load(Ordering::Relaxed);
    loop {
        if current <= keep { return false; }
        match connections.compare_exchange_weak(current, current - 1, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return true,
            Err(now) => current = now,
        }
    }
}

enum PieceError { Retry(String, bool), Fatal(String) }
use PieceError::{Fatal, Retry};

async fn fetch_range(client: &Client, source: &Source, plan: &Plan, file: &mut tokio::fs::File, position: &mut u64, end: u64, progress: &Progress) -> Result<(), PieceError> {
    let mut builder = request(client, source, &plan.url, plan.send_cookie).header(header::RANGE, format!("bytes={}-{}", *position, end));
    if let Some(validator) = &plan.validator { builder = builder.header(header::IF_RANGE, validator); }
    let response = builder.send().await.map_err(|_| Retry("Connection lost".into(), false))?;
    match response.status() {
        StatusCode::PARTIAL_CONTENT => {}
        // The whole file instead of the range: it changed, or ranges stopped being honoured.
        StatusCode::OK => return Err(Fatal("The file changed on the server during the download".into())),
        status if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS => return Err(Retry(format!("Server answered {}", status.as_u16()), true)),
        status => return Err(Fatal(format!("Server refused the download ({})", status.as_u16()))),
    }
    file.seek(std::io::SeekFrom::Start(*position)).await.map_err(|_| Fatal("Cannot write the download file".into()))?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if progress.cancel.load(Ordering::Relaxed) { return Err(Fatal("Cancelled".into())); }
        let chunk = chunk.map_err(|_| Retry("Connection lost".into(), false))?;
        let room = (end + 1 - *position) as usize;
        let bytes = &chunk[..chunk.len().min(room)];
        file.write_all(bytes).await.map_err(|_| Fatal("Cannot write the download file; check free disk space".into()))?;
        *position += bytes.len() as u64;
        progress.received.fetch_add(bytes.len() as u64, Ordering::Relaxed);
        if *position > end { break; }
    }
    file.flush().await.map_err(|_| Fatal("Cannot write the download file".into()))?;
    if *position <= end { return Err(Retry("Connection closed early".into(), false)); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn redirects_do_not_replay_browser_credentials() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/private", listener.local_addr().unwrap());
        let target = format!("http://{}/redirected", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut head = Vec::new();
            let mut byte = [0; 1];
            while !head.ends_with(b"\r\n\r\n") {
                assert_eq!(socket.read(&mut byte).await.unwrap(), 1);
                head.push(byte[0]);
            }
            let head = String::from_utf8(head).unwrap().to_lowercase();
            assert!(head.contains("cookie: session=synthetic"));
            assert!(!head.contains("referer:"));
            socket.write_all(format!("HTTP/1.1 302 Found\r\nLocation: {target}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
            assert!(tokio::time::timeout(Duration::from_millis(300), listener.accept()).await.is_err());
        });
        let source = Source { url, cookie: Some("session=synthetic".into()), ..Default::default() };
        assert!(probe(&client().unwrap(), &source, 1).await.is_none());
        server.await.unwrap();
    }

    fn sample(len: usize) -> Vec<u8> { (0..len).map(|i| ((i * 31 + i / 7) % 251) as u8).collect() }

    /// A tiny HTTP server. `ranges`: honour Range requests. `drop_every`: cut every
    /// n-th ranged response halfway, to exercise resuming.
    async fn serve(data: Arc<Vec<u8>>, ranges: bool, drop_every: usize) -> (String, Arc<AtomicU64>) { serve_limited(data, ranges, drop_every, 0).await }
    /// `max_parallel`: answer 429 when more than this many ranged responses are in flight (0 = no limit).
    async fn serve_limited(data: Arc<Vec<u8>>, ranges: bool, drop_every: usize, max_parallel: u64) -> (String, Arc<AtomicU64>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let ranged = Arc::new(AtomicU64::new(0));
        let counter = ranged.clone();
        let in_flight = Arc::new(AtomicU64::new(0));
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else { return; };
                let (data, counter, in_flight) = (data.clone(), counter.clone(), in_flight.clone());
                tokio::spawn(async move {
                    let mut head = Vec::new();
                    let mut byte = [0u8; 1];
                    while !head.ends_with(b"\r\n\r\n") { if socket.read(&mut byte).await.unwrap_or(0) == 0 { return; } head.push(byte[0]); }
                    let head = String::from_utf8_lossy(&head).to_ascii_lowercase();
                    let range = head.lines().find_map(|line| line.strip_prefix("range: bytes=")).and_then(|value| {
                        let (a, b) = value.trim().split_once('-')?;
                        Some((a.parse::<usize>().ok()?, b.parse::<usize>().ok()?))
                    });
                    match range.filter(|_| ranges) {
                        Some((start, end)) => {
                            if max_parallel > 0 && in_flight.fetch_add(1, Ordering::SeqCst) >= max_parallel {
                                in_flight.fetch_sub(1, Ordering::SeqCst);
                                let _ = socket.write_all(b"HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
                                let _ = socket.shutdown().await;
                                return;
                            }
                            if max_parallel > 0 { tokio::time::sleep(Duration::from_millis(25)).await; }
                            let end = end.min(data.len() - 1);
                            let body = &data[start..=end];
                            let number = counter.fetch_add(1, Ordering::Relaxed) + 1;
                            let header = format!("HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {start}-{end}/{}\r\nContent-Length: {}\r\nETag: \"v1\"\r\nConnection: close\r\n\r\n", data.len(), body.len());
                            let _ = socket.write_all(header.as_bytes()).await;
                            let cut = drop_every > 0 && number as usize % drop_every == 0 && body.len() > 1;
                            let _ = socket.write_all(if cut { &body[..body.len() / 2] } else { body }).await;
                            if max_parallel > 0 { in_flight.fetch_sub(1, Ordering::SeqCst); }
                        }
                        None => {
                            let header = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", data.len());
                            let _ = socket.write_all(header.as_bytes()).await;
                            let _ = socket.write_all(&data).await;
                        }
                    }
                    let _ = socket.shutdown().await;
                });
            }
        });
        (format!("http://{address}/file.bin"), ranged)
    }

    #[test]
    fn reads_the_total_size() {
        assert_eq!(total_from_content_range("bytes 0-0/1234"), Some(1234));
        assert_eq!(total_from_content_range("bytes 0-0/*"), None);
        assert_eq!(total_from_content_range("items 0-0/9"), None);
    }

    #[tokio::test]
    async fn downloads_in_parallel_pieces_and_resumes_cut_connections() {
        let data = Arc::new(sample(3 * 1024 * 1024 + 4321));
        let (url, ranged) = serve(data.clone(), true, 5).await;
        let client = Client::new();
        let source = Source { url, ..Default::default() };
        let plan = probe(&client, &source, 1024).await.expect("server supports ranges");
        assert_eq!(plan.total, data.len() as u64);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("file.bin.part");
        let progress = Arc::new(Progress::default());
        download(&client, &source, &plan, &part, 6, 256 * 1024, progress.clone()).await.unwrap();
        assert_eq!(progress.received.load(Ordering::Relaxed), data.len() as u64);
        assert!(std::fs::read(&part).unwrap() == *data, "file content differs");
        // 13 pieces plus the probe, plus the resumed halves.
        assert!(ranged.load(Ordering::Relaxed) > 14);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn uses_fewer_connections_when_the_server_limits_them() {
        let data = Arc::new(sample(5 * 1024 * 1024 + 77));
        let (url, _) = serve_limited(data.clone(), true, 0, 2).await;
        let client = Client::new();
        let source = Source { url, ..Default::default() };
        let plan = probe(&client, &source, 1024).await.expect("server supports ranges");
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("limited.part");
        let progress = Arc::new(Progress::default());
        // A server that allows two at once can be measured; if limits appear later,
        // the download still completes on fewer connections.
        assert!(measure_parallel(&client, &source, &plan, Duration::from_millis(300)).await.is_some());
        download(&client, &source, &plan, &part, 8, 128 * 1024, progress.clone()).await.unwrap();
        assert!(std::fs::read(&part).unwrap() == *data, "file content differs");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_server_that_refuses_parallel_ranges_is_not_measured() {
        let data = Arc::new(sample(5 * 1024 * 1024));
        let (url, _) = serve_limited(data, true, 0, 1).await;
        let client = Client::new();
        let source = Source { url, ..Default::default() };
        let plan = probe(&client, &source, 1024).await.expect("single ranges work");
        assert!(measure_parallel(&client, &source, &plan, Duration::from_millis(300)).await.is_none());
    }

    #[tokio::test]
    async fn declines_servers_without_ranges_and_small_files() {
        let data = Arc::new(sample(200_000));
        let client = Client::new();
        let (plain, _) = serve(data.clone(), false, 0).await;
        assert!(probe(&client, &Source { url: plain, ..Default::default() }, 1024).await.is_none());
        let (ranged, _) = serve(data.clone(), true, 0).await;
        assert!(probe(&client, &Source { url: ranged.clone(), ..Default::default() }, 10 * 1024 * 1024).await.is_none());
        assert!(probe(&client, &Source { url: ranged, ..Default::default() }, 1024).await.is_some());
        assert!(probe(&client, &Source { url: "blob:https://example.com/x".into(), ..Default::default() }, 1).await.is_none());
    }

    /// Measures one connection against eight on a real server:
    /// `LABEEB_ACCEL_TEST_URL=https://… cargo test --release --lib -- --ignored real_speed --nocapture`
    #[tokio::test(flavor = "multi_thread")] #[ignore = "Downloads a real file twice; needs LABEEB_ACCEL_TEST_URL"]
    async fn real_speed_comparison() {
        let url = std::env::var("LABEEB_ACCEL_TEST_URL").expect("test URL");
        let client = client().unwrap();
        let source = Source { url, user_agent: Some("labeeb-speed-test".into()), ..Default::default() };
        let raw = request(&client, &source, &Url::parse(&source.url).unwrap(), true).header(header::RANGE, "bytes=0-0").send().await;
        match &raw { Ok(r) => println!("PROBE status={} content-range={:?} version={:?}", r.status(), r.headers().get(header::CONTENT_RANGE), r.version()), Err(e) => println!("PROBE error={e:?}") }
        let mut plan = probe(&client, &source, 1).await.expect("server supports ranges");
        // Optionally measure only the first part of a very large file.
        if let Some(cap) = std::env::var("LABEEB_ACCEL_TEST_BYTES").ok().and_then(|v| v.parse::<u64>().ok()) { plan.total = plan.total.min(cap); }
        let measured = measure_parallel(&client, &source, &plan, Duration::from_millis(2500)).await;
        println!("MEASURE two parallel ranges MBps={:?} total={}", measured.map(|b| (b as f64 / 1048576.0 * 100.0).round() / 100.0), plan.total);
        let parallel_ok = measured.is_some();
        let dir = tempfile::tempdir().unwrap();
        for connections in if parallel_ok { vec![1usize, 8] } else { vec![1usize] } {
            let part = dir.path().join(format!("speed-{connections}.part"));
            let progress = Arc::new(Progress::default());
            let started = std::time::Instant::now();
            let piece = (plan.total / (connections as u64 * 6)).clamp(1024 * 1024, 8 * 1024 * 1024);
            let result = download(&client, &source, &plan, &part, connections, piece, progress.clone()).await;
            let seconds = started.elapsed().as_secs_f64();
            let received = progress.received.load(Ordering::Relaxed);
            println!("SPEED connections={connections} result={result:?} bytes={received}/{} seconds={seconds:.1} MBps={:.2}", plan.total, received as f64 / 1048576.0 / seconds);
        }
    }

    #[tokio::test]
    async fn stops_when_cancelled() {
        let data = Arc::new(sample(2 * 1024 * 1024));
        let (url, _) = serve(data, true, 0).await;
        let client = Client::new();
        let source = Source { url, ..Default::default() };
        let plan = probe(&client, &source, 1024).await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let progress = Arc::new(Progress::default());
        progress.cancel.store(true, Ordering::Relaxed);
        assert_eq!(download(&client, &source, &plan, &dir.path().join("x.part"), 4, 128 * 1024, progress).await.unwrap_err(), "Cancelled");
    }
}
