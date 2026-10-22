#!/usr/bin/env python3
"""Run actual Rust checks, or explicitly report BLOCKED. Never pretend static scans are tests.

Windows GitHub Actions needs the stable Rust toolchain, Cargo and network for dependencies.
The single #[ignore] CDP test can ONLY be run with --with-brave and a local Brave CDP port.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'src-tauri/Cargo.toml'
REPORT = ROOT / 'build_reports/rust_suite.json'


def rust_inventory():
    files = list((ROOT / 'src-tauri/src').rglob('*.rs'))
    tests = 0
    ignored = 0
    for file in files:
        source = file.read_text(encoding='utf-8')
        tests += len(re.findall(r'#\[\s*(?:tokio::test|test)(?:\s*\([^]]*\))?\s*\]', source))
        ignored += len(re.findall(r'#\[ignore(?:\s*=|\])', source))
    return {'rust_files': len(files), 'declared_tests': tests, 'ignored_manual_tests': ignored}


def commands(with_brave=False):
    common = ['--manifest-path', MANIFEST]
    feature = ['--locked', '--no-default-features', '--features', 'community-build']
    steps = [
        ('rustfmt', ['cargo', 'fmt', *common, '--all', '--', '--check']),
        ('clippy_all_targets', ['cargo', 'clippy', *common, *feature, '--all-targets']),
        ('rust_all_targets', ['cargo', 'test', *common, *feature, '--all-targets']),
        ('rust_doc_tests', ['cargo', 'test', *common, *feature, '--doc']),
    ]
    if with_brave:
        steps.append(('brave_cdp_manual', [
            'cargo', 'test', *common, *feature,
            'probes_a_real_cdp_version_endpoint_from_rust', '--', '--ignored',
        ]))
    return steps


def run(with_brave=False):
    now = datetime.now(timezone.utc).isoformat()
    report = {'timestamp_utc': now, 'inventory': rust_inventory(), 'environment': {
        'platform': sys.platform, 'cargo_available': bool(shutil.which('cargo'))},
        'status': 'blocked', 'steps': []}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    def save():
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    port_value = os.environ.get('POKEIDLE_CDP_PORT', '')
    if with_brave and not (port_value.isdigit() and 1 <= int(port_value) <= 65535):
        report['reason'] = 'POKEIDLE_CDP_PORT ausente ou inválido; teste real do Brave não executado.'
        save()
        print('BLOQUEADO: configure uma porta local real do Brave para o teste manual.', file=sys.stderr)
        return 2
    if not shutil.which('cargo'):
        report['reason'] = 'Cargo indisponível; nenhum teste Rust executado.'
        save()
        print('BLOQUEADO: cargo não está instalado; testes Rust não foram executados.', file=sys.stderr)
        return 2
    for name, argv in commands(with_brave):
        print('Executando etapa:', name, flush=True)
        result = subprocess.run(argv, cwd=ROOT, check=False)
        report['steps'].append({'name': name, 'command': argv, 'exit_code': result.returncode,
                                'status': 'passed' if result.returncode == 0 else 'failed'})
        if result.returncode:
            report['status'] = 'failed'
            report['reason'] = 'A etapa ' + name + ' falhou; as seguintes não foram executadas.'
            save()
            return 1
    report['status'] = 'passed'
    report['reason'] = 'Todas as etapas Rust selecionadas passaram nesta máquina.'
    save()
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Lorde Nexus: suíte de testes Rust real')
    parser.add_argument('--with-brave', action='store_true', help='Executar também o teste ignorado com um Brave REAL local')
    parser.add_argument('--inventory-only', action='store_true', help='Apenas contar os testes; NÃO executa Rust')
    options = parser.parse_args()
    if options.inventory_only:
        print(json.dumps(rust_inventory(), indent=2))
    else:
        sys.exit(run(options.with_brave))
