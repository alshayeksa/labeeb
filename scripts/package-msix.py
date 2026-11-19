"""Package the verified portable Windows build for Partner Center (unsigned).

Usage: python scripts/package-msix.py [--makeappx PATH]
No certificate, installation, upload or publication is performed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--makeappx', type=Path)
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
parts = version.split('.')
assert len(parts) == 3 and all(p.isdigit() and 0 <= int(p) <= 65535 for p in parts)
package_version = version + '.0'
identity = json.loads((root / 'packaging/store-identity.json').read_text(encoding='utf-8'))
artifacts = root / 'artifacts'
portable = artifacts / f'Labeeb-{version}-Windows-x64-portable'
exe = portable / 'labeeb-browser.exe'
hashes = json.loads((artifacts / f'SHA256-{version}.json').read_text(encoding='utf-8'))
expected = next(value for key, value in hashes.items() if key.replace('\\', '/').endswith(f'Labeeb-{version}-Windows-x64-portable/labeeb-browser.exe'))
assert hashlib.sha256(exe.read_bytes()).hexdigest() == expected, 'Portable executable hash mismatch'
assert (portable / 'viora/app/index.html').is_file(), 'Viora resources are required'

tool = args.makeappx
if tool is None:
    sdk = Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'Windows Kits/10/bin'
    candidates = [p for p in sdk.glob('*/x64/makeappx.exe') if all(v.isdigit() for v in p.parent.parent.name.split('.'))]
    tool = max(candidates, key=lambda p: tuple(map(int, p.parent.parent.name.split('.')))) if candidates else None
if tool is None or not tool.is_file():
    raise SystemExit('Install the Windows SDK or pass --makeappx PATH')

out = artifacts / f'Labeeb-{version}-Windows-x64-store.msix'
log = root / f'docs/verification/windows-{version}-msix.log'
namespace = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10'
with tempfile.TemporaryDirectory(prefix='msix-stage-', dir=artifacts) as temporary:
    stage = Path(temporary).resolve()
    assert stage.is_relative_to(artifacts.resolve())
    shutil.copy2(exe, stage / exe.name)
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copy2(portable / name, stage / name)
    for name in ['licenses', 'viora']:
        shutil.copytree(portable / name, stage / name)
    assets = stage / 'Assets'
    assets.mkdir()
    for name, size in [('StoreLogo.png', 50), ('Square44x44Logo.png', 44), ('Square150x150Logo.png', 150)]:
        source = root / 'src-tauri/icons' / name
        data = source.read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (size, size), name
        shutil.copy2(source, assets / name)
    manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="{namespace}"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap rescap">
 <Identity Name={quoteattr(identity['name'])} Publisher={quoteattr(identity['publisher'])}
  Version="{package_version}" ProcessorArchitecture="x64" />
 <Properties>
  <DisplayName>{escape(identity['displayName'])}</DisplayName>
  <PublisherDisplayName>{escape(identity['publisherDisplayName'])}</PublisherDisplayName>
  <Description>Arabic-first browser with an AI assistant</Description>
  <Logo>Assets\StoreLogo.png</Logo>
 </Properties>
 <Resources><Resource Language="ar-SA"/><Resource Language="en-US"/></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0"/></Dependencies>
 <Applications>
  <Application Id="Labeeb" Executable="labeeb-browser.exe" EntryPoint="Windows.FullTrustApplication">
   <uap:VisualElements DisplayName="Labeeb" Description="Arabic-first browser with an AI assistant"
    Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" BackgroundColor="transparent"/>
  </Application>
 </Applications>
 <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>
</Package>
'''
    (stage / 'AppxManifest.xml').write_text(manifest, encoding='utf-8')
    # Keep schema validation enabled: never use MakeAppx /nv.
    result = subprocess.run([str(tool), 'pack', '/d', str(stage), '/p', str(out), '/o'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_bytes(result.stdout)
    if result.returncode:
        raise SystemExit(f'MakeAppx failed ({result.returncode}); see {log}')
    with zipfile.ZipFile(out) as package:
        assert package.testzip() is None
        assert 'AppxSignature.p7x' not in package.namelist()
        assert hashlib.sha256(package.read('labeeb-browser.exe')).hexdigest() == expected
        parsed = ET.fromstring(package.read('AppxManifest.xml'))
        actual = parsed.find(f'{{{namespace}}}Identity')
        assert actual.attrib == {'Name': identity['name'], 'Publisher': identity['publisher'], 'Version': package_version, 'ProcessorArchitecture': 'x64'}
        assert parsed.find(f'{{{namespace}}}Properties/{{{namespace}}}PublisherDisplayName').text == identity['publisherDisplayName']
        assert 'viora/app/index.html' in package.namelist()
        (artifacts / f'Labeeb-{version}-AppxManifest.xml').write_bytes(package.read('AppxManifest.xml'))
        file_count = len(package.namelist())
report = {
    'package': str(out.relative_to(root)), 'version': package_version, 'identity': identity,
    'sha256': hashlib.sha256(out.read_bytes()).hexdigest(), 'bytes': out.stat().st_size,
    'files': file_count, 'makeappx': str(tool), 'schemaValidation': 'passed',
    'archiveIntegrity': 'passed', 'executableHashMatchesPortable': True,
    'signed': False, 'installedAppTest': 'not run', 'storeCertification': 'not submitted',
    'webview2': 'Evergreen Runtime required; not bundled in this MSIX'
}
(root / f'docs/verification/windows-{version}-msix.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
