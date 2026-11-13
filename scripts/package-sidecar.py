#!/usr/bin/env python3
"""Fetch the pinned render-enabled Obscura release and emit a build-time pin."""
import argparse, hashlib, io, json, os, stat, tarfile, tempfile, urllib.request, zipfile
from pathlib import Path
VERSION = 'v0.2.6'
ASSETS = {
    "x86_64-pc-windows-gnu": ("obscura-x86_64-windows.zip", "0a110d0693753a252ed7ffd61e682363e8622caf79697f564c529099a31a6242"),
    "x86_64-pc-windows-gnullvm": ("obscura-x86_64-windows.zip", "0a110d0693753a252ed7ffd61e682363e8622caf79697f564c529099a31a6242"),
 'x86_64-pc-windows-msvc': ('obscura-x86_64-windows.zip','0a110d0693753a252ed7ffd61e682363e8622caf79697f564c529099a31a6242'),
 'aarch64-apple-darwin': ('obscura-aarch64-macos.tar.gz','19faa248ac762f466ddb822dbb03ed4f097312d10d1a4d5b2143e6040a9bebd0'),
 'x86_64-apple-darwin': ('obscura-x86_64-macos.tar.gz','897f03df4e3d704f946c5e14c6a90a34e0d4e4ef898c4b3201771712962cd7fb'),
 'x86_64-unknown-linux-gnu': ('obscura-x86_64-linux.tar.gz','eed986e478c5ec5439f531f2d7fb6b0e36a356f1df7a6c44a8e8fd4f2486bd76'),
 'aarch64-unknown-linux-gnu': ('obscura-aarch64-linux.tar.gz','e12aff8bbe40326386a471060083e9cec5255b67048996b84f649efef10cac39'),
}
MAX_ARCHIVE=256*1024*1024
MAX_BINARY=512*1024*1024

def download(asset, expected):
 request=urllib.request.Request(f'https://github.com/h4ckf0r0day/obscura/releases/download/{VERSION}/{asset}',headers={'User-Agent':'Labeeb-build/0.1'})
 with urllib.request.urlopen(request,timeout=120) as response:
  data=response.read(MAX_ARCHIVE+1)
 if len(data)>MAX_ARCHIVE or hashlib.sha256(data).hexdigest()!=expected:
  raise ValueError('Archive size/hash check failed; refusing to package')
 return data

def extract_binary(data, windows):
 name='obscura.exe' if windows else 'obscura'
 if windows:
  with zipfile.ZipFile(io.BytesIO(data)) as archive:
   entries=[e for e in archive.infolist() if Path(e.filename).name==name and not e.is_dir() and not stat.S_ISLNK(e.external_attr>>16)]
   if len(entries)!=1 or entries[0].file_size>MAX_BINARY:
    raise ValueError('Missing, duplicated, linked or oversized executable')
   return archive.read(entries[0])
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
  entries=[e for e in archive.getmembers() if Path(e.name).name==name and e.isfile()]
  if len(entries)!=1 or entries[0].size>MAX_BINARY:
   raise ValueError('Missing, duplicated, linked or oversized executable')
  source=archive.extractfile(entries[0])
  if source is None: raise ValueError('Executable unreadable')
  return source.read(MAX_BINARY+1)

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--target',choices=ASSETS,required=True)
 args=parser.parse_args()
 asset,archive_hash=ASSETS[args.target]
 binary=extract_binary(download(asset,archive_hash),'windows' in args.target)
 if len(binary)>MAX_BINARY: raise ValueError('Executable too large')
 directory=Path(__file__).resolve().parents[1]/'src-tauri'/'binaries'
 directory.mkdir(parents=True,exist_ok=True)
 output=directory/f"obscura-{args.target}{'.exe' if 'windows' in args.target else ''}"
 with tempfile.NamedTemporaryFile(dir=directory,delete=False) as f:
  f.write(binary); staging=Path(f.name)
 staging.chmod(0o755);os.replace(staging,output)
 manifest={'version':VERSION,'target':args.target,'asset':asset,'archiveSha256':archive_hash,'sha256':hashlib.sha256(binary).hexdigest(),'source':f'https://github.com/h4ckf0r0day/obscura/releases/tag/{VERSION}'}
 (directory/'sidecar-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'binary':str(output),**manifest},indent=2))
if __name__=='__main__': main()
