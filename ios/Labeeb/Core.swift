import SwiftUI
import UIKit

// MARK: - Settings

enum Lang: String { case ar, en }

/// User preferences, kept in UserDefaults. Views that read a property redraw when it changes.
@Observable
final class AppSettings {
    static let shared = AppSettings()
    @ObservationIgnored private let store = UserDefaults.standard

    var language: Lang { didSet { store.set(language.rawValue, forKey: "language") } }
    /// "dark", "light" or "system".
    var theme: String { didSet { store.set(theme, forKey: "theme") } }
    var engine: String { didSet { store.set(engine, forKey: "engine") } }
    var provider: String { didSet { store.set(provider, forKey: "ai_provider") } }
    var fixArabic: Bool { didSet { store.set(fixArabic, forKey: "fix_arabic") } }
    var hijri: Bool { didSet { store.set(hijri, forKey: "hijri") } }
    var memory: Bool { didSet { store.set(memory, forKey: "memory") } }
    var offerSave: Bool { didSet { store.set(offerSave, forKey: "offer_save") } }
    var readerSize: Double { didSet { store.set(readerSize, forKey: "reader_size") } }
    /// Bumped whenever a model name changes, so settings rows redraw.
    var modelRevision = 0

    private init() {
        // Labeeb is Arabic-first: Arabic until the user picks a language.
        language = Lang(rawValue: store.string(forKey: "language") ?? "ar") ?? .ar
        theme = store.string(forKey: "theme") ?? "dark"
        engine = store.string(forKey: "engine") ?? "google"
        provider = store.string(forKey: "ai_provider") ?? "openai"
        fixArabic = store.object(forKey: "fix_arabic") as? Bool ?? true
        hijri = store.object(forKey: "hijri") as? Bool ?? true
        memory = store.object(forKey: "memory") as? Bool ?? true
        offerSave = store.object(forKey: "offer_save") as? Bool ?? true
        readerSize = store.object(forKey: "reader_size") as? Double ?? 19
    }

    var isArabic: Bool { language == .ar }
    var colorScheme: ColorScheme? { theme == "dark" ? .dark : theme == "light" ? .light : nil }
    var layoutDirection: LayoutDirection { isArabic ? .rightToLeft : .leftToRight }
    var locale: Locale { Locale(identifier: isArabic ? "ar" : "en") }

    func model(for provider: String) -> String {
        let saved = store.string(forKey: "ai_model_\(provider)") ?? ""
        return saved.isEmpty ? (AI.providers[provider]?.model ?? "") : saved
    }

    func setModel(_ model: String, for provider: String) {
        store.set(model.trimmingCharacters(in: .whitespaces), forKey: "ai_model_\(provider)")
        modelRevision += 1
    }

    static let engines: [(id: String, name: String, url: String)] = [
        ("google", "Google", "https://www.google.com/search?q="),
        ("bing", "Bing", "https://www.bing.com/search?q="),
        ("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q="),
    ]
}

// MARK: - Colours and type

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                           blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }

    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Labeeb's palette, the same values as the desktop and Android apps.
enum Palette {
    static let canvas = Color(light: 0xF4F7FA, dark: 0x0C131D)
    static let panel = Color(light: 0xFFFFFF, dark: 0x111B27)
    static let surface = Color(light: 0xEAF0F5, dark: 0x162231)
    static let line = Color(light: 0xCBD5DF, dark: 0x2C3E52)
    static let hairline = Color(light: 0xDDE5EC, dark: 0x1E2C3B)
    static let muted = Color(light: 0x506579, dark: 0xA9BBC8)
    static let text = Color(light: 0x172B3B, dark: 0xDDE9EE)
    static let accent = Color(light: 0x087B68, dark: 0x5CDBC1)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x06241E)
    static let accentSoft = Color(light: 0xDCEFE8, dark: 0x12302D)
    static let danger = Color(light: 0xA12242, dark: 0xFF8FA3)
    static let warn = Color(light: 0x805114, dark: 0xF2B872)
}

extension Font {
    /// The brand typeface, used for Labeeb's own headlines and for reading mode.
    static func tajawal(_ size: CGFloat, bold: Bool = false) -> Font {
        .custom(bold ? "Tajawal-Bold" : "Tajawal-Regular", size: size)
    }
}

// MARK: - Addresses

enum Web {
    /// Turns what the user typed into an address to load: a URL when it looks like one, otherwise a search.
    static func resolve(_ input: String) -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return "" }
        let lower = text.lowercased()
        if (lower.hasPrefix("http://") || lower.hasPrefix("https://")) && !text.contains(" ") { return text }
        let looksLikeHost = !text.contains(" ") && !text.contains("://") &&
            (text.range(of: #"^[^/\s]+\.[^/\s.]{2,}(/\S*)?$"#, options: .regularExpression) != nil || lower.hasPrefix("localhost"))
        if looksLikeHost { return "https://" + text }
        let engine = AppSettings.engines.first { $0.id == AppSettings.shared.engine } ?? AppSettings.engines[0]
        let query = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=?#"))) ?? text
        return engine.url + query
    }

    static func isWeb(_ url: String?) -> Bool {
        guard let url else { return false }
        return url.hasPrefix("http://") || url.hasPrefix("https://")
    }

    static func host(_ url: String?) -> String {
        guard let url, let host = URL(string: url)?.host else { return "" }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// The origin a saved login or a site permission belongs to. Only HTTPS pages take part.
    static func origin(_ url: String?) -> String? {
        guard let url, let parts = URLComponents(string: url), parts.scheme == "https", let host = parts.host, !host.isEmpty else { return nil }
        if let port = parts.port, port != 443 { return "https://\(host):\(port)" }
        return "https://\(host)"
    }

    static func isSearch(_ url: String) -> Bool {
        let h = host(url)
        return ((h.hasPrefix("google.") || h == "bing.com") && url.contains("/search")) || h == "duckduckgo.com"
    }
}

// MARK: - Arabic text

/// Text normalisation for Labeeb's memory, so a search finds a word whatever its spelling variant or article.
enum ArabicText {
    private static let stop: Set<String> = [
        "في", "من", "على", "الى", "عن", "هل", "ما", "ماذا", "اين", "وين", "متى", "كيف", "اللي", "التي", "الذي", "هذا", "هذه", "ذلك",
        "كان", "كانت", "عند", "مع", "او", "ثم", "قد", "لي", "انا", "عنه", "عنها", "قرات", "قراته", "مقال", "صفحه", "موقع",
        "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is", "was", "what", "where", "when", "how", "that",
        "this", "about", "i", "read", "article", "page", "site", "which", "with", "did",
    ]

    /// Folds spelling variants and strips the article and its common attached prefixes.
    static func word(_ raw: String) -> String {
        var w = ""
        for scalar in raw.lowercased().unicodeScalars {
            switch scalar.value {
            case 0x064B...0x065F, 0x0670, 0x0640: continue                       // marks and tatweel
            case 0x0623, 0x0625, 0x0622, 0x0671: w.unicodeScalars.append("\u{0627}") // alef forms
            case 0x0649: w.unicodeScalars.append("\u{064A}")
            case 0x0629: w.unicodeScalars.append("\u{0647}")
            case 0x0624: w.unicodeScalars.append("\u{0648}")
            case 0x0626: w.unicodeScalars.append("\u{064A}")
            default: w.unicodeScalars.append(scalar)
            }
        }
        if w.count >= 5, ["وال", "بال", "كال", "فال"].contains(where: { w.hasPrefix($0) }) { return String(w.dropFirst(3)) }
        if w.count >= 4, w.hasPrefix("ال") || w.hasPrefix("لل") { return String(w.dropFirst(2)) }
        return w
    }

    static func words(_ text: String) -> [String] {
        text.components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
    }

    /// The text as space-separated normalised words: what the memory index stores.
    static func normalize(_ text: String) -> String {
        words(text).map(word).joined(separator: " ")
    }

    /// The meaningful words of a question, normalised the same way as the index.
    static func queryWords(_ question: String) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for w in words(question).map(word) where w.count >= 2 && !stop.contains(w) && seen.insert(w).inserted {
            out.append(w)
            if out.count == 12 { break }
        }
        return out
    }
}

/// Adds the Hijri date beside Gregorian dates written out with a month name.
enum Hijri {
    private static let ar = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
    private static let en = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
    private static let digit = "[0-9\u{0660}-\u{0669}]"

    private static let dayFirst: NSRegularExpression? = {
        let months = (ar + ["ابريل", "اغسطس", "اكتوبر"] + en).joined(separator: "|")
        return try? NSRegularExpression(pattern: "(\(digit){1,2})\\s+(\(months))\\s+(\(digit){4})", options: [.caseInsensitive])
    }()

    private static let monthFirst: NSRegularExpression? = {
        try? NSRegularExpression(pattern: "\\b(\(en.joined(separator: "|")))\\s+(\(digit){1,2}),?\\s+(\(digit){4})", options: [.caseInsensitive])
    }()

    private static func number(_ s: String) -> Int {
        var out = ""
        for scalar in s.unicodeScalars {
            if (0x0660...0x0669).contains(scalar.value) { out.append(String(scalar.value - 0x0660)) } else { out.unicodeScalars.append(scalar) }
        }
        return Int(out) ?? 0
    }

    private static func month(_ name: String) -> Int {
        let lower = name.lowercased()
        if let i = en.firstIndex(of: lower) { return i }
        let fixed = name.hasPrefix("ا") ? "أ" + name.dropFirst() : name
        return ar.firstIndex(of: fixed) ?? ar.firstIndex(of: name) ?? -1
    }

    private static func format(day: Int, month: Int, year: Int) -> String? {
        guard (0...11).contains(month), (1...31).contains(day), (1900...2100).contains(year) else { return nil }
        var parts = DateComponents()
        parts.year = year; parts.month = month + 1; parts.day = day; parts.hour = 12
        guard let date = Calendar(identifier: .gregorian).date(from: parts) else { return nil }
        let arabic = AppSettings.shared.isArabic
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.locale = Locale(identifier: arabic ? "ar" : "en")
        f.dateFormat = "d MMMM y"
        return f.string(from: date) + (arabic ? " هـ" : " AH")
    }

    static func annotate(_ text: String) -> String {
        var out = text
        for (regex, dayGroup, monthGroup) in [(dayFirst, 1, 2), (monthFirst, 2, 1)] {
            guard let regex else { continue }
            let ns = out as NSString
            var result = ""
            var last = 0
            for m in regex.matches(in: out, range: NSRange(location: 0, length: ns.length)) {
                let whole = ns.substring(with: m.range)
                result += ns.substring(with: NSRange(location: last, length: m.range.location - last)) + whole
                let hijri = format(day: number(ns.substring(with: m.range(at: dayGroup))),
                                   month: month(ns.substring(with: m.range(at: monthGroup))),
                                   year: number(ns.substring(with: m.range(at: 3))))
                if let hijri { result += " (\(hijri))" }
                last = m.range.location + m.range.length
            }
            out = result + ns.substring(from: last)
        }
        return out
    }
}

// MARK: - Small helpers

enum Icons {
    private static let palette: [UInt32] = [0x5CDBC1, 0x7FB6FF, 0xF2B872]

    static func tint(for seed: String) -> Color {
        var hash = 0
        for scalar in seed.unicodeScalars { hash = (hash &* 31 &+ Int(scalar.value)) & 0xFFFFFF }
        return Color(hex: palette[hash % palette.count])
    }

    static func letter(_ name: String) -> String {
        if let ch = name.trimmingCharacters(in: .whitespaces).first(where: { $0.isLetter || $0.isNumber }) { return String(ch).uppercased() }
        return "•"
    }
}

extension UIApplication {
    /// The view controller on top, for alerts and share sheets raised outside SwiftUI.
    var topController: UIViewController? {
        let scene = connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.keyWindow?.rootViewController
        // A sheet on its way out cannot present anything, so the search stops beneath it.
        while let presented = top?.presentedViewController, !presented.isBeingDismissed { top = presented }
        return top
    }
}

/// Raises the system share sheet. When a sheet is still closing (the menu the request came from), the
/// presentation would be dropped without a word, so it waits for the screen to settle.
func share(_ items: [Any], attempt: Int = 0) {
    guard let top = UIApplication.shared.topController else { return }
    if top.presentedViewController != nil || top.isBeingPresented || top.transitionCoordinator != nil, attempt < 30 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { share(items, attempt: attempt + 1) }
        return
    }
    let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = top.view
    sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.maxY - 80, width: 1, height: 1)
    top.present(sheet, animated: true)
}
