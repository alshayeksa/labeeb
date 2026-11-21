package ai.alshaye.labeeb

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream

class Entry(val id: Long, val url: String, val title: String, val time: Long)

class SiteApp(val id: Long, val name: String, val url: String, val host: String, val color: Int, val icon: Bitmap?)

/** History, bookmarks and installed site apps. Not encrypted; site cookies and storage live in the WebView, not here. */
class Store private constructor(context: Context) : SQLiteOpenHelper(context, "labeeb.db", null, 3) {

    companion object {
        private const val HISTORY_LIMIT = 5000
        private const val MEMORY_LIMIT = 2000

        @Volatile
        private var instance: Store? = null
        fun get(c: Context): Store = instance ?: synchronized(this) {
            instance ?: Store(c.applicationContext).also { instance = it }
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE history(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, title TEXT NOT NULL, time INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX history_time ON history(time)")
        db.execSQL("CREATE TABLE bookmarks(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, time INTEGER NOT NULL)")
        createCredentials(db)
        createMemory(db)
        db.execSQL("CREATE TABLE apps(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL, host TEXT NOT NULL, color INTEGER NOT NULL, icon BLOB, time INTEGER NOT NULL)")
    }

    private fun createCredentials(db: SQLiteDatabase) {
        // The secret column holds ciphertext only; the key stays in the Android Keystore.
        db.execSQL("CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY AUTOINCREMENT, origin TEXT NOT NULL, username TEXT NOT NULL, secret TEXT NOT NULL, time INTEGER NOT NULL, UNIQUE(origin, username))")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createCredentials(db)
        if (oldVersion < 3) createMemory(db)
    }

    private fun createMemory(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS memory(id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, time INTEGER NOT NULL)")
        // The index holds the page text already normalised into plain words, so the default tokenizer is enough.
        db.execSQL("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts4(content)")
    }

    // Memory: the text of pages read, searchable by what they said

    @Synchronized
    fun remember(url: String, title: String, body: String, normalized: String) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.rawQuery("SELECT id FROM memory WHERE url=?", arrayOf(url)).use { c ->
                if (c.moveToFirst()) {
                    val old = c.getLong(0).toString()
                    db.delete("memory_fts", "docid=?", arrayOf(old))
                    db.delete("memory", "id=?", arrayOf(old))
                }
            }
            val id = db.insert("memory", null, ContentValues().apply {
                put("url", url); put("title", title); put("body", body); put("time", System.currentTimeMillis())
            })
            db.execSQL("INSERT INTO memory_fts(docid, content) VALUES(?, ?)", arrayOf<Any>(id, normalized))
            // The oldest pages make room once the memory holds $MEMORY_LIMIT.
            db.rawQuery("SELECT id FROM memory ORDER BY time DESC LIMIT -1 OFFSET $MEMORY_LIMIT", null).use { c ->
                while (c.moveToNext()) {
                    val old = c.getLong(0).toString()
                    db.delete("memory_fts", "docid=?", arrayOf(old))
                    db.delete("memory", "id=?", arrayOf(old))
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /** Pages whose text matches [match], ranked by how many different words of the question they contain. */
    fun recall(match: String): List<MemoryHit> {
        val out = ArrayList<MemoryHit>()
        readableDatabase.rawQuery(
            "SELECT m.url, m.title, m.body, m.time, offsets(memory_fts) FROM memory_fts JOIN memory m ON m.id = memory_fts.docid WHERE memory_fts MATCH ? LIMIT 200",
            arrayOf(match)
        ).use { c ->
            while (c.moveToNext()) {
                // offsets() lists "column term position length" for every match; the second number is the query word.
                val parts = c.getString(4).split(' ')
                val terms = HashSet<String>()
                for (i in 1 until parts.size step 4) terms.add(parts[i])
                out.add(MemoryHit(c.getString(0), c.getString(1), c.getString(2), c.getLong(3), terms.size * 1000 + minOf(parts.size / 4, 50)))
            }
        }
        return out.sortedWith(compareByDescending<MemoryHit> { it.score }.thenByDescending { it.time })
    }

    fun recentMemory(limit: Int = 30): List<MemoryHit> {
        val out = ArrayList<MemoryHit>()
        readableDatabase.rawQuery("SELECT url, title, time FROM memory ORDER BY time DESC LIMIT $limit", null).use { c ->
            while (c.moveToNext()) out.add(MemoryHit(c.getString(0), c.getString(1), "", c.getLong(2), 0))
        }
        return out
    }

    fun memoryCount(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM memory", null).use { c ->
        if (c.moveToFirst()) c.getInt(0) else 0
    }

    @Synchronized
    fun clearMemory() {
        writableDatabase.delete("memory_fts", null, null)
        writableDatabase.delete("memory", null, null)
    }

    // Saved logins

    fun credentials(origin: String?): List<Credential> {
        val out = ArrayList<Credential>()
        val sql = "SELECT id,origin,username FROM credentials" + (if (origin != null) " WHERE origin=?" else "") + " ORDER BY origin, username"
        readableDatabase.rawQuery(sql, if (origin != null) arrayOf(origin) else emptyArray()).use { c ->
            while (c.moveToNext()) out.add(Credential(c.getLong(0), c.getString(1), c.getString(2)))
        }
        return out
    }

    fun credentialSecret(id: Long): String? =
        readableDatabase.rawQuery("SELECT secret FROM credentials WHERE id=?", arrayOf(id.toString())).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    fun saveCredential(origin: String, username: String, sealed: String) {
        writableDatabase.insertWithOnConflict("credentials", null, ContentValues().apply {
            put("origin", origin); put("username", username); put("secret", sealed); put("time", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun deleteCredential(id: Long) = writableDatabase.delete("credentials", "id=?", arrayOf(id.toString()))

    private fun entries(sql: String, vararg args: String): List<Entry> {
        val out = ArrayList<Entry>()
        readableDatabase.rawQuery(sql, args).use { c ->
            while (c.moveToNext()) out.add(Entry(c.getLong(0), c.getString(1), c.getString(2), c.getLong(3)))
        }
        return out
    }

    // History

    fun addHistory(url: String, title: String) {
        val db = writableDatabase
        // A repeat visit moves the page to the top instead of adding a second row.
        db.delete("history", "url=?", arrayOf(url))
        db.insert("history", null, ContentValues().apply {
            put("url", url); put("title", title); put("time", System.currentTimeMillis())
        })
        db.execSQL("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY time DESC LIMIT $HISTORY_LIMIT)")
    }

    fun setHistoryTitle(url: String, title: String) {
        writableDatabase.update("history", ContentValues().apply { put("title", title) }, "url=?", arrayOf(url))
    }

    fun history(limit: Int = 300) = entries("SELECT id,url,title,time FROM history ORDER BY time DESC LIMIT $limit")
    fun lastHistory() = entries("SELECT id,url,title,time FROM history ORDER BY time DESC LIMIT 1").firstOrNull()
    fun deleteHistory(id: Long) = writableDatabase.delete("history", "id=?", arrayOf(id.toString()))
    fun clearHistory() = writableDatabase.delete("history", null, null)

    // Bookmarks

    fun bookmarks() = entries("SELECT id,url,title,time FROM bookmarks ORDER BY time ASC")
    fun isBookmarked(url: String) = entries("SELECT id,url,title,time FROM bookmarks WHERE url=?", url).isNotEmpty()

    fun addBookmark(url: String, title: String) {
        writableDatabase.insertWithOnConflict("bookmarks", null, ContentValues().apply {
            put("url", url); put("title", title.ifBlank { Urls.host(url) }); put("time", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun removeBookmark(url: String) = writableDatabase.delete("bookmarks", "url=?", arrayOf(url))

    // Address suggestions: bookmarks first, then recent history.

    fun suggest(query: String, limit: Int = 5): List<Entry> {
        val q = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        val seen = HashSet<String>()
        val out = ArrayList<Entry>()
        val sources = listOf(
            "SELECT id,url,title,time FROM bookmarks WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY time DESC LIMIT $limit",
            "SELECT id,url,title,time FROM history WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY time DESC LIMIT ${limit * 2}",
        )
        for (sql in sources) for (e in entries(sql, q, q)) if (out.size < limit && seen.add(e.url)) out.add(e)
        return out
    }

    // Site apps

    fun addApp(name: String, url: String, color: Int, icon: Bitmap?): Long =
        writableDatabase.insert("apps", null, ContentValues().apply {
            put("name", name); put("url", url); put("host", Urls.host(url)); put("color", color)
            put("time", System.currentTimeMillis())
            if (icon != null) put("icon", ByteArrayOutputStream().also { icon.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray())
        })

    private fun apps(where: String, vararg args: String): List<SiteApp> {
        val out = ArrayList<SiteApp>()
        readableDatabase.rawQuery("SELECT id,name,url,host,color,icon FROM apps $where ORDER BY time ASC", args).use { c ->
            while (c.moveToNext()) {
                val blob = c.getBlob(5)
                out.add(SiteApp(c.getLong(0), c.getString(1), c.getString(2), c.getString(3), c.getInt(4),
                    blob?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }))
            }
        }
        return out
    }

    fun apps() = apps("")
    fun app(id: Long) = apps("WHERE id=?", id.toString()).firstOrNull()
    fun removeApp(id: Long) = writableDatabase.delete("apps", "id=?", arrayOf(id.toString()))
}
