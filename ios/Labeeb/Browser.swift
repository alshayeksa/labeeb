import SwiftUI
import WebKit

/// A login the page reported, held until the site moves on from its sign-in page.
struct Offer: Identifiable {
    let id = UUID()
    let origin: String
    let pageURL: String
    let username: String
    let password: String
    let time: Date
    var isUpdate = false
}

struct Article: Identifiable {
    struct Block: Identifiable {
        let id: Int
        let kind: String
        let text: String
    }
    let id = UUID()
    let title: String
    let site: String
    let chars: Int
    let blocks: [Block]
}

@Observable
final class Tab: Identifiable {
    let id = UUID()
    let isPrivate: Bool
    /// True while the tab shows Labeeb's home screen instead of a page.
    var home = true
    var url = ""
    var title = ""
    var progress = 0.0
    var loading = false
    var canGoBack = false
    var canGoForward = false
    var desktop = false
    var thumb: UIImage?
    /// Saved logins that can be filled into the page now showing.
    var fill: [Credential] = []
    @ObservationIgnored var webView: WKWebView?
    @ObservationIgnored var observers: [NSKeyValueObservation] = []
    @ObservationIgnored var offer: Offer?

    init(isPrivate: Bool) { self.isPrivate = isPrivate }

    var displayTitle: String { home ? t("home_tab") : (title.isEmpty ? Web.host(url) : title) }
}

/// The browser's state and its dealings with WebKit: tabs, navigation, downloads, and what pages may ask for.
@Observable
final class BrowserModel: NSObject {
    static let shared = BrowserModel()

    var tabs: [Tab] = []
    var current: Tab?
    /// The bar tucks away while reading down a page.
    var barHidden = false
    var toast: String?
    var pendingSave: Offer?
    var article: Article?
    var siteApp: SiteApp?
    /// Bumped when bookmarks, history or site apps change, so the home screen redraws.
    var libraryRevision = 0

    @ObservationIgnored private var privateStore: WKWebsiteDataStore?
    @ObservationIgnored private var downloadTargets: [ObjectIdentifier: URL] = [:]

    static var downloadsFolder: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private override init() {
        super.init()
        restoreSession()
    }

    // MARK: Tabs

    @discardableResult
    func newTab(private isPrivate: Bool) -> Tab {
        let tab = Tab(isPrivate: isPrivate)
        tabs.append(tab)
        return tab
    }

    func select(_ tab: Tab) {
        current = tab
        barHidden = false
        if !tab.home, tab.webView == nil, let url = URL(string: tab.url) {
            makeWebView(for: tab).load(URLRequest(url: url))
        }
    }

    func navigate(_ tab: Tab, to address: String) {
        if address.isEmpty {
            tab.home = true
        } else if let url = URL(string: address) {
            tab.home = false
            tab.url = address
            (tab.webView ?? makeWebView(for: tab)).load(URLRequest(url: url))
        }
        barHidden = false
    }

    func load(_ input: String, newTab inNewTab: Bool = false) {
        let tab: Tab
        if inNewTab || current == nil {
            tab = newTab(private: current?.isPrivate ?? false)
            current = tab
        } else {
            tab = current!
        }
        navigate(tab, to: Web.resolve(input))
    }

    /// Closing the last tab from the tabs screen really removes it; [ensureTab] opens a fresh one on leaving.
    func close(_ tab: Tab, allowEmpty: Bool = false) {
        guard let index = tabs.firstIndex(where: { $0 === tab }) else { return }
        tab.observers.forEach { $0.invalidate() }
        tab.observers = []
        tab.webView?.stopLoading()
        tab.webView?.removeFromSuperview()
        tab.webView = nil
        tabs.remove(at: index)
        // The private store goes with its last tab, and its cookies and storage with it.
        if tab.isPrivate, !tabs.contains(where: { $0.isPrivate }) { privateStore = nil }
        if tab === current {
            if let next = tabs.last(where: { $0.isPrivate == tab.isPrivate }) ?? tabs.last { select(next) }
            else if allowEmpty { current = nil }
            else { select(newTab(private: false)) }
        }
    }

    func ensureTab() {
        if current == nil { select(tabs.last ?? newTab(private: false)) }
    }

    func neighbour(of tab: Tab, step: Int) -> Tab? {
        let peers = tabs.filter { $0.isPrivate == tab.isPrivate }
        guard let i = peers.firstIndex(where: { $0 === tab }), peers.indices.contains(i + step) else { return nil }
        return peers[i + step]
    }

    // MARK: Navigation

    func goBack(_ tab: Tab) {
        if let w = tab.webView, w.canGoBack { w.goBack() }
        else { tab.home = true }   // the first page of a tab goes back to home; Forward returns to it
        barHidden = false
    }

    func canGoForward(_ tab: Tab) -> Bool { tab.home ? tab.webView?.url != nil : tab.canGoForward }

    func goForward(_ tab: Tab) {
        guard let w = tab.webView else { return }
        if tab.home {
            tab.home = false
            tab.url = w.url?.absoluteString ?? tab.url
        } else { w.goForward() }
    }

    func toggleDesktop(_ tab: Tab) {
        tab.desktop.toggle()
        guard let w = tab.webView else { return }
        w.configuration.defaultWebpagePreferences.preferredContentMode = tab.desktop ? .desktop : .mobile
        w.reloadFromOrigin()
    }

    func toggleBookmark(_ tab: Tab) {
        if Store.shared.isBookmarked(tab.url) { Store.shared.removeBookmark(url: tab.url) }
        else { Store.shared.addBookmark(url: tab.url, title: tab.title) }
        libraryRevision += 1
    }

    func show(_ message: String) {
        toast = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) { [weak self] in
            if self?.toast == message { self?.toast = nil }
        }
    }

    // MARK: WebKit

    private func makeWebView(for tab: Tab) -> WKWebView {
        let config = WKWebViewConfiguration()
        if tab.isPrivate {
            if privateStore == nil { privateStore = .nonPersistent() }
            config.websiteDataStore = privateStore!
        }
        config.allowsInlineMediaPlayback = true
        // Sites serve a reduced page to embedded web views; this identifies Labeeb as a full mobile browser.
        config.applicationNameForUserAgent = "Version/17.5 Mobile/15E148 Safari/604.1"
        config.defaultWebpagePreferences.preferredContentMode = tab.desktop ? .desktop : .mobile
        let content = config.userContentController
        if AppSettings.shared.fixArabic {
            content.addUserScript(WKUserScript(source: Scripts.fixer, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        if !tab.isPrivate {
            // Pages may report a login for saving. Private tabs are left out entirely.
            content.addUserScript(WKUserScript(source: Scripts.capture, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            content.add(self, name: "labeebVault")
        }
        let w = WKWebView(frame: .zero, configuration: config)
        attach(w, to: tab)
        return w
    }

    private func attach(_ w: WKWebView, to tab: Tab) {
        w.navigationDelegate = self
        w.uiDelegate = self
        w.allowsBackForwardNavigationGestures = true
        w.isFindInteractionEnabled = true
        w.scrollView.delegate = self
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.isOpaque = false
        w.backgroundColor = .clear
        let refresh = UIRefreshControl()
        refresh.addAction(UIAction { [weak w, weak refresh] _ in
            w?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { refresh?.endRefreshing() }
        }, for: .valueChanged)
        w.scrollView.refreshControl = refresh
        tab.webView = w
        tab.observers = [
            w.observe(\.title) { [weak tab] w, _ in
                guard let tab else { return }
                tab.title = w.title ?? ""
                if !tab.isPrivate, let url = w.url?.absoluteString, let title = w.title, !title.isEmpty {
                    Store.shared.setHistoryTitle(url: url, title: title)
                }
            },
            w.observe(\.url) { [weak self, weak tab] w, _ in
                guard let tab, let url = w.url?.absoluteString else { return }
                tab.url = url
                tab.fill = []
                self?.settleOffer(tab, url: url)
            },
            w.observe(\.estimatedProgress) { [weak tab] w, _ in tab?.progress = w.estimatedProgress },
            w.observe(\.isLoading) { [weak tab] w, _ in tab?.loading = w.isLoading },
            w.observe(\.canGoBack) { [weak tab] w, _ in tab?.canGoBack = w.canGoBack },
            w.observe(\.canGoForward) { [weak tab] w, _ in tab?.canGoForward = w.canGoForward },
        ]
    }

    private func tab(for webView: WKWebView) -> Tab? { tabs.first { $0.webView === webView } }

    /// A small picture of the tab for its card in the tabs screen.
    func snapshot(_ tab: Tab, done: @escaping () -> Void) {
        guard !tab.home, let w = tab.webView, w.bounds.width > 0 else {
            done()
            return
        }
        let config = WKSnapshotConfiguration()
        config.snapshotWidth = 220
        w.takeSnapshot(with: config) { image, _ in
            if let image { tab.thumb = image }
            done()
        }
    }

    // MARK: Things the page can be asked

    /// The visible text of the current page, for the assistant; nil when no web page is open.
    func pageText(_ done: @escaping (String?, String?) -> Void) {
        guard let tab = current, !tab.home, let w = tab.webView, Web.isWeb(tab.url) else {
            done(nil, nil)
            return
        }
        w.evaluateJavaScript(Scripts.pageText) { value, _ in
            let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            done(text.isEmpty ? nil : text, tab.url)
        }
    }

    func openReader(_ tab: Tab) {
        tab.webView?.evaluateJavaScript(Scripts.reader) { [weak self] value, failure in
            guard let self else { return }
            guard let json = value as? String, let data = json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  ((object["chars"] as? NSNumber)?.intValue ?? 0) >= 500, let raw = object["blocks"] as? [[String: Any]] else {
                #if DEBUG
                let parsed = (value as? String).flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                print("reader failed:", failure?.localizedDescription ?? "", parsed?["error"] ?? "", parsed?["chars"] ?? "")
                self.show("reader: \(failure?.localizedDescription ?? "") \(parsed?["error"] ?? "") chars=\(parsed?["chars"] ?? "nil")")
                #else
                self.show(t("reader_unavailable"))
                #endif
                return
            }
            let blocks = raw.enumerated().map { Article.Block(id: $0.offset, kind: $0.element["k"] as? String ?? "p", text: $0.element["t"] as? String ?? "") }
            self.article = Article(title: object["title"] as? String ?? "", site: object["site"] as? String ?? "",
                                   chars: (object["chars"] as? NSNumber)?.intValue ?? 0, blocks: blocks)
        }
    }

    private func remember(_ tab: Tab, url: String) {
        guard AppSettings.shared.memory, !tab.isPrivate, Web.isWeb(url), !Web.isSearch(url) else { return }
        // A little after loading, once the page has drawn its text.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak tab] in
            guard let tab, let w = tab.webView, w.url?.absoluteString == url else { return }
            w.evaluateJavaScript(Scripts.memory) { value, _ in
                guard let json = value as? String, let data = json.data(using: .utf8),
                      let page = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                let text = (page["text"] as? String ?? "").split(whereSeparator: \.isWhitespace).joined(separator: " ")
                guard text.count >= 400 else { return }
                let title = (page["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? Web.host(url)
                DispatchQueue.global(qos: .utility).async {
                    Store.shared.remember(url: url, title: title, body: text, normalized: ArabicText.normalize(title + " " + text))
                }
            }
        }
    }

    // MARK: Passwords

    /// Once the site leaves its sign-in page the login evidently worked, and saving it is offered.
    private func settleOffer(_ tab: Tab, url: String) {
        guard var offer = tab.offer, url != offer.pageURL else { return }
        tab.offer = nil
        guard Date().timeIntervalSince(offer.time) < 30, Web.origin(url) == offer.origin else { return }
        let existing = Store.shared.credentials(origin: offer.origin).first { $0.username == offer.username }
        if let existing, Vault.password(for: existing) == offer.password { return }
        offer.isUpdate = existing != nil
        pendingSave = offer
    }

    private func checkFill(_ tab: Tab) {
        guard !tab.isPrivate, !tab.home, let origin = Web.origin(tab.url), let w = tab.webView else { return }
        let saved = Store.shared.credentials(origin: origin)
        if saved.isEmpty { return }
        w.evaluateJavaScript(Scripts.hasLogin) { value, _ in
            if (value as? Bool) == true, Web.origin(tab.url) == origin { tab.fill = saved }
        }
    }

    func fill(_ credential: Credential, in tab: Tab) {
        Vault.verify {
            // The page is checked again after Face ID: a fill only ever goes to the site it was saved for.
            guard let w = tab.webView, Web.origin(w.url?.absoluteString) == credential.origin,
                  let password = Vault.password(for: credential) else { return }
            w.evaluateJavaScript(Scripts.fill(username: credential.username, password: password), completionHandler: nil)
            tab.fill = []
        }
    }

    // MARK: Site apps

    func installApp(from tab: Tab) {
        guard let w = tab.webView, Web.isWeb(tab.url) else { return }
        let pageURL = tab.url
        w.evaluateJavaScript(Scripts.siteProbe) { [weak self] value, _ in
            let info = (value as? String).flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            let name = String(((info["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? Web.host(pageURL)).prefix(40))
            let color = BrowserModel.color(info["color"] as? String) ?? 0x111B27
            let iconURL = (info["icon"] as? String).flatMap { URL(string: $0) }
            Task {
                var icon: Data?
                if let iconURL, let (data, _) = try? await URLSession.shared.data(from: iconURL), data.count < 2_000_000,
                   let image = UIImage(data: data), image.size.width >= 48 { icon = data }
                await MainActor.run {
                    Store.shared.addApp(name: name, url: pageURL, color: color, icon: icon)
                    self?.libraryRevision += 1
                    self?.show(t("your_apps") + ": " + name)
                }
            }
        }
    }

    private static func color(_ css: String?) -> UInt32? {
        guard var hex = css?.trimmingCharacters(in: .whitespaces), hex.hasPrefix("#") else { return nil }
        hex.removeFirst()
        if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
        return hex.count == 6 ? UInt32(hex, radix: 16) : nil
    }

    // MARK: Session

    func saveSession() {
        let normal = tabs.filter { !$0.isPrivate }
        let list = normal.map { ["url": $0.home ? "" : $0.url, "title": $0.title] }
        UserDefaults.standard.set(list, forKey: "session")
        UserDefaults.standard.set(normal.firstIndex(where: { $0 === current }) ?? 0, forKey: "session_index")
    }

    private func restoreSession() {
        let list = UserDefaults.standard.array(forKey: "session") as? [[String: String]] ?? []
        for item in list.prefix(50) {
            let tab = newTab(private: false)
            tab.url = item["url"] ?? ""
            tab.home = !Web.isWeb(tab.url)
            tab.title = item["title"] ?? ""
        }
        if tabs.isEmpty { newTab(private: false) }
        // Only the selected tab loads now; the others load when first opened.
        let index = min(max(UserDefaults.standard.integer(forKey: "session_index"), 0), tabs.count - 1)
        select(tabs[index])
    }
}

// MARK: - Navigation

extension BrowserModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = (url.scheme ?? "").lowercased()
        if ["http", "https", "about", "blob", "data"].contains(scheme) {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
            return
        }
        // Another app opens only on a tap, never on a page's own initiative.
        if action.navigationType == .linkActivated, action.targetFrame?.isMainFrame != false {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard let tab = tab(for: webView), let url = webView.url?.absoluteString else { return }
        tab.url = url
        if !tab.isPrivate, Web.isWeb(url) { Store.shared.addHistory(url: url, title: webView.title ?? "") }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let tab = tab(for: webView), let url = webView.url?.absoluteString else { return }
        checkFill(tab)
        // Sign-in forms drawn by the page after loading are caught on a second look.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self, weak tab] in
            if let tab { self?.checkFill(tab) }
        }
        remember(tab, url: url)
        libraryRevision += 1
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // The page's process died; reload it rather than leave a blank view.
        webView.reload()
    }
}

// MARK: - What pages may ask for

extension BrowserModel: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // A link that asks for a new window opens in a new tab, next to the one it came from.
        let parent = tab(for: webView)
        let tab = newTab(private: parent?.isPrivate ?? false)
        tab.home = false
        let w = WKWebView(frame: .zero, configuration: configuration)
        attach(w, to: tab)
        current = tab
        barHidden = false
        return w
    }

    func webViewDidClose(_ webView: WKWebView) {
        if let tab = tab(for: webView) { close(tab) }
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // The system asks the user, per site, for the camera or microphone. Only secure pages may ask.
        decisionHandler(origin.protocol == "https" ? .prompt : .deny)
    }

    private func present(_ alert: UIAlertController, fallback: @escaping () -> Void) {
        guard let top = UIApplication.shared.topController else {
            fallback()
            return
        }
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: t("ok"), style: .default) { _ in completionHandler() })
        present(alert, fallback: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: t("cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: t("ok"), style: .default) { _ in completionHandler(true) })
        present(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: frame.securityOrigin.host, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: t("cancel"), style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: t("ok"), style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
        present(alert) { completionHandler(nil) }
    }
}

extension BrowserModel: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // The message carries no authority of its own: the origin comes from WebKit, and only the top frame counts.
        guard AppSettings.shared.offerSave, message.name == "labeebVault", message.frameInfo.isMainFrame,
              let webView = message.webView, let tab = tab(for: webView), !tab.isPrivate,
              let origin = Web.origin(tab.url), message.frameInfo.securityOrigin.host == URL(string: tab.url)?.host,
              let json = message.body as? String, let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let password = object["p"] as? String, !password.isEmpty, password.count <= 256 else { return }
        tab.offer = Offer(origin: origin, pageURL: tab.url, username: String((object["u"] as? String ?? "").prefix(256)),
                          password: password, time: Date())
    }
}

// MARK: - Downloads

extension BrowserModel: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = BrowserModel.downloadsFolder
        let name = suggestedFilename.isEmpty ? "download" : suggestedFilename
        var target = folder.appendingPathComponent(name)
        var n = 1
        // An existing file keeps its name; the new one gets a number.
        while FileManager.default.fileExists(atPath: target.path) {
            let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
            target = folder.appendingPathComponent(ext.isEmpty ? "\(base) (\(n))" : "\(base) (\(n)).\(ext)")
            n += 1
        }
        downloadTargets[ObjectIdentifier(download)] = target
        completionHandler(target)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let target = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) {
            show(t("download_done", target.lastPathComponent))
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadTargets.removeValue(forKey: ObjectIdentifier(download))
    }
}

// MARK: - Reading down a page hides the bar

extension BrowserModel: UIScrollViewDelegate {
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        // Only a scroll the reader is making by touch moves the bar. The bar floats over the page,
        // so hiding it never resizes the page and cannot set off a scroll of its own.
        guard scrollView.isTracking else { return }
        let velocity = scrollView.panGestureRecognizer.velocity(in: scrollView).y
        let scrollable = scrollView.contentSize.height > scrollView.bounds.height * 1.3
        if velocity < -250, scrollView.contentOffset.y > 120, scrollable { if !barHidden { barHidden = true } }
        else if velocity > 250 || scrollView.contentOffset.y <= 0 { if barHidden { barHidden = false } }
    }
}
