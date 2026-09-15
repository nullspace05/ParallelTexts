import { checkBrowserStorage } from "@/lib/browser-storage"
import { captureStorageCheck } from "@/lib/operation-diagnostics"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

export function BrowserStorageNotice() {
  const { t } = useTranslation()

  useEffect(() => {
    let cancelled = false
    void checkBrowserStorage().then((result) => {
      if (cancelled) return
      captureStorageCheck(result)
      if (result.indexedDb && result.cacheStorage) return

      if (
        result.indexedDb &&
        !result.cacheStorage &&
        result.cacheStorageError?.includes("timed out")
      ) {
        toast.warning(t("storage.slowCacheHeading"), {
          id: "browser-storage-unavailable",
          description: t("storage.slowCacheDescription"),
        })
        return
      }

      const unavailable = [
        !result.indexedDb && t("storage.indexedDb"),
        !result.cacheStorage && t("storage.cacheStorage"),
      ]
        .filter(Boolean)
        .join(" and ")
      toast.error(t("storage.heading"), {
        id: "browser-storage-unavailable",
        description: t("storage.description", { unavailable }),
      })
    })

    return () => {
      cancelled = true
    }
  }, [t])

  return null
}
