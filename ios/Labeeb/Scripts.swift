import Foundation

/// JavaScript that Labeeb runs inside pages. Pages never receive anything from these scripts except
/// a password fill the user asked for; everything else only reads the page or restyles it.
enum Scripts {
    private static func fontData(_ name: String) -> String {
        guard let url = Bundle.main.url(forResource: name, withExtension: "ttf"), let data = try? Data(contentsOf: url) else { return "" }
        return data.base64EncodedString()
    }

    /// The Arabic web fixer. The typeface travels inside the script and is registered from memory, because a
    /// font fetched by address is refused by any site whose security policy lists its allowed font sources.
    /// Only elements that hold Arabic text are touched, a font is replaced only when the site fell back to a
    /// generic one, and a direction is set only when the page gave none.
    static let fixer: String = #"""
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
    """#
        .replacingOccurrences(of: "__REGULAR__", with: fontData("Tajawal-Regular"))
        .replacingOccurrences(of: "__BOLD__", with: fontData("Tajawal-Bold"))

    /// Reports the filled-in login when the user submits it. Whether to keep it is decided natively,
    /// from the address the browser itself knows.
    static let capture = #"""
    (function(){
      if (window.__labeebLogin) return;
      window.__labeebLogin = true;
      function find(root) {
        var a = (root || document).querySelectorAll('input'), p = null, u = null;
        for (var i = 0; i < a.length; i++) { if (a[i].type === 'password' && a[i].value) { p = a[i]; break; } }
        if (!p) return null;
        for (var j = 0; j < a.length; j++) {
          var e = a[j]; if (e === p) break;
          var t = (e.type || 'text').toLowerCase();
          if ((t === 'text' || t === 'email' || t === 'tel') && e.value) u = e;
        }
        return {u: u ? u.value : '', p: p.value};
      }
      function offer(form) {
        try {
          var c = find(form) || find(null);
          if (c && c.p.length <= 256) window.webkit.messageHandlers.labeebVault.postMessage(JSON.stringify({u: c.u.slice(0, 256), p: c.p}));
        } catch (e) {}
      }
      document.addEventListener('submit', function(e){ offer(e.target); }, true);
      document.addEventListener('click', function(e){
        var b = e.target && e.target.closest && e.target.closest('button,input[type=submit],[role=button]');
        if (b) offer(b.form || b.closest('form'));
      }, true);
      document.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') offer(e.target.form);
      }, true);
    })()
    """#

    static let hasLogin = "!!document.querySelector('input[type=password]')"

    /// Fills the visible login form. It sets values the way typing does, so the site's own code notices, and never submits.
    static func fill(username: String, password: String) -> String {
        let args = (try? JSONSerialization.data(withJSONObject: [username, password])).flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\",\"\"]"
        return #"""
        (function(v){
          var u = v[0], p = v[1], pw = document.querySelector('input[type=password]');
          if (!pw) return false;
          var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          function set(e, x) { d.set.call(e, x); e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }
          var a = (pw.form || document).querySelectorAll('input'), user = null;
          for (var i = 0; i < a.length; i++) {
            var e = a[i]; if (e === pw) break;
            var t = (e.type || 'text').toLowerCase();
            if (t === 'text' || t === 'email' || t === 'tel') user = e;
          }
          if (user && u) set(user, u);
          set(pw, p);
          return true;
        })(
        """# + args + ")"
    }

    static let pageText = "(function(){return document.body ? document.body.innerText.slice(0, 12000) : ''})()"

    /// For Labeeb's memory. Sign-in pages return nothing.
    static let memory = "(function(){if(!document.body||document.querySelector('input[type=password]'))return '';return JSON.stringify({title:document.title,text:document.body.innerText.slice(0,12000)})})()"

    static let siteProbe = #"""
    (function(){
      function q(s){ return document.querySelector(s); }
      var t = q('meta[name="theme-color"]'), i = q('link[rel~="apple-touch-icon"]') || q('link[rel~="icon"]');
      return JSON.stringify({color: t ? t.content : '', icon: i ? i.href : '', title: document.title});
    })()
    """#

    /// Reading mode: picks the element holding the most paragraph text, then lists its headings, paragraphs,
    /// list items and quotes in order. Navigation, references and other page furniture are skipped.
    static let reader = #"""
    (function(){ try {
      function vis(e){ var s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; }
      function score(e){ var n = 0, ps = e.querySelectorAll('p'); for (var i = 0; i < ps.length; i++) { var l = ps[i].innerText.trim().length; if (l > 60) n += l; } return n; }
      var bad = 'nav,aside,footer,header,form,table,figcaption,[role=navigation],[role=complementary],[aria-hidden=true],.navbox,.reflist,.references,.toc,.mw-editsection,.infobox,.hatnote,.share,.social,.related,.comments,.advert';
      var root = null, best = 0, c = document.querySelectorAll('article,[role=main],main,[itemprop=articleBody],.post-content,.entry-content,.article-body,#mw-content-text,#content');
      for (var i = 0; i < c.length; i++) { var sc = score(c[i]); if (sc > best) { best = sc; root = c[i]; } }
      if (best < 600) {
        var m = new Map(), ps = document.querySelectorAll('p');
        for (var i = 0; i < ps.length; i++) { var l = ps[i].innerText.trim().length; if (l < 60) continue; var p = ps[i].parentElement; m.set(p, (m.get(p) || 0) + l); }
        m.forEach(function(v, k){ if (v > best) { best = v; root = k; } });
      }
      if (!root) return JSON.stringify({blocks: [], chars: 0});
      var out = [], total = 0, els = root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre');
      for (var i = 0; i < els.length && out.length < 1500 && total < 200000; i++) {
        var e = els[i];
        if (e.closest(bad) || !vis(e)) continue;
        var tag = e.tagName.toLowerCase();
        if ((tag === 'li' || tag === 'blockquote') && e.querySelector('p,li')) continue;
        var t = e.innerText.replace(/\[\d+\]/g, '').replace(/[ \t]+/g, ' ').trim();
        if (t.length < 2) continue;
        out.push({k: tag[0] === 'h' ? 'h' : tag === 'li' ? 'l' : tag === 'blockquote' ? 'q' : tag === 'pre' ? 'c' : 'p', t: t.slice(0, 6000)});
        total += t.length;
      }
      var h = document.querySelector('h1');
      return JSON.stringify({title: (h && h.innerText.trim()) || document.title, site: location.hostname.replace(/^www\./, ''), chars: total, blocks: out});
    } catch (e) { return JSON.stringify({error: String(e), chars: 0, blocks: []}); } })()
    """#
}
