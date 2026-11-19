//! Preserve Windows' Internet-zone provenance for files written outside WebView2.
use std::path::Path;

pub fn mark_internet(path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        let mut stream = path.as_os_str().to_os_string();
        stream.push(":Zone.Identifier");
        // Do not persist source URLs: they can contain private query parameters.
        std::fs::write(stream, b"[ZoneTransfer]\r\nZoneId=3\r\n")
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn internet_zone_survives_final_rename() {
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("download.part");
        let finished = dir.path().join("download.exe");
        std::fs::write(&part, b"synthetic test data").unwrap();
        mark_internet(&part).unwrap();
        std::fs::rename(&part, &finished).unwrap();
        let mut stream = finished.as_os_str().to_os_string();
        stream.push(":Zone.Identifier");
        assert_eq!(std::fs::read(stream).unwrap(), b"[ZoneTransfer]\r\nZoneId=3\r\n");
        assert_eq!(std::fs::read(finished).unwrap(), b"synthetic test data");
    }
}
