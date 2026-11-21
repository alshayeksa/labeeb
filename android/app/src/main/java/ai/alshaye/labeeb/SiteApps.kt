package ai.alshaye.labeeb

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URL

/** "Run as app": a site gets a home-screen icon and opens in its own window, without the browser's bar or tabs. */
object SiteApps {
    private const val DEFAULT_COLOR = 0xFF111B27.toInt()
    private const val MAX_BYTES = 2_000_000

    private const val PROBE = "(function(){function q(s){return document.querySelector(s)}" +
        "var m=q('link[rel~=\"manifest\"]'),t=q('meta[name=\"theme-color\"]')," +
        "i=q('link[rel~=\"apple-touch-icon\"]')||q('link[rel~=\"icon\"]');" +
        "return JSON.stringify({manifest:m?m.href:'',color:t?t.content:'',icon:i?i.href:'',title:document.title})})()"

    private class Draft(var name: String, var url: String, var color: Int, var icon: Bitmap?)

    private fun fetch(url: String): ByteArray? = try {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.instanceFollowRedirects = true
        try {
            if (conn.responseCode !in 200..299) null
            else conn.inputStream.use { stream ->
                val out = java.io.ByteArrayOutputStream()
                val buf = ByteArray(16384)
                while (true) {
                    val n = stream.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > MAX_BYTES) return null
                }
                out.toByteArray()
            }
        } finally {
            conn.disconnect()
        }
    } catch (_: Exception) {
        null
    }

    private fun color(text: String?): Int? = try {
        text?.trim()?.takeIf { it.isNotEmpty() }?.let { Color.parseColor(it) or 0xFF000000.toInt() }
    } catch (_: Exception) {
        null
    }

    private fun image(url: String?): Bitmap? {
        if (!Urls.isWeb(url)) return null
        val bytes = fetch(url!!) ?: return null
        return try {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (_: Throwable) {
            null
        }
    }

    /** Reads the page's web manifest when it has one; the page title, colour and icon are the fallback. */
    private fun describe(page: JSONObject, pageUrl: String, favicon: Bitmap?): Draft {
        val draft = Draft(page.optString("title").ifBlank { Urls.host(pageUrl) }.take(40), pageUrl, color(page.optString("color")) ?: DEFAULT_COLOR, null)
        var iconUrl: String? = page.optString("icon").takeIf { it.isNotBlank() }
        val manifestUrl = page.optString("manifest")
        if (Urls.isWeb(manifestUrl)) fetch(manifestUrl)?.let { bytes ->
            try {
                val m = JSONObject(String(bytes))
                m.optString("short_name").ifBlank { m.optString("name") }.takeIf { it.isNotBlank() }?.let { draft.name = it.take(40) }
                color(m.optString("theme_color"))?.let { draft.color = it }
                m.optString("start_url").takeIf { it.isNotBlank() }?.let {
                    val start = URL(URL(manifestUrl), it).toString()
                    // A manifest may only point the app at its own site.
                    if (Urls.host(start) == Urls.host(pageUrl) && Urls.isWeb(start)) draft.url = start
                }
                val icons = m.optJSONArray("icons")
                var best = -1
                if (icons != null) for (i in 0 until icons.length()) {
                    val icon = icons.getJSONObject(i)
                    val size = icon.optString("sizes").split(" ").mapNotNull { it.substringBefore('x').toIntOrNull() }.maxOrNull() ?: 0
                    if (size in (best + 1)..512 && icon.optString("src").isNotBlank()) {
                        best = size
                        iconUrl = URL(URL(manifestUrl), icon.getString("src")).toString()
                    }
                }
            } catch (_: Exception) {
            }
        }
        draft.icon = image(iconUrl)?.takeIf { it.width >= 48 } ?: favicon?.takeIf { it.width >= 48 }
        return draft
    }

    fun install(a: AppCompatActivity, tab: Tab) {
        val w = tab.web ?: return
        val pageUrl = tab.url
        if (!Urls.isWeb(pageUrl)) return
        a.toast(R.string.app_loading)
        w.evaluateJavascript(PROBE) { raw ->
            val page = try {
                JSONObject(JSONTokener(raw).nextValue() as String)
            } catch (_: Exception) {
                JSONObject().put("title", tab.title)
            }
            val favicon = tab.icon
            Thread {
                val draft = describe(page, pageUrl, favicon)
                Handler(Looper.getMainLooper()).post { if (!a.isFinishing && !a.isDestroyed) confirm(a, draft) }
            }.start()
        }
    }

    private fun confirm(a: AppCompatActivity, draft: Draft) {
        val size = a.dp(64)
        val box = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(a.dp(24), a.dp(12), a.dp(24), 0)
        }
        val row = LinearLayout(a).apply { gravity = Gravity.CENTER_VERTICAL }
        val preview = ImageView(a)
        val name = EditText(a).apply {
            setText(draft.name)
            isSingleLine = true
            hint = a.getString(R.string.site_name)
        }
        fun icon(label: String) = draft.icon?.let { Icons.rounded(it, 192) } ?: Icons.letter(a, label, 192)
        preview.setImageBitmap(icon(draft.name))
        row.addView(preview, LinearLayout.LayoutParams(size, size))
        row.addView(name, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = a.dp(16) })
        box.addView(TextView(a).apply {
            setText(R.string.app_install_msg)
            textSize = 14f
            setLineSpacing(0f, 1.25f)
            setPadding(0, 0, 0, a.dp(16))
        })
        box.addView(row)
        MaterialAlertDialogBuilder(a).setTitle(R.string.app_install_title).setView(box)
            .setPositiveButton(R.string.add) { _, _ ->
                val label = name.text.toString().trim().ifBlank { draft.name }
                val bitmap = icon(label)
                val id = Store.get(a).addApp(label, draft.url, draft.color, bitmap)
                pin(a, id, label, Icons.adaptive(a, draft.icon, label))
                a.toast(R.string.app_added)
            }
            .setNegativeButton(R.string.cancel, null).show()
    }

    private fun intent(c: Context, id: Long) =
        Intent(c, SiteAppActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("labeeb-app://app/$id"))

    private fun pin(c: Context, id: Long, name: String, icon: Bitmap) {
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(c)) return
        val info = ShortcutInfoCompat.Builder(c, "app-$id")
            .setShortLabel(name)
            .setIcon(IconCompat.createWithAdaptiveBitmap(icon))
            .setIntent(intent(c, id))
            .build()
        try {
            ShortcutManagerCompat.requestPinShortcut(c, info, null)
        } catch (_: Exception) {
        }
    }

    fun launch(c: Context, id: Long) = c.startActivity(intent(c, id))

    fun remove(c: Context, id: Long) {
        Store.get(c).removeApp(id)
        // The launcher owns the pinned icon; disabling it makes a tap explain that the app is gone.
        try {
            ShortcutManagerCompat.disableShortcuts(c, listOf("app-$id"), c.getString(R.string.app_missing))
        } catch (_: Exception) {
        }
    }
}

class SiteAppActivity : AppCompatActivity() {
    private var web: WebView? = null
    private var app: SiteApp? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val sitePermissions = SitePermissions(this)
    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val found = intent.data?.lastPathSegment?.toLongOrNull()?.let { Store.get(this).app(it) }
        if (found == null) {
            toast(R.string.app_missing)
            finish()
            return
        }
        app = found
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_site_app)
        val bar = findViewById<View>(R.id.appBar)
        Web.applyInsets(findViewById(R.id.root), bar)

        // The top bar takes the site's own colour, with text chosen to stay readable on it.
        val light = Icons.isLight(found.color)
        val fore = if (light) 0xFF10202B.toInt() else Color.WHITE
        bar.setBackgroundColor(found.color)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = light
        findViewById<TextView>(R.id.appTitle).apply {
            text = found.name
            setTextColor(fore)
        }
        findViewById<ImageView>(R.id.appIcon).setImageBitmap(found.icon ?: Icons.letter(this, found.name, dp(32)))
        val more = findViewById<ImageButton>(R.id.appMore)
        more.imageTintList = ColorStateList.valueOf(fore)
        more.setOnClickListener { menu(it) }
        @Suppress("DEPRECATION")
        setTaskDescription(ActivityManager.TaskDescription(found.name, found.icon, found.color))

        val progress = findViewById<ProgressBar>(R.id.progress)
        val w = WebView(this)
        web = w
        Web.configure(w)
        findViewById<FrameLayout>(R.id.webContainer).addView(w, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        w.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                if (Prefs.fixArabic && Urls.isWeb(url)) view.evaluateJavascript(ArabicFixer.script(this@SiteAppActivity), null)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (!Urls.isWeb(url)) {
                    return if (request.isForMainFrame && (request.hasGesture() || request.isRedirect)) Web.openExternal(this@SiteAppActivity, url)
                    else !(url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:"))
                }
                // Links that leave the site open in the browser; the app window stays on its own site.
                if (request.isForMainFrame && request.hasGesture() && !sameSite(Urls.host(url), found.host)) {
                    openInLabeeb(url)
                    return true
                }
                return false
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress < 100) View.VISIBLE else View.INVISIBLE
            }

            override fun onPermissionRequest(request: android.webkit.PermissionRequest) = sitePermissions.ask(request)

            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    fileLauncher.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
        w.setDownloadListener { url, ua, disposition, mime, _ -> Web.download(this, url, ua, disposition, mime, cookiesFor(url)) }
        if (savedInstanceState == null || w.restoreState(savedInstanceState) == null) w.loadUrl(found.url)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (w.canGoBack()) w.goBack() else finish()
            }
        })
    }

    private fun sameSite(a: String, b: String) = a == b || a.endsWith(".$b") || b.endsWith(".$a")

    private fun openInLabeeb(url: String) =
        startActivity(Intent(this, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(url)))

    private fun menu(anchor: View) {
        val w = web ?: return
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, 1, 0, R.string.open_in_labeeb)
        popup.menu.add(0, 2, 1, R.string.share)
        popup.menu.add(0, 3, 2, R.string.reload)
        popup.menu.add(0, 4, 3, R.string.runs_on_labeeb).isEnabled = false
        popup.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> openInLabeeb(w.url ?: app!!.url)
                2 -> Web.share(this, w.url ?: app!!.url, w.title)
                3 -> w.reload()
            }
            true
        }
        popup.show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web?.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
    }

    override fun onPause() {
        web?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        web?.let { Web.destroy(it) }
        web = null
        super.onDestroy()
    }
}
