package ai.alshaye.labeeb

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** The assistant panel. The conversation and the unsent draft survive closing the panel and restarting the app. */
class AssistantSheet(private val a: MainActivity) {

    companion object {
        private const val MAX_TURNS = 32
    }

    private val dialog = BottomSheetDialog(a)
    private val root: View = a.layoutInflater.inflate(R.layout.sheet_assistant, null)
    private val scroll: ScrollView = root.findViewById(R.id.aScroll)
    private val list: LinearLayout = root.findViewById(R.id.aMessages)
    private val empty: View = root.findViewById(R.id.aEmpty)
    private val input: EditText = root.findViewById(R.id.aInput)
    private val send: ImageButton = root.findViewById(R.id.aSend)
    private val messages = ArrayList<ChatMsg>()
    private var call: Ai.Call? = null
    private var tts: TextToSpeech? = null

    init {
        dialog.setContentView(root)
        dialog.behavior.skipCollapsed = true
        // The panel fills the screen and cannot be dragged: moving a finger over an answer scrolls the
        // answer, and only the close button or Back puts the panel away.
        dialog.behavior.isDraggable = false
        dialog.setOnShowListener {
            dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)?.let {
                it.layoutParams.height = ViewGroup.LayoutParams.MATCH_PARENT
                it.requestLayout()
            }
            dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
            Toasts.enter(dialog.findViewById(android.R.id.content))
        }
        dialog.setOnDismissListener {
            Toasts.leave(dialog.findViewById(android.R.id.content))
            Prefs.sp.edit().putString("chat_draft", input.text.toString()).apply()
        }

        root.findViewById<View>(R.id.aClose).setOnClickListener { dialog.dismiss() }
        root.findViewById<View>(R.id.aNew).setOnClickListener {
            call?.cancel()
            messages.clear()
            persist()
            render()
        }
        root.findViewById<View>(R.id.aMic).setOnClickListener { Voice.listen(a, a.voiceAssistant) }
        send.setOnClickListener {
            if (call != null) call?.cancel()
            else {
                val text = input.text.toString().trim()
                if (text.isNotEmpty()) ask(text, attachPage = false)
            }
        }

        val chips = root.findViewById<LinearLayout>(R.id.aChips)
        for ((label, prompt) in listOf(
            R.string.chip_summarize to R.string.prompt_summarize,
            R.string.chip_explain to R.string.prompt_explain,
            R.string.chip_translate to R.string.prompt_translate,
        )) {
            chips.addView(TextView(a).apply {
                setText(label)
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(ContextCompat.getColor(a, R.color.accent))
                setBackgroundResource(R.drawable.bg_chip)
                setPadding(a.dp(16), 0, a.dp(16), 0)
                isClickable = true
                isFocusable = true
                setOnClickListener { ask(a.getString(prompt), attachPage = true) }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, a.dp(44)).apply { marginEnd = a.dp(8) })
        }

        try {
            val saved = JSONArray(Prefs.sp.getString("chat", "[]"))
            for (i in 0 until saved.length()) {
                val o = saved.getJSONObject(i)
                messages.add(ChatMsg(o.getString("role"), o.getString("text")))
            }
        } catch (_: Exception) {
        }
        input.setText(Prefs.sp.getString("chat_draft", ""))
        render()
    }

    fun show() {
        dialog.show()
        scrollDown()
    }

    fun appendInput(text: String) {
        val now = input.text.toString()
        input.setText(if (now.isBlank()) text else "$now $text")
        input.setSelection(input.text.length)
    }

    fun destroy() {
        call?.cancel()
        tts?.shutdown()
        if (dialog.isShowing) dialog.dismiss()
    }

    private fun persist() {
        val arr = JSONArray()
        // The page text that was attached to a turn is not stored; only what the user saw.
        for (m in messages) arr.put(JSONObject().put("role", m.role).put("text", m.text))
        Prefs.sp.edit().putString("chat", arr.toString()).apply()
    }

    private fun ask(text: String, attachPage: Boolean) {
        if (call != null) return
        val provider = Prefs.provider
        val key = Secrets.get(a, Ai.providers.getValue(provider).keyName)
        if (key.isNullOrBlank()) {
            Sheets.message(a, R.drawable.ic_key, a.getString(R.string.need_key_title), a.getString(R.string.need_key),
                primary = a.getString(R.string.open_settings)) { a.startActivity(Intent(a, SettingsActivity::class.java)) }
            return
        }
        if (!attachPage) {
            start(provider, key, ChatMsg("user", text))
            input.setText("")
            return
        }
        a.pageText { page, url ->
            if (page == null) a.toast(R.string.no_page)
            else start(provider, key, ChatMsg("user", "$text\n(${a.getString(R.string.page_attached)})", "$text\n\n<page url=\"$url\">\n$page\n</page>"))
        }
    }

    private fun start(provider: String, key: String, question: ChatMsg) {
        messages.add(question)
        while (messages.size > MAX_TURNS) messages.removeAt(0)
        val history = ArrayList(messages)
        val answer = ChatMsg("assistant", "")
        messages.add(answer)
        render()
        val bubble = bubbleText(list.getChildAt(list.childCount - 1))
        bubble?.text = "…"
        send.setImageResource(R.drawable.ic_close)
        send.contentDescription = a.getString(R.string.stop)
        call = Ai.stream(provider, Prefs.model(provider), key, history, onDelta = { delta ->
            answer.text += delta
            bubble?.text = answer.text
            scrollDown()
        }, onEnd = { failure, code ->
            call = null
            send.setImageResource(R.drawable.ic_send)
            send.contentDescription = a.getString(R.string.send)
            if (failure != null && answer.text.isEmpty()) {
                messages.remove(answer)
                // The failed question goes back to the box so it can be sent again.
                if (question.api == null) {
                    messages.remove(question)
                    input.setText(question.text)
                }
            }
            persist()
            render()
            if (failure != null) a.toast(
                when (failure) {
                    Ai.Failure.KEY -> a.getString(R.string.ai_error_key)
                    Ai.Failure.NETWORK -> a.getString(R.string.ai_error_network)
                    Ai.Failure.HTTP -> a.getString(R.string.ai_error_http, code)
                    Ai.Failure.LIMIT -> a.getString(R.string.ai_error_limit)
                    Ai.Failure.GENERIC -> a.getString(R.string.ai_error_generic)
                }
            )
        })
    }

    private fun bubbleText(row: View?): TextView? = (row as? ViewGroup)?.findViewWithTag("text")

    private fun render() {
        while (list.childCount > 1) list.removeViewAt(1)
        empty.visibility = if (messages.isEmpty()) View.VISIBLE else View.GONE
        for (m in messages) list.addView(row(m))
        scrollDown()
    }

    private fun row(m: ChatMsg): View {
        val user = m.role == "user"
        val box = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(if (user) R.drawable.bg_bubble_user else R.drawable.bg_bubble_ai)
            setPadding(a.dp(16), a.dp(12), a.dp(16), a.dp(12))
        }
        box.addView(TextView(a).apply {
            tag = "text"
            text = m.text
            textSize = 15f
            setLineSpacing(0f, 1.45f)
            setTextColor(ContextCompat.getColor(a, R.color.text))
            setTextIsSelectable(true)
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        })
        if (!user && m.text.isNotEmpty()) {
            val actions = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
            fun action(label: Int, icon: Int, run: () -> Unit) {
                actions.addView(TextView(a).apply {
                    setText(label)
                    textSize = 14f
                    gravity = Gravity.CENTER
                    setTextColor(ContextCompat.getColor(a, R.color.muted))
                    setBackgroundResource(R.drawable.bg_btn_outline)
                    setPadding(a.dp(14), 0, a.dp(14), 0)
                    compoundDrawablePadding = a.dp(6)
                    val d = ContextCompat.getDrawable(a, icon)!!.mutate()
                    d.setTint(ContextCompat.getColor(a, R.color.muted))
                    d.setBounds(0, 0, a.dp(16), a.dp(16))
                    setCompoundDrawablesRelative(d, null, null, null)
                    isClickable = true
                    isFocusable = true
                    setOnClickListener { run() }
                }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, a.dp(44)).apply { marginEnd = a.dp(8) })
            }
            action(R.string.copy, R.drawable.ic_copy) {
                (a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("answer", m.text))
                a.toast(R.string.copied)
            }
            action(R.string.listen, R.drawable.ic_speaker) { speak(m.text) }
            box.addView(actions, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = a.dp(10) })
        }
        val holder = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            // The user's turns sit at the start edge, replies at the end edge.
            gravity = if (user) Gravity.START else Gravity.END
            setPadding(if (user) 0 else 0, a.dp(6), 0, a.dp(6))
        }
        // A reply takes the full width of the panel so long answers read comfortably; the user's turns stay short bubbles.
        val lp = LinearLayout.LayoutParams(if (user) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        if (user) lp.marginEnd = a.dp(48)
        holder.addView(box, lp)
        return holder
    }

    private fun scrollDown() = scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }

    private fun speak(text: String) {
        val arabic = text.any { it in '؀'..'ۿ' }
        val locale = if (arabic) Locale("ar") else Locale.ENGLISH
        fun go(engine: TextToSpeech) {
            if (engine.isSpeaking) {
                engine.stop()
                return
            }
            val available = engine.setLanguage(locale)
            if (available == TextToSpeech.LANG_MISSING_DATA || available == TextToSpeech.LANG_NOT_SUPPORTED) a.toast(R.string.tts_unavailable)
            else engine.speak(text.take(3900), TextToSpeech.QUEUE_FLUSH, null, "labeeb")
        }
        val ready = tts
        if (ready != null) go(ready)
        else {
            var engine: TextToSpeech? = null
            engine = TextToSpeech(a) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tts = engine
                    engine?.let { go(it) }
                } else a.toast(R.string.tts_unavailable)
            }
        }
    }
}
