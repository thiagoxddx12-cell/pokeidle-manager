import { describe, expect, it, vi } from 'vitest'
import { createPokemonSpriteResolver, isValidPokemonSpriteFrame, type PokemonSpriteFrame } from './sprite-cache'

const frame: PokemonSpriteFrame = {
  assetPath: 'assets/pokemon.png',
  x: 0,
  y: 0,
  width: 32,
  height: 32,
  pageWidth: 256,
  pageHeight: 256,
}

describe('Pokemon sprite request cache', () => {
  it('rejeita coordenadas negativas e refaz a consulta apos TTL', async () => {
    expect(isValidPokemonSpriteFrame({ ...frame, x: -1 })).toBe(false)
    expect(isValidPokemonSpriteFrame({ ...frame, y: -1 })).toBe(false)
    expect(isValidPokemonSpriteFrame({ ...frame, pageWidth: 1 })).toBe(false)
    let now = 0
    const load = vi.fn().mockResolvedValueOnce({ ...frame, x: -10 }).mockResolvedValue(frame)
    const resolve = createPokemonSpriteResolver(load, { now: () => now, retryMissingAfterMs: 60 })
    await expect(resolve([401])).resolves.toBeNull()
    await expect(resolve([401])).resolves.toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    now = 61
    await expect(resolve([401])).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares pending and completed looktype requests across overlapping fallbacks', async () => {
    const resolvers = new Map<number, (value: PokemonSpriteFrame | null) => void>()
    const load = vi.fn((looktype: number) => {
      if (looktype === 900) return Promise.resolve(null)
      return new Promise<PokemonSpriteFrame | null>((done) => resolvers.set(looktype, done))
    })
    const resolveSprite = createPokemonSpriteResolver(load)
    const shinyFallback = resolveSprite([900, 401])
    const normal = resolveSprite([401])

    expect(load).toHaveBeenCalledTimes(2)
    resolvers.get(401)?.(frame)
    await Promise.resolve()

    await expect(shinyFallback).resolves.toEqual(frame)
    await expect(normal).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('retries a looktype after a transient resolver failure', async () => {
    const load = vi
      .fn<(looktype: number) => Promise<PokemonSpriteFrame | null>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(frame)
    const resolveSprite = createPokemonSpriteResolver(load)

    await expect(resolveSprite([401])).resolves.toBeNull()
    await expect(resolveSprite([401])).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('tries the next looktype if the first one fails to download', async () => {
    const load = vi.fn((looktype: number) => looktype === 402
      ? Promise.reject(new Error('network failure'))
      : Promise.resolve(frame))
    const resolveSprite = createPokemonSpriteResolver(load)
    await expect(resolveSprite([402, 401])).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reconsulta sprite ausente após prazo e conserva a imagem carregada', async () => {
    let clock = 0
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(frame)
    const resolveSprite = createPokemonSpriteResolver(load, {
      now: () => clock,
      retryMissingAfterMs: 100,
    })
    await expect(resolveSprite([777])).resolves.toBeNull()
    await expect(resolveSprite([777])).resolves.toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    clock = 101
    await expect(resolveSprite([777])).resolves.toEqual(frame)
    await expect(resolveSprite([777])).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('ignora looktypes inválidos', async () => {
    const load = vi.fn().mockResolvedValue(frame)
    const resolveSprite = createPokemonSpriteResolver(load)
    await expect(resolveSprite([0, -5, Number.NaN, 401])).resolves.toEqual(frame)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(401)
  })

})
