package ai.alshaye.labeeb

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.speech.RecognizerIntent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

object Web {
    @SuppressLint("SetJavaScriptEnabled")
    fun configure(w: WebView, desktop: Boolean = false) {
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.setSupportZoom(true)
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.mediaPlaybackRequiresUserGesture = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.setGeolocationEnabled(false)
        // Sites never get the WebView's own password store; a vault with biometric approval comes later.
        @Suppress("DEPRECATION")
        s.savePassword = false
        setDesktop(w, desktop)
    }

    /** The system WebView's user agent minus the "; wv" marker and "Version/4.0", which make sites serve a reduced page. */
    fun setDesktop(w: WebView, desktop: Boolean) {
        val base = WebSettings.getDefaultUserAgent(w.context).replace("; wv", "").replace(Regex(" Version/\\d+\\.\\d+"), "")
        w.settings.userAgentString = if (!desktop) base else
            base.replace(Regex("\\(Linux; Android[^)]*\\)"), "(X11; Linux x86_64)").replace(" Mobile", "")
    }

    fun download(c: Context, url: String, userAgent: String?, disposition: String?, mime: String?, cookies: String?) {
        if (!Urls.isWeb(url)) {
            c.toast(R.string.download_unsupported)
            return
        }
        try {
            val name = URLUtil.guessFileName(url, disposition, mime)
            val req = DownloadManager.Request(Uri.parse(url))
            if (!mime.isNullOrBlank()) req.setMimeType(mime)
            if (!userAgent.isNullOrBlank()) req.addRequestHeader("User-Agent", userAgent)
            if (!cookies.isNullOrBlank()) req.addRequestHeader("Cookie", cookies)
            req.setTitle(name)
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            if (Build.VERSION.SDK_INT >= 29) req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            else req.setDestinationInExternalFilesDir(c, Environment.DIRECTORY_DOWNLOADS, name)
            (c.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            c.toast(c.getString(R.string.download_started, name))
        } catch (_: Exception) {
            c.toast(R.string.download_unsupported)
        }
    }

    /** Hands a non-web link (tel:, mailto:, intent:, market:) to another app. Returns true when handled here. */
    fun openExternal(c: Context, url: String): Boolean {
        if (Urls.isWeb(url) || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("javascript:")) return false
        try {
            val intent = if (url.startsWith("intent:")) Intent.parseUri(url, Intent.URI_INTENT_SCHEME) else Intent(Intent.ACTION_VIEW, Uri.parse(url))
            // Pages may only reach activities that other apps expose for browsing.
            intent.addCategory(Intent.CATEGORY_BROWSABLE)
            intent.component = null
            intent.selector = null
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            c.startActivity(intent)
        } catch (_: Exception) {
            c.toast(R.string.no_app_for_link)
        }
        return true
    }

    fun share(c: Context, url: String, title: String?) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
        if (!title.isNullOrBlank()) send.putExtra(Intent.EXTRA_SUBJECT, title)
        c.startActivity(Intent.createChooser(send, null))
    }

    fun destroy(w: WebView) {
        (w.parent as? ViewGroup)?.removeView(w)
        w.stopLoading()
        w.webChromeClient = null
        w.destroy()
    }

    /** Keeps content clear of the status bar, navigation bar and keyboard on edge-to-edge windows. */
    fun applyInsets(root: View, top: View = root) {
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            if (top === root) v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            else {
                v.setPadding(bars.left, 0, bars.right, maxOf(bars.bottom, ime.bottom))
                top.setPadding(top.paddingLeft, bars.top + top.context.dp(4), top.paddingRight, top.paddingBottom)
            }
            WindowInsetsCompat.CONSUMED
        }
    }
}

object Voice {
    /** Starts Google's speech recogniser, or explains that it is missing. */
    fun listen(a: Activity, launcher: ActivityResultLauncher<Intent>) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (a.isArabic()) "ar-SA" else "en-US")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, a.getString(R.string.voice_prompt))
        try {
            launcher.launch(intent)
        } catch (_: ActivityNotFoundException) {
            unavailable(a)
        }
    }

    fun result(r: ActivityResult): String? =
        if (r.resultCode != Activity.RESULT_OK) null
        else r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.takeIf { it.isNotBlank() }

    private fun unavailable(a: Activity) {
        val store = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.googlequicksearchbox"))
        val builder = MaterialAlertDialogBuilder(a)
            .setTitle(R.string.voice_unavailable_title)
            .setMessage(R.string.voice_unavailable)
            .setNegativeButton(R.string.close, null)
        // Offer the install only where a store can actually open it.
        if (store.resolveActivity(a.packageManager) != null) {
            builder.setPositiveButton(R.string.install_service) { _, _ ->
                try { a.startActivity(store) } catch (_: Exception) {}
            }
        }
        builder.show()
    }
}

fun cookiesFor(url: String): String? = try {
    CookieManager.getInstance().getCookie(url)
} catch (_: Exception) {
    null
}

/**
 * Camera and microphone requests from a page. The user is asked per site, the answer can be remembered,
 * and Android's own permission is requested before anything is granted to the page.
 */
class SitePermissions(private val a: androidx.appcompat.app.AppCompatActivity) {
    private var pending: android.webkit.PermissionRequest? = null
    private var wanted: List<String> = emptyList()

    private val launcher = a.registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val req = pending
        pending = null
        if (req != null) {
            val granted = wanted.filter { result[android(it)] == true }
            if (granted.isEmpty()) req.deny() else req.grant(granted.toTypedArray())
        }
    }

    private fun android(resource: String) =
        if (resource == android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE) android.Manifest.permission.RECORD_AUDIO
        else android.Manifest.permission.CAMERA

    private fun remembered(origin: String, resource: String) =
        Prefs.sp.getStringSet("site_permissions", emptySet())!!.contains("$origin|$resource")

    private fun proceed(req: android.webkit.PermissionRequest, resources: List<String>) {
        pending?.deny()
        pending = req
        wanted = resources
        launcher.launch(resources.map { android(it) }.toTypedArray())
    }

    fun ask(req: android.webkit.PermissionRequest) {
        val resources = req.resources.filter {
            it == android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE || it == android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE
        }
        val origin = Vault.origin(req.origin.toString())
        // Only secure pages may use the camera or microphone.
        if (resources.isEmpty() || origin == null || a.isFinishing) {
            req.deny()
            return
        }
        if (resources.all { remembered(origin, it) }) {
            proceed(req, resources)
            return
        }
        val names = resources.joinToString(if (a.isArabic()) "، " else ", ") {
            a.getString(if (it == android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE) R.string.perm_mic else R.string.perm_camera)
        }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(a)
            .setMessage(a.getString(R.string.perm_request, Vault.host(origin), names))
            .setPositiveButton(R.string.allow) { _, _ -> proceed(req, resources) }
            .setNeutralButton(R.string.always_allow) { _, _ ->
                val all = HashSet(Prefs.sp.getStringSet("site_permissions", emptySet())!!)
                for (r in resources) all.add("$origin|$r")
                Prefs.sp.edit().putStringSet("site_permissions", all).apply()
                proceed(req, resources)
            }
            .setNegativeButton(R.string.deny) { _, _ -> req.deny() }
            .setOnCancelListener { req.deny() }
            .show()
    }
}
