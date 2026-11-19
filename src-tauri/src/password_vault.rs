//! Labeeb's vault for approved login captures and manual entries. Never reads WebView2's Login Data.
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use zeroize::Zeroizing;
type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Serialize)]
pub struct VaultEntry {
    pub id: String,
    pub origin: String,
    pub username: String,
}

pub trait Secrets {
    fn put(&self, id: &str, secret: &str) -> Result<()>;
    fn get(&self, id: &str) -> Result<Zeroizing<String>>;
    fn remove(&self, id: &str) -> Result<()>;
}
pub struct Vault {
    db: Mutex<Connection>,
    verifying: AtomicBool,
    unlocked: AtomicBool,
}
pub struct VerifiedUser(());
pub struct VerificationGuard<'a>(&'a AtomicBool);
impl Drop for VerificationGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

pub(crate) fn origin(input: &str) -> Result<String> {
    let u = url::Url::parse(input.trim()).map_err(|_| "VAULT_INVALID_SITE")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || input.len() > 2048
    {
        return Err("VAULT_INVALID_SITE".into());
    }
    Ok(u.origin().ascii_serialization())
}
impl Vault {
    fn unlock_session(&self, _verified: VerifiedUser) {
        self.unlocked.store(true, Ordering::Release);
    }
    pub(crate) fn session_proof(&self) -> Result<VerifiedUser> {
        if self.unlocked.load(Ordering::Acquire) { Ok(VerifiedUser(())) }
        else { Err("VAULT_LOCKED".into()) }
    }
    pub fn save_login(
        &self,
        secrets: &impl Secrets,
        site: &str,
        username: &str,
        password: &str,
    ) -> Result<()> {
        let site = origin(site)?;
        let username = username.trim();
        if username.is_empty()
            || username.len() > 512
            || password.is_empty()
            || password.len() > 1024
        {
            return Err("VAULT_INVALID_INPUT".into());
        }
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        let id = db.query_row(
            "SELECT id FROM credentials WHERE origin=?1 AND username=?2",
            params![site, username],
            |r| r.get::<_, String>(0),
        );
        match id {
            Ok(id) => secrets.put(&id, password),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                drop(db);
                self.add(secrets, &site, username, password)
            }
            Err(_) => Err("VAULT_STORAGE".into()),
        }
    }
    // Internal comparison only: never exposes credentials or unlocks the vault.
    pub fn matches_login(&self, secrets: &impl Secrets, site: &str, username: &str, password: &str) -> Result<bool> {
        let site = origin(site)?;
        let id = self.db.lock().map_err(|_| "VAULT_STORAGE")?.query_row(
            "SELECT id FROM credentials WHERE origin=?1 AND username=?2",
            params![site, username.trim()], |r| r.get::<_, String>(0),
        );
        match id {
            Ok(id) => Ok(secrets.get(&id)?.as_str() == password),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
            Err(_) => Err("VAULT_STORAGE".into()),
        }
    }
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path).map_err(|_| "VAULT_STORAGE")?;
        db.execute_batch("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY, origin TEXT NOT NULL, username TEXT NOT NULL, UNIQUE(origin,username));").map_err(|_| "VAULT_STORAGE")?;
        Ok(Self {
            db: Mutex::new(db),
            verifying: AtomicBool::new(false),
            unlocked: AtomicBool::new(false),
        })
    }
    pub fn begin_verification(&self) -> Result<VerificationGuard<'_>> {
        self.verifying
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .map_err(|_| "VAULT_BUSY")?;
        Ok(VerificationGuard(&self.verifying))
    }
    pub fn list(&self) -> Result<Vec<VaultEntry>> {
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        let mut stmt = db
            .prepare("SELECT id,origin,username FROM credentials ORDER BY origin,username")
            .map_err(|_| "VAULT_STORAGE")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(VaultEntry {
                    id: r.get(0)?,
                    origin: r.get(1)?,
                    username: r.get(2)?,
                })
            })
            .map_err(|_| "VAULT_STORAGE")?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| "VAULT_STORAGE".into())
    }
    pub fn add(
        &self,
        secrets: &impl Secrets,
        site: &str,
        username: &str,
        password: &str,
    ) -> Result<()> {
        let site = origin(site)?;
        let username = username.trim();
        if username.is_empty()
            || username.len() > 512
            || password.is_empty()
            || password.len() > 1024
        {
            return Err("VAULT_INVALID_INPUT".into());
        }
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM credentials WHERE origin=?1 AND username=?2)",
                params![site, username],
                |r| r.get(0),
            )
            .map_err(|_| "VAULT_STORAGE")?;
        if exists {
            return Err("VAULT_DUPLICATE".into());
        }
        let count: i64 = db
            .query_row("SELECT count(*) FROM credentials", [], |r| r.get(0))
            .map_err(|_| "VAULT_STORAGE")?;
        if count >= 1000 {
            return Err("VAULT_LIMIT".into());
        }
        let id = uuid::Uuid::new_v4().to_string();
        secrets.put(&id, password)?;
        if db
            .execute(
                "INSERT INTO credentials(id,origin,username) VALUES(?1,?2,?3)",
                params![id, site, username],
            )
            .is_err()
        {
            let _ = secrets.remove(&id);
            return Err("VAULT_STORAGE".into());
        }
        Ok(())
    }
    fn known(db: &Connection, id: &str) -> Result<()> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err("VAULT_NOT_FOUND".into());
        }
        let found: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM credentials WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(|_| "VAULT_STORAGE")?;
        if found {
            Ok(())
        } else {
            Err("VAULT_NOT_FOUND".into())
        }
    }
    // Host-only filling path. Unlike vault viewing, filling is restricted to
    // one exact HTTPS origin; the host rechecks the live document before use.
    pub(crate) fn secret_for_site(&self, secrets: &impl Secrets, id: &str, site: &str) -> Result<Zeroizing<String>> {
        let site = origin(site)?;
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        let matches: bool = db.query_row(
            "SELECT EXISTS(SELECT 1 FROM credentials WHERE id=?1 AND origin=?2)",
            params![id, site], |r| r.get(0),
        ).map_err(|_| "VAULT_STORAGE")?;
        if !matches { return Err("VAULT_NOT_FOUND".into()); }
        secrets.get(id)
    }
    pub fn reveal(
        &self,
        secrets: &impl Secrets,
        id: &str,
        _verified: VerifiedUser,
    ) -> Result<Zeroizing<String>> {
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        Self::known(&db, id)?;
        secrets.get(id)
    }
    pub fn delete(&self, secrets: &impl Secrets, id: &str, _verified: VerifiedUser) -> Result<()> {
        let db = self.db.lock().map_err(|_| "VAULT_STORAGE")?;
        Self::known(&db, id)?;
        secrets.remove(id)?;
        db.execute("DELETE FROM credentials WHERE id=?1", [id])
            .map_err(|_| "VAULT_STORAGE")?;
        Ok(())
    }
}

#[cfg(all(windows, feature = "desktop"))]
pub struct WindowsSecrets;
#[cfg(all(windows, feature = "desktop"))]
impl WindowsSecrets {
    fn entry(id: &str) -> Result<keyring::Entry> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err("VAULT_NOT_FOUND".into());
        }
        keyring::Entry::new("app.labeeb.password-vault.v1", id).map_err(|_| "VAULT_STORAGE".into())
    }
}
#[cfg(all(windows, feature = "desktop"))]
impl Secrets for WindowsSecrets {
    fn put(&self, id: &str, secret: &str) -> Result<()> {
        Self::entry(id)?
            .set_password(secret)
            .map_err(|_| "VAULT_STORAGE".into())
    }
    fn get(&self, id: &str) -> Result<Zeroizing<String>> {
        Self::entry(id)?
            .get_password()
            .map(Zeroizing::new)
            .map_err(|_| "VAULT_SECRET_UNAVAILABLE".into())
    }
    fn remove(&self, id: &str) -> Result<()> {
        match Self::entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("VAULT_STORAGE".into()),
        }
    }
}

#[cfg(all(windows, feature = "desktop"))]
pub async fn verify(app: &tauri::AppHandle, ar: bool) -> Result<VerifiedUser> {
    use tauri::Manager;
    use windows::{
        core::{factory, HSTRING},
        Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier},
        Win32::System::WinRT::IUserConsentVerifierInterop,
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let operation =
            (|| -> Result<windows_future::IAsyncOperation<UserConsentVerificationResult>> {
                let window = handle.get_window("main").ok_or("VAULT_AUTH_UNAVAILABLE")?;
                let hwnd = window.hwnd().map_err(|_| "VAULT_AUTH_UNAVAILABLE")?;
                let factory: IUserConsentVerifierInterop =
                    factory::<UserConsentVerifier, IUserConsentVerifierInterop>()
                        .map_err(|_| "VAULT_AUTH_UNAVAILABLE")?;
                let message = HSTRING::from(if ar {
                    "تحقق من هويتك للوصول إلى كلمة المرور في لبيب"
                } else {
                    "Verify your identity to access a password in Labeeb"
                });
                unsafe {
                    factory
                        .RequestVerificationForWindowAsync(hwnd, &message)
                        .map_err(|_| "VAULT_AUTH_UNAVAILABLE".into())
                }
            })();
        let _ = tx.send(operation);
    })
    .map_err(|_| "VAULT_AUTH_UNAVAILABLE")?;
    let result = rx
        .await
        .map_err(|_| "VAULT_AUTH_UNAVAILABLE")??
        .await
        .map_err(|_| "VAULT_AUTH_UNAVAILABLE")?;
    if result == UserConsentVerificationResult::Verified {
        Ok(VerifiedUser(()))
    } else if result == UserConsentVerificationResult::Canceled {
        Err("VAULT_AUTH_CANCELLED".into())
    } else {
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}

#[cfg(feature = "desktop")]
pub struct VaultLocation(
    std::path::PathBuf,
    std::sync::OnceLock<Result<std::sync::Arc<Vault>>>,
);
#[cfg(feature = "desktop")]
impl VaultLocation {
    pub fn new(path: std::path::PathBuf) -> Self {
        Self(path, std::sync::OnceLock::new())
    }
    pub(crate) fn open(&self) -> Result<std::sync::Arc<Vault>> {
        self.1
            .get_or_init(|| Vault::open(&self.0).map(std::sync::Arc::new))
            .clone()
    }
}

#[cfg(all(windows, feature = "desktop"))]
async fn available() -> bool {
    use windows::{
        core::factory,
        Security::Credentials::UI::{UserConsentVerifier, UserConsentVerifierAvailability},
        Win32::System::WinRT::IUserConsentVerifierInterop,
    };
    if factory::<UserConsentVerifier, IUserConsentVerifierInterop>().is_err() {
        return false;
    }
    match UserConsentVerifier::CheckAvailabilityAsync() {
        Ok(op) => op
            .await
            .is_ok_and(|v| v == UserConsentVerifierAvailability::Available),
        Err(_) => false,
    }
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_status(w: tauri::Webview) -> Result<bool> {
    crate::desktop::trusted(&w)?;
    #[cfg(windows)]
    {
        Ok(available().await)
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}
#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_unlock(w: tauri::Webview, app: tauri::AppHandle, ar: bool) -> Result<()> {
    use tauri::Manager;
    crate::desktop::trusted(&w)?;
    #[cfg(windows)] {
        let vault = app.state::<VaultLocation>().open()?;
        if vault.session_proof().is_ok() { return Ok(()); }
        let _guard = vault.begin_verification()?;
        let verified = verify(&app, ar).await?;
        vault.unlock_session(verified);
        Ok(())
    }
    #[cfg(not(windows))] { let _ = (app, ar); Err("VAULT_AUTH_UNAVAILABLE".into()) }
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_list(w: tauri::Webview, app: tauri::AppHandle) -> Result<Vec<VaultEntry>> {
    use tauri::Manager;
    crate::desktop::trusted(&w)?;
    app.state::<VaultLocation>().open()?.session_proof()?;
    tauri::async_runtime::spawn_blocking(move || app.state::<VaultLocation>().open()?.list())
        .await
        .map_err(|_| "VAULT_STORAGE")?
}
#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_add(
    w: tauri::Webview,
    app: tauri::AppHandle,
    site: String,
    username: String,
    password: String,
) -> Result<()> {
    use tauri::Manager;
    let password = Zeroizing::new(password);
    crate::desktop::trusted(&w)?;
    #[cfg(windows)]
    {
        app.state::<VaultLocation>().open()?.session_proof()?;
        tauri::async_runtime::spawn_blocking(move || {
            app.state::<VaultLocation>()
                .open()?
                .add(&WindowsSecrets, &site, &username, &password)
        })
        .await
        .map_err(|_| "VAULT_STORAGE")?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, site, username, password);
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}
#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_reveal(
    w: tauri::Webview,
    app: tauri::AppHandle,
    id: String,
    ar: bool,
) -> Result<String> {
    use tauri::Manager;
    crate::desktop::trusted(&w)?;
    #[cfg(windows)]
    {
        let vault = app.state::<VaultLocation>().open()?;
        let _ = ar;
        let verified = vault.session_proof()?;
        let worker = vault.clone();
        tauri::async_runtime::spawn_blocking(move || {
            worker
                .reveal(&WindowsSecrets, &id, verified)
                .map(|secret| secret.to_string())
        })
        .await
        .map_err(|_| "VAULT_STORAGE")?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id, ar);
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}
#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn vault_delete(
    w: tauri::Webview,
    app: tauri::AppHandle,
    id: String,
    ar: bool,
) -> Result<()> {
    use tauri::Manager;
    crate::desktop::trusted(&w)?;
    #[cfg(windows)]
    {
        let vault = app.state::<VaultLocation>().open()?;
        let _ = ar;
        let verified = vault.session_proof()?;
        let worker = vault.clone();
        tauri::async_runtime::spawn_blocking(move || worker.delete(&WindowsSecrets, &id, verified))
            .await
            .map_err(|_| "VAULT_STORAGE")?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id, ar);
        Err("VAULT_AUTH_UNAVAILABLE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saving_does_not_unlock_and_a_new_session_starts_locked() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.sqlite");
        let vault = Vault::open(&path).unwrap();
        let secrets = Fake::default();
        vault.save_login(&secrets, "https://example.com", "test", "synthetic").unwrap();
        assert!(vault.session_proof().is_err());
        vault.unlock_session(VerifiedUser(()));
        assert!(vault.session_proof().is_ok());
        assert!(vault.session_proof().is_ok());
        drop(vault);
        assert!(Vault::open(&path).unwrap().session_proof().is_err());
    }
    use std::{cell::RefCell, collections::HashMap};
    #[test]
    fn approved_login_updates_the_same_account_without_creating_duplicates() {
        let vault = Vault::open(Path::new(":memory:")).unwrap();
        let secrets = Fake::default();
        vault
            .save_login(
                &secrets,
                "https://example.com/login",
                "person",
                "first",
            )
            .unwrap();
        let id = vault.list().unwrap()[0].id.clone();
        vault
            .save_login(
                &secrets,
                "https://example.com/again",
                "person",
                "second",
            )
            .unwrap();
        assert_eq!(vault.list().unwrap().len(), 1);
        assert_eq!(
            &**vault.reveal(&secrets, &id, VerifiedUser(())).unwrap(),
            "second"
        );
        vault
            .save_login(
                &secrets,
                "https://other.example/login",
                "person",
                "other",
            )
            .unwrap();
        assert_eq!(vault.list().unwrap().len(), 2);
    }
    #[derive(Default)]
    struct Fake(RefCell<HashMap<String, String>>);
    impl Secrets for Fake {
        fn put(&self, id: &str, secret: &str) -> Result<()> {
            self.0.borrow_mut().insert(id.into(), secret.into());
            Ok(())
        }
        fn get(&self, id: &str) -> Result<Zeroizing<String>> {
            self.0
                .borrow()
                .get(id)
                .cloned()
                .map(Zeroizing::new)
                .ok_or("VAULT_SECRET_UNAVAILABLE".into())
        }
        fn remove(&self, id: &str) -> Result<()> {
            self.0.borrow_mut().remove(id);
            Ok(())
        }
    }
    #[test]
    fn filling_after_restart_does_not_unlock_vault_and_requires_exact_site() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.sqlite");
        let secrets = Fake::default();
        let vault = Vault::open(&path).unwrap();
        vault.save_login(&secrets, "https://example.com", "user", "synthetic-secret").unwrap();
        let id = vault.list().unwrap()[0].id.clone();
        drop(vault);
        let vault = Vault::open(&path).unwrap();
        assert!(vault.session_proof().is_err());
        assert_eq!(vault.secret_for_site(&secrets, &id, "https://example.com/login").unwrap().as_str(), "synthetic-secret");
        assert!(vault.session_proof().is_err());
        for site in ["http://example.com", "https://other.example.com", "https://example.com:8443", "https://example.com.evil.test"] {
            assert!(vault.secret_for_site(&secrets, &id, site).is_err());
        }
        assert!(vault.secret_for_site(&secrets, "missing", "https://example.com").is_err());
    }
    #[test]
    fn identical_login_is_suppressed_without_unlocking() {
        let vault = Vault::open(Path::new(":memory:")).unwrap();
        let secrets = Fake::default();
        vault.save_login(&secrets, "https://example.com/login", "user", "saved-secret").unwrap();
        assert!(vault.matches_login(&secrets, "https://example.com/other", " user ", "saved-secret").unwrap());
        assert!(!vault.matches_login(&secrets, "https://example.com", "user", "changed-secret").unwrap());
        assert!(!vault.matches_login(&secrets, "https://example.com", "other", "saved-secret").unwrap());
        assert!(!vault.matches_login(&secrets, "https://other.example.com", "user", "saved-secret").unwrap());
        assert!(!vault.matches_login(&secrets, "https://example.com:8443", "user", "saved-secret").unwrap());
        assert!(vault.session_proof().is_err());
        secrets.0.borrow_mut().clear();
        assert!(vault.matches_login(&secrets, "https://example.com", "user", "saved-secret").is_err());
    }
    #[test]
    fn metadata_never_contains_secrets_and_reopens() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.sqlite");
        let secrets = Fake::default();
        let vault = Vault::open(&path).unwrap();
        vault
            .add(
                &secrets,
                "https://example.com/private?q=secret",
                "user",
                "unique-password-marker",
            )
            .unwrap();
        let rows = vault.list().unwrap();
        assert_eq!(rows[0].origin, "https://example.com");
        assert!(!serde_json::to_string(&rows)
            .unwrap()
            .contains("unique-password-marker"));
        assert_eq!(
            &**vault
                .reveal(&secrets, &rows[0].id, VerifiedUser(()))
                .unwrap(),
            "unique-password-marker"
        );
        drop(vault);
        assert!(!String::from_utf8_lossy(&std::fs::read(&path).unwrap())
            .contains("unique-password-marker"));
        let vault = Vault::open(&path).unwrap();
        assert_eq!(vault.list().unwrap().len(), 1);
        vault
            .delete(&secrets, &rows[0].id, VerifiedUser(()))
            .unwrap();
        assert!(vault.list().unwrap().is_empty());
        assert!(secrets.0.borrow().is_empty());
    }
    #[test]
    fn rejects_unsafe_inputs_duplicates_and_foreign_ids() {
        let vault = Vault::open(Path::new(":memory:")).unwrap();
        let secrets = Fake::default();
        for site in [
            "http://example.com",
            "javascript:alert(1)",
            "https://user:pass@example.com",
        ] {
            assert!(vault.add(&secrets, site, "u", "p").is_err());
        }
        assert!(vault
            .add(&secrets, "https://example.com", "u", &"x".repeat(1025))
            .is_err());
        vault
            .add(&secrets, "https://example.com/a", "u", "p")
            .unwrap();
        assert_eq!(
            vault
                .add(&secrets, "https://example.com/b", "u", "new")
                .unwrap_err(),
            "VAULT_DUPLICATE"
        );
        assert!(vault.reveal(&secrets, "api-key", VerifiedUser(())).is_err());
        assert!(vault
            .delete(
                &secrets,
                &uuid::Uuid::new_v4().to_string(),
                VerifiedUser(())
            )
            .is_err());
    }
    #[test]
    fn verification_is_single_flight_and_released_on_cancel() {
        let vault = Vault::open(Path::new(":memory:")).unwrap();
        let guard = vault.begin_verification().unwrap();
        assert!(vault.begin_verification().is_err());
        drop(guard);
        assert!(vault.begin_verification().is_ok());
    }
    #[test]
    fn failed_secret_writes_never_create_metadata() {
        struct Broken;
        impl Secrets for Broken {
            fn put(&self, _: &str, _: &str) -> Result<()> {
                Err("VAULT_STORAGE".into())
            }
            fn get(&self, _: &str) -> Result<Zeroizing<String>> {
                panic!("must not read")
            }
            fn remove(&self, _: &str) -> Result<()> {
                Err("VAULT_STORAGE".into())
            }
        }
        let vault = Vault::open(Path::new(":memory:")).unwrap();
        assert!(vault
            .add(&Broken, "https://example.com", "u", "secret")
            .is_err());
        assert!(vault.list().unwrap().is_empty());
        let good = Fake::default();
        vault
            .add(&good, "https://example.com", "u", "secret")
            .unwrap();
        let id = vault.list().unwrap()[0].id.clone();
        assert!(vault.delete(&Broken, &id, VerifiedUser(())).is_err());
        assert_eq!(vault.list().unwrap().len(), 1);
    }
    #[cfg(all(windows, feature = "desktop"))]
    #[test]
    fn windows_credential_store_roundtrip_with_synthetic_secret() {
        let id = uuid::Uuid::new_v4().to_string();
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = WindowsSecrets.remove(&self.0);
            }
        }
        let _cleanup = Cleanup(id.clone());
        WindowsSecrets
            .put(&id, "labeeb-synthetic-test-only")
            .unwrap();
        assert_eq!(
            &**WindowsSecrets.get(&id).unwrap(),
            "labeeb-synthetic-test-only"
        );
        WindowsSecrets.remove(&id).unwrap();
        assert!(WindowsSecrets.get(&id).is_err());
    }
}
