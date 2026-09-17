let activeModelDownloadId: string | null = null
const listeners = new Set<() => void>()

export function getActiveModelDownloadId(): string | null {
  return activeModelDownloadId
}

export function subscribeToModelDownloads(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setActiveModelDownloadId(modelId: string | null) {
  activeModelDownloadId = modelId
  for (const listener of listeners) listener()
}
