/** Self-contained asset smoke tests; no game account, browser or network access. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
// `npm ci` installs this pinned compiler for a reproducible check.
const ts = require('typescript')
const changed = [
  'src/inventory/asset-components.tsx',
  'src/inventory/asset-request-cache.ts',
  'src/inventory/assets.ts',
  'src/inventory/assets.test.ts',
  'src/inventory/sprite-cache.ts',
  'src/inventory/sprite-cache.test.ts',
]
for (const rel of changed) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8')
  const node = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  assert.equal(node.parseDiagnostics.length, 0, `${rel}: TypeScript syntax diagnostics ${node.parseDiagnostics.map(x => x.messageText)}`)
}

const { createPokemonSpriteResolver } = await import(pathToFileURL(path.join(root, 'src/inventory/sprite-cache.ts')).href)
const frame = { assetPath: 'assets/s.png', x: 0, y: 0, width: 64, height: 64, pageWidth: 1024, pageHeight: 1024 }
let now = 0
let calls = 0
const retry = createPokemonSpriteResolver(async () => (++calls === 1 ? null : frame), { now: () => now, retryMissingAfterMs: 50 })
assert.equal(await retry([111]), null)
assert.equal(await retry([111]), null)
assert.equal(calls, 1)
now = 51
assert.deepEqual(await retry([111]), frame)
assert.equal(calls, 2)
assert.deepEqual(await retry([111]), frame)
assert.equal(calls, 2)

let calls2 = 0
const concurrent = createPokemonSpriteResolver(async () => { calls2++; await new Promise(r => setTimeout(r, 5)); return frame })
await Promise.all([concurrent([777]), concurrent([777])])
assert.equal(calls2, 1)

const skipInvalid = createPokemonSpriteResolver(async () => frame)
assert.equal(await skipInvalid([0, -1, Number.NaN]), null)

// Run asset resolver in isolation; type-only imports aren't needed at runtime.
const full = fs.readFileSync(path.join(root, 'src/inventory/assets.ts'), 'utf8')
const modulePart = full.slice(full.indexOf('export const PokemonAssetResolver = {'), full.indexOf('export const CombatAssetResolver'))
const transpiled = ts.transpileModule(modulePart, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { PokemonAssetResolver } = await import('data:text/javascript;base64,' + Buffer.from(transpiled).toString('base64'))
const pokemon = { shiny: true, looktype: 401, lookShiny: 402 }
const atlas = { cols: 16, rows: 50, assetPath: 'atlas.png', slots: { '401': [12, 2], '402': [999, 2] } }
assert.deepEqual(PokemonAssetResolver.atlasSlot(pokemon, atlas), { looktype: 401, slot: [12, 2] })
assert.equal(PokemonAssetResolver.atlasSlot(pokemon, { ...atlas, slots: { '402': [-1, 0] } }), null)
assert.equal(PokemonAssetResolver.shinyFrameMissingFromAtlas(pokemon, PokemonAssetResolver.atlasSlot(pokemon, atlas)), true)
assert.equal(PokemonAssetResolver.shinyFrameMissingFromAtlas(pokemon, { looktype: 402 }), false)
assert.equal(PokemonAssetResolver.shinyFrameMissingFromAtlas({ ...pokemon, shiny: false }, { looktype: 401 }), false)
assert.equal(PokemonAssetResolver.mayDisplayAtlasSlot(pokemon, { looktype: 401 }), false)
assert.equal(PokemonAssetResolver.mayDisplayAtlasSlot(pokemon, { looktype: 402 }), true)
assert.deepEqual(PokemonAssetResolver.frameLooktypes(pokemon, { looktype: 401 }, false), [402])
assert.deepEqual(PokemonAssetResolver.frameLooktypes(pokemon, null, true), [402])
assert.deepEqual(PokemonAssetResolver.frameLooktypes(pokemon, { looktype: 402 }, false), [])
assert.deepEqual(PokemonAssetResolver.frameLooktypes({ ...pokemon, shiny: false }, null, true), [401])
let transportRequests = 0
const recoverOnFallback = createPokemonSpriteResolver(async (looktype) => {
  transportRequests++
  if (looktype === 402) throw new Error('temporary sprite network outage')
  return frame
})
assert.deepEqual(await recoverOnFallback([402, 401]), frame)
assert.equal(transportRequests, 2)
assert.match(fs.readFileSync(path.join(root, 'src/inventory/asset-components.tsx'), 'utf8'),
  /atlas && atlasAsset\.url && PokemonAssetResolver\.mayDisplayAtlasSlot\(pokemon, atlas\)/,
  'shiny fallback must never display a known normal atlas cell')

const config = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
assert.equal(config.identifier, 'com.lordedosgames.pokeidlemanager')
assert.match(config.app.security.csp, /img-src[^;]+https:\/\/pokeidle\.io/)
const rust = fs.readFileSync(path.join(root, 'src-tauri/src/connection.rs'), 'utf8')
assert.ok(rust.includes('is_official_game_socket(&bootstrap.ws_url)'))
assert.ok(rust.includes('is_official_game_socket(value: &str)'))
assert.ok(!fs.readFileSync(path.join(root, 'src-tauri/src/browser.rs'), 'utf8').includes('url.contains("://pokeidle.io")'))
console.log('PASSOU: sintaxe TS, retry com fallback, shiny fiel, atlas e verificações estáticas.')
