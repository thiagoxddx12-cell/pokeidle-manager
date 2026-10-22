import assert from 'node:assert/strict'
import { createAssetRequestCache } from '../src/inventory/asset-request-cache.ts'

let count = 0
const cache = createAssetRequestCache(async (key) => {
  count++
  if (key === 'missing') return null
  if (key === 'temporary' && count === 3) throw new Error('network offline')
  return key + '.png'
}, 3)
assert.equal(await cache.request('missing'), null)
assert.equal(await cache.request('missing'), null)
assert.equal(count, 2, 'negative misses must be retried, not cached forever')
assert.equal(await cache.request('temporary'), null, 'a thrown error is visible as a miss')
assert.equal(await cache.request('temporary'), 'temporary.png', 'a failed request can recover')
const [a, b, c] = await Promise.all([cache.request('shared'), cache.request('shared'), cache.request('shared')])
assert.deepEqual([a, b, c], Array(3).fill('shared.png'))
assert.equal(count, 5, 'concurrent requests are deduplicated')
cache.invalidate('shared')
assert.equal(await cache.request('shared'), 'shared.png')
assert.equal(count, 6, 'invalidated resources revalidate')
await cache.request('1')
await cache.request('2')
await cache.request('3')
assert.equal(cache.size(), 3, 'cache must be bounded')
console.log('PASSOU: cache de imagens, retry após erro, deduplicação e limite de entradas.')
