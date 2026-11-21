import SwiftUI
import WebKit

@main
struct LabeebApp: App {
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            BrowserView()
                .labeebEnvironment()
                .onChange(of: phase) { _, now in
                    if now != .active { BrowserModel.shared.saveSession() }
                }
        }
    }
}

extension View {
    /// Applies the language, direction, theme and accent chosen inside the app. Sheets apply it again,
    /// because a presented screen does not always inherit the direction of the one behind it.
    func labeebEnvironment() -> some View { modifier(LabeebEnvironment()) }
}

private struct LabeebEnvironment: ViewModifier {
    let settings = AppSettings.shared

    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, settings.layoutDirection)
            .environment(\.locale, settings.locale)
            .preferredColorScheme(settings.colorScheme)
            .tint(Palette.accent)
    }
}

enum Panel: String, Identifiable {
    case menu, assistant, library, settings, about, memory
    var id: String { rawValue }
}

/// Hosts the current tab's web view. The page runs under the floating bar, with room left at its end.
struct WebContainer: UIViewRepresentable {
    let webView: WKWebView?
    let bottomInset: CGFloat

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        guard let webView else {
            view.subviews.forEach { $0.removeFromSuperview() }
            return
        }
        if webView.superview !== view {
            view.subviews.forEach { $0.removeFromSuperview() }
            webView.frame = view.bounds
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.addSubview(webView)
        }
        webView.scrollView.contentInset.bottom = bottomInset
        webView.scrollView.verticalScrollIndicatorInsets.bottom = bottomInset
    }
}

struct BrowserView: View {
    @State private var model = BrowserModel.shared
    @State private var panel: Panel?
    @State private var libraryTab = 0
    @State private var showTabs = false
    @State private var editing = false
    @State private var address = ""
    @State private var suggestions: [Entry] = []
    @State private var chooseAccount = false
    @FocusState private var focused: Bool
    @Environment(\.layoutDirection) private var direction

    private let barSpace: CGFloat = 78

    var body: some View {
        ZStack(alignment: .bottom) {
            Palette.canvas.ignoresSafeArea()
            page
            bottom
            if let toast = model.toast {
                Text(toast)
                    .font(.subheadline)
                    .foregroundStyle(Palette.text)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.bottom, 110)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.toast)
        .sheet(item: $panel) { panel in
            sheet(for: panel).labeebEnvironment()
        }
        .fullScreenCover(isPresented: $showTabs) {
            TabsView(model: model, isShown: $showTabs).labeebEnvironment()
        }
        .fullScreenCover(item: $model.article) { article in
            ReaderView(article: article).labeebEnvironment()
        }
        .fullScreenCover(item: $model.siteApp) { app in
            SiteAppView(app: app) { url in
                model.siteApp = nil
                model.load(url, newTab: true)
            }
            .labeebEnvironment()
        }
        .alert(t(model.pendingSave?.isUpdate == true ? "update_password_title" : "save_password_title"),
               isPresented: Binding(get: { model.pendingSave != nil }, set: { if !$0 { model.pendingSave = nil } }),
               presenting: model.pendingSave) { offer in
            Button(t(offer.isUpdate ? "update" : "save")) {
                Store.shared.saveCredential(origin: offer.origin, username: offer.username, password: offer.password)
            }
            Button(t("not_now"), role: .cancel) {}
        } message: { offer in
            Text(Web.host(offer.origin) + "\n" + (offer.username.isEmpty ? t("no_username") : offer.username))
        }
        .confirmationDialog(t("choose_account"), isPresented: $chooseAccount, titleVisibility: .visible) {
            if let tab = model.current {
                ForEach(tab.fill) { credential in
                    Button(credential.username.isEmpty ? t("no_username") : credential.username) { model.fill(credential, in: tab) }
                }
            }
        }
        .onOpenURL { url in
            if Web.isWeb(url.absoluteString) { model.load(url.absoluteString, newTab: true) }
        }
        .onAppear(perform: stage)
    }

    // MARK: Page

    @ViewBuilder
    private var page: some View {
        if let tab = model.current {
            if tab.home {
                HomeView(model: model, bottomSpace: barSpace + 24) { load($0) }
            } else {
                WebContainer(webView: tab.webView, bottomInset: barSpace)
                    .id(tab.id)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .ignoresSafeArea(.keyboard)
            }
        }
    }

    private func load(_ input: String) {
        endEditing()
        model.load(input)
    }

    // MARK: Bottom bar

    private var bottom: some View {
        VStack(spacing: 0) {
            if editing, !suggestions.isEmpty { suggestionList }
            if let tab = model.current, !tab.fill.isEmpty, !editing, !tab.home { fillStrip(tab) }
            if let tab = model.current, model.barHidden, !editing, !tab.home {
                // A slim strip with the site's name stands in for the bar while reading; a tap brings the bar back.
                Button { withAnimation(.snappy) { model.barHidden = false } } label: {
                    Text(Web.host(tab.url))
                        .font(.caption)
                        .foregroundStyle(Palette.muted)
                        .environment(\.layoutDirection, .leftToRight)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .accessibilityLabel(t("show_bar"))
                .background(Palette.canvas.opacity(0.96))
            } else {
                bar
            }
        }
        .animation(.snappy(duration: 0.25), value: model.barHidden)
    }

    private var bar: some View {
        VStack(spacing: 0) {
            if let tab = model.current, tab.loading, !tab.home {
                GeometryReader { geo in
                    Rectangle().fill(Palette.accent).frame(width: geo.size.width * max(tab.progress, 0.05))
                }
                .frame(height: 2)
            } else {
                Rectangle().fill(Palette.hairline).frame(height: 0.5)
            }
            HStack(spacing: 8) {
                if editing {
                    pill
                    Button(t("cancel")) { endEditing() }
                        .font(.body)
                } else {
                    Button { panel = .menu } label: {
                        Image(systemName: "line.3.horizontal").font(.title3.weight(.medium)).frame(width: 44, height: 46)
                    }
                    .accessibilityLabel(t("menu"))
                    pill
                    Button { openTabs() } label: {
                        Text(num(tabCount))
                            .font(.footnote.weight(.bold))
                            .frame(width: 26, height: 26)
                            .overlay(RoundedRectangle(cornerRadius: 7).stroke(lineWidth: 1.8))
                            .frame(width: 44, height: 46)
                    }
                    .accessibilityLabel(t("tabs") + " " + num(tabCount))
                }
            }
            .foregroundStyle(Palette.text)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 6)
        }
        .background(Palette.canvas.opacity(0.96))
    }

    private var tabCount: Int {
        let isPrivate = model.current?.isPrivate ?? false
        return model.tabs.filter { $0.isPrivate == isPrivate }.count
    }

    private var pill: some View {
        HStack(spacing: 6) {
            if editing {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField(t("address_hint"), text: $address)
                    .focused($focused)
                    .submitLabel(.go)
                    .keyboardType(.webSearch)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { if !address.trimmingCharacters(in: .whitespaces).isEmpty { load(address) } else { endEditing() } }
                    .onChange(of: address) { _, text in
                        let q = text.trimmingCharacters(in: .whitespaces)
                        suggestions = q.isEmpty || model.current?.isPrivate == true ? [] : Store.shared.suggest(q)
                    }
                if !address.isEmpty {
                    Button { address = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Palette.muted) }
                        .accessibilityLabel(t("clear"))
                }
            } else if let tab = model.current, !tab.home {
                Spacer(minLength: 0)
                // A lock marks an encrypted connection; a warning marks plain HTTP.
                Image(systemName: tab.url.hasPrefix("https://") ? "lock.fill" : "exclamationmark.triangle.fill")
                    .font(.caption2)
                    .foregroundStyle(tab.url.hasPrefix("https://") ? Palette.accent : Palette.warn)
                    .accessibilityLabel(tab.url.hasPrefix("https://") ? "" : t("not_secure"))
                Text(Web.host(tab.url).isEmpty ? tab.url : Web.host(tab.url))
                    .lineLimit(1)
                    .environment(\.layoutDirection, .leftToRight)
                Spacer(minLength: 0)
                Button {
                    if tab.loading { tab.webView?.stopLoading() } else { tab.webView?.reload() }
                } label: {
                    Image(systemName: tab.loading ? "xmark" : "arrow.clockwise").font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                        .frame(width: 32, height: 40)
                }
                .accessibilityLabel(t(tab.loading ? "stop" : "reload"))
            } else {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                Text(t("address_hint")).foregroundStyle(Palette.muted)
                Spacer(minLength: 0)
            }
        }
        .font(.callout)
        .padding(.horizontal, 14)
        .frame(height: 46)
        .frame(maxWidth: .infinity)
        .background(Palette.surface, in: Capsule())
        .contentShape(Capsule())
        .onTapGesture { if !editing { beginEditing() } }
        // Swiping sideways on the address pill moves to the neighbouring tab.
        .gesture(DragGesture(minimumDistance: 30).onEnded { value in
            guard !editing, abs(value.translation.width) > 60, abs(value.translation.width) > abs(value.translation.height) * 1.5,
                  let tab = model.current else { return }
            let rtl = direction == .rightToLeft
            if let next = model.neighbour(of: tab, step: (value.translation.width > 0) != rtl ? -1 : 1) {
                withAnimation(.snappy) { model.select(next) }
            }
        })
    }

    private var suggestionList: some View {
        VStack(spacing: 0) {
            ForEach(suggestions) { entry in
                Button { load(entry.url) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.title.isEmpty ? Web.host(entry.url) : entry.title).font(.callout).foregroundStyle(Palette.text).lineLimit(1)
                        Text(entry.url).font(.caption).foregroundStyle(Palette.muted).lineLimit(1)
                            .environment(\.layoutDirection, .leftToRight)
                            .frame(maxWidth: .infinity, alignment: direction == .rightToLeft ? .trailing : .leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20).padding(.vertical, 9)
                }
            }
        }
        .background(Palette.canvas.opacity(0.96))
    }

    private func fillStrip(_ tab: Tab) -> some View {
        Button {
            if tab.fill.count == 1 { model.fill(tab.fill[0], in: tab) } else { chooseAccount = true }
        } label: {
            Label(tab.fill.count == 1 && !tab.fill[0].username.isEmpty ? t("fill_password") + " · " + tab.fill[0].username : t("fill_password"),
                  systemImage: "key.fill")
                .font(.subheadline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
        }
        .background(Palette.canvas.opacity(0.96))
    }

    private func beginEditing() {
        address = (model.current?.home ?? true) ? "" : (model.current?.url ?? "")
        suggestions = []
        model.barHidden = false
        editing = true
        focused = true
    }

    private func endEditing() {
        focused = false
        editing = false
        suggestions = []
    }

    private func openTabs() {
        if let tab = model.current { model.snapshot(tab) { showTabs = true } } else { showTabs = true }
    }

    // MARK: Sheets

    @ViewBuilder
    private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .menu:
            MenuSheet(model: model) { action in
                switch action {
                case .assistant: self.panel = .assistant
                case .library(let tab):
                    libraryTab = tab
                    self.panel = .library
                case .memory: self.panel = .memory
                case .settings: self.panel = .settings
                case .about: self.panel = .about
                case .dismiss: self.panel = nil
                }
            }
            .presentationDetents([.fraction(0.9), .large])
            .presentationDragIndicator(.visible)
        case .assistant:
            AssistantView(model: model) { self.panel = .settings }
                .presentationDetents([.fraction(0.8), .large])
                .presentationDragIndicator(.visible)
        case .library:
            LibraryView(model: model, tab: libraryTab) { url, newTab in
                self.panel = nil
                model.load(url, newTab: newTab)
            }
        case .memory:
            MemoryView { url in
                self.panel = nil
                model.load(url)
            }
        case .settings:
            SettingsView(model: model)
        case .about:
            NavigationStack {
                AboutView { url in
                    self.panel = nil
                    model.load(url, newTab: true)
                }
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(t("done")) { self.panel = nil } } }
            }
        }
    }

    // MARK: Staging for the build's screen captures

    /// The build launches the app once per screen with `-shot <name>` and photographs it.
    private func stage() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-shot"), args.indices.contains(i + 1) else { return }
        let sample = "https://ar.wikipedia.org/wiki/%D8%AE%D8%B7_%D8%B9%D8%B1%D8%A8%D9%8A"
        func later(_ seconds: Double, _ work: @escaping () -> Void) { DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work) }
        let settings = AppSettings.shared
        switch args[i + 1] {
        case "home":
            if let tab = model.current { tab.home = true }
        case "page": model.load(sample)
        case "tabs":
            model.load(sample)
            later(7) { openTabs() }
        case "menu":
            model.load(sample)
            later(6) { panel = .menu }
        case "reader":
            model.load(sample)
            later(8) { if let tab = model.current { model.openReader(tab) } }
        case "settings": later(1) { panel = .settings }
        case "about": later(1) { panel = .about }
        case "library":
            libraryTab = 1
            later(1) { panel = .library }
        case "memory": later(1) { panel = .memory }
        case "assistant": later(1) { panel = .assistant }
        case "light":
            settings.theme = "light"
            if let tab = model.current { tab.home = true }
        case "english":
            settings.language = .en
            if let tab = model.current { tab.home = true }
        default: break
        }
    }
}

// MARK: - Home

struct HomeView: View {
    let model: BrowserModel
    let bottomSpace: CGFloat
    let open: (String) -> Void

    @State private var addSite = false
    @State private var newName = ""
    @State private var newURL = ""
    private var settings = AppSettings.shared

    init(model: BrowserModel, bottomSpace: CGFloat, open: @escaping (String) -> Void) {
        self.model = model
        self.bottomSpace = bottomSpace
        self.open = open
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        // Reading the revision makes this screen redraw when bookmarks, apps or history change.
        let _ = model.libraryRevision
        let apps = Store.shared.apps()
        let sites = Array(Store.shared.bookmarks().prefix(7))
        let last = model.current?.isPrivate == true ? nil : Store.shared.lastHistory()

        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Image("Logo").resizable().frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 11))
                        .accessibilityHidden(true)
                    Text(t("app_name")).font(.tajawal(21, bold: true))
                    Spacer()
                    Button { settings.language = settings.isArabic ? .en : .ar } label: {
                        Text(t("lang_switch")).font(.subheadline.weight(.medium)).foregroundStyle(Palette.muted)
                            .frame(minWidth: 46, minHeight: 44)
                            .overlay(Capsule().stroke(Palette.line))
                    }
                }

                Text(t("home_title")).font(.tajawal(27, bold: true)).padding(.top, 30)
                Text(t("home_sub")).font(.subheadline).foregroundStyle(Palette.muted).padding(.top, 4)

                if !apps.isEmpty {
                    label(t("your_apps")).padding(.top, 28)
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(apps) { app in
                            tile(app.name) { AppIcon(app: app, size: 60) }
                                .onTapGesture { model.siteApp = app }
                                .contextMenu {
                                    Button(t("remove"), systemImage: "trash", role: .destructive) {
                                        Store.shared.removeApp(id: app.id)
                                        model.libraryRevision += 1
                                    }
                                }
                        }
                    }
                    .padding(.top, 12)
                }

                label(t("your_sites")).padding(.top, 24)
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(sites) { site in
                        let name = site.title.isEmpty ? Web.host(site.url) : site.title
                        tile(name) {
                            Text(Icons.letter(name)).font(.title2.weight(.bold)).foregroundStyle(Palette.accent)
                                .frame(width: 60, height: 60).background(Palette.surface, in: RoundedRectangle(cornerRadius: 18))
                        }
                        .onTapGesture { open(site.url) }
                        .contextMenu {
                            Button(t("remove"), systemImage: "trash", role: .destructive) {
                                Store.shared.removeBookmark(url: site.url)
                                model.libraryRevision += 1
                            }
                        }
                    }
                    tile(t("add")) {
                        Image(systemName: "plus").font(.title3).foregroundStyle(Palette.muted)
                            .frame(width: 60, height: 60)
                            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Palette.muted, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                    }
                    .onTapGesture { addSite = true }
                    .accessibilityLabel(t("add_site"))
                }
                .padding(.top, 12)

                if let last {
                    Button { open(last.url) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "clock").font(.title3).foregroundStyle(Palette.accent)
                                .frame(width: 40, height: 40).background(Palette.surface, in: RoundedRectangle(cornerRadius: 11))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t("continue_where")).font(.caption).foregroundStyle(Palette.muted)
                                Text(last.title.isEmpty ? Web.host(last.url) : last.title + " — " + Web.host(last.url))
                                    .font(.callout).foregroundStyle(Palette.text).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(14)
                        .background(Palette.panel, in: RoundedRectangle(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.hairline))
                    }
                    .padding(.top, 26)
                }
            }
            .foregroundStyle(Palette.text)
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, bottomSpace)
        }
        .alert(t("add_site"), isPresented: $addSite) {
            TextField(t("site_name"), text: $newName)
            TextField(t("site_url"), text: $newURL).textInputAutocapitalization(.never).keyboardType(.URL)
            Button(t("add")) {
                let raw = newURL.trimmingCharacters(in: .whitespaces)
                if !raw.isEmpty {
                    Store.shared.addBookmark(url: Web.isWeb(raw) ? raw : "https://" + raw, title: newName.trimmingCharacters(in: .whitespaces))
                    model.libraryRevision += 1
                }
                newName = ""
                newURL = ""
            }
            Button(t("cancel"), role: .cancel) {}
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(Palette.muted)
    }

    private func tile<Icon: View>(_ name: String, @ViewBuilder icon: () -> Icon) -> some View {
        VStack(spacing: 7) {
            icon()
            Text(name).font(.caption).lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }
}

struct AppIcon: View {
    let app: SiteApp
    let size: CGFloat

    var body: some View {
        if let data = app.icon, let image = UIImage(data: data) {
            Image(uiImage: image).resizable().scaledToFill().frame(width: size, height: size)
                .background(Color.white).clipShape(RoundedRectangle(cornerRadius: size * 0.24))
        } else {
            Text(Icons.letter(app.name)).font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(Color(hex: 0x06241E))
                .frame(width: size, height: size)
                .background(Icons.tint(for: app.name), in: RoundedRectangle(cornerRadius: size * 0.24))
        }
    }
}
