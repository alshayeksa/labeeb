package ai.alshaye.labeeb

import android.content.Context
import android.icu.text.SimpleDateFormat
import android.icu.util.Calendar
import android.icu.util.GregorianCalendar
import android.icu.util.ULocale

/**
 * The Arabic web fixer: many sites show Arabic in a fallback font and lay it out left to right.
 * This gives such text Labeeb's typeface and its natural direction, and leaves well-made pages alone.
 */
object ArabicFixer {
    @Volatile
    private var cached: String? = null

    private fun base64(c: Context, res: Int) =
        android.util.Base64.encodeToString(c.resources.openRawResource(res).use { it.readBytes() }, android.util.Base64.NO_WRAP)

    /**
     * The script carries the typeface inside it and registers it from memory. A font fetched by address
     * would be refused by any site whose security policy lists its allowed font sources.
     */
    fun script(c: Context): String = cached ?: TEMPLATE
        .replace("__REGULAR__", base64(c, R.font.tajawal_regular))
        .replace("__BOLD__", base64(c, R.font.tajawal_bold))
        .also { cached = it }

    /**
     * Only elements that actually hold Arabic text are touched, so icons and Latin text keep the site's fonts.
     * A font is replaced only when the site fell back to a generic one; a direction is set only when the page gave none.
     */
    private val TEMPLATE = """
(function(){
  if (window.__labeebArabic || !document.body) return;
  window.__labeebArabic = true;
  var AR = /[؀-ۿ]/;
  var GENERIC = /^(arial|tahoma|times new roman|times|helvetica|helvetica neue|verdana|georgia|courier new|sans-serif|serif|system-ui|-apple-system|blinkmacsystemfont|roboto|segoe ui|trebuchet ms|simplified arabic|traditional arabic|arabic typesetting|geeza pro|droid arabic naskh|noto naskh arabic)$/i;
  var RANGE = 'U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF';
  function register(data, weight) {
    var bin = atob(data), n = bin.length, bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    document.fonts.add(new FontFace('LabeebArabic', bytes.buffer, {weight: weight, unicodeRange: RANGE}));
  }
  try { register('__REGULAR__', '400'); register('__BOLD__', '700'); } catch (e) { return; }
  var seen = new WeakSet(), budget = 6000;
  var pageHasDirection = !!document.documentElement.getAttribute('dir') || !!document.body.getAttribute('dir');
  function blockOf(el) {
    while (el && el !== document.body) {
      var d = getComputedStyle(el).display;
      if (d === 'block' || d === 'list-item' || d === 'table-cell' || d === 'flex') return el;
      el = el.parentElement;
    }
    return null;
  }
  function fix(el) {
    if (seen.has(el) || budget <= 0) return;
    seen.add(el); budget--;
    var cs = getComputedStyle(el);
    var first = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (GENERIC.test(first)) el.style.setProperty('font-family', 'LabeebArabic, ' + cs.fontFamily);
    if (!pageHasDirection && cs.direction === 'ltr' && !el.closest('[dir]')) {
      var b = blockOf(el);
      if (b && !b.hasAttribute('dir')) b.setAttribute('dir', 'auto');
    }
  }
  function scan() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node, count = 0;
    while ((node = walker.nextNode()) && count++ < 20000) {
      if (!AR.test(node.nodeValue)) continue;
      var p = node.parentElement;
      if (p && !/^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(p.tagName)) fix(p);
    }
  }
  scan();
  var timer = null;
  new MutationObserver(function(){
    if (timer || budget <= 0) return;
    timer = setTimeout(function(){ timer = null; scan(); }, 900);
  }).observe(document.body, {childList: true, subtree: true});
})()
""".trimIndent()
}

/** Text normalisation shared by Labeeb's memory, so a search finds a word whatever its spelling variant or article. */
object Arabic {
    private val marks = Regex("[ً-ٰٟـ]")
    private val splitter = Regex("[^\\p{L}\\p{N}]+")
    private val stop = setOf(
        "في", "من", "على", "الى", "عن", "هل", "ما", "ماذا", "اين", "وين", "متى", "كيف", "اللي", "التي", "الذي", "هذا", "هذه", "ذلك",
        "كان", "كانت", "عند", "مع", "او", "ثم", "قد", "لي", "انا", "عنه", "عنها", "قرات", "قراته", "مقال", "صفحه", "موقع",
        "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is", "was", "what", "where", "when", "how", "that",
        "this", "about", "i", "read", "article", "page", "site", "which", "with", "did",
    )

    /** Folds spelling variants and strips the article and its common attached prefixes. */
    fun word(raw: String): String {
        var w = raw.lowercase()
            .replace(marks, "")
            .replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ٱ', 'ا')
            .replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
        if (w.length >= 5 && (w.startsWith("وال") || w.startsWith("بال") || w.startsWith("كال") || w.startsWith("فال"))) w = w.substring(3)
        else if (w.length >= 4 && (w.startsWith("ال") || w.startsWith("لل"))) w = w.substring(2)
        return w
    }

    /** The text as space-separated normalised words: what the memory index stores. */
    fun normalize(text: String): String =
        text.split(splitter).asSequence().filter { it.isNotEmpty() }.map { word(it) }.joinToString(" ")

    /** The meaningful words of a question, normalised the same way as the index. */
    fun queryWords(question: String): List<String> =
        question.split(splitter).map { word(it) }.filter { it.length >= 2 && it !in stop }.distinct().take(12)
}

/** Adds the Hijri date beside Gregorian dates written out with a month name. */
object Hijri {
    private val ar = listOf("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")
    private val en = listOf("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december")
    private const val D = "[0-9٠-٩]"
    private val months = (ar + listOf("ابريل", "اغسطس", "اكتوبر") + en).joinToString("|")
    private val dayFirst = Regex("($D{1,2})\\s+($months)\\s+($D{4})", RegexOption.IGNORE_CASE)
    private val monthFirst = Regex("\\b(${en.joinToString("|")})\\s+($D{1,2}),?\\s+($D{4})", RegexOption.IGNORE_CASE)

    private fun number(s: String) = s.map { if (it in '٠'..'٩') '0' + (it - '٠') else it }.joinToString("").toInt()

    private fun month(name: String): Int {
        val n = name.lowercase().replace('ا', 'أ')
        val i = ar.indexOfFirst { it == n || it == name }
        return if (i >= 0) i else en.indexOf(name.lowercase())
    }

    private fun format(c: Context, day: Int, month: Int, year: Int): String? {
        if (month !in 0..11 || day !in 1..31 || year !in 1900..2100) return null
        return try {
            val locale = ULocale(if (c.isArabic()) "ar@calendar=islamic-umalqura" else "en@calendar=islamic-umalqura")
            val hijri = Calendar.getInstance(locale)
            hijri.timeInMillis = GregorianCalendar(year, month, day, 12, 0).timeInMillis
            SimpleDateFormat("d MMMM y", locale).format(hijri) + if (c.isArabic()) " هـ" else " AH"
        } catch (_: Exception) {
            null
        }
    }

    fun annotate(c: Context, text: String): String {
        var out = dayFirst.replace(text) { m ->
            val hijri = format(c, number(m.groupValues[1]), month(m.groupValues[2]), number(m.groupValues[3]))
            if (hijri == null) m.value else "${m.value} ($hijri)"
        }
        out = monthFirst.replace(out) { m ->
            val hijri = format(c, number(m.groupValues[2]), month(m.groupValues[1]), number(m.groupValues[3]))
            if (hijri == null) m.value else "${m.value} ($hijri)"
        }
        return out
    }
}
