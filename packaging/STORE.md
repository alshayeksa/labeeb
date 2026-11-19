# Microsoft Store packaging

The public identity in `store-identity.json` was transcribed from the owner's Partner Center product identity. It is not a signing credential. Keep the exact case and publisher identifier.

Build the native Windows application and run `python scripts/package.py` first, then:

```powershell
python scripts/package-msix.py
```

The script uses Windows SDK MakeAppx with schema validation enabled. It packages the matching portable executable, Viora resources, notices and existing Store icons. It checks the executable against the portable release hash, the manifest identity and ZIP integrity. Output is `artifacts/Labeeb-<version>-Windows-x64-store.msix`; evidence is in `docs/verification/windows-<version>-msix.json` and the accompanying log. Version `0.1.21` becomes Store package version `0.1.21.0`.

This package is unsigned and intended for Partner Center submission, not direct installation by end users. The Store signs MSIX packages after certification. No certificate is installed, account accessed, or application uploaded by this script.

## Partner Center draft

Open **Start submission**, then **Packages**, and select the generated `.msix` file. Wait for server-side package validation and review every result. Uploading for validation does not establish certification or readiness for publication.

The desktop application declares `runFullTrust` because it uses native WebView2 child windows, an OS keychain API, local browser storage, user-selected downloads and media helper processes. It runs at the user's normal privilege level; it does not require administrator elevation. Explain these functions if the submission requests restricted-capability justification.

## Outstanding release checks

- Test installation, launch, upgrade, uninstall, browser profiles, keychain, downloads, Viora resources and media tool startup in the packaged context. The MSIX install location is read-only; application data must remain in user-data directories.
- Run the Windows App Certification Kit against the installed package. Schema validation is not a substitute for this or native functional testing.
- Test WebView2 availability on clean target systems. This MSIX does not contain the runtime or the NSIS bootstrapper; WebView2 must already be installed. Windows 10 support must not be inferred from packaging alone.
- Complete privacy-policy URL, screenshots, descriptions, age ratings and any capability declarations in the Store submission.
- Supply the corresponding source and notices required by the included Viora license before distribution; the existing notice inventory still needs a complete release dependency review.

References: [manual MSIX packaging](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion), [Store package requirements and signing](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
