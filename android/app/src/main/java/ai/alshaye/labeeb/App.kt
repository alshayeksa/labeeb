package ai.alshaye.labeeb

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.util.TypedValue
import android.widget.Toast
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.res.ResourcesCompat
import java.net.URLEncoder
import java.text.NumberFormat

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
        AppCompatDelegate.setDefaultNightMode(Prefs.nightMode())
    }
}

object Prefs {
    lateinit var sp: SharedPreferences
        private set

    fun init(c: Context) {
        sp = c.getSharedPreferences("labeeb", Context.MODE_PRIVATE)
    }

    var theme: String
        get() = sp.getString("theme", "dark")!!
        set(v) = sp.edit().putString("theme", v).apply()

    fun nightMode() = when (theme) {
        "light" -> AppCompatDelegate.MODE_NIGHT_NO
        "system" -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        else -> AppCompatDelegate.MODE_NIGHT_YES
    }

    val engines = linkedMapOf(
        "google" to ("Google" to "https://www.google.com/search?q="),
        "bing" to ("Bing" to "https://www.bing.com/search?q="),
        "duckduckgo" to ("DuckDuckGo" to "https://duckduckgo.com/?q="),
    )

    var engine: String
        get() = sp.getString("engine", "google")!!.takeIf { it in engines } ?: "google"
        set(v) = sp.edit().putString("engine", v).apply()

    var provider: String
        get() = sp.getString("ai_provider", "openai")!!.takeIf { it in Ai.providers } ?: "openai"
        set(v) = sp.edit().putString("ai_provider", v).apply()

    var fixArabic: Boolean
        get() = sp.getBoolean("fix_arabic", true)
        set(v) = sp.edit().putBoolean("fix_arabic", v).apply()

    var hijri: Boolean
        get() = sp.getBoolean("hijri", true)
        set(v) = sp.edit().putBoolean("hijri", v).apply()

    var memory: Boolean
        get() = sp.getBoolean("memory", true)
        set(v) = sp.edit().putBoolean("memory", v).apply()

    var offerSave: Boolean
        get() = sp.getBoolean("offer_save_passwords", true)
        set(v) = sp.edit().putBoolean("offer_save_passwords", v).apply()

    fun model(provider: String): String =
        sp.getString("ai_model_$provider", null)?.takeIf { it.isNotBlank() } ?: Ai.providers.getValue(provider).model

    fun setModel(provider: String, model: String) = sp.edit().putString("ai_model_$provider", model.trim()).apply()
}

object Urls {
    const val HOME = ""

    /** Turns what the user typed into a URL to load: an address when it looks like one, otherwise a search. */
    fun resolve(input: String): String {
        val text = input.trim()
        if (text.isEmpty()) return HOME
        if (Regex("^https?://\\S+$", RegexOption.IGNORE_CASE).matches(text)) return text
        val looksLikeHost = !text.contains(' ') && !text.contains("://") &&
            (Regex("^[^/\\s]+\\.[^/\\s.]{2,}(/\\S*)?$").matches(text) || text.startsWith("localhost"))
        if (looksLikeHost) return "https://$text"
        return Prefs.engines.getValue(Prefs.engine).second + URLEncoder.encode(text, "UTF-8")
    }

    fun isWeb(url: String?) = url != null && (url.startsWith("http://") || url.startsWith("https://"))

    fun host(url: String?): String = try {
        Uri.parse(url).host?.removePrefix("www.") ?: ""
    } catch (_: Exception) {
        ""
    }
}

fun Context.dp(v: Float): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()
fun Context.dp(v: Int): Int = dp(v.toFloat())
fun Context.toast(text: CharSequence) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
fun Context.toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_SHORT).show()
fun Context.num(n: Int): String = NumberFormat.getIntegerInstance(resources.configuration.locales[0]).format(n)
fun Context.isArabic(): Boolean = resources.configuration.locales[0].language == "ar"

object Icons {
    private val palette = intArrayOf(0xFF5CDBC1.toInt(), 0xFF7FB6FF.toInt(), 0xFFF2B872.toInt())
    private val onPalette = intArrayOf(0xFF06241E.toInt(), 0xFF0A2440.toInt(), 0xFF3A2406.toInt())

    private fun index(seed: String) = Math.floorMod(seed.hashCode(), palette.size)
    fun color(seed: String) = palette[index(seed)]

    /** A rounded-square icon carrying the first letter of [name]; used when a site has no icon of its own. */
    fun letter(c: Context, name: String, sizePx: Int, bg: Int? = null): Bitmap {
        val i = index(name)
        val back = bg ?: palette[i]
        val fore = if (bg == null) onPalette[i] else if (isLight(back)) 0xFF10202B.toInt() else Color.WHITE
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = back
        val r = sizePx * 0.27f
        canvas.drawRoundRect(RectF(0f, 0f, sizePx.toFloat(), sizePx.toFloat()), r, r, p)
        p.color = fore
        p.textSize = sizePx * 0.46f
        p.textAlign = Paint.Align.CENTER
        p.typeface = ResourcesCompat.getFont(c, R.font.tajawal_bold)
        val ch = name.trim().firstOrNull { it.isLetterOrDigit() }?.toString()?.uppercase() ?: "•"
        val fm = p.fontMetrics
        canvas.drawText(ch, sizePx / 2f, sizePx / 2f - (fm.ascent + fm.descent) / 2f, p)
        return bmp
    }

    fun isLight(color: Int): Boolean =
        (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) > 160

    /** A full-bleed launcher icon: the launcher masks it to its own shape, so the artwork sits in the safe centre. */
    fun adaptive(c: Context, src: Bitmap?, name: String): Bitmap {
        val size = 432
        val inner = 250
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val corner = src?.getPixel(1, 1)
        canvas.drawColor(if (src == null) color(name) else if (corner != null && Color.alpha(corner) == 255) corner else Color.WHITE)
        val art = src ?: letter(c, name, inner)
        val at = (size - inner) / 2f
        canvas.drawBitmap(art, null, RectF(at, at, at + inner, at + inner), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        return bmp
    }

    /** Fits [src] into a rounded square so home-screen icons share one shape. */
    fun rounded(src: Bitmap, sizePx: Int): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val rect = RectF(0f, 0f, sizePx.toFloat(), sizePx.toFloat())
        val r = sizePx * 0.22f
        p.color = Color.WHITE
        canvas.drawRoundRect(rect, r, r, p)
        p.xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN)
        canvas.drawBitmap(src, null, rect, p)
        return bmp
    }
}
