export type PokemonSpriteFrame = {
  assetPath: string
  x: number
  y: number
  width: number
  height: number
  pageWidth: number
  pageHeight: number
}

/** Valida dados de sprites recebidos da ponte Rust antes de montar CSS ou cache. */
export function isValidPokemonSpriteFrame(frame: unknown): frame is PokemonSpriteFrame {
  if (!frame || typeof frame !== 'object') return false
  const candidate = frame as Record<string, unknown>
  const positive = (key: string) => Number.isSafeInteger(candidate[key]) && (candidate[key] as number) > 0
  const nonNegative = (key: string) => Number.isSafeInteger(candidate[key]) && (candidate[key] as number) >= 0
  if (typeof candidate.assetPath !== 'string' || !candidate.assetPath.trim()) return false
  if (!nonNegative('x') || !nonNegative('y') || !positive('width') || !positive('height') ||
      !positive('pageWidth') || !positive('pageHeight')) return false
  const x = candidate.x as number
  const y = candidate.y as number
  const width = candidate.width as number
  const height = candidate.height as number
  const pageWidth = candidate.pageWidth as number
  const pageHeight = candidate.pageHeight as number
  return x + width <= pageWidth && y + height <= pageHeight
}

/**
 * O jogo pode ficar temporariamente sem um recurso. Nunca grave "não encontrado"
 * para sempre; erros de transporte e respostas nulas precisam poder ser refeitos.
 * Deduplicamos pedidos simultâneos e limitamos o cache em memória.
 */
export function createPokemonSpriteResolver(
  resolveLooktype: (looktype: number) => Promise<PokemonSpriteFrame | null>,
  options: { now?: () => number; retryMissingAfterMs?: number } = {},
) {
  const now = options.now ?? Date.now
  const retryMissingAfterMs = options.retryMissingAfterMs ?? 30_000
  const maxEntries = 4096
  type Cached = { promise: Promise<PokemonSpriteFrame | null>; expiresAt: number }
  const requests = new Map<number, Cached>()

  return async (looktypes: number[]): Promise<PokemonSpriteFrame | null> => {
    for (const looktype of new Set(looktypes)) {
      if (!Number.isSafeInteger(looktype) || looktype <= 0) continue
      let cached = requests.get(looktype)
      if (cached && cached.expiresAt <= now()) {
        requests.delete(looktype)
        cached = undefined
      }
      if (!cached) {
        const entry: Cached = { promise: Promise.resolve(null), expiresAt: Number.POSITIVE_INFINITY }
        entry.promise = resolveLooktype(looktype)
          .then((sprite) => {
            // Dados de dimensoes malformados equivalem a imagem ausente.
            // Revalidar apos o prazo em vez de congelar o cache com um frame invalido.
            const valid = isValidPokemonSpriteFrame(sprite) ? sprite : null
            if (valid === null) entry.expiresAt = now() + retryMissingAfterMs
            return valid
          })
          .catch((error: unknown) => {
            if (requests.get(looktype) === entry) requests.delete(looktype)
            throw error
          })
        if (requests.size >= maxEntries) {
          const oldest = requests.keys().next().value
          if (oldest !== undefined) requests.delete(oldest)
        }
        requests.set(looktype, entry)
        cached = entry
      }
      // Uma falha de transporte na primeira imagem não deve impedir a
      // tentativa das demais formas. A entrada com erro já foi invalidada.
      const frame = await cached.promise.catch(() => null)
      if (frame) return frame
    }
    return null
  }
}
