import {
  checkIndexedDbStorage,
  subscribeToCacheStorageChecks,
  type CacheStorageCheckResult,
} from "@/lib/browser-storage"
import { captureStorageCheck } from "@/lib/operation-diagnostics"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

const INDEXED_DB_TOAST_ID = "browser-indexeddb-unavailable"
const CACHE_STORAGE_TOAST_ID = "browser-cache-storage-unavailable"

export function BrowserStorageNotice() {
  const { t } = useTranslation()

  useEffect(() => {
    let cancelled = false
    const showCacheStorageResult = (result: CacheStorageCheckResult) => {
      if (cancelled) return
      captureStorageCheck(result)
      if (result.cacheStorage) {
        toast.dismiss(CACHE_STORAGE_TOAST_ID)
        return
      }

      if (result.timedOut) {
        toast.warning(t("storage.slowCacheHeading"), {
          id: CACHE_STORAGE_TOAST_ID,
          description: t("storage.slowCacheDescription"),
        })
        return
      }

      toast.error(t("storage.heading"), {
        id: CACHE_STORAGE_TOAST_ID,
        description: t("storage.description", {
          unavailable: t("storage.cacheStorage"),
        }),
      })
    }

    const unsubscribe = subscribeToCacheStorageChecks(showCacheStorageResult)
    void checkIndexedDbStorage().then((result) => {
      if (cancelled) return
      captureStorageCheck(result)
      if (result.indexedDb) return

      toast.error(t("storage.heading"), {
        id: INDEXED_DB_TOAST_ID,
        description: t("storage.description", {
          unavailable: t("storage.indexedDb"),
        }),
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [t])

  return null
}
