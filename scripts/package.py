"""Collect the completed Windows build and verify archive contents.

The version comes from package.json, or from the first argument:
    python scripts/package.py
    python scripts/package.py 0.1.12
"""
from pathlib import Path
import hashlib
import json
import shutil
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
version = sys.argv[1] if len(sys.argv) > 1 else json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
artifacts = root / "artifacts"
name = f"Labeeb-{version}-Windows-x64-portable"
dest = artifacts / name
dest.mkdir(parents=True, exist_ok=True)
release = root / "src-tauri/target/x86_64-pc-windows-msvc/release"
shutil.copy2(release / "labeeb-browser.exe", dest / "labeeb-browser.exe")
for filename in ["LICENSE", "THIRD_PARTY_NOTICES.md", "TRY_WINDOWS_AR.md"]:
    shutil.copy2(root / filename, dest / filename)
shutil.copytree(root / "licenses", dest / "licenses", dirs_exist_ok=True)
# Viora's interface is a separate AGPL program shipped beside Labeeb; Labeeb finds it in `viora/`.
viora = root / "viora-tauri"
if (viora / "app" / "index.html").exists():
    shutil.copytree(viora / "app", dest / "viora" / "app", dirs_exist_ok=True)
    shutil.copytree(viora / "shim", dest / "viora" / "shim", dirs_exist_ok=True)
else:
    print("note: viora-tauri/app not prepared; packaging without the built-in Viora")
# The verification record is written after testing a release; a build made before
# that record exists is still packaged, without it.
verification = root / f"docs/verification/windows-{version}.md"
if verification.exists():
    shutil.copy2(verification, dest / "VERIFICATION.md")
else:
    print(f"note: {verification.relative_to(root)} not found; packaging without VERIFICATION.md")
(dest / "README.txt").write_text(f"Labeeb {version} portable trial. Run labeeb-browser.exe.\nUse the toolbar sun/moon button or Settings > Appearance to select Light, Dark or System.\n", encoding="utf-8")
installer = artifacts / f"Labeeb-{version}-Windows-x64-setup.exe"
shutil.copy2(release / f"bundle/nsis/Labeeb_{version}_x64-setup.exe", installer)
archive = artifacts / f"{name}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for file in dest.rglob("*"):
        if file.is_file() and "video-tools" not in file.relative_to(dest).parts and file.name not in {"obscura.exe", "sidecar-manifest.json"}:
            z.write(file, file.relative_to(artifacts))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for exe in ["labeeb-browser.exe"]:
        assert z.read(f"{name}/{exe}") == (dest / exe).read_bytes()
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
          for p in [installer, archive, dest / "labeeb-browser.exe"]}
for path in [artifacts / f"SHA256-{version}.json", root / f"docs/verification/windows-{version}-artifacts.json"]:
    path.write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")
print(json.dumps(hashes, indent=2))
