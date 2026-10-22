import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest
import importlib.util

p = Path(__file__).resolve().parents[1] / 'scripts/testar_rust.py'
spec = importlib.util.spec_from_file_location('testar_rust', p)
rust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rust)


class TestRustRunner(unittest.TestCase):
    def test_inventory_has_real_attributes(self):
        inventory = rust.rust_inventory()
        self.assertEqual(inventory['declared_tests'], 255)
        self.assertEqual(inventory['ignored_manual_tests'], 1)
        self.assertGreaterEqual(inventory['rust_files'], 23)

    def test_all_targets_and_docs_are_separate(self):
        commands = dict(rust.commands())
        self.assertIn('--all-targets', commands['rust_all_targets'])
        self.assertIn('--doc', commands['rust_doc_tests'])
        self.assertIn('--locked', commands['rust_all_targets'])
        self.assertNotIn('--ignored', commands['rust_all_targets'])

    def test_manual_test_requires_explicit_opt_in(self):
        self.assertNotIn('brave_cdp_manual', dict(rust.commands()))
        self.assertIn('--ignored', dict(rust.commands(with_brave=True))['brave_cdp_manual'])

    def test_no_cargo_reports_blocked_not_passed(self):
        with TemporaryDirectory() as folder, patch.object(rust, 'REPORT', Path(folder) / 'report.json'):
            with patch.object(rust.shutil, 'which', return_value=None):
                result = rust.run()
            data = json.loads((Path(folder) / 'report.json').read_text())
            self.assertEqual(result, 2)
            self.assertEqual(data['status'], 'blocked')
            self.assertEqual(data['steps'], [])

    def test_brave_requires_real_port(self):
        with TemporaryDirectory() as folder, patch.object(rust, 'REPORT', Path(folder) / 'report.json'):
            with patch.dict(rust.os.environ, {'POKEIDLE_CDP_PORT': '999999'}):
                result = rust.run(with_brave=True)
            self.assertEqual(result, 2)
            data = json.loads((Path(folder) / 'report.json').read_text())
            self.assertEqual(data['status'], 'blocked')

    def test_failed_command_stops_workflow(self):
        class Result:
            returncode = 9
        with TemporaryDirectory() as folder, patch.object(rust, 'REPORT', Path(folder) / 'report.json'):
            with patch.object(rust.shutil, 'which', return_value='/usr/bin/cargo'):
                with patch.object(rust.subprocess, 'run', return_value=Result()) as mocked:
                    result = rust.run()
                    self.assertEqual(mocked.call_count, 1)
            data = json.loads((Path(folder) / 'report.json').read_text())
            self.assertEqual(result, 1)
            self.assertEqual(data['status'], 'failed')
            self.assertEqual(data['steps'][0]['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
