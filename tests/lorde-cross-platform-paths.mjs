/** Windows/Linux/macOS smoke check for source-test path handling. No external dependencies. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lorde nexus caminho com espaço-'))
try {
  const pathname = path.join(fixture, 'formá-shiny de teste.mjs')
  fs.writeFileSync(pathname, '')
  const url = pathToFileURL(pathname)
  assert.equal(fileURLToPath(url), pathname, 'URL de arquivo deve ser decodificada sem perda')
  assert.notEqual(url.pathname, pathname, 'URL.pathname nao pode ser usada como caminho de arquivo')

  // A Windows file URL contains a leading slash in pathname. Using it as a path
  // is not equivalent to fileURLToPath(file:), especially with drive letters.
  const windowsUrl = new URL('file:///C:/Lorde%20Nexus/tests/smoke.mjs')
  assert.equal(windowsUrl.pathname, '/C:/Lorde%20Nexus/tests/smoke.mjs')
  assert.notEqual(path.win32.normalize(windowsUrl.pathname), 'C:\\Lorde Nexus\\tests\\smoke.mjs')

  const source = fs.readFileSync(new URL('./lorde-fonte-smoke.mjs', import.meta.url), 'utf8')
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/, 'Smoke must be portable to Windows')
  assert.doesNotMatch(source, /new URL\(import\.meta\.url\)\.pathname/, 'Do not reintroduce URL.pathname bug')
  console.log('PASSOU: caminhos de teste portaveis entre Linux, Windows e pastas com acentos/espaços.')
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
