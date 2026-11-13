# Windows host check for 0.1.1

Read-only checks on the connected Windows x64 host succeeded:
- PowerShell 7.6.9.
- Windows build 26200.
- Microsoft WebView2 Runtime 157.0.4341.46 reported by EdgeUpdate.
- System32 contains vcruntime140.dll and vcruntime140_1.dll.

Application launch was NOT performed. The supported Library file-transfer helper failed while applying metadata with AttributeError: os has no attribute setxattr. Its destination remained empty. WSL was not usable through the checked command. No dependencies, system settings or security exceptions were installed/changed.

This is transfer-tool failure, not evidence that Labeeb itself failed or passed runtime testing. User downloading the installer or full portable archive to the machine provides a way to continue local validation. No claim of native visual/functional success is made.
