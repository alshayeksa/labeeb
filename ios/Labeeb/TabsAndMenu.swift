import SwiftUI

// MARK: - Tabs

struct TabsView: View {
    let model: BrowserModel
    @Binding var isShown: Bool
    @State private var privateMode = false
    @State private var confirmCloseAll = false

    private let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    private var shown: [Tab] { model.tabs.filter { $0.isPrivate == privateMode } }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(t("tabs")).font(.title2.weight(.bold))
                    Text(t("tabs_total", num(shown.count))).font(.footnote).foregroundStyle(Palette.muted)
                }
                Spacer()
                Picker("", selection: $privateMode) {
                    Text(t("tabs_normal")).tag(false)
                    Text(t("tabs_private")).tag(true)
                }
                .pickerStyle(.segmented)
                .frame(width: 170)
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)

            if privateMode {
                Text(t("private_hint")).font(.footnote).foregroundStyle(Palette.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20).padding(.top, 10)
            }

            ScrollView {
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(shown) { tab in
                        TabCard(tab: tab, isCurrent: tab === model.current) {
                            model.select(tab)
                            isShown = false
                        } close: {
                            withAnimation(.snappy) { model.close(tab, allowEmpty: true) }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }

            Divider()
            HStack {
                Button(t("close_all"), role: .destructive) {
                    // One tab closes at once; several are confirmed first, since they cannot be brought back.
                    if shown.count <= 1 { closeAll() } else { confirmCloseAll = true }
                }
                .foregroundStyle(Palette.danger)
                .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    model.select(model.newTab(private: privateMode))
                    isShown = false
                } label: {
                    Image(systemName: "plus").font(.title3.weight(.semibold)).foregroundStyle(Palette.onAccent)
                        .frame(width: 52, height: 52).background(Palette.accent, in: Circle())
                }
                .accessibilityLabel(t("new_tab"))

                Button(t("done")) { done() }
                    .fontWeight(.semibold)
                    .foregroundStyle(Palette.accent)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
        }
        .foregroundStyle(Palette.text)
        .background(Palette.canvas.ignoresSafeArea())
        .confirmationDialog(t("close_all_confirm"), isPresented: $confirmCloseAll, titleVisibility: .visible) {
            Button(t("close_all"), role: .destructive) { closeAll() }
        }
        .onAppear { privateMode = model.current?.isPrivate ?? false }
    }

    private func closeAll() {
        withAnimation(.snappy) { for tab in shown { model.close(tab, allowEmpty: true) } }
    }

    private func done() {
        model.ensureTab()
        isShown = false
    }
}

private struct TabCard: View {
    let tab: Tab
    let isCurrent: Bool
    let open: () -> Void
    let close: () -> Void
    @State private var drag: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Group {
                    if tab.home {
                        Image("Logo").resizable().clipShape(RoundedRectangle(cornerRadius: 4))
                    } else {
                        Text(Icons.letter(Web.host(tab.url))).font(.system(size: 10, weight: .bold)).foregroundStyle(Color(hex: 0x06241E))
                            .frame(width: 18, height: 18).background(Icons.tint(for: Web.host(tab.url)), in: RoundedRectangle(cornerRadius: 5))
                    }
                }
                .frame(width: 18, height: 18)
                .accessibilityHidden(true)
                Text(tab.displayTitle).font(.footnote).lineLimit(1)
                Spacer(minLength: 0)
                Button(action: close) {
                    Image(systemName: "xmark").font(.caption.weight(.semibold)).foregroundStyle(Palette.muted)
                        .frame(width: 36, height: 38)
                }
                .accessibilityLabel(t("close_tab"))
            }
            .padding(.leading, 10)
            .frame(height: 38)

            ZStack {
                Palette.surface
                if let thumb = tab.thumb, !tab.home {
                    Image(uiImage: thumb).resizable().scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if tab.home {
                    Image("Logo").resizable().frame(width: 54, height: 54).clipShape(RoundedRectangle(cornerRadius: 13)).opacity(0.9)
                } else {
                    // A tab restored from the last session has no picture until it is opened; it shows its address.
                    Text(Web.host(tab.url)).font(.footnote).foregroundStyle(Palette.muted).padding(12)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            .frame(height: 190)
            .clipped()
        }
        .background(Palette.panel)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(isCurrent ? Palette.accent : Palette.line, lineWidth: isCurrent ? 2 : 1))
        .shadow(color: .black.opacity(0.18), radius: 6, y: 3)
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .onTapGesture(perform: open)
        .offset(x: drag)
        .opacity(1.0 - min(Double(abs(drag)) / 320.0, 0.6))
        // A card must be dragged well across before its tab closes.
        .gesture(DragGesture(minimumDistance: 24).onChanged { value in
            if abs(value.translation.width) > abs(value.translation.height) { drag = value.translation.width }
        }.onEnded { value in
            if abs(value.translation.width) > 150 { close() } else { withAnimation(.snappy) { drag = 0 } }
        })
    }
}

// MARK: - Menu

enum MenuAction {
    case assistant, library(Int), memory, settings, about, dismiss
}

struct MenuSheet: View {
    let model: BrowserModel
    let act: (MenuAction) -> Void
    private var settings = AppSettings.shared
    @Environment(\.colorScheme) private var scheme

    init(model: BrowserModel, act: @escaping (MenuAction) -> Void) {
        self.model = model
        self.act = act
    }

    var body: some View {
        let tab = model.current
        let page = tab != nil && tab?.home == false
        let web = page && Web.isWeb(tab?.url)
        let saved = web && Store.shared.isBookmarked(tab?.url ?? "")

        ScrollView {
            VStack(spacing: 14) {
                HStack(spacing: 8) {
                    quick(t("assistant"), "sparkles", tint: Palette.accent) { act(.assistant) }
                    quick(t("back"), "chevron.backward", enabled: page) { run { if let tab { model.goBack(tab) } } }
                    quick(t("forward"), "chevron.forward", enabled: tab.map(model.canGoForward) ?? false) { run { if let tab { model.goForward(tab) } } }
                    quick(t(saved ? "saved" : "save"), saved ? "star.fill" : "star", enabled: web) { run { if let tab { model.toggleBookmark(tab) } } }
                    quick(t("share"), "square.and.arrow.up", enabled: web) {
                        act(.dismiss)
                        if let url = URL(string: tab?.url ?? "") {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { share([url]) }
                        }
                    }
                }

                VStack(spacing: 0) {
                    row(t("run_as_app"), "plus.app", enabled: web) { run { if let tab { model.installApp(from: tab) } } }
                    row(t("reader_mode"), "book", enabled: web) {
                        act(.dismiss)
                        if let tab { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { model.openReader(tab) } }
                    }
                    row(t("memory"), "archivebox") { act(.memory) }
                    row(t("bookmarks"), "star") { act(.library(0)) }
                    row(t("history"), "clock") { act(.library(1)) }
                    row(t("downloads"), "arrow.down.to.line") { act(.library(2)) }
                    row(t("find_in_page"), "doc.text.magnifyingglass", enabled: page) {
                        act(.dismiss)
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { tab?.webView?.findInteraction?.presentFindNavigator(showingReplace: false) }
                    }
                    row(t("settings"), "slider.horizontal.3") { act(.settings) }
                    row(t("about"), "info.circle", last: true) { act(.about) }
                }
                .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18))

                HStack(spacing: 10) {
                    toggle(t("theme_dark"), "moon", on: scheme == .dark) { settings.theme = scheme == .dark ? "light" : "dark" }
                    toggle(t("desktop_site"), "desktopcomputer", on: tab?.desktop ?? false, enabled: page) {
                        run { if let tab { model.toggleDesktop(tab) } }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 26)
            .padding(.bottom, 20)
        }
        .background(Palette.panel.ignoresSafeArea())
    }

    private func run(_ work: () -> Void) {
        work()
        act(.dismiss)
    }

    private func quick(_ title: String, _ icon: String, tint: Color = Palette.text, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon).font(.title3)
                Text(title).font(.caption2).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18))
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }

    private func row(_ title: String, _ icon: String, enabled: Bool = true, last: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: 14) {
                    Image(systemName: icon).font(.body).foregroundStyle(Palette.accent).frame(width: 26)
                    Text(title).font(.body).foregroundStyle(Palette.text)
                    Spacer()
                }
                .frame(height: 50)
                if !last { Rectangle().fill(Palette.hairline).frame(height: 0.5).padding(.leading, 40) }
            }
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }

    private func toggle(_ title: String, _ icon: String, on: Bool, enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline)
                .foregroundStyle(on ? Palette.accent : Palette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(on ? Palette.accentSoft : Color.clear, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(on ? Palette.accent : Palette.line))
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
