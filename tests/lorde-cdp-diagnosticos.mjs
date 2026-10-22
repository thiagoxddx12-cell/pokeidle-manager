import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browser = readFileSync(resolve(root, 'src-tauri/src/browser.rs'), 'utf8')
assert.match(browser, /fn safe_cdp_error\(method: &str, category: &'static str, _raw: impl std::fmt::Display\)/)
assert.match(browser, /safe_cdp_error\(method, "comando rejeitado pelo navegador", error\)/)
assert.match(browser, /safe_cdp_error\(method, "resposta inválida", error\)/)
assert.match(browser, /cdp_errors_never_expose_browser_response_secrets/)
assert.doesNotMatch(browser, /BrowserError::Launch\(format!\("CDP \{method\}: \{error\}"\)\)/)
assert.doesNotMatch(browser, /Falha ao conectar ao Browser WebSocket CDP: \{error\}/)
assert.doesNotMatch(browser, /source: format!\("\{error\}; source:/)
console.log('PASSOU: regressão ESTÁTICA de erros CDP sem dados de sessão; testes Rust ainda não executados.')
