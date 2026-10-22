#!/usr/bin/env python3
"""Checks for sensitive build and source misconfiguration; not a malware scan."""
from pathlib import Path
import json, sys
ROOT = Path(__file__).resolve().parents[1]
errors = []
def ensure(condition, message):
    if not condition:
        errors.append(message)
def read(path): return (ROOT / path).read_text(encoding='utf-8')
config = json.loads(read('src-tauri/tauri.conf.json'))
ensure(config['identifier'] == 'com.lordedosgames.pokeidlemanager', 'App must isolate its user profiles from upstream.')
ensure(config['build']['beforeBuildCommand'] == 'npm run build', 'UI build check missing.')
ensure(config['bundle']['active'] is True, 'Tauri bundle disabled.')
ensure(config['bundle']['targets'] == ['nsis'], 'EXE NSIS must be the only mandatory bundle target.')
ensure(config['productName'] == 'Lorde Nexus', 'Brand identity mismatch.')
ensure('https://pokeidle.io' in config['app']['security']['csp'], 'CSP official image source missing.')
ensure('GNU GENERAL PUBLIC LICENSE' in read('LICENSE'), 'GPL source license missing.')
source = read('src-tauri/src/browser.rs')
ensure('--remote-debugging-address=127.0.0.1' in source, 'CDP must listen only on loopback.')
ensure('is_local_browser_debugger_url(&web_socket_debugger_url, port)' in source, 'CDP endpoint validation missing.')
ensure('.redirect(reqwest::redirect::Policy::none())' in source, 'CDP HTTP redirect disabled check missing.')
ensure('fn safe_cdp_error(method: &str' in source, 'CDP diagnostic redaction missing.')
ensure('is_official_game_socket(url)' in source, 'WebSocket origin validation missing.')
connection = read('src-tauri/src/connection.rs')
ensure('if !is_official_game_socket(&bootstrap.ws_url)' in connection, 'Session handoff origin guard missing.')
ensure('.map_err(safe_socket_connect_error)' in connection, 'Network errors must be redacted before reaching UI/logs.')
ensure('fn secret_field(key: &str)' in read('src-tauri/src/logging.rs'), 'Log secret redaction missing.')
ensure('"wss"' in connection and '"pokeidle.io"' in connection, 'TLS socket/domain allowlist missing.')
sprites = read('src/inventory/asset-components.tsx')
ensure('SPRITE_RETRY_DELAY_MS' in sprites, 'Sprite retry missing.')
ensure('PokemonAssetResolver.mayDisplayAtlasSlot(pokemon, atlas)' in sprites, 'Shiny display fidelity guard missing.')
ensure('clearTimeout(retry)' in sprites, 'Sprite retry cleanup missing.')
ensure('isValidPokemonSpriteFrame(frame)' in sprites, 'Sprite UI geometry validation missing.')
ensure('const valid = isValidPokemonSpriteFrame(sprite)' in read('src/inventory/sprite-cache.ts'), 'Invalid sprite cache guard missing.')
ensure('catalogRequest = null' in read('src/inventory/assets.ts'), 'Catalog promise retry missing.')
ensure('LICENSE' in read('src-tauri/tauri.conf.json'), 'Bundle license missing.')
ensure('fileURLToPath(import.meta.url)' in read('tests/lorde-fonte-smoke.mjs'), 'Windows smoke path must use fileURLToPath.')
for forbidden in ['--remote-debugging-address=0.0.0.0', '--disable-web-security', '--no-sandbox']:
    ensure(forbidden not in source, f'Unsafe browser argument in source: {forbidden}')
for candidate in ROOT.rglob('*'):
    if not candidate.is_file() or any(folder in candidate.parts for folder in ('node_modules','.git','target')):
        continue
    if (candidate.suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.pem', '.p12', '.key'}
        or candidate.name.lower().startswith('.env')
        or candidate.name.lower() in {'cookies.json', 'cookies.txt', 'localstorage.json'}):
        errors.append(f'Potential private data or secret bundled: {candidate.relative_to(ROOT)}')
if errors:
    print('FALHOU: verificacoes de origem/seguranca:')
    for error in errors: print(' -', error)
    sys.exit(1)
print('PASSOU: preflight de configuracao, isolamento, CDP, sockets e sprites. (Teste estatico, nao auditoria total.)')
