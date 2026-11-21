package ai.alshaye.labeeb

import android.app.DownloadManager
import android.app.role.RoleManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.text.format.DateUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import androidx.core.view.WindowCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.util.Calendar

/**
 * Shared frame for the secondary screens: a large title that collapses into the top bar on scroll,
 * and content laid out as rounded groups of rows.
 */
abstract class ListScreen : AppCompatActivity() {
    protected lateinit var list: LinearLayout
    protected lateinit var action: TextView
    protected lateinit var segs: LinearLayout
    protected lateinit var search: EditText
    private lateinit var empty: View

    private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
    private val match = ViewGroup.LayoutParams.MATCH_PARENT

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_list)
        Web.applyInsets(findViewById(R.id.root))
        list = findViewById(R.id.list)
        empty = findViewById(R.id.empty)
        action = findViewById(R.id.actionBtn)
        segs = findViewById(R.id.segs)
        search = findViewById(R.id.search)
        findViewById<View>(R.id.backBtn).setOnClickListener { finish() }
        val big = findViewById<View>(R.id.screenTitle)
        val small = findViewById<View>(R.id.barTitle)
        findViewById<ScrollView>(R.id.scroll).setOnScrollChangeListener { _, _, y, _, _ ->
            // The bar title fades in as the large title scrolls out of view.
            small.alpha = ((y - big.height * 0.4f) / (big.height * 0.5f).coerceAtLeast(1f)).coerceIn(0f, 1f)
        }
    }

    protected fun color(res: Int) = ContextCompat.getColor(this, res)

    protected fun title(text: CharSequence) {
        findViewById<TextView>(R.id.screenTitle).text = text
        findViewById<TextView>(R.id.barTitle).text = text
    }

    protected fun showEmpty(show: Boolean, icon: Int = 0, text: Int = 0) {
        empty.visibility = if (show) View.VISIBLE else View.GONE
        if (show) {
            findViewById<ImageView>(R.id.emptyIcon).setImageResource(icon)
            findViewById<TextView>(R.id.emptyText).setText(text)
        }
    }

    protected fun section(text: CharSequence) {
        list.addView(TextView(this).apply {
            this.text = text
            textSize = 13f
            setTextColor(color(R.color.muted))
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setPadding(dp(16), dp(24), dp(16), dp(8))
        })
    }

    protected fun group(topMargin: Int = 0): LinearLayout {
        val g = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_list_group)
            clipToOutline = true
        }
        list.addView(g, LinearLayout.LayoutParams(match, wrap).apply { this.topMargin = dp(topMargin) })
        return g
    }

    protected fun iconTile(icon: Int, danger: Boolean = false): View = ImageView(this).apply {
        setImageResource(icon)
        setColorFilter(color(if (danger) R.color.danger else R.color.accent))
        setBackgroundResource(if (danger) R.drawable.bg_icon_tile_danger else R.drawable.bg_icon_tile)
        setPadding(dp(6), dp(6), dp(6), dp(6))
        layoutParams = LinearLayout.LayoutParams(dp(32), dp(32))
    }

    protected fun letterTile(name: String): View = TextView(this).apply {
        text = name.trim().firstOrNull { it.isLetterOrDigit() }?.toString()?.uppercase() ?: "•"
        textSize = 16f
        typeface = Typeface.create(typeface, Typeface.BOLD)
        gravity = Gravity.CENTER
        setTextColor(color(R.color.accent))
        setBackgroundResource(R.drawable.bg_letter_tile)
        layoutParams = LinearLayout.LayoutParams(dp(36), dp(36))
    }

    /** One row inside a [group]. [value] sits at the trailing edge; [trailing] replaces the chevron. */
    protected fun item(
        g: LinearLayout, lead: View?, title: CharSequence, sub: CharSequence? = null, value: CharSequence? = null,
        chevron: Boolean = false, danger: Boolean = false, ltrSub: Boolean = false, trailing: View? = null,
        onClick: (() -> Unit)? = null,
    ): View {
        if (g.childCount > 0) g.addView(View(this).apply { setBackgroundColor(color(R.color.hairline)) },
            LinearLayout.LayoutParams(match, dp(1)).apply { marginStart = dp(if (lead == null) 16 else 60) })
        val row = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(56)
            setPadding(dp(14), dp(9), dp(if (trailing == null) 14 else 4), dp(9))
            if (onClick != null) {
                isClickable = true
                isFocusable = true
                val ripple = android.util.TypedValue()
                theme.resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)
                setBackgroundResource(ripple.resourceId)
                setOnClickListener { onClick() }
            }
        }
        if (lead != null) row.addView(lead)
        val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(this).apply {
            text = title
            textSize = 15f
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            setTextColor(color(if (danger) R.color.danger else R.color.text))
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        })
        if (!sub.isNullOrEmpty()) texts.addView(TextView(this).apply {
            text = sub
            textSize = 13f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            setTextColor(color(R.color.muted))
            if (ltrSub) textDirection = View.TEXT_DIRECTION_LTR
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        })
        row.addView(texts, LinearLayout.LayoutParams(0, wrap, 1f).apply { marginStart = dp(if (lead == null) 2 else 12) })
        if (!value.isNullOrEmpty()) row.addView(TextView(this).apply {
            text = value
            textSize = 15f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            maxWidth = dp(150)
            setTextColor(color(R.color.muted))
        }, LinearLayout.LayoutParams(wrap, wrap).apply { marginStart = dp(8) })
        if (chevron) row.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_chevron)
            setColorFilter(color(R.color.muted))
            alpha = 0.7f
        }, LinearLayout.LayoutParams(dp(18), dp(18)).apply { marginStart = dp(4) })
        if (trailing != null) row.addView(trailing)
        g.addView(row, LinearLayout.LayoutParams(match, wrap))
        return row
    }
}

/** Bookmarks, history and downloads. Choosing a page returns its address to the browser. */
class LibraryActivity : ListScreen() {
    companion object {
        const val BOOKMARKS = 0
        const val HISTORY = 1
        const val DOWNLOADS = 2
    }

    private var tab = BOOKMARKS
    private val labels = intArrayOf(R.string.bookmarks, R.string.history, R.string.downloads)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tab = savedInstanceState?.getInt("tab") ?: intent.getIntExtra("tab", BOOKMARKS)
        segs.visibility = View.VISIBLE
        for (i in labels.indices) {
            segs.addView(TextView(this).apply {
                setText(labels[i])
                textSize = 14f
                gravity = Gravity.CENTER
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    tab = i
                    search.setText("")
                    render()
                }
            }, LinearLayout.LayoutParams(0, dp(38), 1f))
        }
        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = render()
        })
        render()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("tab", tab)
    }

    private fun open(url: String, newTab: Boolean = false) {
        setResult(RESULT_OK, Intent().putExtra("url", url).putExtra("newTab", newTab))
        finish()
    }

    private fun more(url: String?, delete: () -> Unit): View = ImageButton(this).apply {
        setImageResource(R.drawable.ic_more)
        setColorFilter(color(R.color.muted))
        background = null
        contentDescription = getString(R.string.more_options)
        layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
        setOnClickListener { anchor ->
            val menu = PopupMenu(this@LibraryActivity, anchor)
            if (url != null) {
                menu.menu.add(0, 1, 0, R.string.open_in_new_tab)
                menu.menu.add(0, 2, 1, R.string.copy_link)
                menu.menu.add(0, 3, 2, R.string.share)
            }
            menu.menu.add(0, 4, 3, R.string.delete)
            menu.setOnMenuItemClickListener {
                when (it.itemId) {
                    1 -> open(url!!, newTab = true)
                    2 -> {
                        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("url", url))
                        toast(R.string.link_copied)
                    }
                    3 -> Web.share(this@LibraryActivity, url!!, null)
                    4 -> {
                        delete()
                        render()
                    }
                }
                true
            }
            menu.show()
        }
    }

    private fun matches(e: Entry, q: String) = q.isEmpty() || e.title.contains(q, true) || e.url.contains(q, true)

    /** Start of today, yesterday and seven days ago, for grouping history by day. */
    private fun dayBounds(): LongArray {
        val c = Calendar.getInstance()
        c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
        val today = c.timeInMillis
        return longArrayOf(today, today - DateUtils.DAY_IN_MILLIS, today - 6 * DateUtils.DAY_IN_MILLIS)
    }

    private fun render() {
        title(getString(labels[tab]))
        for (i in labels.indices) {
            val v = segs.getChildAt(i) as TextView
            val on = i == tab
            if (on) v.setBackgroundResource(R.drawable.bg_seg_on) else v.background = null
            v.setTextColor(color(if (on) R.color.on_accent else R.color.muted))
            v.typeface = Typeface.create(v.typeface, if (on) Typeface.BOLD else Typeface.NORMAL)
            v.isSelected = on
        }
        list.removeAllViews()
        action.visibility = View.INVISIBLE
        val store = Store.get(this)
        val q = search.text.toString().trim()
        var total = 0
        when (tab) {
            BOOKMARKS -> {
                val all = store.bookmarks().reversed()
                total = all.size
                val items = all.filter { matches(it, q) }
                if (items.isNotEmpty()) {
                    val g = group(16)
                    for (e in items) {
                        val name = e.title.ifBlank { Urls.host(e.url) }
                        item(g, letterTile(name), name, Urls.host(e.url), ltrSub = true,
                            trailing = more(e.url) { store.removeBookmark(e.url) }) { open(e.url) }
                    }
                }
            }
            HISTORY -> {
                val all = store.history()
                total = all.size
                if (all.isNotEmpty()) {
                    action.visibility = View.VISIBLE
                    action.setText(R.string.clear)
                    action.contentDescription = getString(R.string.clear_history)
                    action.setOnClickListener {
                        MaterialAlertDialogBuilder(this).setTitle(R.string.clear_history).setMessage(R.string.clear_history_confirm)
                            .setPositiveButton(R.string.clear_history) { _, _ -> store.clearHistory(); render() }
                            .setNegativeButton(R.string.cancel, null).show()
                    }
                }
                val bounds = dayBounds()
                val names = intArrayOf(R.string.today, R.string.yesterday, R.string.this_week, R.string.older)
                var bucket = -1
                var g: LinearLayout? = null
                for (e in all.filter { matches(it, q) }) {
                    val b = when {
                        e.time >= bounds[0] -> 0
                        e.time >= bounds[1] -> 1
                        e.time >= bounds[2] -> 2
                        else -> 3
                    }
                    if (b != bucket) {
                        bucket = b
                        section(getString(names[b]))
                        g = group()
                    }
                    val name = e.title.ifBlank { Urls.host(e.url) }
                    val time = DateUtils.formatDateTime(this, e.time, if (b <= 1) DateUtils.FORMAT_SHOW_TIME else DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_MONTH)
                    item(g!!, letterTile(name), name, "${Urls.host(e.url)} · $time",
                        trailing = more(e.url) { store.deleteHistory(e.id) }) { open(e.url) }
                }
            }
            DOWNLOADS -> total = downloads(q)
        }
        findViewById<View>(R.id.searchBox).visibility = if (total > 0) View.VISIBLE else View.GONE
        val icons = intArrayOf(R.drawable.ic_star, R.drawable.ic_clock, R.drawable.ic_download)
        val texts = intArrayOf(R.string.empty_bookmarks, R.string.empty_history, R.string.empty_downloads)
        if (list.childCount > 0) showEmpty(false)
        else if (total > 0) showEmpty(true, R.drawable.ic_search, R.string.empty_search)
        else showEmpty(true, icons[tab], texts[tab])
    }

    private fun downloads(q: String): Int {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        var total = 0
        var g: LinearLayout? = null
        dm.query(DownloadManager.Query()).use { c ->
            val idCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)
            val titleCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)
            val statusCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)
            val sizeCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
            val mimeCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_MEDIA_TYPE)
            val timeCol = c.getColumnIndexOrThrow(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP)
            while (c.moveToNext()) {
                total++
                val name = c.getString(titleCol).orEmpty()
                if (q.isNotEmpty() && !name.contains(q, true)) continue
                val id = c.getLong(idCol)
                val status = c.getInt(statusCol)
                val mime = c.getString(mimeCol)
                val failed = status == DownloadManager.STATUS_FAILED
                val sub = when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> android.text.format.Formatter.formatShortFileSize(this, c.getLong(sizeCol)) +
                        " · " + DateUtils.getRelativeTimeSpanString(c.getLong(timeCol), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)
                    DownloadManager.STATUS_FAILED -> getString(R.string.dl_failed)
                    else -> getString(R.string.dl_running)
                }
                if (g == null) g = group(16)
                item(g!!, iconTile(R.drawable.ic_download, failed), name, sub, trailing = more(null) { dm.remove(id) }) {
                    try {
                        val uri = dm.getUriForDownloadedFile(id)!!
                        startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                    } catch (_: Exception) {
                        toast(R.string.file_missing)
                    }
                }
            }
        }
        return total
    }
}

class SettingsActivity : ListScreen() {
    private val roleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        // Some devices dismiss the system's question without showing it. If Labeeb still is not the
        // default afterwards, the system's own default-apps screen opens so the choice can be made there.
        if (!isDefaultBrowser()) openDefaultApps()
        render()
    }

    private fun openDefaultApps() {
        try {
            startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
        } catch (_: Exception) {
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title(getString(R.string.settings))
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun choose(title: Int, labels: List<String>, selected: Int, pick: (Int) -> Unit) {
        MaterialAlertDialogBuilder(this).setTitle(title)
            .setSingleChoiceItems(labels.toTypedArray(), selected) { d, i ->
                d.dismiss()
                pick(i)
            }
            .setNegativeButton(R.string.cancel, null).show()
    }

    private fun input(title: Int, value: String, hint: String?, secret: Boolean, extra: Pair<Int, () -> Unit>? = null, save: (String) -> Unit) {
        val field = EditText(this).apply {
            setText(value)
            this.hint = hint
            isSingleLine = true
            textDirection = View.TEXT_DIRECTION_LTR
            inputType = InputType.TYPE_CLASS_TEXT or
                (if (secret) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        }
        val box = LinearLayout(this).apply { setPadding(dp(24), dp(8), dp(24), 0) }
        box.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val builder = MaterialAlertDialogBuilder(this).setTitle(title).setView(box)
            .setPositiveButton(R.string.save) { _, _ -> save(field.text.toString().trim()); render() }
            .setNegativeButton(R.string.cancel, null)
        if (extra != null) builder.setNeutralButton(extra.first) { _, _ -> extra.second(); render() }
        builder.show()
    }

    private fun confirm(title: Int, message: Int, run: () -> Unit) {
        MaterialAlertDialogBuilder(this).setTitle(title).setMessage(message)
            .setPositiveButton(title) { _, _ -> run(); toast(R.string.done) }
            .setNegativeButton(R.string.cancel, null).show()
    }

    /** A row that flips a setting in place and shows its state. */
    private fun toggle(g: LinearLayout, icon: Int, title: Int, sub: Int, on: Boolean, set: (Boolean) -> Unit) {
        item(g, iconTile(icon), getString(title), sub = if (sub != 0) getString(sub) else null,
            value = getString(if (on) R.string.on else R.string.off)) {
            set(!on)
            render()
        }
    }

    private fun isDefaultBrowser(): Boolean {
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
        return packageManager.resolveActivity(probe, 0)?.activityInfo?.packageName == packageName
    }

    private fun askDefaultBrowser() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                val roles = getSystemService(RoleManager::class.java)
                if (roles.isRoleAvailable(RoleManager.ROLE_BROWSER) && !roles.isRoleHeld(RoleManager.ROLE_BROWSER)) {
                    roleLauncher.launch(roles.createRequestRoleIntent(RoleManager.ROLE_BROWSER))
                    return
                }
            }
            openDefaultApps()
        } catch (_: Exception) {
            openDefaultApps()
        }
    }

    private fun render() {
        list.removeAllViews()
        val themes = listOf("dark", "light", "system")
        val themeLabels = listOf(getString(R.string.theme_dark), getString(R.string.theme_light), getString(R.string.theme_system))
        val engines = Prefs.engines.keys.toList()
        val providers = Ai.providers.keys.toList()
        val provider = Prefs.provider
        val keyName = Ai.providers.getValue(provider).keyName
        val hasKey = Secrets.has(this, keyName)

        section(getString(R.string.section_general))
        var g = group()
        item(g, iconTile(R.drawable.ic_globe), getString(R.string.language), value = getString(if (isArabic()) R.string.lang_ar else R.string.lang_en), chevron = true) {
            choose(R.string.language, listOf(getString(R.string.lang_ar), getString(R.string.lang_en)), if (isArabic()) 0 else 1) {
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(if (it == 0) "ar" else "en"))
            }
        }
        item(g, iconTile(R.drawable.ic_moon), getString(R.string.theme), value = themeLabels[themes.indexOf(Prefs.theme).coerceAtLeast(0)], chevron = true) {
            choose(R.string.theme, themeLabels, themes.indexOf(Prefs.theme)) {
                Prefs.theme = themes[it]
                AppCompatDelegate.setDefaultNightMode(Prefs.nightMode())
                render()
            }
        }
        item(g, iconTile(R.drawable.ic_search), getString(R.string.search_engine), value = Prefs.engines.getValue(Prefs.engine).first, chevron = true) {
            choose(R.string.search_engine, engines.map { Prefs.engines.getValue(it).first }, engines.indexOf(Prefs.engine)) {
                Prefs.engine = engines[it]
                render()
            }
        }
        val isDefault = isDefaultBrowser()
        item(g, iconTile(R.drawable.ic_browser), getString(R.string.default_browser),
            sub = getString(if (isDefault) R.string.default_yes else R.string.default_no), chevron = true) { askDefaultBrowser() }

        section(getString(R.string.section_assistant))
        g = group()
        item(g, iconTile(R.drawable.ic_spark), getString(R.string.ai_provider), value = Ai.providers.getValue(provider).label, chevron = true) {
            choose(R.string.ai_provider, providers.map { Ai.providers.getValue(it).label }, providers.indexOf(provider)) {
                Prefs.provider = providers[it]
                render()
            }
        }
        item(g, iconTile(R.drawable.ic_cube), getString(R.string.ai_model), value = Prefs.model(provider), chevron = true) {
            input(R.string.ai_model, Prefs.model(provider), Ai.providers.getValue(provider).model, secret = false) { Prefs.setModel(provider, it) }
        }
        item(g, iconTile(R.drawable.ic_key), getString(R.string.ai_key),
            sub = getString(if (hasKey) R.string.key_saved else R.string.key_missing), chevron = true) {
            // The stored key is never shown again; saving replaces it.
            val remove = if (hasKey) R.string.remove to { Secrets.remove(this, keyName) } else null
            input(R.string.ai_key, "", getString(R.string.key_hint), secret = true, extra = remove) {
                if (it.isNotEmpty()) Secrets.put(this, keyName, it)
            }
        }

        section(getString(R.string.section_arabic))
        g = group()
        toggle(g, R.drawable.ic_text, R.string.fix_arabic, R.string.fix_arabic_sub, Prefs.fixArabic) { Prefs.fixArabic = it }
        toggle(g, R.drawable.ic_clock, R.string.hijri, 0, Prefs.hijri) { Prefs.hijri = it }

        section(getString(R.string.memory))
        g = group()
        toggle(g, R.drawable.ic_memory, R.string.memory_on, R.string.memory_on_sub, Prefs.memory) { Prefs.memory = it }
        item(g, iconTile(R.drawable.ic_trash, danger = true), getString(R.string.memory_clear),
            value = getString(R.string.memory_count, num(Store.get(this).memoryCount())), danger = true) {
            confirm(R.string.memory_clear, R.string.memory_clear_confirm) {
                Store.get(this).clearMemory()
                render()
            }
        }

        section(getString(R.string.passwords))
        g = group()
        val saved = Vault.list(this).size
        item(g, iconTile(R.drawable.ic_key), getString(R.string.passwords),
            value = if (saved > 0) getString(R.string.saved_count, num(saved)) else null, chevron = true) {
            startActivity(Intent(this, PasswordsActivity::class.java))
        }
        item(g, iconTile(R.drawable.ic_lock), getString(R.string.offer_save),
            sub = getString(if (Prefs.offerSave) R.string.offer_on else R.string.offer_off), chevron = true) {
            choose(R.string.offer_save, listOf(getString(R.string.on), getString(R.string.off)), if (Prefs.offerSave) 0 else 1) {
                Prefs.offerSave = it == 0
                render()
            }
        }

        section(getString(R.string.section_privacy))
        g = group()
        item(g, iconTile(R.drawable.ic_clock, danger = true), getString(R.string.clear_history), danger = true) {
            confirm(R.string.clear_history, R.string.clear_history_confirm) { Store.get(this).clearHistory() }
        }
        item(g, iconTile(R.drawable.ic_trash, danger = true), getString(R.string.clear_site_data), sub = getString(R.string.clear_site_data_sub), danger = true) {
            confirm(R.string.clear_site_data, R.string.clear_site_data_confirm) {
                CookieManager.getInstance().removeAllCookies(null)
                WebStorage.getInstance().deleteAllData()
                WebView(this).apply { clearCache(true); destroy() }
            }
        }

        g = group(24)
        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        item(g, iconTile(R.drawable.ic_info), getString(R.string.about), value = version, chevron = true) {
            startActivity(Intent(this, AboutActivity::class.java))
        }
    }
}

class AboutActivity : ListScreen() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title(getString(R.string.about))
        val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
        val match = ViewGroup.LayoutParams.MATCH_PARENT
        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: ""

        fun centered(text: CharSequence, size: Float, colorRes: Int, bold: Boolean = false, top: Int = 0, spacing: Float = 0f): TextView =
            TextView(this).apply {
                this.text = text
                textSize = size
                gravity = Gravity.CENTER
                setTextColor(color(colorRes))
                if (bold) typeface = Typeface.create(typeface, Typeface.BOLD)
                letterSpacing = spacing
                setLineSpacing(0f, 1.3f)
                list.addView(this, LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(top) })
            }

        list.gravity = Gravity.CENTER_HORIZONTAL
        list.addView(ImageView(this).apply {
            setImageResource(R.drawable.logo)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, LinearLayout.LayoutParams(dp(104), dp(104)).apply { topMargin = dp(20) })
        centered(getString(R.string.about_wordmark), 11f, R.color.muted, top = 14, spacing = 0.28f)
        centered(getString(R.string.app_name), 26f, R.color.text, bold = true, top = 2)
        centered(getString(R.string.about_tagline), 15f, R.color.muted, top = 2)
        list.addView(TextView(this).apply {
            text = getString(R.string.version, version)
            textSize = 13f
            setTextColor(color(R.color.muted))
            setBackgroundResource(R.drawable.bg_version)
            setPadding(dp(14), dp(5), dp(14), dp(5))
        }, LinearLayout.LayoutParams(wrap, wrap).apply { topMargin = dp(14) })

        // Developer card
        var g = group(28)
        val monogram = TextView(this).apply {
            text = getString(R.string.developer_monogram)
            textSize = 22f
            typeface = Typeface.create(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setTextColor(color(R.color.on_accent))
            setBackgroundResource(R.drawable.bg_monogram)
            layoutParams = LinearLayout.LayoutParams(dp(52), dp(52))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val card = LinearLayout(this).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        card.addView(monogram)
        val who = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        fun line(text: Int, size: Float, colorRes: Int, bold: Boolean = false, spacing: Float = 0f) = who.addView(TextView(this).apply {
            setText(text)
            textSize = size
            setTextColor(color(colorRes))
            if (bold) typeface = Typeface.create(typeface, Typeface.BOLD)
            letterSpacing = spacing
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        })
        line(R.string.developed_by, 12f, R.color.accent, bold = true, spacing = if (isArabic()) 0f else 0.12f)
        line(R.string.developer_name, 18f, R.color.text, bold = true)
        line(R.string.developer_role, 14f, R.color.muted)
        card.addView(who, LinearLayout.LayoutParams(0, wrap, 1f).apply { marginStart = dp(14) })
        g.addView(card)
        val arrow = ImageView(this).apply {
            setImageResource(R.drawable.ic_open)
            setColorFilter(color(R.color.accent))
            layoutParams = LinearLayout.LayoutParams(dp(20), dp(20))
        }
        item(g, iconTile(R.drawable.ic_globe), getString(R.string.personal_website), sub = "alshaye.ai", ltrSub = true, trailing = arrow) {
            startActivity(Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("https://alshaye.ai/")))
        }.setPadding(dp(14), dp(9), dp(16), dp(9))

        g = group(16)
        item(g, iconTile(R.drawable.ic_doc), getString(R.string.licenses), chevron = true) {
            MaterialAlertDialogBuilder(this).setTitle(R.string.licenses).setMessage(R.string.licenses_text)
                .setPositiveButton(R.string.close, null).show()
        }

        // Origin
        list.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_pin)
            setColorFilter(color(R.color.accent))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, LinearLayout.LayoutParams(dp(22), dp(22)).apply { topMargin = dp(32) })
        centered(getString(R.string.developed_in_saudi), 14f, R.color.muted, top = 8)
        centered(getString(R.string.saudi_arabia), 11f, R.color.muted, bold = true, top = 10, spacing = 0.32f)
    }
}
