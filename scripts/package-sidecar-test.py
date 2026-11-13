#!/usr/bin/env python3
import importlib.util,io,tarfile,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('package_sidecar',Path(__file__).with_name('package-sidecar.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PackageSafetyTests(unittest.TestCase):
 def test_only_expected_zip_bytes(self):
  data=io.BytesIO()
  with zipfile.ZipFile(data,'w') as z:
   z.writestr('../../unsafe',b'not extracted');z.writestr('release/obscura.exe',b'PE')
  self.assertEqual(module.extract_binary(data.getvalue(),True),b'PE')
 def test_duplicate_rejected(self):
  data=io.BytesIO()
  with zipfile.ZipFile(data,'w') as z:
   z.writestr('a/obscura.exe',b'a');z.writestr('b/obscura.exe',b'b')
  with self.assertRaises(ValueError):module.extract_binary(data.getvalue(),True)
 def test_symlink_rejected(self):
  data=io.BytesIO()
  with tarfile.open(fileobj=data,mode='w:gz') as z:
   e=tarfile.TarInfo('obscura');e.type=tarfile.SYMTYPE;e.linkname='/etc/passwd';z.addfile(e)
  with self.assertRaises(ValueError):module.extract_binary(data.getvalue(),False)
 def test_regular_tar_bytes(self):
  data=io.BytesIO()
  with tarfile.open(fileobj=data,mode='w:gz') as z:
   e=tarfile.TarInfo('release/obscura');e.size=3;z.addfile(e,io.BytesIO(b'ELF'))
  self.assertEqual(module.extract_binary(data.getvalue(),False),b'ELF')
if __name__=='__main__':unittest.main()
