# Labeeb for Android

Native Android browser (Kotlin, Android Views) that shares Labeeb's identity: Arabic-first RTL with English, the Tajawal font, and the same dark and light palettes. Pages render in the system WebView, one per tab.

It is a separate app from the Tauri desktop shell in `src-tauri/`. Tauri's multi-webview support is desktop-only, so none of that code runs here.

## Build

Requires JDK 17 and the Android SDK (platform 36). Set `sdk.dir` in `android/local.properties` or `ANDROID_HOME`.

```sh
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is signed with the local debug key. There is no release signing configuration yet.

## What is in this version (0.1.0)

- Tabs with session restore, address bar with search and suggestions, history, bookmarks, downloads, find in page, desktop site, dark/light/system theme, Arabic/English.
- Private tabs in a separate WebView profile that is deleted when the last one closes. They appear only where the device's WebView supports multiple profiles; otherwise the option is hidden.
- Run as app: a site gets a pinned home-screen icon and opens in its own window (`SiteAppActivity`), using its web manifest for name, colour and icon when it has one.
- Assistant: streaming chat with OpenAI, DeepSeek or Claude using the user's own API key, stored encrypted with an Android Keystore key. Page text is sent only when the user picks a page suggestion.
- Reading mode, pull to refresh, and a password vault: logins are offered for saving after sign-in, stored encrypted with an Android Keystore key, and filled only after the screen lock or fingerprint.
- Arabic web fixer: Arabic text that a site leaves in a generic fallback font gets the bundled typeface (registered from memory, so site security policies do not block it) and its natural direction. Reading mode adds Hijri dates and optional side-by-side translation through the assistant.
- Labeeb Memory: the text of pages read is indexed on the device (SQLite FTS) and searched by a normalised Arabic or English question; private tabs, sign-in pages and search results are never stored.
- Voice input through Google's speech recogniser, with a message when it is missing.

## Not ported from desktop

Video and audio download, the media library, multi-connection downloads, custom AI endpoints and Viora.

## Layout

| File | Role |
| --- | --- |
| `MainActivity.kt` | Tabs, navigation, bottom bar, home, tabs overlay, menu |
| `Web.kt` | WebView settings, downloads, external links, voice input |
| `Sheets.kt` | The one message sheet (confirmations, notices, choices, fields) and the in-app notice card |
| `SiteApps.kt` | Run as app: install flow and the standalone window |
| `AssistantSheet.kt`, `Ai.kt` | Assistant panel, provider client, key storage |
| `Screens.kt` | Library (bookmarks, history, downloads) and settings |
| `Store.kt` | SQLite: history, bookmarks, site apps |
