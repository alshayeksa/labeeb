import Foundation
import LocalAuthentication
import Security
import SQLite3
import UIKit

struct Entry: Identifiable, Hashable {
    let id: Int64
    let url: String
    let title: String
    let time: Date
}

struct MemoryHit: Identifiable, Hashable {
    var id: String { url }
    let url: String
    let title: String
    let body: String
    let time: Date
}

struct Credential: Identifiable, Hashable {
    let id: Int64
    let origin: String
    let username: String
    var host: String { origin.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "www.", with: "") }
}

struct SiteApp: Identifiable, Hashable {
    let id: Int64
    let name: String
    let url: String
    let color: UInt32
    let icon: Data?
}

/// History, bookmarks, site apps, remembered pages and the list of saved logins, in one SQLite file.
/// Passwords themselves are not here: they live in the Keychain.
final class Store {
    static let shared = Store()

    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "labeeb.store")
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    private static let historyLimit = 5000
    private static let memoryLimit = 2000

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        sqlite3_open(dir.appendingPathComponent("labeeb.sqlite").path, &db)
        for sql in [
            "CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL, time REAL NOT NULL)",
            "CREATE INDEX IF NOT EXISTS history_time ON history(time)",
            "CREATE TABLE IF NOT EXISTS bookmarks(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, time REAL NOT NULL)",
            "CREATE TABLE IF NOT EXISTS apps(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL, color INTEGER NOT NULL, icon BLOB, time REAL NOT NULL)",
            "CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY AUTOINCREMENT, origin TEXT NOT NULL, username TEXT NOT NULL, time REAL NOT NULL, UNIQUE(origin, username))",
            "CREATE TABLE IF NOT EXISTS memory(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, time REAL NOT NULL)",
            // The index holds page text already normalised into plain words.
            "CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content)",
        ] { run(sql) }
    }

    // MARK: SQLite plumbing

    private func bind(_ statement: OpaquePointer?, _ args: [Any?]) {
        for (i, arg) in args.enumerated() {
            let index = Int32(i + 1)
            switch arg {
            case let v as String: sqlite3_bind_text(statement, index, v, -1, transient)
            case let v as Int64: sqlite3_bind_int64(statement, index, v)
            case let v as Int: sqlite3_bind_int64(statement, index, Int64(v))
            case let v as UInt32: sqlite3_bind_int64(statement, index, Int64(v))
            case let v as Double: sqlite3_bind_double(statement, index, v)
            case let v as Data: _ = v.withUnsafeBytes { sqlite3_bind_blob(statement, index, $0.baseAddress, Int32(v.count), transient) }
            default: sqlite3_bind_null(statement, index)
            }
        }
    }

    @discardableResult
    private func run(_ sql: String, _ args: [Any?] = []) -> Int64 {
        queue.sync {
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { return 0 }
            defer { sqlite3_finalize(statement) }
            bind(statement, args)
            sqlite3_step(statement)
            return sqlite3_last_insert_rowid(db)
        }
    }

    private func rows(_ sql: String, _ args: [Any?] = []) -> [[Any?]] {
        queue.sync {
            var statement: OpaquePointer?
            guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK else { return [] }
            defer { sqlite3_finalize(statement) }
            bind(statement, args)
            var out: [[Any?]] = []
            while sqlite3_step(statement) == SQLITE_ROW {
                var row: [Any?] = []
                for i in 0..<sqlite3_column_count(statement) {
                    switch sqlite3_column_type(statement, i) {
                    case SQLITE_INTEGER: row.append(sqlite3_column_int64(statement, i))
                    case SQLITE_FLOAT: row.append(sqlite3_column_double(statement, i))
                    case SQLITE_TEXT: row.append(String(cString: sqlite3_column_text(statement, i)))
                    case SQLITE_BLOB:
                        if let bytes = sqlite3_column_blob(statement, i) {
                            row.append(Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, i))))
                        } else { row.append(nil) }
                    default: row.append(nil)
                    }
                }
                out.append(row)
            }
            return out
        }
    }

    private func entries(_ sql: String, _ args: [Any?] = []) -> [Entry] {
        rows(sql, args).map {
            Entry(id: $0[0] as? Int64 ?? 0, url: $0[1] as? String ?? "", title: $0[2] as? String ?? "",
                  time: Date(timeIntervalSince1970: $0[3] as? Double ?? 0))
        }
    }

    private var now: Double { Date().timeIntervalSince1970 }

    // MARK: History

    func addHistory(url: String, title: String) {
        // A repeat visit moves the page to the top instead of adding a second row.
        run("DELETE FROM history WHERE url=?", [url])
        run("INSERT INTO history(url,title,time) VALUES(?,?,?)", [url, title, now])
        run("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY time DESC LIMIT \(Store.historyLimit))")
    }

    func setHistoryTitle(url: String, title: String) { run("UPDATE history SET title=? WHERE url=?", [title, url]) }
    func history(limit: Int = 400) -> [Entry] { entries("SELECT id,url,title,time FROM history ORDER BY time DESC LIMIT \(limit)") }
    func lastHistory() -> Entry? { entries("SELECT id,url,title,time FROM history ORDER BY time DESC LIMIT 1").first }
    func deleteHistory(id: Int64) { run("DELETE FROM history WHERE id=?", [id]) }
    func clearHistory() { run("DELETE FROM history") }

    // MARK: Bookmarks

    func bookmarks() -> [Entry] { entries("SELECT id,url,title,time FROM bookmarks ORDER BY time ASC") }
    func isBookmarked(_ url: String) -> Bool { !rows("SELECT id FROM bookmarks WHERE url=?", [url]).isEmpty }
    func addBookmark(url: String, title: String) {
        run("INSERT OR REPLACE INTO bookmarks(url,title,time) VALUES(?,?,?)", [url, title.isEmpty ? Web.host(url) : title, now])
    }
    func removeBookmark(url: String) { run("DELETE FROM bookmarks WHERE url=?", [url]) }

    /// Address suggestions: bookmarks first, then recent history.
    func suggest(_ query: String, limit: Int = 5) -> [Entry] {
        let like = "%" + query.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "%", with: "\\%").replacingOccurrences(of: "_", with: "\\_") + "%"
        var seen = Set<String>()
        var out: [Entry] = []
        for table in ["bookmarks", "history"] {
            let found = entries("SELECT id,url,title,time FROM \(table) WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY time DESC LIMIT \(limit * 2)", [like, like])
            for e in found where out.count < limit && seen.insert(e.url).inserted { out.append(e) }
        }
        return out
    }

    // MARK: Site apps

    @discardableResult
    func addApp(name: String, url: String, color: UInt32, icon: Data?) -> Int64 {
        run("INSERT INTO apps(name,url,color,icon,time) VALUES(?,?,?,?,?)", [name, url, color, icon, now])
    }

    func apps() -> [SiteApp] {
        rows("SELECT id,name,url,color,icon FROM apps ORDER BY time ASC").map {
            SiteApp(id: $0[0] as? Int64 ?? 0, name: $0[1] as? String ?? "", url: $0[2] as? String ?? "",
                    color: UInt32(truncatingIfNeeded: $0[3] as? Int64 ?? 0), icon: $0[4] as? Data)
        }
    }

    func removeApp(id: Int64) { run("DELETE FROM apps WHERE id=?", [id]) }

    // MARK: Memory

    func remember(url: String, title: String, body: String, normalized: String) {
        if let old = rows("SELECT id FROM memory WHERE url=?", [url]).first?[0] as? Int64 {
            run("DELETE FROM memory_fts WHERE rowid=?", [old])
            run("DELETE FROM memory WHERE id=?", [old])
        }
        let id = run("INSERT INTO memory(url,title,body,time) VALUES(?,?,?,?)", [url, title, body, now])
        run("INSERT INTO memory_fts(rowid, content) VALUES(?,?)", [id, normalized])
        // The oldest pages make room once the memory is full.
        for row in rows("SELECT id FROM memory ORDER BY time DESC LIMIT -1 OFFSET \(Store.memoryLimit)") {
            guard let old = row[0] as? Int64 else { continue }
            run("DELETE FROM memory_fts WHERE rowid=?", [old])
            run("DELETE FROM memory WHERE id=?", [old])
        }
    }

    private func hits(_ sql: String, _ args: [Any?] = []) -> [MemoryHit] {
        rows(sql, args).map {
            MemoryHit(url: $0[0] as? String ?? "", title: $0[1] as? String ?? "", body: $0[2] as? String ?? "",
                      time: Date(timeIntervalSince1970: $0[3] as? Double ?? 0))
        }
    }

    /// Pages matching any word of the question, best matches first.
    func recall(_ question: String) -> [MemoryHit] {
        let words = ArabicText.queryWords(question)
        if words.isEmpty { return [] }
        let match = words.map { "\"\($0)\"*" }.joined(separator: " OR ")
        return hits("SELECT m.url, m.title, m.body, m.time FROM memory_fts JOIN memory m ON m.id = memory_fts.rowid WHERE memory_fts MATCH ? ORDER BY rank LIMIT 40", [match])
    }

    func recentMemory(limit: Int = 30) -> [MemoryHit] {
        hits("SELECT url, title, '', time FROM memory ORDER BY time DESC LIMIT \(limit)")
    }

    func memoryCount() -> Int { Int(rows("SELECT COUNT(*) FROM memory").first?[0] as? Int64 ?? 0) }

    func clearMemory() {
        run("DELETE FROM memory_fts")
        run("DELETE FROM memory")
    }

    // MARK: Saved logins

    func credentials(origin: String? = nil) -> [Credential] {
        let found = origin == nil
            ? rows("SELECT id,origin,username FROM credentials ORDER BY origin, username")
            : rows("SELECT id,origin,username FROM credentials WHERE origin=? ORDER BY username", [origin])
        return found.map { Credential(id: $0[0] as? Int64 ?? 0, origin: $0[1] as? String ?? "", username: $0[2] as? String ?? "") }
    }

    func saveCredential(origin: String, username: String, password: String) {
        run("INSERT OR IGNORE INTO credentials(origin,username,time) VALUES(?,?,?)", [origin, username, now])
        Keychain.set(password, for: Vault.account(origin: origin, username: username))
    }

    func deleteCredential(_ credential: Credential) {
        run("DELETE FROM credentials WHERE id=?", [credential.id])
        Keychain.remove(Vault.account(origin: credential.origin, username: credential.username))
    }
}

// MARK: - Keychain

/// Secrets held by the system Keychain: readable only while the device is unlocked, and never backed up to another device.
enum Keychain {
    private static let service = "ai.alshaye.labeeb"

    private static func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    static func set(_ value: String, for account: String) {
        SecItemDelete(query(account) as CFDictionary)
        var item = query(account)
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func get(_ account: String) -> String? {
        var item = query(account)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func has(_ account: String) -> Bool { get(account) != nil }
    static func remove(_ account: String) { SecItemDelete(query(account) as CFDictionary) }
}

/// Labeeb's password vault. Pages can only propose a login to save; a stored password goes back to a page
/// only as a fill the user asked for and confirmed with Face ID or the device passcode.
enum Vault {
    static func account(origin: String, username: String) -> String { "login|\(origin)|\(username)" }

    static func password(for credential: Credential) -> String? {
        Keychain.get(account(origin: credential.origin, username: credential.username))
    }

    /// Asks for Face ID, Touch ID or the passcode. A device with no passcode has nothing to verify against, so it proceeds.
    static func verify(_ done: @escaping () -> Void) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            done()
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: t("verify_reason")) { ok, _ in
            if ok { DispatchQueue.main.async(execute: done) }
        }
    }
}
