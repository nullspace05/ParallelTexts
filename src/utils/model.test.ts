import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadModel } from "./model"

const { pipeline, checkCacheStorageForModelDownload } = vi.hoisted(() => ({
  pipeline: vi.fn(),
  checkCacheStorageForModelDownload: vi.fn(),
}))

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline,
}))

vi.mock("@/lib/browser-storage", () => ({
  checkCacheStorageForModelDownload,
}))

afterEach(() => {
  pipeline.mockReset()
  checkCacheStorageForModelDownload.mockReset()
  checkCacheStorageForModelDownload.mockResolvedValue(undefined)
})

describe("downloadModel", () => {
  it("does not wait for the cache storage check", async () => {
    checkCacheStorageForModelDownload.mockReturnValue(new Promise(() => {}))
    pipeline.mockResolvedValue(undefined)

    await expect(downloadModel("test-model", "wasm")).resolves.toBeUndefined()
    expect(checkCacheStorageForModelDownload).toHaveBeenCalledOnce()
  })

  it("shares an in-flight download and forwards progress to every caller", async () => {
    let resolveDownload: () => void
    let reportProgress: (info: { status: string; progress: number }) => void
    pipeline.mockImplementation(
      (
        _task,
        _modelId,
        options: { progress_callback: typeof reportProgress }
      ) => {
        reportProgress = options.progress_callback
        return new Promise<void>((resolve) => {
          resolveDownload = resolve
        })
      }
    )
    const firstProgress = vi.fn()
    const secondProgress = vi.fn()

    const first = downloadModel("test-model", "wasm", firstProgress)
    const second = downloadModel("test-model", "wasm", secondProgress)

    expect(pipeline).toHaveBeenCalledTimes(1)
    reportProgress!({ status: "progress", progress: 42 })
    expect(firstProgress).toHaveBeenCalledWith({
      status: "progress",
      progress: 42,
    })
    expect(secondProgress).toHaveBeenCalledWith({
      status: "progress",
      progress: 42,
    })

    resolveDownload!()
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ])
  })

  it("starts another download after the shared one settles", async () => {
    pipeline.mockResolvedValue(undefined)

    await downloadModel("test-model", "wasm")
    await downloadModel("test-model", "wasm")

    expect(pipeline).toHaveBeenCalledTimes(2)
  })
})
