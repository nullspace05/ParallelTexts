import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const cache = {
  put: vi.fn(),
  delete: vi.fn(),
}
const open = vi.fn()
const deleteCache = vi.fn()

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  cache.put.mockReset()
  cache.delete.mockReset()
  open.mockReset()
  deleteCache.mockReset()
  open.mockResolvedValue(cache)
  deleteCache.mockResolvedValue(true)
  vi.stubGlobal("caches", { open, delete: deleteCache })
  vi.stubGlobal("crypto", { randomUUID: () => "storage-check" })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("checkCacheStorageForModelDownload", () => {
  it("probes once and reuses a confirmed result for the browser session", async () => {
    const { checkCacheStorageForModelDownload } =
      await import("./browser-storage")

    await expect(checkCacheStorageForModelDownload()).resolves.toEqual({
      cacheStorage: true,
      timedOut: false,
    })
    expect(open).toHaveBeenCalledOnce()
    expect(cache.put).toHaveBeenCalledOnce()
    expect(cache.delete).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledOnce()

    vi.resetModules()
    const { checkCacheStorageForModelDownload: checkAfterReload } =
      await import("./browser-storage")
    await expect(checkAfterReload()).resolves.toEqual({
      cacheStorage: true,
      timedOut: false,
    })
    expect(open).toHaveBeenCalledOnce()
  })

  it("reports a rejected Cache Storage write as unavailable", async () => {
    open.mockRejectedValue(
      new DOMException("Storage is blocked", "SecurityError")
    )
    const { checkCacheStorageForModelDownload } =
      await import("./browser-storage")

    await expect(checkCacheStorageForModelDownload()).resolves.toEqual({
      cacheStorage: false,
      timedOut: false,
      cacheStorageError: "Storage is blocked",
    })
  })

  it("reports a timeout without blocking the caller forever", async () => {
    vi.useFakeTimers()
    open.mockReturnValue(new Promise(() => {}))
    const { checkCacheStorageForModelDownload } =
      await import("./browser-storage")

    const result = checkCacheStorageForModelDownload()
    await vi.advanceTimersByTimeAsync(40_000)

    await expect(result).resolves.toMatchObject({
      cacheStorage: false,
      timedOut: true,
      cacheStorageError: "Checking cache storage timed out after 20 seconds.",
    })
  })

  it("corrects a timeout result when an earlier probe succeeds late", async () => {
    vi.useFakeTimers()
    let resolveFirstProbe: (openedCache: typeof cache) => void
    const firstProbe = new Promise<typeof cache>((resolve) => {
      resolveFirstProbe = resolve
    })
    open
      .mockReturnValueOnce(firstProbe)
      .mockReturnValueOnce(new Promise(() => {}))
    const { checkCacheStorageForModelDownload, subscribeToCacheStorageChecks } =
      await import("./browser-storage")
    const notifications = vi.fn()
    subscribeToCacheStorageChecks(notifications)

    const result = checkCacheStorageForModelDownload()
    await vi.advanceTimersByTimeAsync(40_000)
    await expect(result).resolves.toMatchObject({
      cacheStorage: false,
      timedOut: true,
    })

    resolveFirstProbe!(cache)
    await vi.advanceTimersByTimeAsync(1)

    expect(notifications).toHaveBeenLastCalledWith({
      cacheStorage: true,
      timedOut: false,
    })
    await expect(checkCacheStorageForModelDownload()).resolves.toEqual({
      cacheStorage: true,
      timedOut: false,
    })
  })
})
