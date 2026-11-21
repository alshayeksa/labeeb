# Labeeb for iPhone

Native iOS browser in Swift and SwiftUI, with pages rendered by WKWebView. It is a separate app from the
Android one in `android/` and from the Tauri desktop shell; they share the design, the palette and the feature set.

## Build

The Xcode project is generated, not committed:

```sh
brew install xcodegen
cd ios && xcodegen generate
open Labeeb.xcodeproj
```

Requires Xcode 16 and iOS 17 or later. The bundle identifier is `ai.alshaye.labeeb`; signing is not configured.
The app icon is 1024 px and opaque, as App Store Connect requires.

## TestFlight

The `testflight` job in `.github/workflows/ios-build.yml` is started by hand: Actions > iOS build and screenshots > Run workflow, branch `mobile-apps`, tick `testflight`. It fetches the App Store profile for `ai.alshaye.labeeb` from Apple (creating the identifier and profile on the first run), signs, numbers the build by the time it ran and uploads it to TestFlight.

Repository secrets it needs: `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY` (the `.p8` text) and `IOS_CERTIFICATE_PRIVATE_KEY` (the RSA key the distribution certificate is tied to). The app must also exist in App Store Connect.

`codemagic.yaml` at the repository root is an equivalent workflow for Codemagic, kept as an alternative.

## App Store page

The store texts live in `fastlane/metadata` (Arabic and English). The manual job `appstore` in the same workflow (Run workflow, tick "appstore") photographs the app on the largest iPhone in both languages and sends the pictures and texts to App Store Connect. It never submits for review.

Set by hand in App Store Connect, because they are answers only the owner can give: the age rating questionnaire, the App Privacy answers, price and availability, the review contact, and the build attached to the version. The privacy policy is built with the website (`labeeb-wbsite`, pages `/privacy/` and `/en/privacy/`).

## Continuous build

`.github/workflows/ios-build.yml` builds for the simulator on every push to `mobile-apps` that touches `ios/`,
then launches the app once per screen with `-shot <name>` and uploads the pictures as the `ios-output` artifact.

## What is in it

Tabs with session restore and private tabs (a non-persistent data store), a floating bottom address bar that
tucks away while reading, pull to refresh, find in page, desktop site, downloads, bookmarks, history, Labeeb
Memory, the Arabic web fixer, reading mode with Hijri dates and side-by-side translation, the assistant, a
password vault in the Keychain behind Face ID, sites opened as apps inside Labeeb, settings and About.

## Differences from Android

- No custom voice search: the iOS keyboard's own dictation covers it.
- "Run as app" opens the site in its own window inside Labeeb; iOS does not let a third-party browser pin a home-screen icon this way.
- Becoming the default browser needs an entitlement that Apple grants on request.

## Layout

| File | Role |
| --- | --- |
| `Browser.swift` | Tabs, navigation, downloads, what pages may ask for |
| `BrowserView.swift` | App entry, home, bottom bar, sheets |
| `TabsAndMenu.swift` | Tabs screen and the menu |
| `Screens.swift` | Library, Memory, Settings, Passwords, About |
| `Assistant.swift`, `Reader.swift` | Assistant, reading mode, site-app window |
| `Storage.swift`, `Scripts.swift`, `Core.swift`, `Strings.swift` | SQLite and Keychain, page scripts, settings and text |
