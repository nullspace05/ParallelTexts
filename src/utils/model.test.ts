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

    await expect(downloadModel("test-model", "wasm")).resolves.toEqual({
      runtime: "cpu",
      fellBackToWasm: false,
    })
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
      { runtime: "cpu", fellBackToWasm: false },
      { runtime: "cpu", fellBackToWasm: false },
    ])
  })

  it("starts another download after the shared one settles", async () => {
    pipeline.mockResolvedValue(undefined)

    await downloadModel("test-model", "wasm")
    await downloadModel("test-model", "wasm")

    expect(pipeline).toHaveBeenCalledTimes(2)
  })

  it("rejects a different model while a download is in progress", async () => {
    let resolveDownload: () => void
    pipeline.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDownload = resolve
        })
    )

    const first = downloadModel("first-model", "wasm")

    await expect(downloadModel("second-model", "wasm")).rejects.toThrow(
      "A download for first-model is already in progress."
    )
    expect(pipeline).toHaveBeenCalledTimes(1)

    resolveDownload!()
    await first
  })

  it("retries a recorded WebGPU failure with WASM for Auto", async () => {
    vi.resetModules()
    vi.stubGlobal("process", undefined)
    vi.stubGlobal("navigator", { gpu: {} })
    pipeline
      .mockRejectedValueOnce(new Error("table index is out of bounds"))
      .mockResolvedValueOnce(undefined)

    try {
      const { downloadModel: downloadInBrowser } = await import("./model")
      const { getModelRuntimeOverride } = await import("@/lib/model-runtime")

      await expect(downloadInBrowser("test-model", "auto")).resolves.toEqual({
        runtime: "wasm",
        fellBackToWasm: true,
      })
      expect(getModelRuntimeOverride("test-model")).toBe("wasm")
      expect(pipeline).toHaveBeenNthCalledWith(
        1,
        "feature-extraction",
        "test-model",
        expect.objectContaining({ device: "webgpu" })
      )
      expect(pipeline).toHaveBeenNthCalledWith(
        2,
        "feature-extraction",
        "test-model",
        expect.objectContaining({ device: "wasm" })
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
