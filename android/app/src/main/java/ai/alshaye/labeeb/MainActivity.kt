package ai.alshaye.labeeb

import android.Manifest
import android.annotation.SuppressLint
import android.app.SearchManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.text.Editable
import android.text.SpannableString
import android.text.Spanned
import android.text.TextUtils
import android.text.TextWatcher
import android.text.style.ImageSpan
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

class Tab(val private: Boolean) {
    var web: WebView? = null
    /** True while the tab shows Labeeb's home screen instead of a page. */
    var home = true
    var url = ""
    var title = ""
    var thumb: Bitmap? = null
    var icon: Bitmap? = null
    var desktop = false
    var loading = false
    var progress = 0
    /** A login the page reported, waiting to see whether the site accepts it. */
    var offer: Offer? = null
}

class MainActivity : AppCompatActivity() {

    companion object {
        private const val PRIVATE_PROFILE = "labeeb-private"
        private const val MAX_RESTORED_TABS = 50
    }

    private lateinit var store: Store
    private val tabs = ArrayList<Tab>()
    private var current: Tab? = null
    private var privateSupported = false
    private var privateMode = false

    private lateinit var content: View
    private lateinit var webContainer: FrameLayout
    private lateinit var swipe: androidx.swiperefreshlayout.widget.SwipeRefreshLayout
    private lateinit var home: ScrollView
    private lateinit var suggestions: ListView
    private lateinit var progress: ProgressBar
    private lateinit var findBar: View
    private lateinit var findInput: EditText
    private lateinit var findCount: TextView
    private lateinit var bottomBar: View
    private lateinit var address: EditText
    private lateinit var endBtn: ImageButton
    private lateinit var startBtn: ImageButton
    private lateinit var miniBar: TextView
    private lateinit var barLine: View
    private lateinit var fillBar: TextView
    private var fillFor: Tab? = null
    private var barHidden = false
    private var scrollTravel = 0
    private var barLockUntil = 0L
    private var swallowTouch = false
    private lateinit var tabsBtn: View
    private lateinit var tabsCount: TextView
    private lateinit var tabsOverlay: View
    private lateinit var fullscreen: FrameLayout
    private val tabsAdapter = TabsAdapter()
    private val suggestAdapter = SuggestAdapter()

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var assistant: AssistantSheet? = null

    private val voiceAddress = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        Voice.result(r)?.let { address.clearFocus(); load(it) }
    }
    val voiceAssistant = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        Voice.result(r)?.let { assistant?.appendInput(it) }
    }
    private val libraryLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val data = r.data
        data?.getStringExtra("url")?.let { url ->
            if (data.getBooleanExtra("newTab", false)) {
                val t = newTab(current?.private == true)
                navigate(t, url)
                select(t)
            } else load(url)
        }
    }
    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val sitePermissions = SitePermissions(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Labeeb is Arabic-first: start in Arabic until the user picks a language.
        if (!Prefs.sp.getBoolean("locale_init", false)) {
            Prefs.sp.edit().putBoolean("locale_init", true).apply()
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("ar"))
        }
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        Web.applyInsets(findViewById(R.id.root))
        store = Store.get(this)

        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        privateSupported = try {
            WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
        } catch (_: Throwable) {
            false
        }
        // Private data left behind by a killed process is erased before anything loads.
        if (privateSupported && savedInstanceState == null) wipePrivate()

        content = findViewById(R.id.content)
        webContainer = findViewById(R.id.webContainer)
        swipe = findViewById(R.id.swipe)
        swipe.setColorSchemeColors(ContextCompat.getColor(this, R.color.accent))
        swipe.setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this, R.color.panel))
        // Pulling down refreshes only when the page itself is at its top, never while scrolling inside it.
        swipe.setOnChildScrollUpCallback { _, _ ->
            val t = current
            val w = t?.web as? PageView
            t == null || t.home || w == null || w.scrollY > 0 || !w.pullAllowed
        }
        swipe.setOnRefreshListener {
            current?.web?.reload()
            swipe.postDelayed({ swipe.isRefreshing = false }, 1500)
        }
        home = findViewById(R.id.home)
        suggestions = findViewById(R.id.suggestions)
        progress = findViewById(R.id.progress)
        findBar = findViewById(R.id.findBar)
        findInput = findViewById(R.id.findInput)
        findCount = findViewById(R.id.findCount)
        bottomBar = findViewById(R.id.bottomBar)
        address = findViewById(R.id.address)
        endBtn = findViewById(R.id.endBtn)
        startBtn = findViewById(R.id.startBtn)
        miniBar = findViewById(R.id.miniBar)
        barLine = findViewById(R.id.barLine)
        fillBar = findViewById(R.id.fillBar)
        fillBar.setOnClickListener { fillPassword() }
        tabsBtn = findViewById(R.id.tabsBtn)
        tabsCount = findViewById(R.id.tabsCount)
        tabsOverlay = findViewById(R.id.tabsOverlay)
        fullscreen = findViewById(R.id.fullscreen)
        content.isFocusableInTouchMode = true
        content.defaultFocusHighlightEnabled = false

        setupBar()
        setupFind()
        setupTabsOverlay()
        findViewById<View>(R.id.langBtn).setOnClickListener {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(if (isArabic()) "en" else "ar"))
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = back()
        })

        restoreSession()
        if (savedInstanceState == null) handleIntent(intent)
        content.requestFocus()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        val url = when (intent.action) {
            Intent.ACTION_VIEW -> intent.dataString?.takeIf { Urls.isWeb(it) }
            Intent.ACTION_WEB_SEARCH -> intent.getStringExtra(SearchManager.QUERY)?.let { Urls.resolve(it) }
            else -> null
        } ?: return
        hideTabs()
        val t = current?.takeIf { it.home && !it.private } ?: newTab(false)
        navigate(t, url)
        select(t)
    }

    override fun onResume() {
        super.onResume()
        current?.let { if (it.home) refreshHome() else it.web?.onResume() }
        updateBar()
    }

    override fun onPause() {
        saveSession()
        for (t in tabs) t.web?.onPause()
        // Sign-ins must survive the app being closed right after logging in.
        android.webkit.CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        assistant?.destroy()
        for (t in tabs) t.web?.let { Web.destroy(it) }
        tabs.clear()
        super.onDestroy()
    }

    // ---- Tabs ----

    private fun newTab(private: Boolean): Tab = Tab(private).also { tabs.add(it) }

    private fun select(tab: Tab) {
        current = tab
        if (!tab.home && tab.web == null) createWeb(tab).loadUrl(tab.url)
        for (t in tabs) {
            val w = t.web ?: continue
            if (t === tab && !tab.home) {
                w.visibility = View.VISIBLE
                w.onResume()
            } else {
                w.visibility = View.GONE
                w.onPause()
            }
        }
        home.visibility = if (tab.home) View.VISIBLE else View.GONE
        if (tab.home) refreshHome()
        address.clearFocus()
        setBarHidden(false)
        updateBar()
    }

    private fun navigate(tab: Tab, url: String) {
        if (url.isEmpty()) {
            tab.home = true
        } else {
            tab.home = false
            tab.url = url
            (tab.web ?: createWeb(tab)).loadUrl(url)
        }
        if (tab === current) select(tab) else updateBar()
    }

    private fun load(input: String) {
        val t = current ?: newTab(false)
        navigate(t, Urls.resolve(input))
        if (current !== t) select(t)
    }

    private fun closeTab(tab: Tab) {
        val index = tabs.indexOf(tab)
        if (index < 0) return
        tab.web?.let { Web.destroy(it) }
        tab.web = null
        tabs.removeAt(index)
        if (tab.private && tabs.none { it.private }) content.postDelayed({ wipePrivate() }, 600)
        if (tab === current) {
            val next = tabs.lastOrNull { it.private == tab.private } ?: tabs.lastOrNull()
            when {
                next != null -> select(next)
                // Closing the last tab from the tabs screen really removes it; a fresh one opens on leaving the screen.
                tabsOverlay.visibility == View.VISIBLE -> current = null
                else -> select(newTab(false))
            }
        } else updateBar()
    }

    /** Deletes the private profile: its cookies, storage and cache. Fails harmlessly while a private tab still uses it. */
    private fun wipePrivate() {
        if (tabs.any { it.private }) return
        try {
            ProfileStore.getInstance().deleteProfile(PRIVATE_PROFILE)
        } catch (_: Throwable) {
        }
    }

    private fun cookies(tab: Tab, url: String): String? {
        if (!tab.private) return cookiesFor(url)
        return try {
            ProfileStore.getInstance().getProfile(PRIVATE_PROFILE)?.cookieManager?.getCookie(url)
        } catch (_: Throwable) {
            null
        }
    }

    private fun createWeb(tab: Tab): WebView {
        val w = PageView(this)
        if (tab.private) WebViewCompat.setProfile(w, PRIVATE_PROFILE)
        Web.configure(w, tab.desktop)
        w.settings.setSupportMultipleWindows(true)
        w.webViewClient = Client(tab)
        w.webChromeClient = Chrome(tab)
        w.setDownloadListener { url, ua, disposition, mime, _ ->
            Web.download(this, url, ua, disposition, mime, cookies(tab, url))
        }
        w.setOnLongClickListener { longPress(tab, w) }
        // Pages may report a login for saving. The message carries no authority of its own: the origin comes
        // from the browser, only the top frame counts, and private tabs are left out.
        if (!tab.private && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, "LabeebVault", setOf("*")) { _, message, sourceOrigin, isMainFrame, _ ->
                if (isMainFrame) loginOffered(tab, sourceOrigin.toString(), message.data)
            }
        }
        w.setOnScrollChangeListener { _, _, y, _, oldY -> if (tab === current) onPageScroll(y - oldY, y) }
        w.visibility = View.GONE
        webContainer.addView(w, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        tab.web = w
        return w
    }

    private inner class Client(val tab: Tab) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (Urls.isWeb(url)) return false
            // Another app opens only on a tap or as part of a navigation the user started.
            if (request.isForMainFrame && (request.hasGesture() || request.isRedirect)) return Web.openExternal(this@MainActivity, url)
            return !(url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:"))
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            tab.url = url
            tab.loading = true
            tab.icon = null
            if (tab === current) updateBar()
        }

        override fun onPageFinished(view: WebView, url: String) {
            tab.loading = false
            view.title?.takeIf { it.isNotBlank() }?.let { tab.title = it }
            if (tab === current) swipe.isRefreshing = false
            if (Prefs.fixArabic && Urls.isWeb(url)) view.evaluateJavascript(ArabicFixer.script(this@MainActivity), null)
            // Remembered a little after loading, once the page has drawn its text.
            if (!tab.private) view.postDelayed({ Memory.capture(this@MainActivity, view, url) }, 3000)
            if (!tab.private && Vault.origin(url) != null) {
                view.evaluateJavascript(Vault.CAPTURE, null)
                checkFill(tab)
                // Sign-in forms drawn by the page after loading are caught on a second look.
                view.postDelayed({ checkFill(tab) }, 1200)
            }
            if (tab === current) updateBar()
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            tab.url = url
            if (!tab.private && !isReload && Urls.isWeb(url)) store.addHistory(url, "")
            settleOffer(tab, url)
            if (tab === fillFor) hideFill()
            if (tab === current) updateBar()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The page's process died; drop the view and fall back to home rather than crash the app.
            (view.parent as? ViewGroup)?.removeView(view)
            view.destroy()
            tab.web = null
            tab.home = true
            tab.loading = false
            if (tab === current) select(tab)
            return true
        }
    }

    private inner class Chrome(val tab: Tab) : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            tab.progress = newProgress
            if (newProgress >= 100) tab.loading = false
            if (tab === current) updateBar()
        }

        override fun onReceivedTitle(view: WebView, title: String?) {
            tab.title = title ?: ""
            val url = view.url
            if (!tab.private && !title.isNullOrBlank() && Urls.isWeb(url)) store.setHistoryTitle(url!!, title)
        }

        override fun onReceivedIcon(view: WebView, icon: Bitmap?) {
            tab.icon = icon
        }

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

        override fun onPermissionRequest(request: PermissionRequest) = sitePermissions.ask(request)

        override fun onJsAlert(view: WebView, url: String?, message: String?, result: android.webkit.JsResult) =
            Web.pageAlert(this@MainActivity, url, message, result)

        override fun onJsConfirm(view: WebView, url: String?, message: String?, result: android.webkit.JsResult) =
            Web.pageConfirm(this@MainActivity, url, message, result)

        override fun onJsPrompt(view: WebView, url: String?, message: String?, defaultValue: String?, result: android.webkit.JsPromptResult) =
            Web.pagePrompt(this@MainActivity, url, message, defaultValue, result)

        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            if (!isUserGesture) return false
            val t = newTab(tab.private)
            t.home = false
            (resultMsg.obj as WebView.WebViewTransport).webView = createWeb(t)
            resultMsg.sendToTarget()
            select(t)
            return true
        }

        override fun onCloseWindow(window: WebView) {
            tabs.firstOrNull { it.web === window }?.let { closeTab(it) }
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customCallback = callback
            fullscreen.addView(view)
            fullscreen.visibility = View.VISIBLE
            WindowInsetsControllerCompat(window, window.decorView).apply {
                hide(WindowInsetsCompat.Type.systemBars())
                systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }

        override fun onHideCustomView() = hideCustomView()
    }

    private fun hideCustomView() {
        customView ?: return
        fullscreen.removeAllViews()
        fullscreen.visibility = View.GONE
        customView = null
        customCallback?.onCustomViewHidden()
        customCallback = null
        WindowInsetsControllerCompat(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }

    private fun longPress(tab: Tab, w: WebView): Boolean {
        val hit = w.hitTestResult
        val target = hit.extra ?: return false
        val image = hit.type == WebView.HitTestResult.IMAGE_TYPE || hit.type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE
        if (!image && hit.type != WebView.HitTestResult.SRC_ANCHOR_TYPE) return false
        if (!Urls.isWeb(target)) return false
        val items = ArrayList<Triple<Int, Int, () -> Unit>>()
        items.add(Triple(R.string.open_in_new_tab, R.drawable.ic_plus) {
            val t = newTab(tab.private)
            navigate(t, target)
        })
        if (image) items.add(Triple(R.string.download_image, R.drawable.ic_download) {
            Web.download(this, target, w.settings.userAgentString, null, null, cookies(tab, target))
        })
        items.add(Triple(R.string.copy_link, R.drawable.ic_copy) {
            (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("url", target))
            toast(R.string.link_copied)
        })
        items.add(Triple(R.string.share, R.drawable.ic_share) { Web.share(this, target, null) })
        // The address is shown left to right whatever the language, and cut short when it runs long.
        Sheets.list(this, R.drawable.ic_globe, Urls.host(target).ifEmpty { getString(R.string.link) }, "\u2066" + target.take(120) + "\u2069",
            items.map { Sheets.Row(getString(it.first), it.second) }) { items[it].third() }
        return true
    }

    // ---- Navigation ----

    private fun back() {
        val t = current
        when {
            customView != null -> hideCustomView()
            tabsOverlay.visibility == View.VISIBLE -> hideTabs()
            findBar.visibility == View.VISIBLE -> closeFind()
            address.hasFocus() -> address.clearFocus()
            barHidden -> setBarHidden(false)
            t == null || t.home -> moveTaskToBack(true)
            else -> goBack(t)
        }
    }

    private fun goBack(t: Tab) {
        val w = t.web
        if (w != null && w.canGoBack()) w.goBack()
        else {
            // The first page of a tab goes back to home; Forward returns to it.
            t.home = true
            select(t)
        }
    }

    private fun canGoForward(t: Tab) = if (t.home) t.web?.url != null else t.web?.canGoForward() == true

    private fun goForward(t: Tab) {
        val w = t.web ?: return
        if (t.home) {
            t.home = false
            t.url = w.url ?: t.url
            select(t)
        } else w.goForward()
    }

    // ---- Bottom bar ----

    private fun setupBar() {
        findViewById<View>(R.id.menuBtn).setOnClickListener { showMenu() }
        startBtn.setOnClickListener { if (address.hasFocus()) submitAddress() else address.requestFocus() }
        miniBar.setOnClickListener { setBarHidden(false) }
        setupTabSwipe()
        tabsBtn.setOnClickListener { showTabs() }
        endBtn.setOnClickListener {
            val t = current
            when {
                address.hasFocus() && address.text.isNotEmpty() -> address.setText("")
                t == null || t.home || address.hasFocus() -> Voice.listen(this, voiceAddress)
                t.loading -> t.web?.stopLoading()
                else -> t.web?.reload()
            }
        }
        suggestions.adapter = suggestAdapter
        suggestions.setOnItemClickListener { _, _, position, _ ->
            val url = suggestAdapter.items[position].url
            address.clearFocus()
            load(url)
        }
        address.setOnFocusChangeListener { _, focused ->
            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            if (focused) {
                val t = current
                address.setText(if (t == null || t.home) "" else t.url)
                address.gravity = Gravity.START or Gravity.CENTER_VERTICAL
                address.post { address.selectAll() }
                imm.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT)
            } else {
                suggestions.visibility = View.GONE
                imm.hideSoftInputFromWindow(address.windowToken, 0)
                content.requestFocus()
            }
            updateBar()
        }
        address.setOnEditorActionListener { _, action, event ->
            if (action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER) {
                submitAddress()
                true
            } else false
        }
        address.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (!address.hasFocus()) return
                updateBar()
                val q = s?.toString()?.trim().orEmpty()
                val found = if (q.isEmpty() || current?.private == true) emptyList() else store.suggest(q)
                suggestAdapter.items = found
                suggestAdapter.notifyDataSetChanged()
                suggestions.visibility = if (found.isEmpty()) View.GONE else View.VISIBLE
            }
        })
    }

    private fun updateBar() {
        val t = current ?: return
        val count = tabs.count { it.private == t.private }
        tabsCount.text = num(count)
        tabsBtn.contentDescription = getString(R.string.tabs_open, num(count))
        val focused = address.hasFocus()
        if (!focused) {
            address.gravity = Gravity.CENTER
            if (t.home) address.setText("")
            else {
                val host = Urls.host(t.url).ifEmpty { t.url }
                // A lock ahead of the host marks an encrypted connection; a warning marks plain HTTP.
                val secure = t.url.startsWith("https://")
                val mark = ContextCompat.getDrawable(this, if (secure) R.drawable.ic_lock else R.drawable.ic_warning)!!.mutate()
                mark.setTint(ContextCompat.getColor(this, if (secure) R.color.accent else R.color.warn))
                mark.setBounds(0, 0, dp(15), dp(15))
                val text = SpannableString("\u200E   $host")
                text.setSpan(ImageSpan(mark, ImageSpan.ALIGN_BASELINE), 1, 2, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                address.setText(text)
            }
        }
        val typing = focused && address.text.isNotEmpty()
        val mic = !typing && (focused || t.home)
        endBtn.setImageResource(if (typing || (!mic && t.loading)) R.drawable.ic_close else if (mic) R.drawable.ic_mic else R.drawable.ic_reload)
        endBtn.contentDescription = getString(if (typing) R.string.clear else if (mic) R.string.voice_search else if (t.loading) R.string.stop else R.string.reload)
        // While typing, the leading button becomes the "go" arrow, where people look for it.
        val rtl = resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
        if (typing) {
            startBtn.setImageResource(if (rtl) R.drawable.ic_arrow_left else R.drawable.ic_arrow_right)
            startBtn.setBackgroundResource(R.drawable.bg_accent_circle)
            startBtn.setColorFilter(ContextCompat.getColor(this, R.color.on_accent))
            startBtn.contentDescription = getString(R.string.go)
        } else {
            startBtn.setImageResource(R.drawable.ic_search)
            startBtn.background = null
            startBtn.setColorFilter(ContextCompat.getColor(this, R.color.muted))
            startBtn.contentDescription = getString(R.string.address_hint)
        }
        miniBar.text = if (t.home) "" else Urls.host(t.url)
        if (fillFor != null && (fillFor !== t || t.home || focused)) hideFill()
        swipe.isEnabled = !t.home && !focused
        barLine.visibility = if (t.home || tabsOverlay.visibility == View.VISIBLE) View.INVISIBLE else View.VISIBLE
        progress.progress = t.progress
        progress.visibility = if (!t.home && t.loading) View.VISIBLE else View.INVISIBLE
    }

    private fun submitAddress() {
        val text = address.text.toString()
        address.clearFocus()
        if (text.isNotBlank()) load(text)
    }

    /** Scrolling down a page tucks the bar away for reading; scrolling up, or reaching the top, brings it back. */
    private fun onPageScroll(dy: Int, y: Int) {
        if (address.hasFocus() || findBar.visibility == View.VISIBLE || customView != null) return
        val w = current?.web as? PageView ?: return
        val now = android.os.SystemClock.uptimeMillis()
        // The bar always stays while the keyboard is open, so typing never makes the layout jump.
        val keyboard = androidx.core.view.ViewCompat.getRootWindowInsets(content)?.isVisible(WindowInsetsCompat.Type.ime()) == true
        if (keyboard) {
            setBarHidden(false)
            return
        }
        // Hiding the bar resizes the page, which itself scrolls it. Only a scroll the reader is making
        // by touch may move the bar; otherwise the two would chase each other without end.
        if (now < barLockUntil || now - w.lastTouch > 1500) return
        scrollTravel = if ((dy > 0) == (scrollTravel > 0)) scrollTravel + dy else dy
        val range = w.contentHeight * resources.displayMetrics.density - w.height
        if (!barHidden && scrollTravel > dp(56) && y > dp(140) && range > dp(320)) setBarHidden(true)
        else if (barHidden && (scrollTravel < -dp(28) || y <= 0)) setBarHidden(false)
    }

    private fun setBarHidden(hidden: Boolean) {
        if (barHidden == hidden) return
        barHidden = hidden
        scrollTravel = 0
        // Resizing the page moves its scroll position; ignore scrolls until that settles.
        barLockUntil = android.os.SystemClock.uptimeMillis() + 500
        bottomBar.visibility = if (hidden) View.GONE else View.VISIBLE
        miniBar.visibility = if (hidden) View.VISIBLE else View.GONE
    }

    /** Swiping sideways on the address pill moves to the neighbouring tab. */
    @android.annotation.SuppressLint("ClickableViewAccessibility")
    private fun setupTabSwipe() {
        val detector = android.view.GestureDetector(this, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onFling(e1: android.view.MotionEvent?, e2: android.view.MotionEvent, vx: Float, vy: Float): Boolean {
                val start = e1 ?: return false
                val dx = e2.x - start.x
                if (kotlin.math.abs(dx) < dp(56) || kotlin.math.abs(dx) < kotlin.math.abs(e2.y - start.y) * 1.5f) return false
                val t = current ?: return false
                val peers = tabs.filter { it.private == t.private }
                val rtl = resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
                val step = if ((dx > 0) != rtl) -1 else 1
                val next = peers.getOrNull(peers.indexOf(t) + step) ?: return false
                swallowTouch = true
                select(next)
                return true
            }
        })
        address.setOnTouchListener { v, event ->
            if (address.hasFocus()) return@setOnTouchListener false
            detector.onTouchEvent(event)
            if (swallowTouch && event.actionMasked == android.view.MotionEvent.ACTION_UP) {
                // The swipe already switched tabs; this lift must not also open the keyboard.
                swallowTouch = false
                v.isPressed = false
                v.cancelLongPress()
                true
            } else false
        }
    }

    private inner class SuggestAdapter : BaseAdapter() {
        var items: List<Entry> = emptyList()
        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val row = (convertView as? LinearLayout) ?: LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(10), dp(20), dp(10))
                addView(TextView(context).apply {
                    textSize = 15f
                    setTextColor(ContextCompat.getColor(context, R.color.text))
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                    textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                })
                addView(TextView(context).apply {
                    textSize = 13f
                    setTextColor(ContextCompat.getColor(context, R.color.muted))
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                    textDirection = View.TEXT_DIRECTION_LTR
                    textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                })
            }
            val e = items[position]
            (row.getChildAt(0) as TextView).text = e.title.ifBlank { Urls.host(e.url) }
            (row.getChildAt(1) as TextView).text = e.url
            return row
        }
    }

    // ---- Home ----

    private fun gridParams() = GridLayout.LayoutParams(
        GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f)
    ).apply { width = 0 }

    private fun tile(label: String, icon: View): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            isClickable = true
            isFocusable = true
            setPadding(0, 0, 0, dp(14))
            layoutParams = gridParams()
        }
        box.addView(icon, LinearLayout.LayoutParams(dp(60), dp(60)))
        box.addView(TextView(this).apply {
            text = label
            textSize = 12f
            setTextColor(ContextCompat.getColor(context, R.color.text))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            gravity = Gravity.CENTER
            setPadding(dp(2), dp(8), dp(2), 0)
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return box
    }

    /** Fills the last row so every grid keeps four equal columns. */
    private fun padGrid(grid: GridLayout) {
        while (grid.childCount % 4 != 0) grid.addView(Space(this), gridParams())
    }

    private fun refreshHome() {
        val appsLabel = findViewById<View>(R.id.appsLabel)
        val appsGrid = findViewById<GridLayout>(R.id.appsGrid)
        val sitesGrid = findViewById<GridLayout>(R.id.sitesGrid)
        val apps = store.apps()
        appsLabel.visibility = if (apps.isEmpty()) View.GONE else View.VISIBLE
        appsGrid.visibility = appsLabel.visibility
        appsGrid.removeAllViews()
        for (app in apps) {
            val icon = ImageView(this).apply { setImageBitmap(app.icon ?: Icons.letter(context, app.name, dp(60))) }
            val t = tile(app.name, icon)
            t.setOnClickListener { SiteApps.launch(this, app.id) }
            t.setOnLongClickListener {
                Sheets.confirm(this, getString(R.string.remove_app_title), getString(R.string.remove_app, app.name), getString(R.string.remove)) {
                    SiteApps.remove(this, app.id)
                    refreshHome()
                }
                true
            }
            appsGrid.addView(t)
        }
        padGrid(appsGrid)

        sitesGrid.removeAllViews()
        for (site in store.bookmarks().take(7)) {
            val name = site.title.ifBlank { Urls.host(site.url) }
            val letter = TextView(this).apply {
                text = name.trim().firstOrNull { it.isLetterOrDigit() }?.toString()?.uppercase() ?: "•"
                textSize = 22f
                typeface = Typeface.create(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER
                setTextColor(ContextCompat.getColor(context, R.color.accent))
                setBackgroundResource(R.drawable.bg_tile)
            }
            val t = tile(name, letter)
            t.setOnClickListener { load(site.url) }
            t.setOnLongClickListener {
                Sheets.confirm(this, getString(R.string.remove_site_title), getString(R.string.remove_site, name), getString(R.string.remove)) {
                    store.removeBookmark(site.url)
                    refreshHome()
                }
                true
            }
            sitesGrid.addView(t)
        }
        val plus = ImageView(this).apply {
            setImageResource(R.drawable.ic_plus)
            setColorFilter(ContextCompat.getColor(context, R.color.muted))
            scaleType = ImageView.ScaleType.CENTER
            setBackgroundResource(R.drawable.bg_tile_dashed)
        }
        val addTile = tile(getString(R.string.add), plus)
        addTile.contentDescription = getString(R.string.add_site)
        addTile.setOnClickListener { addSiteDialog() }
        sitesGrid.addView(addTile)
        padGrid(sitesGrid)

        val card = findViewById<View>(R.id.continueCard)
        val last = if (current?.private == true) null else store.lastHistory()
        card.visibility = if (last == null) View.GONE else View.VISIBLE
        if (last != null) {
            val host = Urls.host(last.url)
            findViewById<TextView>(R.id.continueTitle).text = if (last.title.isBlank()) host else "${last.title} — $host"
            card.setOnClickListener { load(last.url) }
        }
    }

    private fun addSiteDialog() {
        val name = Sheets.field(this, getString(R.string.site_name))
        val url = Sheets.field(this, getString(R.string.site_url), address = true)
        Sheets.message(this, R.drawable.ic_plus, getString(R.string.add_site), getString(R.string.add_site_note),
            primary = getString(R.string.add), extra = Sheets.stack(this, name, url), focus = name) {
            val raw = url.text.toString().trim()
            if (raw.isNotEmpty()) {
                val full = if (Urls.isWeb(raw)) raw else "https://$raw"
                store.addBookmark(full, name.text.toString().trim())
                refreshHome()
            }
        }
    }

    // ---- Tabs overlay ----

    private fun setupTabsOverlay() {
        val list = findViewById<RecyclerView>(R.id.tabsList)
        list.layoutManager = GridLayoutManager(this, 2)
        list.adapter = tabsAdapter
        androidx.recyclerview.widget.ItemTouchHelper(object : androidx.recyclerview.widget.ItemTouchHelper.SimpleCallback(
            0, androidx.recyclerview.widget.ItemTouchHelper.START or androidx.recyclerview.widget.ItemTouchHelper.END
        ) {
            override fun onMove(rv: RecyclerView, a: RecyclerView.ViewHolder, b: RecyclerView.ViewHolder) = false

            // A card must be dragged most of the way across, or thrown firmly, before its tab closes.
            override fun getSwipeThreshold(holder: RecyclerView.ViewHolder) = 0.65f
            override fun getSwipeEscapeVelocity(defaultValue: Float) = defaultValue * 8
            override fun onSwiped(holder: RecyclerView.ViewHolder, direction: Int) {
                tabsAdapter.items.getOrNull(holder.bindingAdapterPosition)?.let { closeTab(it) }
                refreshTabs()
            }
        }).attachToRecyclerView(list)
        findViewById<View>(R.id.segNormal).setOnClickListener { privateMode = false; refreshTabs() }
        findViewById<View>(R.id.segPrivate).setOnClickListener { privateMode = true; refreshTabs() }
        findViewById<View>(R.id.newTabBtn).setOnClickListener {
            val t = newTab(privateMode)
            select(t)
            hideTabs()
        }
        findViewById<View>(R.id.doneBtn).setOnClickListener { hideTabs() }
        findViewById<View>(R.id.closeAllBtn).setOnClickListener {
            val shown = tabs.filter { it.private == privateMode }
            fun closeAll() {
                for (t in shown) closeTab(t)
                refreshTabs()
            }
            // One tab closes at once; several are confirmed first, since they cannot be brought back.
            if (shown.size <= 1) closeAll()
            else Sheets.confirm(this, getString(R.string.close_all_confirm), getString(R.string.close_all_message, num(shown.size)),
                getString(R.string.close_all), icon = R.drawable.ic_close) { closeAll() }
        }
    }

    private fun showTabs() {
        address.clearFocus()
        current?.let { capture(it) }
        privateMode = current?.private == true
        tabsOverlay.animate().cancel()
        tabsOverlay.alpha = 0f
        tabsOverlay.scaleX = 0.97f
        tabsOverlay.scaleY = 0.97f
        tabsOverlay.visibility = View.VISIBLE
        tabsOverlay.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(160).start()
        refreshTabs()
        updateBar()
    }

    private fun hideTabs() {
        if (tabsOverlay.visibility != View.VISIBLE) return
        if (current == null) select(newTab(false))
        tabsOverlay.animate().cancel()
        tabsOverlay.animate().alpha(0f).setDuration(120).withEndAction {
            tabsOverlay.visibility = View.GONE
            updateBar()
        }.start()
    }

    private fun refreshTabs() {
        val normal = findViewById<TextView>(R.id.segNormal)
        val private = findViewById<TextView>(R.id.segPrivate)
        normal.text = getString(R.string.tabs_normal, num(tabs.count { !it.private }))
        findViewById<TextView>(R.id.tabsSub).text = getString(R.string.tabs_total, num(tabs.count { it.private == privateMode }))
        fun style(v: TextView, on: Boolean) {
            if (on) v.setBackgroundResource(R.drawable.bg_seg_on) else v.background = null
            v.setTextColor(ContextCompat.getColor(this, if (on) R.color.on_accent else R.color.muted))
            v.typeface = Typeface.create(v.typeface, if (on) Typeface.BOLD else Typeface.NORMAL)
            v.isSelected = on
        }
        style(normal, !privateMode)
        style(private, privateMode)
        // Private tabs need a separate WebView profile; without it they would share cookies, so the option is hidden.
        findViewById<View>(R.id.tabsSeg).visibility = if (privateSupported) View.VISIBLE else View.GONE
        findViewById<View>(R.id.privateHint).visibility = if (privateMode) View.VISIBLE else View.GONE
        tabsAdapter.items = tabs.filter { it.private == privateMode }
        tabsAdapter.notifyDataSetChanged()
    }

    /** Draws the top of the tab's visible content into a small bitmap for its card. */
    private fun capture(tab: Tab) {
        val v: View = if (tab.home) home else tab.web ?: return
        if (v.width <= 0 || v.height <= 0) return
        try {
            val scale = 0.4f
            // Captured in the card's own proportions, so the preview shows the top of the page uncropped.
            val cardWidth = (resources.displayMetrics.widthPixels - dp(54)) / 2f
            val height = minOf(v.height.toFloat(), v.width * dp(190) / cardWidth)
            val bmp = Bitmap.createBitmap((v.width * scale).toInt(), (height * scale).toInt(), Bitmap.Config.RGB_565)
            val canvas = Canvas(bmp)
            canvas.drawColor(ContextCompat.getColor(this, R.color.canvas))
            canvas.scale(scale, scale)
            canvas.translate(-v.scrollX.toFloat(), -v.scrollY.toFloat())
            v.draw(canvas)
            tab.thumb = bmp
        } catch (_: Throwable) {
        }
    }

    private inner class TabsAdapter : RecyclerView.Adapter<TabsAdapter.Holder>() {
        var items: List<Tab> = emptyList()

        inner class Holder(v: View) : RecyclerView.ViewHolder(v) {
            val card: View = v.findViewById(R.id.card)
            val icon: ImageView = v.findViewById(R.id.icon)
            val title: TextView = v.findViewById(R.id.title)
            val close: View = v.findViewById(R.id.close)
            val thumb: ImageView = v.findViewById(R.id.thumb)
            val placeholder: TextView = v.findViewById(R.id.placeholder)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
            Holder(layoutInflater.inflate(R.layout.item_tab, parent, false))

        override fun getItemCount() = items.size

        override fun onBindViewHolder(h: Holder, position: Int) {
            val tab = items[position]
            val name = if (tab.home) getString(R.string.home_tab) else tab.title.ifBlank { Urls.host(tab.url) }
            h.title.text = name
            when {
                tab.home -> h.icon.setImageResource(R.drawable.logo)
                tab.icon != null -> h.icon.setImageBitmap(tab.icon)
                else -> h.icon.setImageBitmap(Icons.letter(this@MainActivity, Urls.host(tab.url).ifEmpty { name }, dp(18)))
            }
            // A tab restored from the last session has no preview until it is opened; it shows its address instead.
            h.thumb.setImageBitmap(tab.thumb)
            h.placeholder.text = if (tab.thumb != null || tab.home) "" else Urls.host(tab.url)
            h.card.setBackgroundResource(if (tab === current) R.drawable.bg_tab_active else R.drawable.bg_tab)
            h.card.clipToOutline = true
            h.card.setOnClickListener {
                select(tab)
                hideTabs()
            }
            h.close.setOnClickListener {
                closeTab(tab)
                refreshTabs()
            }
        }
    }

    // ---- Menu ----

    private fun showMenu() {
        val t = current ?: return
        address.clearFocus()
        val dialog = BottomSheetDialog(this)
        val v = layoutInflater.inflate(R.layout.sheet_menu, null)
        dialog.setContentView(v)
        dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        dialog.behavior.skipCollapsed = true
        val page = !t.home
        val web = page && Urls.isWeb(t.url)

        fun action(id: Int, enabled: Boolean = true, run: () -> Unit) {
            val b = v.findViewById<View>(id)
            b.isEnabled = enabled
            b.alpha = if (enabled) 1f else 0.4f
            b.setOnClickListener {
                dialog.dismiss()
                run()
            }
        }

        fun toggle(boxId: Int, textId: Int, on: Boolean) {
            v.findViewById<View>(boxId).setBackgroundResource(if (on) R.drawable.bg_toggle_on else R.drawable.bg_toggle_off)
            val text = v.findViewById<TextView>(textId)
            val color = ContextCompat.getColor(this, if (on) R.color.accent else R.color.text)
            text.setTextColor(color)
            androidx.core.widget.TextViewCompat.setCompoundDrawableTintList(text, android.content.res.ColorStateList.valueOf(color))
            v.findViewById<View>(boxId).isSelected = on
        }

        // Back points toward the reading start: right in Arabic, left in English.
        val rtl = resources.configuration.layoutDirection == View.LAYOUT_DIRECTION_RTL
        v.findViewById<TextView>(R.id.mBack).setCompoundDrawablesRelativeWithIntrinsicBounds(0, if (rtl) R.drawable.ic_arrow_right else R.drawable.ic_arrow_left, 0, 0)
        v.findViewById<TextView>(R.id.mForward).setCompoundDrawablesRelativeWithIntrinsicBounds(0, if (rtl) R.drawable.ic_arrow_left else R.drawable.ic_arrow_right, 0, 0)
        action(R.id.mAssistant) { showAssistant() }
        action(R.id.mBack, page) { goBack(t) }
        action(R.id.mForward, canGoForward(t)) { goForward(t) }
        val saved = web && store.isBookmarked(t.url)
        v.findViewById<TextView>(R.id.mSave).setText(if (saved) R.string.saved else R.string.save)
        action(R.id.mSave, web) {
            if (saved) {
                store.removeBookmark(t.url)
                toast(R.string.bookmark_removed)
            } else {
                store.addBookmark(t.url, t.title)
                toast(R.string.bookmark_added)
            }
        }
        action(R.id.mShare, web) { Web.share(this, t.url, t.title) }
        action(R.id.mApp, web) { SiteApps.install(this, t) }
        action(R.id.mReader, web && t.web != null) { t.web?.let { Reader.open(this, it) } }
        action(R.id.mMemory) { libraryLauncher.launch(Intent(this, MemoryActivity::class.java)) }
        action(R.id.mBookmarks) { openLibrary(LibraryActivity.BOOKMARKS) }
        action(R.id.mHistory) { openLibrary(LibraryActivity.HISTORY) }
        action(R.id.mDownloads) { openLibrary(LibraryActivity.DOWNLOADS) }
        action(R.id.mFind, page) { openFind() }
        action(R.id.mSettings) { startActivity(Intent(this, SettingsActivity::class.java)) }
        action(R.id.mAbout) { startActivity(Intent(this, AboutActivity::class.java)) }

        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        toggle(R.id.mDark, R.id.mDarkText, dark)
        action(R.id.mDark) {
            saveSession()
            Prefs.theme = if (dark) "light" else "dark"
            AppCompatDelegate.setDefaultNightMode(Prefs.nightMode())
        }
        toggle(R.id.mDesktop, R.id.mDesktopText, t.desktop)
        action(R.id.mDesktop, page) {
            t.desktop = !t.desktop
            t.web?.let {
                Web.setDesktop(it, t.desktop)
                it.reload()
            }
        }
        dialog.show()
    }

    private fun openLibrary(tab: Int) =
        libraryLauncher.launch(Intent(this, LibraryActivity::class.java).putExtra("tab", tab))

    // ---- Find in page ----

    private fun setupFind() {
        findInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                current?.web?.findAllAsync(s?.toString().orEmpty())
            }
        })
        findViewById<View>(R.id.findPrev).setOnClickListener { current?.web?.findNext(false) }
        findViewById<View>(R.id.findNext).setOnClickListener { current?.web?.findNext(true) }
        findViewById<View>(R.id.findClose).setOnClickListener { closeFind() }
    }

    private fun openFind() {
        val w = current?.web ?: return
        w.setFindListener { active, total, _ ->
            findCount.text = if (total == 0) num(0) else "${num(active + 1)}/${num(total)}"
        }
        setBarHidden(false)
        bottomBar.visibility = View.GONE
        findBar.visibility = View.VISIBLE
        findInput.setText("")
        findCount.text = ""
        findInput.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(findInput, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun closeFind() {
        current?.web?.clearMatches()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(findInput.windowToken, 0)
        findBar.visibility = View.GONE
        bottomBar.visibility = View.VISIBLE
        content.requestFocus()
    }

    // ---- Assistant ----

    private fun showAssistant() {
        address.clearFocus()
        val sheet = assistant ?: AssistantSheet(this).also { assistant = it }
        sheet.show()
    }

    /** Reads the visible text of the current page for the assistant; null when no web page is open. */
    fun pageText(done: (text: String?, url: String?) -> Unit) {
        val t = current
        val w = t?.web
        if (t == null || t.home || w == null || !Urls.isWeb(t.url)) {
            done(null, null)
            return
        }
        w.evaluateJavascript("(function(){return document.body?document.body.innerText.slice(0,12000):''})()") { raw ->
            val text = try {
                JSONTokener(raw).nextValue() as? String
            } catch (_: Exception) {
                null
            }
            done(text?.takeIf { it.isNotBlank() }, t.url)
        }
    }

    // ---- Passwords ----

    private fun loginOffered(tab: Tab, source: String, data: String?) {
        if (!Prefs.offerSave || tab.private) return
        val origin = Vault.origin(source) ?: return
        if (origin != Vault.origin(tab.url)) return
        try {
            val o = JSONObject(data ?: return)
            val password = o.optString("p")
            if (password.isEmpty() || password.length > 256) return
            tab.offer = Offer(origin, tab.url, o.optString("u").take(256), password, android.os.SystemClock.uptimeMillis())
        } catch (_: Exception) {
        }
    }

    /** Once the site leaves its sign-in page the login evidently worked, and saving it is offered. */
    private fun settleOffer(tab: Tab, url: String) {
        val offer = tab.offer ?: return
        if (url == offer.pageUrl) return
        tab.offer = null
        if (android.os.SystemClock.uptimeMillis() - offer.time > 30000 || Vault.origin(url) != offer.origin || isFinishing) return
        val existing = Vault.list(this, offer.origin).firstOrNull { it.username == offer.username }
        if (existing != null && Vault.password(this, existing.id) == offer.password) return
        Sheets.message(this, R.drawable.ic_key, getString(if (existing == null) R.string.save_password_title else R.string.update_password_title),
            getString(R.string.save_password_note), primary = getString(if (existing == null) R.string.save else R.string.update),
            secondary = getString(R.string.not_now), extra = Sheets.account(this, Vault.host(offer.origin), offer.username)) {
            Vault.save(this, offer.origin, offer.username, offer.password)
            toast(R.string.password_saved)
        }
    }

    /** Shows the fill strip when the page has a sign-in form and a login is stored for this exact site. */
    private fun checkFill(tab: Tab) {
        val w = tab.web ?: return
        if (tab !== current || tab.home || tab.private) return
        val origin = Vault.origin(tab.url) ?: return
        val saved = Vault.list(this, origin)
        if (saved.isEmpty()) return
        w.evaluateJavascript(Vault.HAS_LOGIN) { found ->
            if (found != "true" || tab !== current || tab.home || Vault.origin(tab.url) != origin || address.hasFocus()) return@evaluateJavascript
            fillFor = tab
            val key = ContextCompat.getDrawable(this, R.drawable.ic_key)!!.mutate()
            key.setTint(ContextCompat.getColor(this, R.color.accent))
            key.setBounds(0, 0, dp(18), dp(18))
            fillBar.setCompoundDrawablesRelative(key, null, null, null)
            fillBar.text = if (saved.size == 1 && saved[0].username.isNotEmpty()) getString(R.string.fill_for, saved[0].username)
            else getString(R.string.fill_password)
            fillBar.visibility = View.VISIBLE
        }
    }

    private fun hideFill() {
        fillFor = null
        fillBar.visibility = View.GONE
    }

    private fun fillPassword() {
        val tab = fillFor ?: return
        val origin = Vault.origin(tab.url) ?: return
        val saved = Vault.list(this, origin)
        fun fill(cred: Credential) = Vault.verify(this) {
            val secret = Vault.password(this, cred.id)
            val w = tab.web
            // The page is checked again after the lock screen: a fill only ever goes to the site it was saved for.
            if (secret != null && w != null && tab === current && Vault.origin(w.url) == cred.origin) {
                w.evaluateJavascript(Vault.fillScript(cred.username, secret), null)
                hideFill()
            }
        }
        when {
            saved.isEmpty() -> hideFill()
            saved.size == 1 -> fill(saved[0])
            else -> Sheets.list(this, R.drawable.ic_key, getString(R.string.choose_account), Vault.host(origin),
                saved.map { Sheets.Row(it.username.ifEmpty { getString(R.string.no_username) }, letter = it.username.ifEmpty { Vault.host(origin) }) }) { fill(saved[it]) }
        }
    }

    // ---- Session ----

    private fun saveSession() {
        val normal = tabs.filter { !it.private }
        val arr = JSONArray()
        for (t in normal) arr.put(JSONObject().put("url", if (t.home) "" else t.url).put("title", t.title).put("desktop", t.desktop))
        Prefs.sp.edit()
            .putString("session", arr.toString())
            .putInt("session_index", normal.indexOf(current).coerceAtLeast(0))
            .apply()
    }

    private fun restoreSession() {
        try {
            val arr = JSONArray(Prefs.sp.getString("session", "[]"))
            for (i in 0 until minOf(arr.length(), MAX_RESTORED_TABS)) {
                val o = arr.getJSONObject(i)
                val t = newTab(false)
                t.url = o.optString("url")
                t.home = !Urls.isWeb(t.url)
                t.title = o.optString("title")
                t.desktop = o.optBoolean("desktop")
            }
        } catch (_: Exception) {
        }
        if (tabs.isEmpty()) newTab(false)
        // Only the selected tab loads now; the others load when first opened.
        select(tabs[Prefs.sp.getInt("session_index", 0).coerceIn(0, tabs.size - 1)])
    }
}
