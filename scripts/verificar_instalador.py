#!/usr/bin/env python3
"""Verify build artifact integrity. Does NOT establish publisher trust or malware freedom."""
from __future__ import annotations
import argparse
import hashlib
import re
from pathlib import Path

HASH_LINE = re.compile(r'^([0-9a-fA-F]{64})  ([^\\/\r\n]+)$')

# Hash confirmado do executável original RC4: não é o build das nossas correções.
ORIGINAL_RC4_SHA256 = '3f994d6c0be7386ad95938a3a8905047886021dd560813ee0ffd53e0b8bd2e7b'


def verify(folder: Path) -> list[tuple[str, str]]:
    folder = folder.resolve()
    manifest = folder / 'SHA256SUMS.txt'
    if not manifest.is_file():
        raise ValueError('Arquivo SHA256SUMS.txt ausente.')
    lines = [line for line in manifest.read_text(encoding='ascii').splitlines() if line.strip()]
    if not lines:
        raise ValueError('O manifesto SHA256SUMS esta vazio.')
    seen: set[str] = set()
    verified: list[tuple[str, str]] = []
    for line in lines:
        match = HASH_LINE.fullmatch(line)
        if match is None:
            raise ValueError('Linha invalida no manifesto SHA256SUMS.')
        expected, filename = match.groups()
        if filename in {'.', '..'} or filename.startswith('.') or ':' in filename or filename != Path(filename).name:
            raise ValueError('Nome de arquivo potencialmente perigoso no manifesto.')
        if filename.lower() in seen:
            raise ValueError('Nome duplicado no manifesto SHA256SUMS.')
        seen.add(filename.lower())
        lower_filename = filename.lower()
        if not (lower_filename.endswith('-setup.exe') and 'lorde' in lower_filename and 'nexus' in lower_filename):
            raise ValueError('Instalador nao identificado como Lorde Nexus NSIS.')
        candidate = folder / filename
        if not candidate.is_file() or candidate.is_symlink():
            raise ValueError(f'Instalador ausente ou link nao permitido: {filename}')
        file_size = candidate.stat().st_size
        if file_size < 1_000_000:
            raise ValueError(f'EXE muito pequeno para um instalador completo: {filename}')
        with candidate.open('rb') as stream:
            prefix = stream.read(64)
            if len(prefix) < 64 or prefix[:2] != b'MZ':
                raise ValueError(f'Assinatura PE (MZ) ausente: {filename}')
            pointer = int.from_bytes(prefix[0x3c:0x40], 'little')
            if pointer < 64 or pointer >= file_size - 4:
                raise ValueError(f'Cabecalho PE invalido: {filename}')
            stream.seek(pointer)
            if stream.read(4) != b'PE\0\0':
                raise ValueError(f'Cabecalho PE ausente: {filename}')
            stream.seek(0)
            hasher = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                hasher.update(chunk)
            digest = hasher.hexdigest()
        if digest.lower() != expected.lower():
            raise ValueError(f'SHA256 divergente: {filename}')
        if digest.lower() == ORIGINAL_RC4_SHA256:
            raise ValueError('EXE original RC4 foi apresentado como Lorde Nexus: recusado.')
        verified.append((filename, digest))
    if len(verified) != 1:
        raise ValueError('Esperado exatamente um instalador NSIS Lorde Nexus.')
    actual = {p.name.lower() for p in folder.glob('*.exe') if p.is_file()}
    if actual != seen:
        raise ValueError('A pasta contem executaveis nao listados no manifesto.')
    return verified


def main() -> None:
    parser = argparse.ArgumentParser(description='Confere SHA256 e cabecalho do instalador Lorde Nexus')
    parser.add_argument('folder', type=Path, help='Pasta contendo instalador EXE e SHA256SUMS.txt')
    args = parser.parse_args()
    try:
        verified = verify(args.folder)
    except (ValueError, OSError, UnicodeError) as error:
        parser.exit(1, f'FALHOU: {error}\n')
    for filename, digest in verified:
        print(f'PASSOU: {filename} SHA256={digest}')
    print('ATENCAO: integridade nao comprova origem, seguranca, assinatura digital nem testes funcionais.')

if __name__ == '__main__':
    main()
