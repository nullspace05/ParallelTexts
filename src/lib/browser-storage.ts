import { db } from "@/lib/db"
import { withTimeout } from "@/lib/operation-diagnostics"

export interface StorageCheckResult {
  indexedDb: boolean
  cacheStorage: boolean
  indexedDbError?: string
  cacheStorageError?: string
}

/**
 * Tests the two browser storage APIs the app depends on without retaining data.
 * Some private-browsing and privacy configurations expose the APIs but reject
 * their first read or write, so feature detection alone is not sufficient.
 */
export async function checkBrowserStorage(): Promise<StorageCheckResult> {
  let indexedDb = false
  let cacheStorage = false
  let indexedDbError: string | undefined
  let cacheStorageError: string | undefined

  try {
    await withTimeout(
      "Checking browser storage",
      5_000,
      db.open().then(() => db.books.limit(1).toArray())
    )
    indexedDb = true
  } catch (error) {
    indexedDbError = error instanceof Error ? error.message : String(error)
  }

  try {
    await withTimeout(
      "Checking cache storage",
      5_000,
      (async () => {
        if (typeof caches === "undefined") return

        const cacheName = "paralleltexts-storage-check"
        const cache = await caches.open(cacheName)
        const request = new Request("/__paralleltexts_storage_check__")
        await cache.put(request, new Response("ok"))
        await cache.delete(request)
        await caches.delete(cacheName)
        cacheStorage = true
      })()
    )
  } catch (error) {
    cacheStorageError = error instanceof Error ? error.message : String(error)
  }

  return { indexedDb, cacheStorage, indexedDbError, cacheStorageError }
}
