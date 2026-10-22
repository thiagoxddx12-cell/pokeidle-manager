import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import type { DepotPokemon, InventoryItem } from '../types'
import { ItemAssetResolver, PokemonAssetResolver, type GameItemCatalog } from './assets'
import { createPokemonSpriteResolver, isValidPokemonSpriteFrame, type PokemonSpriteFrame } from './sprite-cache'
import { createAssetRequestCache } from './asset-request-cache'

type ResolvedAsset = { path: string }
type SpriteFrame = PokemonSpriteFrame

// Reusable results for sprites/items. A temporary failure never remains cached forever.
const ASSET_RETRY_DELAY_MS = 35_000
const resolvePokemonSprite = createPokemonSpriteResolver((looktype) =>
  invoke<SpriteFrame | null>('resolve_pokemon_sprite', { looktypes: [looktype] }),
)

function inTauri() {
  return '__TAURI_INTERNALS__' in window
}

function verifyImageUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(url)
    image.onerror = () => reject(new Error('Não foi possível carregar o asset local.'))
    image.src = url
  })
}

const assetRequestCache = createAssetRequestCache(async (assetPath: string) => {
  const asset = await invoke<ResolvedAsset>('resolve_game_asset', { assetPath })
  return verifyImageUrl(convertFileSrc(asset.path))
})

type AssetLoadStatus = 'loading' | 'ready' | 'error'
type AssetLoad = { assetPath: string | null; url: string | null; status: AssetLoadStatus }

function useAssetState(assetPath: string | null | undefined): AssetLoad {
  const currentPath = assetPath || null
  const [state, setState] = useState<AssetLoad>({ assetPath: null, url: null, status: 'error' })
  useEffect(() => {
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    if (!assetPath || !inTauri()) {
      setState({ assetPath: currentPath, url: null, status: 'error' })
      return () => { active = false }
    }
    setState({ assetPath: currentPath, url: null, status: 'loading' })
    async function load() {
      const url = await assetRequestCache.request(assetPath!)
      if (!active) return
      setState({ assetPath: currentPath, url, status: url ? 'ready' : 'error' })
      // A rede do jogo pode ter falhado. Revalidar sem recriar a tela,
      // com um único timer por item visível e limpeza na desmontagem.
      if (!url) retry = setTimeout(() => { void load() }, ASSET_RETRY_DELAY_MS)
    }
    void load()
    return () => {
      active = false
      if (retry !== undefined) clearTimeout(retry)
    }
  }, [assetPath, currentPath])
  // A grade virtual não pode reutilizar imagem da linha anterior.
  return state.assetPath === currentPath
    ? state
    : { assetPath: currentPath, url: null, status: currentPath ? 'loading' : 'error' }
}

function useAssetUrl(assetPath: string | null | undefined) {
  return useAssetState(assetPath).url
}

function AssetFallback({ label, className = '' }: { label: string; className?: string }) {
  return (
    <span className={`asset-fallback ${className}`.trim()} aria-label={`${label}: sem imagem`}>
      ?
    </span>
  )
}

export function ItemAsset({
  item,
  catalog,
  compact = false,
}: {
  item: InventoryItem
  catalog: GameItemCatalog
  compact?: boolean
}) {
  const source = ItemAssetResolver.assetPath(item, catalog)
  const url = useAssetUrl(source)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  useEffect(() => {
    if (!failed) return
    const retry = setTimeout(() => setFailed(false), ASSET_RETRY_DELAY_MS)
    return () => clearTimeout(retry)
  }, [failed, url])
  if (!url || failed)
    return <AssetFallback label={item.name} className={compact ? 'asset-compact' : ''} />
  return (
    <img
      className={`resolved-asset ${compact ? 'asset-compact' : ''}`.trim()}
      src={url}
      alt=""
      onError={() => { if (source) assetRequestCache.invalidate(source); setFailed(true) }}
    />
  )
}

// Resolucoes de sprites que falham devem ser repetidas sem reiniciar o Manager.
// O backend e o cache TS revalidam ausencias apos 30s; agendamos um pouco
// depois, apenas enquanto a linha do inventario estiver montada/visivel.
const SPRITE_RETRY_DELAY_MS = 31_000
function useSpriteFrame(key: string) {
  const [resolved, setResolved] = useState<{ key: string; frame: SpriteFrame | null }>({ key: '', frame: null })
  useEffect(() => {
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    setResolved({ key, frame: null })
    if (!key || !inTauri()) {
      return () => { active = false }
    }
    const looktypes = key.split(',').map(Number).filter(Number.isFinite)
    async function load() {
      let frame: SpriteFrame | null = null
      try {
        frame = await resolvePokemonSprite(looktypes)
      } catch {
        // Falhas temporarias nao devem causar retry rapido ou tela travada.
      }
      if (!active) return
      setResolved({ key, frame })
      if (!frame) retry = setTimeout(() => { void load() }, SPRITE_RETRY_DELAY_MS)
    }
    void load()
    return () => {
      active = false
      if (retry !== undefined) clearTimeout(retry)
    }
  }, [key])
  return resolved.key === key ? resolved.frame : null
}

export function PokemonAsset({
  pokemon,
  catalog,
  size = 68,
}: {
  pokemon: DepotPokemon
  catalog: GameItemCatalog
  size?: number
}) {
  const visualSize = Math.max(32, size)
  const atlas = PokemonAssetResolver.atlasSlot(pokemon, catalog.markerAtlas)
  const atlasAsset = useAssetState(atlas ? catalog.markerAtlas.assetPath : null)
  // O atlas pode conter a forma normal mas não a forma shiny. Nesse caso,
  // tentamos a imagem shiny separada antes de recorrer ao atlas comum.
  const needShinyFrame = PokemonAssetResolver.shinyFrameMissingFromAtlas(pokemon, atlas)
  const frameCandidates = PokemonAssetResolver.frameLooktypes(
    pokemon, atlas, !atlas || atlasAsset.status === 'error',
  )
  const frame = useSpriteFrame(frameCandidates.join(','))
  const frameUrl = useAssetUrl(frame?.assetPath)
  const scaledFrame = isValidPokemonSpriteFrame(frame) && frameUrl
    ? (() => {
        const scale = Math.min((visualSize - 6) / frame.width, (visualSize - 6) / frame.height)
        return (
          <span className="pokemon-asset-frame" role="img" aria-label={pokemon.name}
            style={{ width: visualSize, height: visualSize }}>
            <span style={{
              width: frame.width * scale, height: frame.height * scale,
              backgroundImage: `url("${frameUrl}")`,
              backgroundSize: `${frame.pageWidth * scale}px ${frame.pageHeight * scale}px`,
              backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
            }} />
          </span>
        )
      })() : null
  if (needShinyFrame && scaledFrame) return scaledFrame
  if (atlas && atlasAsset.url && PokemonAssetResolver.mayDisplayAtlasSlot(pokemon, atlas)) {
    const [column, row] = atlas.slot
    return (
      <span
        className="pokemon-asset pokemon-atlas"
        role="img"
        aria-label={pokemon.name}
        style={{
          width: visualSize,
          height: visualSize,
          backgroundImage: `url("${atlasAsset.url}")`,
          backgroundSize: `${catalog.markerAtlas.cols * 100}% ${catalog.markerAtlas.rows * 100}%`,
          backgroundPosition: `${(column / Math.max(1, catalog.markerAtlas.cols - 1)) * 100}% ${(row / Math.max(1, catalog.markerAtlas.rows - 1)) * 100}%`,
        }}
      />
    )
  }
  if (scaledFrame) return scaledFrame
  return <AssetFallback label={needShinyFrame ? `${pokemon.name} shiny` : pokemon.name} className="pokemon-asset-fallback" />
}
