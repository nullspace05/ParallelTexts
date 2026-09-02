import { getStoredModelId, subscribeStoredModelId } from "@/lib/user-settings"
import { DEFAULT_MODEL_ID } from "@/utils/model-registry"
import { useSyncExternalStore } from "react"

function subscribe(onStoreChange: () => void): () => void {
  const unsubscribe = subscribeStoredModelId(onStoreChange)
  // Cross-tab writes. useSyncExternalStore no-ops when the snapshot is
  // unchanged, so reacting to unrelated localStorage keys is harmless.
  window.addEventListener("storage", onStoreChange)
  return () => {
    unsubscribe()
    window.removeEventListener("storage", onStoreChange)
  }
}

/**
 * The current embedding model id from user settings, re-rendering when it
 * changes — whether from this tab (align form, Settings) or another tab.
 */
export function useStoredModelId(): string {
  return useSyncExternalStore(
    subscribe,
    getStoredModelId,
    () => DEFAULT_MODEL_ID
  )
}
