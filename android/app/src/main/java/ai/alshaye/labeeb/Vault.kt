package ai.alshaye.labeeb

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import org.json.JSONObject

class Credential(val id: Long, val origin: String, val username: String)

/** A login the page reported, held until the site moves on from its sign-in page. */
class Offer(val origin: String, val pageUrl: String, val username: String, val password: String, val time: Long)

/**
 * Labeeb's password vault. Passwords are sealed with a key held in the Android Keystore and never leave the device.
 * Pages can only propose a login to save; nothing here hands a stored secret back to a page except a fill the
 * user asked for and confirmed with their fingerprint or screen lock.
 */
object Vault {
    /** The origin a credential belongs to. Only HTTPS pages take part. */
    fun origin(url: String?): String? {
        val uri = try {
            Uri.parse(url)
        } catch (_: Exception) {
            return null
        }
        if (uri.scheme != "https" || uri.host.isNullOrEmpty()) return null
        return "https://" + uri.host + (if (uri.port > 0 && uri.port != 443) ":" + uri.port else "")
    }

    fun host(origin: String) = origin.removePrefix("https://").removePrefix("www.")

    /**
     * Reports the filled-in login when the user submits it. The page only posts a message; whether to keep it
     * is decided natively, from the address the browser itself knows.
     */
    const val CAPTURE = "(function(){if(window.__labeebLogin||typeof LabeebVault==='undefined')return;window.__labeebLogin=true;" +
        "function find(root){var a=(root||document).querySelectorAll('input'),p=null,u=null;" +
        "for(var i=0;i<a.length;i++){if(a[i].type==='password'&&a[i].value){p=a[i];break}}if(!p)return null;" +
        "for(var j=0;j<a.length;j++){var e=a[j];if(e===p)break;var t=(e.type||'text').toLowerCase();" +
        "if((t==='text'||t==='email'||t==='tel')&&e.value)u=e}return{u:u?u.value:'',p:p.value}}" +
        "function offer(form){try{var c=find(form)||find(null);if(c&&c.p.length<=256)" +
        "LabeebVault.postMessage(JSON.stringify({u:c.u.slice(0,256),p:c.p}))}catch(e){}}" +
        "document.addEventListener('submit',function(e){offer(e.target)},true);" +
        "document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('button,input[type=submit],[role=button]');" +
        "if(b)offer(b.form||b.closest('form'))},true);" +
        "document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target&&e.target.tagName==='INPUT')offer(e.target.form)},true)})()"

    const val HAS_LOGIN = "!!document.querySelector('input[type=password]')"

    /** Fills the visible login form. It sets values the way typing does, so the site's own code notices, and never submits. */
    fun fillScript(username: String, password: String) = "(function(u,p){var pw=document.querySelector('input[type=password]');if(!pw)return false;" +
        "var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');" +
        "function set(e,v){d.set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}" +
        "var a=(pw.form||document).querySelectorAll('input'),user=null;" +
        "for(var i=0;i<a.length;i++){var e=a[i];if(e===pw)break;var t=(e.type||'text').toLowerCase();if(t==='text'||t==='email'||t==='tel')user=e}" +
        "if(user&&u)set(user,u);set(pw,p);return true})(" + JSONObject.quote(username) + "," + JSONObject.quote(password) + ")"

    fun list(c: Context, origin: String? = null) = Store.get(c).credentials(origin)

    fun password(c: Context, id: Long): String? = Store.get(c).credentialSecret(id)?.let { Secrets.unseal(it) }

    /** Saves a login, replacing the password when this site and username are already stored. */
    fun save(c: Context, origin: String, username: String, password: String) =
        Store.get(c).saveCredential(origin, username, Secrets.seal(password))

    fun delete(c: Context, id: Long) = Store.get(c).deleteCredential(id)

    /**
     * Asks for the fingerprint or screen lock before a stored password is used or shown.
     * A device with no screen lock has nothing to verify against, so it proceeds directly.
     */
    fun verify(a: AppCompatActivity, done: () -> Unit) {
        val allowed = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        val usable = if (Build.VERSION.SDK_INT >= 30) BiometricManager.from(a).canAuthenticate(allowed)
        else BiometricManager.from(a).canAuthenticate()
        val locked = (a.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager).isDeviceSecure
        if (usable != BiometricManager.BIOMETRIC_SUCCESS && !locked) {
            done()
            return
        }
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(a.getString(R.string.verify_title))
            .setSubtitle(a.getString(R.string.verify_sub))
        if (Build.VERSION.SDK_INT >= 30) info.setAllowedAuthenticators(allowed)
        else @Suppress("DEPRECATION") info.setDeviceCredentialAllowed(true)
        BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done()
        }).authenticate(info.build())
    }
}

/** Saved passwords: who they are for, with reveal, copy and delete behind the screen lock. */
class PasswordsActivity : ListScreen() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title(getString(R.string.passwords))
        render()
    }

    private fun render() {
        list.removeAllViews()
        val all = Vault.list(this)
        if (all.isEmpty()) {
            showEmpty(true, R.drawable.ic_key, R.string.empty_passwords)
            return
        }
        showEmpty(false)
        val g = group(16)
        for (cred in all) {
            val host = Vault.host(cred.origin)
            val more = ImageButton(this).apply {
                setImageResource(R.drawable.ic_more)
                setColorFilter(color(R.color.muted))
                background = null
                contentDescription = getString(R.string.more_options)
                layoutParams = LinearLayout.LayoutParams(dp(44), dp(44))
                setOnClickListener { anchor -> menu(anchor, cred) }
            }
            item(g, letterTile(host), host, cred.username.ifEmpty { getString(R.string.no_username) }, ltrSub = true, trailing = more) { reveal(cred) }
        }
        section(getString(R.string.passwords_note))
    }

    private fun menu(anchor: android.view.View, cred: Credential) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, 1, 0, R.string.show_password)
        popup.menu.add(0, 2, 1, R.string.copy_password)
        popup.menu.add(0, 3, 2, R.string.delete)
        popup.setOnMenuItemClickListener {
            when (it.itemId) {
                1 -> reveal(cred)
                2 -> Vault.verify(this) { Vault.password(this, cred.id)?.let { secret -> copy(secret) } }
                3 -> Vault.verify(this) {
                    Vault.delete(this, cred.id)
                    render()
                }
            }
            true
        }
        popup.show()
    }

    private fun copy(secret: String) {
        val clip = ClipData.newPlainText("password", secret)
        // Keeps the password out of the clipboard preview and keyboard suggestions on Android 13 and later.
        if (Build.VERSION.SDK_INT >= 33) clip.description.extras = android.os.PersistableBundle().apply {
            putBoolean(android.content.ClipDescription.EXTRA_IS_SENSITIVE, true)
        }
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(clip)
        toast(R.string.copied)
    }

    private fun reveal(cred: Credential) = Vault.verify(this) {
        val secret = Vault.password(this, cred.id) ?: return@verify
        Sheets.message(this, R.drawable.ic_key, getString(R.string.saved_password), primary = getString(R.string.copy_password),
            secondary = getString(R.string.close), extra = Sheets.account(this, Vault.host(cred.origin), cred.username, secret)) { copy(secret) }
    }
}
