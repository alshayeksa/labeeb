package ai.alshaye.labeeb

import android.app.Activity
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.NestedScrollView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import java.lang.ref.WeakReference

/**
 * Every message Labeeb raises is this one sheet: it rises from the bottom with its content centred, an
 * icon that says what kind of message it is, the main action first and the way out beneath it. System
 * dialogs are not used; they look like another app's.
 */
object Sheets {
    class Row(val label: CharSequence, val icon: Int = 0, val letter: String? = null)

    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    private fun rounded(c: Context, colorRes: Int, radius: Int) = GradientDrawable().apply {
        cornerRadius = c.dp(radius).toFloat()
        setColor(ContextCompat.getColor(c, colorRes))
    }

    private fun button(c: Context, label: CharSequence, back: Int, fore: Int, run: () -> Unit) = TextView(c).apply {
        text = label
        textSize = 16f
        typeface = Typeface.create(typeface, Typeface.BOLD)
        gravity = Gravity.CENTER
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setTextColor(ContextCompat.getColor(c, fore))
        background = RippleDrawable(ColorStateList.valueOf(0x33808080), rounded(c, back, 16), rounded(c, back, 16))
        isClickable = true
        isFocusable = true
        setOnClickListener { run() }
    }

    /**
     * [primary] is the main action; without one the sheet only informs and carries a single button.
     * [onDismiss] runs when the sheet goes away without an action having been chosen.
     */
    fun message(
        c: Context, icon: Int, title: CharSequence, message: CharSequence? = null, danger: Boolean = false,
        primary: CharSequence? = null, secondary: CharSequence? = null, extra: View? = null, focus: View? = null,
        other: CharSequence? = null, onOther: (() -> Unit)? = null, quiet: Boolean = false,
        onDismiss: (() -> Unit)? = null, action: () -> Unit = {},
    ): BottomSheetDialog {
        val dialog = BottomSheetDialog(c)
        var chosen = false
        val column = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(c.dp(24), c.dp(10), c.dp(24), c.dp(16))
        }
        column.addView(View(c).apply { setBackgroundResource(R.drawable.bg_handle) }, LinearLayout.LayoutParams(c.dp(40), c.dp(4)))
        column.addView(ImageView(c).apply {
            setImageResource(icon)
            scaleType = ImageView.ScaleType.CENTER
            setColorFilter(ContextCompat.getColor(c, if (danger) R.color.danger else R.color.accent))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(ContextCompat.getColor(c, if (danger) R.color.danger_soft else R.color.accent_soft))
            }
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, LinearLayout.LayoutParams(c.dp(60), c.dp(60)).apply { topMargin = c.dp(20) })
        column.addView(TextView(c).apply {
            text = title
            textSize = 19f
            typeface = Typeface.create(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.25f)
            setTextColor(ContextCompat.getColor(c, R.color.text))
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = c.dp(16) })
        if (!message.isNullOrEmpty()) column.addView(TextView(c).apply {
            text = message
            textSize = 14.5f
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.45f)
            setTextColor(ContextCompat.getColor(c, R.color.muted))
        }, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = c.dp(8) })
        if (extra != null) column.addView(extra, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = c.dp(18) })

        fun add(view: View, top: Int) = column.addView(view, LinearLayout.LayoutParams(MATCH, c.dp(52)).apply { topMargin = c.dp(top) })
        val strong = if (danger) R.color.danger else R.color.accent
        val onStrong = if (danger) R.color.on_danger else R.color.on_accent
        if (primary != null) {
            add(button(c, primary, strong, onStrong) {
                chosen = true
                action()
                dialog.dismiss()
            }, 24)
            if (other != null) add(button(c, other, R.color.surface, R.color.text) {
                chosen = true
                onOther?.invoke()
                dialog.dismiss()
            }, 10)
            add(button(c, secondary ?: c.getString(R.string.cancel), R.color.surface, R.color.text) { dialog.dismiss() }, 10)
        } else {
            val label = secondary ?: c.getString(R.string.ok)
            add(if (quiet) button(c, label, R.color.surface, R.color.text) { dialog.dismiss() }
            else button(c, label, strong, onStrong) { dialog.dismiss() }, if (quiet) 10 else 24)
        }

        val scroll = NestedScrollView(c).apply {
            setBackgroundResource(R.drawable.bg_sheet)
            addView(column, ViewGroup.LayoutParams(MATCH, WRAP))
        }
        dialog.setContentView(scroll)
        dialog.behavior.skipCollapsed = true
        dialog.behavior.state = BottomSheetBehavior.STATE_EXPANDED
        dialog.setOnShowListener {
            Toasts.enter(dialog.findViewById(android.R.id.content))
            if (focus != null) {
                focus.requestFocus()
                focus.post { (c.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(focus, InputMethodManager.SHOW_IMPLICIT) }
            }
        }
        dialog.setOnDismissListener {
            Toasts.leave(dialog.findViewById(android.R.id.content))
            if (!chosen) onDismiss?.invoke()
        }
        dialog.show()
        return dialog
    }

    /** A question before something that cannot be undone. */
    fun confirm(c: Context, title: CharSequence, message: CharSequence?, confirm: CharSequence, icon: Int = R.drawable.ic_trash, action: () -> Unit) =
        message(c, icon, title, message, danger = true, primary = confirm, action = action)

    /** Something the user is told and only has to acknowledge. */
    fun notice(c: Context, title: CharSequence, message: CharSequence?, icon: Int = R.drawable.ic_info, button: CharSequence? = null) =
        message(c, icon, title, message, secondary = button)

    /** A short list to pick one row from; [selected] marks the current choice. */
    fun list(c: Context, icon: Int, title: CharSequence, message: CharSequence? = null, rows: List<Row>, selected: Int = -1, pick: (Int) -> Unit) {
        val group = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(c, R.color.surface, 16)
            clipToOutline = true
        }
        var dialog: BottomSheetDialog? = null
        rows.forEachIndexed { index, row ->
            val line = LinearLayout(c).apply {
                gravity = Gravity.CENTER_VERTICAL
                setPadding(c.dp(14), 0, c.dp(14), 0)
                isClickable = true
                isFocusable = true
                val ripple = android.util.TypedValue()
                c.theme.resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)
                setBackgroundResource(ripple.resourceId)
                setOnClickListener {
                    dialog?.dismiss()
                    pick(index)
                }
            }
            if (row.letter != null) line.addView(ImageView(c).apply { setImageBitmap(Icons.letter(c, row.letter, c.dp(34))) },
                LinearLayout.LayoutParams(c.dp(34), c.dp(34)).apply { marginEnd = c.dp(12) })
            else if (row.icon != 0) line.addView(ImageView(c).apply {
                setImageResource(row.icon)
                setColorFilter(ContextCompat.getColor(c, R.color.accent))
            }, LinearLayout.LayoutParams(c.dp(22), c.dp(22)).apply { marginEnd = c.dp(14) })
            line.addView(TextView(c).apply {
                text = row.label
                textSize = 15.5f
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.MIDDLE
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                setTextColor(ContextCompat.getColor(c, if (index == selected) R.color.accent else R.color.text))
                if (index == selected) typeface = Typeface.create(typeface, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, WRAP, 1f))
            if (index == selected) line.addView(TextView(c).apply {
                text = "✓"
                textSize = 17f
                setTextColor(ContextCompat.getColor(c, R.color.accent))
                contentDescription = c.getString(R.string.on)
            })
            group.addView(line, LinearLayout.LayoutParams(MATCH, c.dp(56)))
            if (index < rows.size - 1) group.addView(View(c).apply { setBackgroundColor(ContextCompat.getColor(c, R.color.hairline)) },
                LinearLayout.LayoutParams(MATCH, c.dp(1)))
        }
        dialog = message(c, icon, title, message, extra = group, secondary = c.getString(R.string.cancel), quiet = true)
    }

    /** A text field as it appears inside a message sheet. */
    fun field(c: Context, hint: CharSequence?, value: String = "", address: Boolean = false, secret: Boolean = false) = EditText(c).apply {
        setText(value)
        this.hint = hint
        isSingleLine = true
        textSize = 15.5f
        background = rounded(c, R.color.surface, 14)
        setPadding(c.dp(14), 0, c.dp(14), 0)
        minimumHeight = c.dp(50)
        setTextColor(ContextCompat.getColor(c, R.color.text))
        setHintTextColor(ContextCompat.getColor(c, R.color.muted))
        textAlignment = View.TEXT_ALIGNMENT_VIEW_START
        if (address || secret) textDirection = View.TEXT_DIRECTION_LTR
        inputType = InputType.TYPE_CLASS_TEXT or when {
            secret -> InputType.TYPE_TEXT_VARIATION_PASSWORD
            address -> InputType.TYPE_TEXT_VARIATION_URI
            else -> InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        // The typeface is set after the input type, which would otherwise swap in a monospace face for passwords.
        typeface = androidx.core.content.res.ResourcesCompat.getFont(c, R.font.tajawal_regular)
        setSelection(text.length)
    }

    /** Several fields stacked with the spacing a sheet uses. */
    fun stack(c: Context, vararg views: View) = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        views.forEachIndexed { index, view ->
            addView(view, LinearLayout.LayoutParams(MATCH, WRAP).apply { if (index > 0) topMargin = c.dp(10) })
        }
    }

    /** A site and an account on it, as shown inside a message sheet. */
    fun account(c: Context, host: String, username: String, secret: String? = null): View {
        val card = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(c, R.color.surface, 16)
        }
        val row = LinearLayout(c).apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(c.dp(14), c.dp(14), c.dp(14), c.dp(14))
        }
        row.addView(ImageView(c).apply { setImageBitmap(Icons.letter(c, host, c.dp(38))) }, LinearLayout.LayoutParams(c.dp(38), c.dp(38)))
        val names = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        names.addView(TextView(c).apply {
            text = host
            textSize = 15f
            typeface = Typeface.create(typeface, Typeface.BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setTextColor(ContextCompat.getColor(c, R.color.text))
        })
        names.addView(TextView(c).apply {
            text = username.ifEmpty { c.getString(R.string.no_username) }
            textSize = 13.5f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.MIDDLE
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setTextColor(ContextCompat.getColor(c, R.color.muted))
        })
        row.addView(names, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = c.dp(12) })
        card.addView(row)
        if (secret != null) {
            card.addView(View(c).apply { setBackgroundColor(ContextCompat.getColor(c, R.color.hairline)) }, LinearLayout.LayoutParams(MATCH, c.dp(1)))
            card.addView(TextView(c).apply {
                text = secret
                textSize = 17f
                typeface = Typeface.MONOSPACE
                gravity = Gravity.CENTER
                textDirection = View.TEXT_DIRECTION_LTR
                setTextIsSelectable(true)
                setTextColor(ContextCompat.getColor(c, R.color.text))
                setPadding(c.dp(14), c.dp(14), c.dp(14), c.dp(14))
            })
        }
        return card
    }
}

/**
 * Labeeb's own short notices: a small card above the bottom bar, in the app's colours and typeface.
 * It is drawn inside whichever window is in front, so it is not hidden behind an open sheet.
 */
object Toasts {
    private val fronts = ArrayList<WeakReference<View>>()

    /** A sheet's window came to the front; notices are drawn in it until it leaves. */
    fun enter(content: View?) {
        if (content != null) fronts.add(WeakReference(content))
    }

    fun leave(content: View?) {
        fronts.removeAll { it.get() == null || it.get() === content }
    }

    fun show(c: Context, text: CharSequence) {
        val activity = c as? Activity
        fronts.removeAll { it.get() == null || it.get()?.isAttachedToWindow != true }
        val host = (fronts.lastOrNull()?.get() ?: activity?.takeUnless { it.isFinishing || it.isDestroyed }?.findViewById(android.R.id.content)) as? FrameLayout
        if (host == null) {
            Toast.makeText(c.applicationContext, text, Toast.LENGTH_SHORT).show()
            return
        }
        host.findViewWithTag<View>("labeeb-toast")?.let { host.removeView(it) }
        val card = LinearLayout(c).apply {
            tag = "labeeb-toast"
            gravity = Gravity.CENTER_VERTICAL
            setPadding(c.dp(16), c.dp(12), c.dp(18), c.dp(12))
            background = GradientDrawable().apply {
                cornerRadius = c.dp(18).toFloat()
                setColor(ContextCompat.getColor(c, R.color.panel))
                setStroke(c.dp(1), ContextCompat.getColor(c, R.color.line))
            }
            elevation = c.dp(10).toFloat()
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        card.addView(ImageView(c).apply {
            setImageResource(R.drawable.ic_info)
            setColorFilter(ContextCompat.getColor(c, R.color.accent))
        }, LinearLayout.LayoutParams(c.dp(18), c.dp(18)).apply { marginEnd = c.dp(10) })
        card.addView(TextView(c).apply {
            this.text = text
            textSize = 14f
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
            setLineSpacing(0f, 1.3f)
            setTextColor(ContextCompat.getColor(c, R.color.text))
        })
        val insets = ViewCompat.getRootWindowInsets(host)?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
        host.addView(card, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
            bottomMargin = (insets?.bottom ?: 0) + c.dp(104)
            marginStart = c.dp(24)
            marginEnd = c.dp(24)
        })
        host.announceForAccessibility(text)
        card.alpha = 0f
        card.translationY = c.dp(12).toFloat()
        card.animate().alpha(1f).translationY(0f).setDuration(160).start()
        card.postDelayed({
            card.animate().alpha(0f).setDuration(200).withEndAction { (card.parent as? ViewGroup)?.removeView(card) }.start()
        }, 2400)
    }

    private const val WRAP_CONTENT = ViewGroup.LayoutParams.WRAP_CONTENT
}
