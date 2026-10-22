"""Test local integrity gate without creating or running a Windows executable."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'verificar_instalador.py'
spec = importlib.util.spec_from_file_location('verificar_instalador', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def fake_pe() -> bytes:
    # Synthetic test fixture, NEVER a runnable application.
    data = bytearray(1_000_256)
    data[0:2] = b'MZ'
    data[0x3c:0x40] = (0x100).to_bytes(4, 'little')
    data[0x100:0x104] = b'PE\0\0'
    return bytes(data)


class VerifyReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.exe = self.folder / 'Lorde_Nexus_0.1.0_x64-setup.exe'
        self.exe.write_bytes(fake_pe())
        self.good = hashlib.sha256(self.exe.read_bytes()).hexdigest()
        self.manifest = self.folder / 'SHA256SUMS.txt'
        self.manifest.write_text(f'{self.good}  {self.exe.name}\n', encoding='ascii')

    def test_good_artifact(self):
        self.assertEqual(module.verify(self.folder), [(self.exe.name, self.good)])

    def test_tampered_exe_is_rejected(self):
        with self.exe.open('ab') as f:
            f.write(b'corrupted')
        with self.assertRaisesRegex(ValueError, 'SHA256 divergente'):
            module.verify(self.folder)

    def test_missing_exe_rejected(self):
        self.exe.unlink()
        with self.assertRaisesRegex(ValueError, 'ausente'):
            module.verify(self.folder)

    def test_lookalike_non_pe_rejected(self):
        self.exe.write_bytes(b'A' * 1_000_256)
        self.manifest.write_text(f'{hashlib.sha256(self.exe.read_bytes()).hexdigest()}  {self.exe.name}\n')
        with self.assertRaisesRegex(ValueError, 'PE'):
            module.verify(self.folder)

    def test_extra_exe_rejected(self):
        (self.folder / 'extra.exe').write_bytes(b'garbage')
        with self.assertRaisesRegex(ValueError, 'nao listados'):
            module.verify(self.folder)

    def test_upstream_installer_cannot_be_relabelled(self):
        original = module.ORIGINAL_RC4_SHA256
        # Simula a detecção do hash original usando o conteúdo sintético.
        module.ORIGINAL_RC4_SHA256 = self.good
        self.addCleanup(setattr, module, 'ORIGINAL_RC4_SHA256', original)
        with self.assertRaisesRegex(ValueError, 'original RC4'):
            module.verify(self.folder)

    def test_invalid_brand_name_is_rejected(self):
        bad = self.folder / 'Pokeidle.Manager_0.1.0_x64-setup.exe'
        self.exe.rename(bad)
        self.manifest.write_text(f'{self.good}  {bad.name}\n', encoding='ascii')
        with self.assertRaisesRegex(ValueError, 'Lorde Nexus'):
            module.verify(self.folder)

    def test_manifest_with_two_installers_is_rejected(self):
        second = self.folder / 'Lorde_Nexus_backup_x64-setup.exe'
        second.write_bytes(self.exe.read_bytes())
        self.manifest.write_text(f'{self.good}  {self.exe.name}\n{self.good}  {second.name}\n', encoding='ascii')
        with self.assertRaisesRegex(ValueError, 'exatamente um'):
            module.verify(self.folder)

    def test_duplicate_or_traversal_rejected(self):
        self.manifest.write_text(f'{self.good}  {self.exe.name}\n{self.good}  {self.exe.name}\n')
        with self.assertRaisesRegex(ValueError, 'duplicado'):
            module.verify(self.folder)
        self.manifest.write_text(f'{self.good}  ../evil.exe\n')
        with self.assertRaisesRegex(ValueError, 'invalida'):
            module.verify(self.folder)


if __name__ == '__main__':
    unittest.main()
