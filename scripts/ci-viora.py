"""Pack local Viora resources, or restore the pinned archive on a CI runner."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'packaging' / 'viora-app.tar.gz'
MANIFEST = ROOT / 'packaging' / 'viora-app.json'
APP = ROOT / 'viora-tauri' / 'app'
REQUIRED = ('index.html', 'LICENSE-AGPL-3.0.txt')


def check_app():
    for name in REQUIRED:
        if not (APP / name).is_file():
            raise SystemExit(f'Missing Viora resource: {APP / name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('pack', 'restore'))
    args = parser.parse_args()
    if args.command == 'pack':
        check_app()
        with tarfile.open(ARCHIVE, 'w:gz') as archive:
            for path in sorted(APP.rglob('*')):
                if path.is_symlink():
                    raise SystemExit(f'Symlinks are not allowed: {path}')
                if path.is_file():
                    archive.add(path, arcname=path.relative_to(APP).as_posix(), recursive=False)
        digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
        MANIFEST.write_text(json.dumps({'sha256': digest, 'source': 'Prepared local viora-tauri/app; see THIRD_PARTY_NOTICES.md'}, indent=2) + '\n', encoding='utf-8')
    else:
        expected = json.loads(MANIFEST.read_text(encoding='utf-8'))['sha256']
        if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != expected:
            raise SystemExit('Viora archive SHA256 mismatch')
        APP.mkdir(parents=True, exist_ok=True)
        with tarfile.open(ARCHIVE, 'r:gz') as archive:
            for member in archive.getmembers():
                destination = (APP / member.name).resolve()
                if not destination.is_relative_to(APP.resolve()) or not member.isfile():
                    raise SystemExit(f'Unsafe archive entry: {member.name}')
            archive.extractall(APP, filter='data')
        check_app()
    print(f'Viora resources: {args.command} complete')


if __name__ == '__main__':
    main()
