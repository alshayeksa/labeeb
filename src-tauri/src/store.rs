use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::path::Path;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub visited_at: i64,
}
pub struct Store {
    db: Connection,
    revision: Cell<u64>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Session {
    pub tabs: Vec<SessionTab>,
    pub active: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionTab {
    pub title: String,
    pub url: String,
    pub zoom: f64,
}
impl Session {
    pub fn validated(self) -> Self {
        let mut result = Self::default();
        for (index, mut tab) in self.tabs.into_iter().take(24).enumerate() {
            if tab.url.len() > 8192 || !url::Url::parse(&tab.url).is_ok_and(|u| crate::policy::native_url_allowed(&u)) { continue; }
            tab.title = tab.title.chars().take(256).collect();
            if !tab.zoom.is_finite() || !(0.25..=5.0).contains(&tab.zoom) { tab.zoom = 1.0; }
            if index == self.active { result.active = result.tabs.len(); }
            result.tabs.push(tab);
        }
        result
    }
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        db.execute_batch("PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,title TEXT NOT NULL,url TEXT NOT NULL,visited_at INTEGER NOT NULL DEFAULT(unixepoch()));CREATE INDEX IF NOT EXISTS history_time ON history(visited_at);CREATE TABLE IF NOT EXISTS bookmarks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,url TEXT NOT NULL UNIQUE,visited_at INTEGER NOT NULL DEFAULT(unixepoch()));CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);PRAGMA user_version=1;").map_err(|e|e.to_string())?;
        Ok(Self { db, revision: Cell::new(1) })
    }
    pub fn library_revision(&self) -> u64 { self.revision.get() }
    fn changed(&self) { self.revision.set(self.revision.get().wrapping_add(1)); }
    pub fn save_session(&self, session: &Session) -> Result<(), String> {
        let value = serde_json::to_string(session).map_err(|e| e.to_string())?;
        self.db.execute("INSERT INTO settings(key,value) VALUES('session',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [value]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn session(&self) -> Session {
        self.db.query_row("SELECT value FROM settings WHERE key='session'", [], |r| r.get::<_, String>(0))
            .ok().and_then(|s| serde_json::from_str::<Session>(&s).ok()).unwrap_or_default().validated()
    }
    pub fn visit(&self, title: &str, url: &str) -> Result<(), String> {
        if url == "about:blank" {
            return Ok(());
        }
        self.db
            .execute(
                "INSERT INTO history(title,url) VALUES(?1,?2)",
                params![title, url],
            )
            .map_err(|e| e.to_string())?;
        self.db.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 10000)",[]).map_err(|e|e.to_string())?;
        self.changed();
        Ok(())
    }
    pub fn entries(&self, bookmarks: bool) -> Result<Vec<Entry>, String> {
        let mut s = self
            .db
            .prepare(if bookmarks {
                "SELECT id,title,url,visited_at FROM bookmarks ORDER BY id DESC LIMIT 2000"
            } else {
                "SELECT id,title,url,visited_at FROM history ORDER BY id DESC LIMIT 500"
            })
            .map_err(|e| e.to_string())?;
        let rows = s
            .query_map([], |r| {
                Ok(Entry {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    url: r.get(2)?,
                    visited_at: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn bookmark(&self, title: &str, url: &str) -> Result<(), String> {
        self.db.execute("INSERT INTO bookmarks(title,url) VALUES(?1,?2) ON CONFLICT(url) DO UPDATE SET title=excluded.title",params![title,url]).map_err(|e|e.to_string())?;
        self.changed();
        Ok(())
    }
    pub fn remove_bookmark(&self, id: i64) -> Result<(), String> {
        self.db
            .execute("DELETE FROM bookmarks WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        self.changed();
        Ok(())
    }
    pub fn clear_history(&self) -> Result<(), String> {
        self.db
            .execute("DELETE FROM history", [])
            .map_err(|e| e.to_string())?;
        self.changed();
        Ok(())
    }
    pub fn locale(&self) -> String {
        self.db
            .query_row("SELECT value FROM settings WHERE key='locale'", [], |r| {
                r.get(0)
            })
            .unwrap_or_else(|_| "ar".into())
    }
    pub fn set_locale(&self, value: &str) -> Result<(), String> {
        if !["ar", "en"].contains(&value) {
            return Err("Invalid locale".into());
        }
        self.db.execute("INSERT INTO settings(key,value) VALUES('locale',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[value]).map_err(|e|e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_restores_order_active_tab_and_zoom_without_changing_library_revision() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("session.sqlite");
        let s = Store::open(&path).unwrap();
        let revision = s.library_revision();
        s.save_session(&Session { active:1, tabs:vec![
            SessionTab {title:"First".into(),url:"https://example.com/".into(),zoom:1.0},
            SessionTab {title:"Second".into(),url:"https://example.org/".into(),zoom:1.25},
        ]}).unwrap();
        assert_eq!(s.library_revision(), revision);
        drop(s);
        let s = Store::open(&path).unwrap(); let session = s.session();
        assert_eq!(session.tabs.len(), 2); assert_eq!(session.active, 1);
        assert_eq!(session.tabs[1].zoom, 1.25);
        assert_eq!(session.tabs[0].url, "https://example.com/");
        s.save_session(&Session::default()).unwrap(); assert!(s.session().tabs.is_empty());
    }
    #[test]
    fn corrupt_or_unsafe_session_entries_do_not_restore() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        s.db.execute("INSERT INTO settings(key,value) VALUES('session','broken')", []).unwrap();
        assert!(s.session().tabs.is_empty());
        let make = |url: &str| SessionTab {title:"x".repeat(300),url:url.into(),zoom:9.0};
        let session = Session {active:2,tabs:vec![make("javascript:alert(1)"),make("https://user:secret@example.com"),make("https://example.com/")]}.validated();
        assert_eq!(session.tabs.len(), 1); assert_eq!(session.active, 0);
        assert_eq!(session.tabs[0].title.len(), 256); assert_eq!(session.tabs[0].zoom, 1.0);
        assert_eq!(Session {active:50,tabs:(0..100).map(|_| make("about:blank")).collect()}.validated().tabs.len(), 24);
    }
    #[test]
    fn library_revision_invalidates_on_each_library_mutation() {
        let s = Store::open(Path::new(":memory:")).unwrap(); let start = s.library_revision();
        s.visit("blank", "about:blank").unwrap(); assert_eq!(s.library_revision(), start);
        s.visit("page", "https://example.com").unwrap();
        s.bookmark("page", "https://example.com").unwrap();
        s.remove_bookmark(s.entries(true).unwrap()[0].id).unwrap();
        s.clear_history().unwrap(); assert_eq!(s.library_revision(), start + 4);
    }
    #[test]
    fn persistence() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("test.sqlite");
        {
            let s = Store::open(&p).unwrap();
            s.bookmark("'); DROP TABLE bookmarks;--", "https://example.com")
                .unwrap();
            s.visit("عربي", "https://example.com").unwrap();
            s.set_locale("en").unwrap();
        }
        let s = Store::open(&p).unwrap();
        assert_eq!(s.entries(true).unwrap().len(), 1);
        assert_eq!(s.entries(false).unwrap()[0].title, "عربي");
        assert_eq!(s.locale(), "en");
        s.clear_history().unwrap();
        assert!(s.entries(false).unwrap().is_empty());
    }
    #[test]
    fn duplicate() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        s.bookmark("a", "https://example.com").unwrap();
        s.bookmark("b", "https://example.com").unwrap();
        assert_eq!(s.entries(true).unwrap().len(), 1);
    }
}
