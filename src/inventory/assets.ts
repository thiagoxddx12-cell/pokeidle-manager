import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import type { DepotPokemon, InventoryCategory, InventoryItem } from '../types'

export type CatalogItem = {
  id: number
  name: string
  category: string | null
  assetPath: string | null
}
export type MarkerAtlas = {
  assetPath: string
  cell: number
  cols: number
  rows: number
  slots: Record<string, [number, number]>
}
export type GameItemCatalog = { items: Record<string, CatalogItem>; markerAtlas: MarkerAtlas }

export const emptyCatalog: GameItemCatalog = {
  items: {},
  markerAtlas: { assetPath: '', cell: 64, cols: 16, rows: 1, slots: {} },
}

let catalogRequest: Promise<GameItemCatalog> | null = null
function fetchGameItemCatalog() {
  if (!catalogRequest) {
    catalogRequest = invoke<GameItemCatalog>('game_item_catalog').catch((error: unknown) => {
      // Nunca memorize permanentemente uma promessa rejeitada: isso deixava
      // todos os sprites e nomes de itens ausentes ate reiniciar o aplicativo.
      catalogRequest = null
      throw error
    })
  }
  return catalogRequest
}
export function useGameItemCatalog() {
  const [catalog, setCatalog] = useState<GameItemCatalog>(emptyCatalog)
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      try {
        const result = await fetchGameItemCatalog()
        if (active) setCatalog(result)
      } catch {
        if (active) timer = setTimeout(() => { void refresh() }, 30_000)
      }
    }
    void refresh()
    return () => {
      active = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])
  return catalog
}

const ballAssets: Record<string, string> = {
  '1': 'assets/site/assets/ui/ball-poke.png',
  '2': 'assets/site/assets/ui/ball-great.png',
  '3': 'img/ball-super.png',
  '4': 'assets/site/assets/ui/ball-ultra.png',
  '5': 'img/ball-beast.png',
}

const asInventoryCategory = (category: string | null | undefined): InventoryCategory => {
  if (category === 'heal') return 'potions'
  if (category === 'stone') return 'stones'
  return 'other'
}

export const ItemAssetResolver = {
  describe<T extends InventoryItem>(item: T, catalog: GameItemCatalog): T {
    const key = item.assetKey ?? item.id
    if (key.startsWith('ball-')) return { ...item, category: 'balls' } as T
    const real = catalog.items[key]
    if (!real) return item
    return { ...item, name: real.name || item.name, category: asInventoryCategory(real.category) } as T
  },
  assetPath(item: InventoryItem, catalog: GameItemCatalog) {
    const key = item.assetKey ?? item.id
    if (key.startsWith('ball-')) return ballAssets[key.slice('ball-'.length)] ?? null
    return catalog.items[key]?.assetPath ?? null
  },
}

export const PokemonAssetResolver = {
  preferredLooktypes(pokemon: DepotPokemon) {
    const values = pokemon.shiny ? [pokemon.lookShiny, pokemon.looktype] : [pokemon.looktype]
    return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0))]
  },
  // Se o atlas inclui apenas a forma normal, tente buscar o sprite shiny
  // individual primeiro; jamais apresente a forma normal como se fosse shiny
  // quando a imagem correta puder ser encontrada.
  shinyFrameMissingFromAtlas(pokemon: DepotPokemon, chosen: { looktype: number } | null) {
    const shiny = pokemon.lookShiny
    return Boolean(pokemon.shiny && typeof shiny === 'number' && Number.isSafeInteger(shiny)
      && shiny > 0 && shiny !== pokemon.looktype && chosen?.looktype !== shiny)
  },
  // Nunca exiba a forma comum de um shiny cujo lookShiny é conhecido.
  // Se a imagem especial não existir, mantenha o fallback visual e tente
  // novamente mais tarde em vez de identificar erroneamente o Pokémon.
  mayDisplayAtlasSlot(pokemon: DepotPokemon, chosen: { looktype: number } | null) {
    return Boolean(chosen && !this.shinyFrameMissingFromAtlas(pokemon, chosen))
  },
  frameLooktypes(pokemon: DepotPokemon, chosen: { looktype: number } | null, atlasUnavailable: boolean) {
    const preferred = this.preferredLooktypes(pokemon)
    const explicitShiny = this.shinyFrameMissingFromAtlas(pokemon, null)
    if (atlasUnavailable) return explicitShiny ? preferred.slice(0, 1) : preferred
    return this.shinyFrameMissingFromAtlas(pokemon, chosen) ? preferred.slice(0, 1) : []
  },
  atlasSlot(pokemon: DepotPokemon, atlas: MarkerAtlas) {
    for (const looktype of this.preferredLooktypes(pokemon)) {
      const slot = atlas.slots[String(looktype)]
      if (
        slot && slot.length === 2 &&
        slot.every((value) => Number.isSafeInteger(value) && value >= 0) &&
        slot[0] < atlas.cols && slot[1] < atlas.rows
      ) return { looktype, slot }
    }
    return null
  },
}

export const CombatAssetResolver = {
  potion(itemId: number, catalog: GameItemCatalog) {
    return catalog.items[String(itemId)]?.assetPath ?? null
  },
  ball(itemId: number) {
    return ballAssets[String(itemId)] ?? null
  },
}
