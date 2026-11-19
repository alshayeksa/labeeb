use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::{Path, PathBuf}, sync::{Mutex, atomic::{AtomicBool, Ordering}}, time::UNIX_EPOCH};
use base64::Engine;
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Serialize, Deserialize)]
pub struct Media {
    pub id: String, pub title: String, pub path: PathBuf, pub size: u64,
    pub modified: u64, pub audio: bool,
}
pub struct MediaLibrary {
    index: PathBuf, folder: PathBuf, tools: PathBuf, cache: PathBuf,
    items: Mutex<Vec<Media>>, thumbnails: tokio::sync::Semaphore, verified: AtomicBool,
}
fn media_extension(path: &Path) -> Option<bool> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "mp4" | "webm" | "mov" | "m4v" | "ogv" => Some(false),
        "m4a" | "mp3" | "ogg" | "wav" => Some(true), _ => None,
    }
}
fn describe(path: &Path, title: Option<&str>) -> Result<Media> {
    let audio = media_extension(path).ok_or("صيغة غير مدعومة")?;
    let meta = std::fs::symlink_metadata(path).map_err(|_| "الملف لم يعد موجودًا")?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() == 0 { return Err("ملف غير صالح".into()); }
    let path = path.canonicalize().map_err(|_| "تعذر الوصول للملف")?;
    let id = format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()));
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    let title = title.filter(|t| !t.is_empty()).map(str::to_owned).unwrap_or_else(|| {
        if stem.len() > 37 && stem.as_bytes()[stem.len()-37] == b'-' && stem.is_char_boundary(stem.len()-36) && uuid::Uuid::parse_str(&stem[stem.len()-36..]).is_ok() {
            stem[..stem.len()-37].to_string()
        } else { stem.to_string() }
    });
    let title = if title.chars().any(char::is_alphanumeric) { title } else { if audio { "Audio" } else { "Video" }.into() };
    Ok(Media {id, title, path, size:meta.len(), modified:meta.modified().unwrap_or(UNIX_EPOCH).duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(), audio})
}
/// Moves a file to the Recycle Bin so a mistaken delete can be undone.
pub(crate) fn trash(path: &Path) -> Result<()> {
    #[cfg(windows)] {
        use std::os::windows::ffi::OsStrExt;
        use windows::{core::PCWSTR, Win32::UI::Shell::{SHFileOperationW, SHFILEOPSTRUCTW, FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT}};
        let raw = path.to_string_lossy();
        let shell_path = if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") } else { raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string() };
        // The shell expects a list of paths ending with two NULs.
        let from: Vec<u16> = std::ffi::OsStr::new(&shell_path).encode_wide().chain([0, 0]).collect();
        let mut operation = SHFILEOPSTRUCTW {
            wFunc: FO_DELETE, pFrom: PCWSTR(from.as_ptr()),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT).0 as u16,
            ..Default::default()
        };
        let code = unsafe { SHFileOperationW(&mut operation) };
        if code != 0 || operation.fAnyOperationsAborted.as_bool() { return Err("تعذر حذف الملف؛ قد يكون مفتوحًا في برنامج آخر".into()); }
        Ok(())
    }
    #[cfg(not(windows))] { std::fs::remove_file(path).map_err(|_| "تعذر حذف الملف".into()) }
}
impl MediaLibrary {
    pub fn new(tools: PathBuf, folder: PathBuf) -> Self {
        let parent = tools.parent().unwrap_or(&tools);
        let index = parent.join("video-library.json"); let cache = parent.join("video-thumbnails");
        let items = std::fs::read(&index).ok().filter(|b| b.len() < 4*1024*1024).and_then(|b| serde_json::from_slice::<Vec<Media>>(&b).ok()).unwrap_or_default();
        Self {index, cache, folder, tools, items:Mutex::new(items), thumbnails:tokio::sync::Semaphore::new(1), verified:AtomicBool::new(false)}
    }
    fn save(&self, items: &[Media]) -> Result<()> {
        let tmp = self.index.with_extension("tmp");
        std::fs::write(&tmp, serde_json::to_vec(items).map_err(|_| "تعذر حفظ المكتبة")?).map_err(|_| "تعذر حفظ المكتبة")?;
        std::fs::rename(tmp, &self.index).map_err(|_| "تعذر حفظ المكتبة".into())
    }
    pub fn record(&self, path: &Path, title: Option<&str>) -> Result<()> {
        let media = describe(path, title)?;
        let mut items = self.items.lock().unwrap();
        if let Some(old) = items.iter_mut().find(|m| m.id == media.id) { *old = media; } else { items.push(media); }
        self.save(&items)
    }
    pub fn list(&self) -> Vec<Media> {
        let mut items = self.items.lock().unwrap();
        // Recover completed downloads made by older Labeeb versions, only in its own folder.
        let mut changed = false;
        if let Ok(entries) = std::fs::read_dir(&self.folder) {
            for entry in entries.flatten().take(2000) {
                if let Ok(media) = describe(&entry.path(), None) {
                    if !items.iter().any(|m| m.id == media.id) { items.push(media); changed = true; }
                }
            }
        }
        if changed { let _ = self.save(&items); }
        let mut result: Vec<_> = items.iter().filter_map(|m| describe(&m.path, Some(&m.title)).ok()).collect();
        result.sort_by_key(|m| std::cmp::Reverse(m.modified)); result
    }
    fn resolve(&self, id: &str) -> Result<Media> {
        let m = self.items.lock().unwrap().iter().find(|m| m.id == id).cloned().ok_or("الفيديو غير موجود")?;
        let current = describe(&m.path, Some(&m.title))?;
        if current.id != id { return Err("مسار الملف تغير".into()); } Ok(current)
    }
    /// Deletes a library item's file (to the Recycle Bin) and forgets it. The file is
    /// looked up by its recorded id; a caller can never name a path.
    pub fn remove(&self, id: &str) -> Result<()> {
        let known = self.items.lock().unwrap().iter().find(|m| m.id == id).cloned().ok_or("الفيديو غير موجود")?;
        // A file that is already gone only needs to leave the index.
        if let Ok(current) = describe(&known.path, Some(&known.title)) {
            if current.id != id { return Err("مسار الملف تغير".into()); }
            trash(&current.path)?;
        }
        let mut items = self.items.lock().unwrap();
        items.retain(|m| m.id != id);
        let saved = self.save(&items);
        drop(items);
        if let Ok(entries) = std::fs::read_dir(&self.cache) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with(id) { let _ = std::fs::remove_file(entry.path()); }
            }
        }
        saved
    }
    pub fn open(&self, id: &str, folder: bool) -> Result<()> {
        let m = self.resolve(id)?;
        let path = if folder { m.path.parent().ok_or("مجلد غير صالح")?.to_path_buf() } else { m.path };
        #[cfg(windows)] {
            use windows::{core::{HSTRING, w}, Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
            let raw = path.to_string_lossy();
            let shell_path = if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") } else { raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string() };
            let result = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(shell_path), None, None, SW_SHOWNORMAL) };
            if result.0 as isize <= 32 { return Err("تعذر الفتح؛ تحقق من وجود مشغّل وسائط".into()); }
            Ok(())
        }
        #[cfg(not(windows))] { let _ = path; Err("تشغيل الملف متاح حاليًا على Windows".into()) }
    }
    pub async fn thumbnail(&self, id: &str) -> Result<Option<String>> {
        let _slot = self.thumbnails.acquire().await.map_err(|_| "المكتبة مغلقة")?;
        let m = self.resolve(id)?;
        if m.audio { return Ok(None); }
        let key = format!("{}-{}-{}", m.id, m.modified, m.size);
        let output = self.cache.join(format!("{key}.jpg"));
        if let Ok(bytes) = tokio::fs::read(&output).await { return Ok(Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))); }
        // No downloads/installations for thumbnails. Use the existing verified engine only.
        if !self.verified.load(Ordering::Relaxed) {
            if !crate::video::verified(&self.tools.join("ffmpeg.exe"), "3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec").await { return Ok(None); }
            self.verified.store(true, Ordering::Relaxed);
        }
        tokio::fs::create_dir_all(&self.cache).await.map_err(|_| "تعذر حفظ الصورة")?;
        let mut cmd = tokio::process::Command::new(self.tools.join("ffmpeg.exe"));
        cmd.args(["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-ss", "0", "-i"])
            .arg(&m.path).args(["-frames:v", "1", "-vf", "scale=480:-2:force_original_aspect_ratio=decrease", "-q:v", "5", "-y"]).arg(&output)
            .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true);
        #[cfg(windows)] cmd.creation_flags(0x08000000);
        let mut child = cmd.spawn().map_err(|_| "تعذر تجهيز المعاينة")?;
        match tokio::time::timeout(std::time::Duration::from_secs(10), child.wait()).await {
            Ok(Ok(status)) if status.success() => {},
            _ => { let _ = child.kill().await; let _ = child.wait().await; let _ = tokio::fs::remove_file(output).await; return Ok(None); }
        }
        let bytes = tokio::fs::read(output).await.map_err(|_| "تعذر قراءة المعاينة")?;
        Ok(Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn library_recovers_persists_and_rejects_arbitrary_paths() {
        let dir = tempfile::tempdir().unwrap(); let folder = dir.path().join("downloads"); std::fs::create_dir(&folder).unwrap();
        let media = folder.join("sample.mp4"); std::fs::write(&media, b"test").unwrap();
        std::fs::write(folder.join("ignore.exe"), b"test").unwrap();
        let library = MediaLibrary::new(dir.path().join("tools"), folder.clone());
        let items = library.list(); assert_eq!(items.len(), 1);
        assert!(library.resolve("../../other").is_err());
        let library = MediaLibrary::new(dir.path().join("tools"), folder);
        assert_eq!(library.list()[0].id, items[0].id);
        std::fs::remove_file(media).unwrap(); assert!(library.list().is_empty());
        assert!(library.resolve(&items[0].id).is_err());
        // Removing an entry whose file is already gone clears it from the index.
        assert!(library.remove("unknown").is_err());
        library.remove(&items[0].id).unwrap();
        assert!(library.items.lock().unwrap().is_empty());
    }
    #[test] #[ignore = "Sends a small temporary file to the real Recycle Bin"]
    fn delete_moves_the_file_to_the_recycle_bin_and_forgets_it() {
        let dir = tempfile::tempdir().unwrap(); let folder = dir.path().join("downloads"); std::fs::create_dir(&folder).unwrap();
        let media = folder.join("حذف تجريبي.mp4"); std::fs::write(&media, b"test").unwrap();
        let library = MediaLibrary::new(dir.path().join("tools"), folder);
        let id = library.list()[0].id.clone();
        library.remove(&id).unwrap();
        assert!(!media.exists());
        assert!(library.list().is_empty());
    }
    #[tokio::test] #[ignore = "Requires local sample media and verified FFmpeg"]
    async fn generates_and_reuses_a_real_thumbnail() {
        let dir = tempfile::tempdir().unwrap();
        let sample = PathBuf::from(std::env::var("LABEEB_MEDIA_SAMPLE").unwrap());
        let file = dir.path().join("sample.mp4"); std::fs::copy(sample, &file).unwrap();
        let mut library = MediaLibrary::new(dir.path().join("tools"), dir.path().to_path_buf());
        library.tools = PathBuf::from(std::env::var("LABEEB_VIDEO_TEST_TOOLS").unwrap());
        library.record(&file, Some("Sample video")).unwrap();
        let item = library.list().remove(0);
        let first = library.thumbnail(&item.id).await.unwrap().unwrap();
        assert!(first.starts_with("data:image/jpeg;base64,/9j/"));
        assert_eq!(first, library.thumbnail(&item.id).await.unwrap().unwrap());
        assert_eq!(std::fs::read_dir(&library.cache).unwrap().count(), 1);
    }
}
