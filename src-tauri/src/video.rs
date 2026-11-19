//! On-demand YouTube downloader. Remote pages cannot call this module.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{path::{Path, PathBuf}, sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU32, Ordering}}, process::Stdio};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
type Result<T> = std::result::Result<T, String>;
const TOOLS: [(&str, &str, &str); 3] = [
    ("yt-dlp.exe", "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe", "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a"),
    ("node.exe", "https://nodejs.org/dist/v24.22.2/win-x64/node.exe", "1c331340fa6cac5e4294725959070a143fa0507195a78ad77eed7943f719aac9"),
    ("ffmpeg.exe", "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip", "3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec"),
];
const ARCHIVE_HASH: &str = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";

pub fn youtube_url(input: &str) -> Result<String> {
    let u = url::Url::parse(input.trim()).map_err(|_| "رابط غير صالح")?;
    if !matches!(u.scheme(), "https" | "http") || !u.username().is_empty() || u.password().is_some() || u.port().is_some() { return Err("رابط غير مسموح".into()); }
    let id = match u.host_str().unwrap_or("") {
        "youtu.be" => u.path().trim_start_matches('/').to_string(),
        "youtube.com" | "www.youtube.com" | "m.youtube.com" | "music.youtube.com" => {
            if u.path() == "/watch" { u.query_pairs().find(|(k, _)| k == "v").map(|(_, v)| v.into_owned()).unwrap_or_default() }
            else { let parts: Vec<_> = u.path().trim_matches('/').split('/').collect();
                if parts.len() == 2 && matches!(parts[0], "shorts" | "embed" | "live") { parts[1].into() } else { String::new() } }
        },
        _ => return Err("هذه النسخة تدعم روابط يوتيوب فقط".into()),
    };
    if id.len() != 11 || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-') { return Err("افتح فيديو يوتيوب أو ألصق رابط فيديو صالح".into()); }
    Ok(format!("https://www.youtube.com/watch?v={id}"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String, pub url: String, pub title: String, pub quality: String,
    pub status: String, pub percent: f64, pub speed: String, pub eta: String,
    pub folder: String, pub error: Option<String>, pub started_ms: u64,
    #[serde(skip)] cancel: Arc<AtomicBool>,
    #[serde(skip)] pid: Arc<AtomicU32>,
}
pub struct VideoManager {
    pub library: crate::media_library::MediaLibrary,
    jobs: Mutex<Vec<Job>>, tools: PathBuf, default_folder: PathBuf,
    gate: tokio::sync::Semaphore, ready: AtomicBool,
}
impl VideoManager {
    pub fn new(tools: PathBuf, default_folder: PathBuf) -> Arc<Self> {
        Arc::new(Self { library:crate::media_library::MediaLibrary::new(tools.clone(), default_folder.clone()), jobs: Mutex::new(vec![]), tools, default_folder, gate: tokio::sync::Semaphore::new(1), ready: AtomicBool::new(false) })
    }
    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::json!({"jobs":self.jobs.lock().unwrap().clone(), "folder":self.default_folder, "ready":self.ready.load(Ordering::Relaxed)})
    }
    fn update(&self, id: &str, f: impl FnOnce(&mut Job)) { if let Some(j) = self.jobs.lock().unwrap().iter_mut().find(|j| j.id == id) { f(j); } }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let mut jobs = self.jobs.lock().unwrap();
        let j = jobs.iter_mut().find(|j| j.id == id).ok_or("التحميل غير موجود")?;
        j.cancel.store(true, Ordering::Relaxed);
        if j.status == "queued" { j.status = "cancelled".into(); }
        Ok(())
    }
    /// Removes one finished job from the list; returns whether the id was a job.
    pub fn dismiss(&self, id: &str) -> bool {
        let mut jobs = self.jobs.lock().unwrap();
        let known = jobs.iter().any(|j| j.id == id);
        jobs.retain(|j| j.id != id || !terminal(&j.status));
        known
    }
    /// Removes every finished, failed and cancelled job from the list.
    pub fn clear_finished(&self) { self.jobs.lock().unwrap().retain(|j| !terminal(&j.status)); }
    pub fn stop(&self) {
        for j in self.jobs.lock().unwrap().iter() {
            j.cancel.store(true, Ordering::Relaxed);
            #[cfg(windows)] {
                use std::os::windows::process::CommandExt;
                let pid = j.pid.load(Ordering::Relaxed);
                if pid != 0 { let _ = std::process::Command::new("taskkill.exe").args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags(0x08000000).stdout(Stdio::null()).stderr(Stdio::null()).status(); }
            }
        }
    }
    pub fn start(self: &Arc<Self>, url: &str, quality: &str, folder: Option<String>) -> Result<()> {
        if !cfg!(windows) { return Err("تحميل الفيديو متاح حاليًا على Windows".into()); }
        let url = youtube_url(url)?;
        if !["720", "1080", "audio"].contains(&quality) { return Err("جودة غير صالحة".into()); }
        let folder = folder.filter(|s| !s.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| self.default_folder.clone());
        if !folder.is_absolute() { return Err("اختر مسار مجلد كامل".into()); }
        let job = Job { id:uuid::Uuid::new_v4().to_string(), title:url.clone(), url, quality:quality.into(),
            status:"queued".into(), percent:0., speed:String::new(), eta:String::new(), folder:folder.to_string_lossy().into(), error:None, started_ms:std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0), cancel:Arc::new(AtomicBool::new(false)), pid:Arc::new(AtomicU32::new(0)) };
        {
            let mut jobs = self.jobs.lock().unwrap();
            if jobs.iter().filter(|j| !terminal(&j.status)).count() >= 10 { return Err("قائمة الانتظار ممتلئة (10 فيديوهات)".into()); }
            if jobs.len() >= 50 { if let Some(i) = jobs.iter().position(|j| terminal(&j.status)) { jobs.remove(i); } }
            jobs.push(job.clone());
        }
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = manager.gate.acquire().await;
            if job.cancel.load(Ordering::Relaxed) { return; }
            manager.update(&job.id, |j| j.status = "preparing".into());
            let outcome = manager.run(&job).await;
            manager.update(&job.id, |j| {
                j.status = if j.cancel.load(Ordering::Relaxed) { "cancelled" } else if outcome.is_ok() { "completed" } else { "failed" }.into();
                j.error = if j.status == "failed" { outcome.err() } else { None };
                if j.status == "completed" { j.percent = 100.; }
            });
        });
        Ok(())
    }
    async fn prepare(&self, job: &Job) -> Result<()> {
        if self.ready.load(Ordering::Relaxed) { return Ok(()); }
        tokio::fs::create_dir_all(&self.tools).await.map_err(|_| "تعذر إنشاء مجلد أدوات التحميل")?;
        let client = reqwest::Client::builder().https_only(true).connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(900)).build().map_err(|_| "تعذر الاتصال")?;
        for (name, url, hash) in TOOLS {
            if job.cancel.load(Ordering::Relaxed) { return Err("تم الإلغاء".into()); }
            let target = self.tools.join(name);
            if verified(&target, hash).await { continue; }
            // Optional offline pack beside the executable; never search PATH or other apps.
            if let Ok(exe) = std::env::current_exe() {
                if let Some(parent) = exe.parent() {
                    let bundled = parent.join("video-tools").join(name);
                    if verified(&bundled, hash).await {
                        tokio::fs::copy(&bundled, &target).await.map_err(|_| "تعذر تجهيز الأدوات من الحزمة المحلية")?;
                        if verified(&target, hash).await { continue; }
                    }
                }
            }
            let tmp = self.tools.join(format!("{name}.part"));
            let result = async {
                let response = tokio::select! { result = client.get(url).send() => result.map_err(|_| "تعذر تنزيل الأدوات؛ تحقق من الاتصال وأعد المحاولة")?, _ = cancelled(job) => return Err("تم الإلغاء".into()) };
                let mut response = response.error_for_status().map_err(|_| "أدوات التحميل غير متاحة من المصدر")?;
                let mut file = tokio::fs::File::create(&tmp).await.map_err(|_| "تعذر حفظ أدوات التحميل")?;
                let mut size = 0;
                loop {
                    let chunk = tokio::select! { result = response.chunk() => result.map_err(|_| "انقطع تنزيل أدوات التحميل")?, _ = cancelled(job) => return Err("تم الإلغاء".into()) };
                    let Some(chunk) = chunk else { break; };
                    if job.cancel.load(Ordering::Relaxed) { return Err("تم الإلغاء".to_string()); }
                    size += chunk.len(); if size > 300 * 1024 * 1024 { return Err("حجم الأدوات غير متوقع".into()); }
                    file.write_all(&chunk).await.map_err(|_| "تعذر حفظ الأدوات؛ تحقق من مساحة القرص")?;
                }
                file.flush().await.map_err(|_| "تعذر حفظ الأدوات")?; drop(file);
                if !verified(&tmp, if name == "ffmpeg.exe" { ARCHIVE_HASH } else { hash }).await { return Err("فشل التحقق من سلامة أدوات التحميل".into()); }
                if name == "ffmpeg.exe" {
                    let archive_path = tmp.clone(); let output = target.with_extension("extract"); let extracted = output.clone();
                    tokio::task::spawn_blocking(move || -> Result<()> {
                        let f = std::fs::File::open(archive_path).map_err(|_| "تعذر فتح الأدوات")?;
                        let mut zip = zip::ZipArchive::new(f).map_err(|_| "أرشيف أدوات غير صالح")?;
                        for i in 0..zip.len() { let mut entry = zip.by_index(i).map_err(|_| "أرشيف غير صالح")?;
                            if entry.name().is_ok_and(|name| name.ends_with("/bin/ffmpeg.exe")) && entry.size() < 200 * 1024 * 1024 {
                                let mut out = std::fs::File::create(&output).map_err(|_| "تعذر استخراج الأدوات")?;
                                std::io::copy(&mut entry, &mut out).map_err(|_| "تعذر استخراج الأدوات")?; return Ok(());
                            }
                        } Err("FFmpeg غير موجود في الأرشيف".into())
                    }).await.map_err(|_| "تعذر تجهيز الأدوات")??;
                    if !verified(&extracted, hash).await { let _ = tokio::fs::remove_file(&extracted).await; return Err("فشل التحقق من FFmpeg".into()); }
                    tokio::fs::rename(extracted, &target).await.map_err(|_| "تعذر تثبيت الأدوات")?;
                } else { tokio::fs::rename(&tmp, &target).await.map_err(|_| "تعذر تثبيت الأدوات")?; }
                Ok(())
            }.await;
            let _ = tokio::fs::remove_file(&tmp).await;
            result?;
        }
        self.ready.store(true, Ordering::Relaxed); Ok(())
    }
    async fn run(&self, job: &Job) -> Result<()> {
        self.prepare(job).await?;
        if job.cancel.load(Ordering::Relaxed) { return Err("تم الإلغاء".into()); }
        let destination = PathBuf::from(&job.folder);
        tokio::fs::create_dir_all(&destination).await.map_err(|_| "تعذر فتح مجلد الحفظ")?;
        // A unique owned directory confines partial files and cleanup to this job.
        let temp = destination.join(format!(".labeeb-video-{}", job.id));
        tokio::fs::create_dir(&temp).await.map_err(|_| "تعذر إنشاء ملف مؤقت")?;
        let result = self.download(job, &temp, &destination).await;
        let _ = tokio::fs::remove_dir_all(&temp).await;
        result
    }
    async fn download(&self, job: &Job, temp: &Path, destination: &Path) -> Result<()> {
        let mut cmd = tokio::process::Command::new(self.tools.join("yt-dlp.exe"));
        cmd.args(["--encoding", "utf-8", "--ignore-config", "--no-playlist", "--no-color", "--newline", "--progress", "--no-overwrites", "--no-simulate", "--no-cache-dir",
            "--match-filter", "!is_live", "--socket-timeout", "20", "--retries", "2", "--fragment-retries", "2", "--concurrent-fragments", "1", "--progress-delta", "0.5",
            "--progress-template", "download:LABEEB|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
            "--print", "before_dl:LABEEB_TITLE|%(title)s", "--print", "post_process:LABEEB_PROCESSING|%(id)s", "--js-runtimes"])
            .arg(format!("node:{}", self.tools.join("node.exe").display())).arg("--ffmpeg-location").arg(&self.tools);
        if job.quality == "audio" { cmd.args(["-f", "bestaudio[ext=m4a]/bestaudio", "-x", "--audio-format", "m4a"]); }
        else { cmd.args(["-f", &format!("bv[height<={}][ext=mp4]+ba[ext=m4a]/b[height<={}][ext=mp4]", job.quality, job.quality), "--merge-output-format", "mp4"]); }
        cmd.arg("-o").arg(temp.join("video.%(ext)s")).arg("--").arg(&job.url).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        #[cfg(windows)] cmd.creation_flags(0x08000000);
        let mut child = cmd.spawn().map_err(|_| "تعذر تشغيل محرك التحميل")?;
        job.pid.store(child.id().unwrap_or(0), Ordering::Relaxed);
        struct PidGuard(Arc<AtomicU32>);
        impl Drop for PidGuard { fn drop(&mut self) { self.0.store(0, Ordering::Relaxed); } }
        let _pid = PidGuard(job.pid.clone());
        self.update(&job.id, |j| j.status = "running".into());
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let mut err_lines = BufReader::new(child.stderr.take().unwrap()).lines();
        let mut stdout_open = true; let mut stderr_open = true; let mut failure = String::new();
        let mut tick = tokio::time::interval(std::time::Duration::from_millis(200));
        let mut watchdog_tick = tokio::time::interval(std::time::Duration::from_secs(5));
        let mut watchdog = DownloadWatchdog::new(std::time::Instant::now());
        let mut processing = false;
        let status = loop {
            tokio::select! {
                line = lines.next_line(), if stdout_open => match line {
                    Ok(Some(line)) => {
                        processing |= line.starts_with("LABEEB_PROCESSING|");
                        self.update(&job.id, |j| apply_line(j, &line));
                    },
                    _ => stdout_open = false,
                },
                line = err_lines.next_line(), if stderr_open => match line {
                    Ok(Some(line)) => {
                        // yt-dlp can emit progress on stderr, especially with --print.
                        self.update(&job.id, |j| apply_line(j, &line));
                        remember_failure(&mut failure, &line);
                    },
                    _ => stderr_open = false,
                },
                _ = tick.tick() => {
                    if job.cancel.load(Ordering::Relaxed) {
                        kill_tree(&mut child).await;
                        return Err("تم إلغاء التحميل".into());
                    }
                    if let Some(status) = child.try_wait().map_err(|_| "تعذر متابعة التحميل")? { break status; }
                }
                _ = watchdog_tick.tick() => {
                    // Observe actual file growth, not retry messages. One stalled job
                    // must not hold the single-download queue indefinitely.
                    let now = std::time::Instant::now();
                    if let Ok(bytes) = download_bytes(temp).await { watchdog.observe(bytes, now); }
                    if watchdog.stalled(now, processing) {
                        kill_tree(&mut child).await;
                        return Err("توقف نقل بيانات الفيديو لمدة طويلة؛ تحقق من الاتصال ثم أعد المحاولة. ستتابع بقية التنزيلات تلقائيًا".into());
                    }
                }
            }
        };
        // Process exit can win the select before the final error is read. Drain
        // stderr, with a deadline in case a descendant still owns the pipe.
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while let Ok(Some(line)) = err_lines.next_line().await {
                remember_failure(&mut failure, &line);
            }
        }).await;
        if !status.success() {
            let message = if failure.contains("Sign in") || failure.contains("bot") { "يطلب يوتيوب التحقق أو تسجيل الدخول؛ هذا الفيديو غير متاح للتحميل حاليًا" }
                else if failure.contains("format") { "الجودة المطلوبة غير متاحة لهذا الفيديو" }
                else if failure.contains("space") { "مساحة القرص غير كافية" }
                else { "تعذر تحميل الفيديو؛ تحقق من الاتصال وإتاحة الفيديو ثم أعد المحاولة" };
            return Err(message.into());
        }
        let ext = if job.quality == "audio" { "m4a" } else { "mp4" };
        let source = temp.join(format!("video.{ext}"));
        let meta = tokio::fs::metadata(&source).await.map_err(|_| "لم ينتج المحرك ملفًا؛ قد يكون بثًا مباشرًا أو فيديو غير متاح")?;
        if meta.len() == 0 { return Err("ملف الفيديو فارغ".into()); }
        let title = self.jobs.lock().unwrap().iter().find(|j| j.id == job.id).map(|j| j.title.clone()).unwrap_or_default();
        let name = safe_title(&title);
        let target = destination.join(format!("{name}-{}.{}", job.id, ext));
        // Exclusive creation: never overwrite an existing file.
        let mut output = tokio::fs::OpenOptions::new().write(true).create_new(true).open(&target).await.map_err(|_| "تعذر حفظ الملف النهائي")?;
        let mut input = tokio::fs::File::open(&source).await.map_err(|_| "تعذر قراءة الملف")?;
        let copied = tokio::io::copy(&mut input, &mut output).await;
        let flushed = output.flush().await; drop(output);
        if copied.is_err() || flushed.is_err() { let _ = tokio::fs::remove_file(&target).await; return Err("تعذر حفظ الملف النهائي؛ تحقق من مساحة القرص".into()); }
        let _ = self.library.record(&target, Some(&title));
        Ok(())
    }
}
async fn cancelled(job: &Job) { while !job.cancel.load(Ordering::Relaxed) { tokio::time::sleep(std::time::Duration::from_millis(200)).await; } }
pub fn terminal(s: &str) -> bool { matches!(s, "completed" | "failed" | "cancelled") }
fn remember_failure(failure: &mut String, line: &str) {
    let line = line.trim();
    if line.is_empty() || line.starts_with("LABEEB|") { return; }
    // Preserve a real error over trailing warnings or informational messages.
    if failure.starts_with("ERROR:") && !line.starts_with("ERROR:") { return; }
    *failure = line.chars().filter(|c| !c.is_control()).take(2000).collect();
}
fn safe_title(s: &str) -> String {
    let name: String = s.chars().map(|c| if c.is_control() || "<>:\"/\\|?*%".contains(c) { '_' } else { c }).take(100).collect();
    let name = name.trim_matches([' ', '.']); if name.is_empty() { "Video".into() } else { name.into() }
}
fn apply_line(j: &mut Job, line: &str) {
    if let Some(title) = line.strip_prefix("LABEEB_TITLE|") { j.title = title.chars().take(300).collect(); }
    else if let Some(data) = line.strip_prefix("LABEEB|") {
        let values: Vec<_> = data.split('|').collect();
        if values.len() == 3 { if let Ok(p) = values[0].trim().trim_end_matches('%').parse::<f64>() { if p.is_finite() { j.percent = p.clamp(0., 100.); } }
            j.speed = values[1].chars().take(30).collect(); j.eta = values[2].chars().take(30).collect(); }
    } else if line.starts_with("LABEEB_PROCESSING|") || line.starts_with("[Merger]") || line.starts_with("[ExtractAudio]") { j.status = "merging".into(); }
}
struct DownloadWatchdog { bytes: u64, last_growth: std::time::Instant }
impl DownloadWatchdog {
    fn new(now: std::time::Instant) -> Self { Self { bytes: 0, last_growth: now } }
    fn observe(&mut self, bytes: u64, now: std::time::Instant) {
        if bytes != self.bytes { self.bytes = bytes; self.last_growth = now; }
    }
    fn stalled(&self, now: std::time::Instant, processing: bool) -> bool {
        now.duration_since(self.last_growth) >= std::time::Duration::from_secs(if processing { 600 } else { 180 })
    }
}
async fn download_bytes(folder: &Path) -> std::io::Result<u64> {
    let mut entries = tokio::fs::read_dir(folder).await?;
    let mut total = 0u64;
    while let Some(entry) = entries.next_entry().await? {
        let meta = entry.metadata().await?;
        if meta.is_file() { total = total.saturating_add(meta.len()); }
    }
    Ok(total)
}
pub(crate) async fn verified(path: &Path, hash: &str) -> bool {
    let Ok(mut file) = tokio::fs::File::open(path).await else { return false; };
    let mut digest = Sha256::new(); let mut buffer = vec![0; 128 * 1024];
    loop { match file.read(&mut buffer).await { Ok(0) => break, Ok(n) => digest.update(&buffer[..n]), Err(_) => return false } }
    format!("{:x}", digest.finalize()) == hash
}
async fn kill_tree(child: &mut tokio::process::Child) {
    #[cfg(windows)] if let Some(pid) = child.id() {
        let mut kill = tokio::process::Command::new("taskkill.exe");
        kill.args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags(0x08000000).stdout(Stdio::null()).stderr(Stdio::null());
        let _ = kill.status().await;
    }
    let _ = child.kill().await; let _ = child.wait().await;
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn diagnostics_preserve_errors_over_progress_and_warnings() {
        let mut error = String::new();
        remember_failure(&mut error, "ERROR: Permission denied");
        remember_failure(&mut error, "LABEEB|100%|NA|NA");
        remember_failure(&mut error, "WARNING: trailing warning");
        assert_eq!(error, "ERROR: Permission denied");
        remember_failure(&mut error, &format!("ERROR: {}", "x".repeat(4000)));
        assert_eq!(error.len(), 2000);
    }
    #[test] fn stalled_downloads_are_bounded_but_growth_and_merging_get_time() {
        use std::time::{Duration, Instant};
        let now = Instant::now(); let mut watch = DownloadWatchdog::new(now);
        watch.observe(0, now + Duration::from_secs(170));
        assert!(watch.stalled(now + Duration::from_secs(180), false));
        assert!(!watch.stalled(now + Duration::from_secs(180), true));
        watch.observe(1024, now + Duration::from_secs(181));
        assert!(!watch.stalled(now + Duration::from_secs(300), false));
        assert!(watch.stalled(now + Duration::from_secs(781), true));
    }
    #[tokio::test] async fn progress_and_postprocessing_markers_update_the_job() {
        let dir = tempfile::tempdir().unwrap();
        let manager = VideoManager::new(dir.path().join("tools"), dir.path().join("videos"));
        let _gate = manager.gate.acquire().await.unwrap();
        manager.start("https://youtu.be/BaW_jenozKc", "720", None).unwrap();
        let mut job = manager.jobs.lock().unwrap()[0].clone();
        apply_line(&mut job, "LABEEB| 42.5%|2MiB/s|00:12");
        assert_eq!(job.percent, 42.5); assert_eq!(job.speed, "2MiB/s"); assert_eq!(job.eta, "00:12");
        apply_line(&mut job, "LABEEB_PROCESSING|BaW_jenozKc"); assert_eq!(job.status, "merging");
        manager.cancel(&job.id).unwrap();
    }
    #[test] fn canonical_video_urls() {
        for u in ["https://youtu.be/BaW_jenozKc?t=3", "https://www.youtube.com/watch?v=BaW_jenozKc&list=abc", "https://m.youtube.com/shorts/BaW_jenozKc"] {
            assert_eq!(youtube_url(u).unwrap(), "https://www.youtube.com/watch?v=BaW_jenozKc");
        }
    }
    #[test] fn rejects_untrusted_hosts_and_arguments() {
        for u in ["https://youtube.com.evil.test/watch?v=BaW_jenozKc", "https://user@youtube.com/watch?v=BaW_jenozKc", "file:///a", "https://youtu.be/--exec", "https://youtube.com/playlist?list=abc", "https://youtu.be/BaW_jenozKc/extra"] { assert!(youtube_url(u).is_err(), "{u}"); }
        assert_eq!(safe_title("../a:b*"), "_a_b_");
    }
    #[tokio::test] async fn rejects_changed_engine() {
        let dir = tempfile::tempdir().unwrap(); let file = dir.path().join("engine");
        tokio::fs::write(&file, "altered").await.unwrap(); assert!(!verified(&file, TOOLS[0].2).await);
    }
    #[tokio::test] async fn cancelled_queued_job_never_starts() {
        let dir = tempfile::tempdir().unwrap();
        let manager = VideoManager::new(dir.path().join("tools"), dir.path().join("videos"));
        let _gate = manager.gate.acquire().await.unwrap();
        manager.start("https://youtu.be/BaW_jenozKc", "720", None).unwrap();
        let id = manager.jobs.lock().unwrap()[0].id.clone();
        manager.cancel(&id).unwrap();
        assert_eq!(manager.snapshot()["jobs"][0]["status"], "cancelled");
        assert!(manager.snapshot()["jobs"][0]["startedMs"].as_u64().unwrap() > 0);
        assert!(!manager.dismiss("unknown"));
        assert!(manager.dismiss(&id));
        assert!(manager.snapshot()["jobs"].as_array().unwrap().is_empty());
        assert!(!dir.path().join("tools").exists());
    }
    #[tokio::test] #[ignore = "Requires network and verified Viora tools via LABEEB_VIDEO_TEST_TOOLS"]
    async fn real_youtube_download() {
        let source = PathBuf::from(std::env::var("LABEEB_VIDEO_TEST_TOOLS").expect("tool directory"));
        let dir = tempfile::tempdir().unwrap();
        let mut manager = VideoManager::new(dir.path().join("tools"), dir.path().join("videos"));
        Arc::get_mut(&mut manager).unwrap().tools = source;
        let quality = std::env::var("LABEEB_VIDEO_TEST_QUALITY").unwrap_or("720".into());
        manager.start("https://www.youtube.com/watch?v=jNQXAC9IVRw", &quality, None).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(600), async {
            loop { let snapshot = manager.snapshot(); let status = snapshot["jobs"][0]["status"].as_str().unwrap();
                if terminal(status) { assert_eq!(status, "completed", "{snapshot}"); break; }
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }).await.unwrap();
        assert!(std::fs::read_dir(dir.path().join("videos")).unwrap().any(|e| e.unwrap().path().extension().is_some_and(|x| x == if quality == "audio" { "m4a" } else { "mp4" })));
    }
}
