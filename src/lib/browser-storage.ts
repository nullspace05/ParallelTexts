import { db } from "@/lib/db"
import { OperationTimeoutError, withTimeout } from "@/lib/operation-diagnostics"

const STORAGE_CHECK_TIMEOUT_MS = 20_000
const CACHE_STORAGE_CHECK_ATTEMPTS = 2

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
      STORAGE_CHECK_TIMEOUT_MS,
      db.open().then(() => db.books.limit(1).toArray())
    )
    indexedDb = true
  } catch (error) {
    indexedDbError = error instanceof Error ? error.message : String(error)
  }

  for (let attempt = 1; attempt <= CACHE_STORAGE_CHECK_ATTEMPTS; attempt++) {
    try {
      await withTimeout(
        "Checking cache storage",
        STORAGE_CHECK_TIMEOUT_MS,
        (async () => {
          if (typeof caches === "undefined") return

          // Timed-out probes can finish after the timeout. Keep each retry
          // isolated so their cleanup cannot interfere with one another.
          const cacheName = `paralleltexts-storage-check-${crypto.randomUUID()}`
          const cache = await caches.open(cacheName)
          const request = new Request("/__paralleltexts_storage_check__")
          await cache.put(request, new Response("ok"))
          await cache.delete(request)
          await caches.delete(cacheName)
          cacheStorage = true
        })()
      )
      break
    } catch (error) {
      cacheStorageError = error instanceof Error ? error.message : String(error)
      if (
        !(error instanceof OperationTimeoutError) ||
        attempt === CACHE_STORAGE_CHECK_ATTEMPTS
      ) {
        break
      }
    }
  }

  return { indexedDb, cacheStorage, indexedDbError, cacheStorageError }
}
