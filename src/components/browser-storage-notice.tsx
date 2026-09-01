import { checkBrowserStorage } from "@/lib/browser-storage"
import { captureStorageCheck } from "@/lib/operation-diagnostics"
import { useEffect } from "react"
import { toast } from "sonner"

export function BrowserStorageNotice() {
  useEffect(() => {
    let cancelled = false
    void checkBrowserStorage().then((result) => {
      if (cancelled) return
      captureStorageCheck(result)
      if (result.indexedDb && result.cacheStorage) return

      const unavailable = [
        !result.indexedDb && "IndexedDB (books and alignments)",
        !result.cacheStorage && "Cache storage (embedding models)",
      ]
        .filter(Boolean)
        .join(" and ")
      toast.error("Browser storage is unavailable", {
        id: "browser-storage-unavailable",
        description: `${unavailable} cannot be used. Private browsing or privacy settings may be blocking it. Open ParallelTexts in a regular window and try again.`,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
