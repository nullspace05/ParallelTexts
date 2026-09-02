// Browser Cache API helpers for downloaded ONNX model files. Split out of
// model.ts on purpose: model.ts imports @huggingface/transformers (the large
// ML runtime), and these two functions only touch `caches`, so surfaces that
// merely need to know "is a model downloaded?" (e.g. the alignment import
// modal) can import this without pulling the runtime into their bundle. Same
// rationale as the model-registry.ts split. model.ts re-exports both for
// existing callers.

/**
 * Returns true if the model's fp32 ONNX file is already in the browser
 * Cache API (populated by downloadModel(), cleared by
 * deleteModelFromCache()). Models are fetched directly from Hugging Face,
 * cached under the full resolve URL
 * "https://huggingface.co/{modelId}/resolve/main/{filePath}" — matching on
 * "includes modelId" + "ends with filePath" is robust to that shape.
 */
export async function checkModelCached(modelId: string): Promise<boolean> {
  const filePath = "onnx/model.onnx"

  if (typeof caches === "undefined") return false
  try {
    const names = await caches.keys()
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (
        keys.some((r) => r.url.includes(modelId) && r.url.endsWith(filePath))
      ) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Removes all cached files for a model from every CacheStorage bucket.
 */
export async function deleteModelFromCache(modelId: string): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        const toDelete = keys.filter((r) => r.url.includes(`/${modelId}/`))
        await Promise.all(toDelete.map((r) => cache.delete(r)))
      })
    )
  } catch {}
}
