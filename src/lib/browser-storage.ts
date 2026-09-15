import { db } from "@/lib/db"
import { OperationTimeoutError, withTimeout } from "@/lib/operation-diagnostics"

const STORAGE_CHECK_TIMEOUT_MS = 20_000
const CACHE_STORAGE_CHECK_ATTEMPTS = 2
const CACHE_STORAGE_SESSION_KEY = "pt:cache-storage-available"

export interface IndexedDbStorageCheckResult {
  indexedDb: boolean
  indexedDbError?: string
}

export interface CacheStorageCheckResult {
  cacheStorage: boolean
  timedOut: boolean
  cacheStorageError?: string
}

type CacheStorageCheckListener = (result: CacheStorageCheckResult) => void

const cacheStorageCheckListeners = new Set<CacheStorageCheckListener>()
let cacheStorageCheckPromise: Promise<CacheStorageCheckResult> | null = null
let cacheStorageConfirmed = false
let cacheStorageCheckFinished = false

const cacheStorageAvailable: CacheStorageCheckResult = {
  cacheStorage: true,
  timedOut: false,
}

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return String(error)
}

function hasConfirmedCacheStorage() {
  if (cacheStorageConfirmed) return true
  try {
    return sessionStorage.getItem(CACHE_STORAGE_SESSION_KEY) === "true"
  } catch {
    return false
  }
}

function rememberConfirmedCacheStorage() {
  cacheStorageConfirmed = true
  try {
    sessionStorage.setItem(CACHE_STORAGE_SESSION_KEY, "true")
  } catch {
    // The cache probe itself succeeded. sessionStorage is only an optimization.
  }
}

function notifyCacheStorageCheck(result: CacheStorageCheckResult) {
  for (const listener of cacheStorageCheckListeners) listener(result)
}

function rememberLateCacheStorageSuccess(probe: Promise<void>) {
  void probe.then(
    () => {
      rememberConfirmedCacheStorage()
      if (cacheStorageCheckFinished)
        notifyCacheStorageCheck(cacheStorageAvailable)
    },
    () => {}
  )
}

async function probeCacheStorage() {
  if (typeof caches === "undefined") {
    throw new Error("Cache Storage API is unavailable.")
  }

  const cacheName = `paralleltexts-storage-check-${crypto.randomUUID()}`
  const request = new Request(
    new URL("/__paralleltexts_storage_check__", window.location.origin)
  )
  const cache = await caches.open(cacheName)

  try {
    await cache.put(request, new Response("ok"))
    await cache.delete(request)
  } finally {
    await caches.delete(cacheName)
  }
}

/** Tests IndexedDB at startup. It does not touch Cache Storage. */
export async function checkIndexedDbStorage(): Promise<IndexedDbStorageCheckResult> {
  try {
    await withTimeout(
      "Checking browser storage",
      STORAGE_CHECK_TIMEOUT_MS,
      db.open().then(() => db.books.limit(1).toArray())
    )
    return { indexedDb: true }
  } catch (error) {
    return { indexedDb: false, indexedDbError: errorMessage(error) }
  }
}

/**
 * Starts one temporary Cache Storage write probe for this page. A confirmed
 * result is kept in sessionStorage, so reloads in the same browser session do
 * not probe again. Call this immediately before a model download, without
 * awaiting it: a slow cache must not delay the download itself.
 */
export function checkCacheStorageForModelDownload(): Promise<CacheStorageCheckResult> {
  if (hasConfirmedCacheStorage()) {
    return Promise.resolve(cacheStorageAvailable)
  }

  if (!cacheStorageCheckPromise) {
    cacheStorageCheckPromise = (async () => {
      let lastError: unknown

      for (
        let attempt = 1;
        attempt <= CACHE_STORAGE_CHECK_ATTEMPTS;
        attempt++
      ) {
        const probe = probeCacheStorage()
        try {
          await withTimeout(
            "Checking cache storage",
            STORAGE_CHECK_TIMEOUT_MS,
            probe
          )
          rememberConfirmedCacheStorage()
          return { cacheStorage: true, timedOut: false }
        } catch (error) {
          lastError = error
          if (error instanceof OperationTimeoutError) {
            // A Cache Storage operation cannot be cancelled. A late success
            // replaces any slow-cache warning with a confirmed result.
            rememberLateCacheStorageSuccess(probe)
            if (attempt < CACHE_STORAGE_CHECK_ATTEMPTS) continue
          }
          break
        }
      }

      if (hasConfirmedCacheStorage()) return cacheStorageAvailable

      return {
        cacheStorage: false,
        timedOut: lastError instanceof OperationTimeoutError,
        cacheStorageError: errorMessage(lastError),
      }
    })()
    void cacheStorageCheckPromise.then((result) => {
      cacheStorageCheckFinished = true
      notifyCacheStorageCheck(result)
    })
  }

  return cacheStorageCheckPromise
}

/** Receives the result of the first cache probe triggered by a model download. */
export function subscribeToCacheStorageChecks(
  listener: CacheStorageCheckListener
) {
  cacheStorageCheckListeners.add(listener)
  return () => cacheStorageCheckListeners.delete(listener)
}
