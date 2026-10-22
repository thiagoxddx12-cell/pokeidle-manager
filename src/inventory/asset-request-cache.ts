/**
 * Cache de assets estáticos em uso no inventário.
 * Não memoriza falhas, evita downloads duplicados e limita memória em listas grandes.
 * Não recebe tokens, perfis do navegador nem URLs arbitrárias do usuário.
 */
export function createAssetRequestCache<T>(
  loader: (assetPath: string) => Promise<T | null>,
  maxEntries = 2048,
) {
  const requests = new Map<string, Promise<T | null>>()
  return {
    request(assetPath: string): Promise<T | null> {
      const cached = requests.get(assetPath)
      if (cached) return cached
      // The microtask also ensures in-flight references are stored before settlement.
      const pending: Promise<T | null> = Promise.resolve()
        .then(() => loader(assetPath))
        .catch(() => null)
        .then((result) => {
          if (result === null && requests.get(assetPath) === pending) requests.delete(assetPath)
          return result
        })
      if (requests.size >= maxEntries) {
        const oldest = requests.keys().next().value
        if (oldest !== undefined) requests.delete(oldest)
      }
      requests.set(assetPath, pending)
      return pending
    },
    invalidate(assetPath: string) {
      requests.delete(assetPath)
    },
    size() {
      return requests.size
    },
  }
}
