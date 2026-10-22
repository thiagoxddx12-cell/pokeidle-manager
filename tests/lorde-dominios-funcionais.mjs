/** Testes reais do código puro (sem dependências externas e sem acesso a contas). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readHuntReference, estimateHunts, bonusMultiplier } from '../src/hunts/calculator.ts'
import { createAssetRequestCache } from '../src/inventory/asset-request-cache.ts'
import { getMobileInventoryPage, cacheMobileInventoryPage, clearMobileInventoryCacheForTests } from '../src/mobile/inventory-cache.ts'
import { pokemonGridWindow } from '../src/inventory/virtual-grid.ts'
import { currentMarketPrice } from '../src/market-price.ts'
import { formatHuntElapsed } from '../src/dashboard-time.ts'
import { twitchChannelUrl, kickChannelUrl } from '../src/lives/urls.ts'

const clone = (value) => JSON.parse(JSON.stringify(value))
const ref = {
  tipos: { NORMAL: { NORMAL: 1 } },
  especies: [
    { id: 1, n: 'Atacante', t: ['NORMAL'], b: [70, 100, 75, 75, 75, 65], m: [['Tackle','NORMAL',0,50,2000,1]], l: [['Cristal',20,1,2,100]] },
    { id: 2, n: 'Alvo', t: ['NORMAL'], b: [50, 40, 55, 40, 55, 40], m: [] },
  ],
  hunts: [{ s: 'rota-a', n: 'Rota A', a: 'kanto', nv: 30, e: [[2,100]] }],
}
const account = {
  trainerLevel: 100,
  vip: false,
  xpBonus: {},
  activePokemon: { speciesId: 1, level: 85, quality: 1, potency: 1, shiny: false,
    ivs: { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, speed: 16 } },
  huntOptions: [{ slug: 'rota-a', level: 30, name: 'Rota A', region:'Kanto',
    species: [{ speciesId:2, weight:100 }] }],
}

test('referência válida gera estimativas finitas', () => {
  const parsed = readHuntReference(ref)
  assert.ok(parsed)
  const [value] = estimateHunts(account, parsed)
  assert.ok(value)
  for (const key of ['xpTrainerPerHour', 'xpPokemonPerHour', 'goldPerHour', 'killsPerHour', 'secondsPerKill']) {
    assert.ok(Number.isFinite(value[key]) && value[key] >= 0, `${key}: ${value[key]}`)
  }
})

test('loot nulo ou não-array é rejeitado sem crash', () => {
  for (const bad of [null, 12, {}, 'erro', true]) {
    const v = clone(ref); v.especies[0].l = bad
    assert.doesNotThrow(() => readHuntReference(v))
    const parsed = readHuntReference(v)
    assert.ok(parsed)
    assert.deepEqual(parsed.especies.map((species) => species.id), [2])
  }
})

test('níveis inválidos não entram no catálogo de hunts', () => {
  for (const level of [-3, -0.5, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const v = clone(ref); v.hunts[0].nv = level
    assert.equal(readHuntReference(v), null)
  }
})

test('nível observado inválido volta ao nível oficial do guia', () => {
  for (const level of [-100, 0, 3.5, Number.POSITIVE_INFINITY]) {
    const a = clone(account); a.huntOptions[0].level = level
    const parsed = readHuntReference(ref)
    const [value] = estimateHunts(a, parsed)
    assert.equal(value.hunt.nv, 30)
    assert.ok(Number.isFinite(value.goldPerHour))
  }
})

test('pesos inválidos do protocolo não produzem divisão inválida', () => {
  for (const weight of [Number.POSITIVE_INFINITY, Number.NaN, -25]) {
    const a = clone(account)
    a.huntOptions[0].species = [{ speciesId:2, weight }]
    const parsed = readHuntReference(ref)
    const [value] = estimateHunts(a, parsed)
    assert.ok(value && Number.isFinite(value.xpTrainerPerHour))
  }
})

test('IVs incompletos e nível de Pokémon inválido não produzem NaN', () => {
  for (const level of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const a = clone(account); a.activePokemon.level = level
    assert.deepEqual(estimateHunts(a, readHuntReference(ref)), [])
  }
  const a = clone(account); a.activePokemon.ivs.spAtk = Number.NaN
  assert.deepEqual(estimateHunts(a, readHuntReference(ref)), [])
})

test('bônus e qualidade inválidos não contaminam estimativas com Infinity/NaN', () => {
  for (const invalid of [Number.POSITIVE_INFINITY, Number.NaN, -12]) {
    const a = clone(account)
    a.xpBonus = { guildRankPct: invalid, twitchPct: invalid }
    const values = estimateHunts(a, readHuntReference(ref))
    assert.ok(values.every((entry) => Number.isFinite(entry.xpTrainerPerHour)))
    assert.ok(Number.isFinite(bonusMultiplier(a, true)))
  }
  for (const quality of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const a = clone(account)
    a.activePokemon.quality = quality
    assert.deepEqual(estimateHunts(a, readHuntReference(ref)), [])
  }
})

test('loot negativo e potência inválida são descartados do guia', () => {
  for (const drop of [-100, Number.NEGATIVE_INFINITY]) {
    const v = clone(ref)
    v.especies[0].l[0][1] = drop
    const parsed = readHuntReference(v)
    assert.ok(parsed)
    assert.equal(parsed.especies.some((species) => species.id === 1), false)
  }
})

test('duzentas mutações de conteúdo externo nunca derrubam parser', () => {
  const values = [null, undefined, 0, -1, 1, 'x', [], {}, true, false, Number.NaN, Number.POSITIVE_INFINITY]
  const mutations = [
    ['especies',0,'l'], ['especies',0,'m'], ['especies',0,'t'], ['especies',0,'b'],
    ['especies',0,'id'], ['especies',0,'n'], ['hunts',0,'nv'], ['hunts',0,'e'],
    ['hunts',0,'n'], ['hunts',0,'s'], ['hunts',0,'a'], ['tipos','NORMAL'],
    ['especies'], ['hunts'], ['tipos'],
  ]
  for (let i=0; i<200; i++) {
    const v=clone(ref), field=mutations[i % mutations.length], replacement=values[(i*7) % values.length]
    let target=v
    for (const key of field.slice(0,-1)) target=target[key]
    target[field.at(-1)]=replacement
    assert.doesNotThrow(() => {
      const result=readHuntReference(v)
      if (result) estimateHunts(account,result)
    }, `Mutation ${i}: ${field.join('.')}`)
  }
})

test('o cache não memoriza falhas de assets e deduplica requisições', async () => {
  let calls=0
  const loader = createAssetRequestCache(async () => { calls++; return calls===1 ? null : 'ok' })
  assert.equal(await loader.request('a'), null)
  assert.equal(await loader.request('a'), 'ok')
  assert.equal(await loader.request('a'), 'ok')
  assert.equal(calls, 2)
  let parallel=0
  const dedup=createAssetRequestCache(async () => {parallel++; await Promise.resolve();return 'ok'})
  await Promise.all([dedup.request('x'),dedup.request('x'),dedup.request('x')])
  assert.equal(parallel,1)
})

test('grade virtual nunca acessa índices fora do catálogo válido', () => {
  for (const count of [0,1,5,50,2000]) for (const width of [180,400,900,1600]) {
    for (const scroll of [0,500,100_000]) {
      const win=pokemonGridWindow(count,width,700,scroll)
      assert.ok(win.startIndex>=0 && win.startIndex<=count)
      assert.ok(win.endIndex>=win.startIndex && win.endIndex<=count)
    }
  }
})

test('preços diferenciam ausência, oferta, desconhecido e informação vencida', () => {
  const entry = { minGold: 125, minOrb: null, minGoldKnown:true, minOrbKnown:true, observedAt:100 }
  assert.deepEqual(currentMarketPrice(undefined,'gold',100),{state:'not-loaded'})
  assert.deepEqual(currentMarketPrice(entry,'gold',101),{state:'available',price:125})
  assert.deepEqual(currentMarketPrice(entry,'orb',101),{state:'no-offer'})
  assert.equal(currentMarketPrice(entry,'gold',100_000).state,'stale')
})

test('cache móvel limita tamanho e expira sem compartilhar outras contas', () => {
  clearMobileInventoryCacheForTests()
  for(let i=0;i<13;i++)cacheMobileInventoryPage(`account-${i}`,{id:i})
  assert.equal(getMobileInventoryPage('account-0'),null)
  assert.deepEqual(getMobileInventoryPage('account-12'),{id:12})
  clearMobileInventoryCacheForTests()
})

test('URLs de lives não aceitam encaminhamentos/URLs arbitrárias', () => {
  assert.equal(twitchChannelUrl('canal_01'),'https://www.twitch.tv/canal_01')
  assert.equal(twitchChannelUrl('evil/a'),null)
  assert.equal(kickChannelUrl('canal-01'),'https://kick.com/canal-01')
  assert.equal(kickChannelUrl('https://example.com'),null)
})

test('tempo de hunt trata relógio no futuro e formato normal', () => {
  assert.equal(formatHuntElapsed(1000,1000),'00:00')
  assert.equal(formatHuntElapsed(1000,0),'00:00')
  assert.equal(formatHuntElapsed(1000,3_661_000),'01:01:00')
})
