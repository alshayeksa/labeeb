#!/usr/bin/env python3
"""Reject post-build sidecar modifications in an extracted/installed bundle."""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--root',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True)
a=p.parse_args();m=json.loads(a.manifest.read_text(encoding='utf-8'))
files=[p for n in ('obscura','obscura.exe') for p in a.root.rglob(n) if p.is_file()]
if not files:raise SystemExit('No bundled sidecar found. Supply the extracted/installed app directory.')
for p in files:
 if hashlib.sha256(p.read_bytes()).hexdigest()!=m['sha256']:raise SystemExit(f'Bundled sidecar hash changed: {p}')
 print(f'PASS {p}')
