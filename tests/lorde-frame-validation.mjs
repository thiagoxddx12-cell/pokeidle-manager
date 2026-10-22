/** Validate backend sprite boundaries without a game session or npm packages. */
import assert from 'node:assert/strict'
import { createPokemonSpriteResolver, isValidPokemonSpriteFrame } from '../src/inventory/sprite-cache.ts'

const frame = { assetPath: 'assets/site/sprites.png', x: 14, y: 20, width: 32, height: 32, pageWidth: 2048, pageHeight: 2048 }
assert.equal(isValidPokemonSpriteFrame(frame), true)
for (const bad of [null, [], 'image', {},
  { ...frame, x: -1 }, { ...frame, y: -3 }, { ...frame, x: NaN },
  { ...frame, width: 0 }, { ...frame, width: Infinity },
  { ...frame, width: 2040 }, { ...frame, height: 2040 },
  { ...frame, pageWidth: -1 }, { ...frame, pageHeight: '2048' },
  { ...frame, assetPath: '' }, { ...frame, assetPath: undefined },
]) {
  assert.equal(isValidPokemonSpriteFrame(bad), false, `Malformed frame: ${JSON.stringify(bad)}`)
}
let now = 0
let times = 0
const resolve = createPokemonSpriteResolver(async () => ++times === 1 ? { ...frame, x: -40 } : frame,
  { now: () => now, retryMissingAfterMs: 60 })
assert.equal(await resolve([43]), null, 'invalid response must be treated as missing')
assert.equal(await resolve([43]), null, 'invalid frame must not cause a retry storm')
assert.equal(times, 1)
now = 61
assert.deepEqual(await resolve([43]), frame, 'correct data should recover after TTL')
assert.equal(times, 2)
console.log('PASSOU: 16 casos de geometria inválida e recuperação do cache de sprites.')
