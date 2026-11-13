"""Collect the completed Windows 0.1.9 build and verify archive contents."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
artifacts = root / "artifacts"
name = "Labeeb-0.1.9-Windows-x64-portable"
dest = artifacts / name
dest.mkdir(exist_ok=True)
release = root / "src-tauri/target/x86_64-pc-windows-msvc/release"
shutil.copy2(release / "labeeb-browser.exe", dest / "labeeb-browser.exe")
shutil.copy2(root / "src-tauri/binaries/obscura-x86_64-pc-windows-msvc.exe", dest / "obscura.exe")
for filename in ["LICENSE", "THIRD_PARTY_NOTICES.md", "TRY_WINDOWS_AR.md"]:
    shutil.copy2(root / filename, dest / filename)
shutil.copytree(root / "licenses", dest / "licenses", dirs_exist_ok=True)
shutil.copy2(root / "src-tauri/binaries/sidecar-manifest.json", dest / "sidecar-manifest.json")
shutil.copy2(root / "docs/verification/windows-0.1.9.md", dest / "VERIFICATION.md")
(dest / "README.txt").write_text("Labeeb 0.1.9 portable trial. Run labeeb-browser.exe. Keep obscura.exe alongside it.\nUse the toolbar sun/moon button or Settings > Appearance to select Light, Dark or System.\n", encoding="utf-8")
installer = artifacts / "Labeeb-0.1.9-Windows-x64-setup.exe"
shutil.copy2(release / "bundle/nsis/Labeeb_0.1.9_x64-setup.exe", installer)
archive = artifacts / f"{name}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for file in dest.rglob("*"):
        if file.is_file():
            z.write(file, file.relative_to(artifacts))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for exe in ["labeeb-browser.exe", "obscura.exe"]:
        assert z.read(f"{name}/{exe}") == (dest / exe).read_bytes()
pin = json.loads((dest / "sidecar-manifest.json").read_text(encoding="utf-8"))
assert hashlib.sha256((dest / "obscura.exe").read_bytes()).hexdigest() == pin["sha256"]
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in [installer, archive, dest / "labeeb-browser.exe", dest / "obscura.exe"]}
for path in [artifacts / "SHA256-0.1.9.json", root / "docs/verification/windows-0.1.9-artifacts.json"]:
    path.write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")
print(json.dumps(hashes, indent=2))
