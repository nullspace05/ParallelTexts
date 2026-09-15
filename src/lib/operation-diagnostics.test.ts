import { afterEach, describe, expect, it, vi } from "vitest"
import {
  captureWasmFallback,
  trackOperation,
  withTimeout,
} from "./operation-diagnostics"
import type { OperationTimeoutError } from "./operation-diagnostics"

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock("posthog-js", () => ({ default: { capture } }))

afterEach(() => {
  capture.mockClear()
  vi.useRealTimers()
})

describe("withTimeout", () => {
  it("returns a completed task result", async () => {
    await expect(
      withTimeout("Saving", 100, Promise.resolve("done"))
    ).resolves.toBe("done")
  })

  it("rejects with an operation timeout", async () => {
    vi.useFakeTimers()
    const result = withTimeout("Saving", 100, new Promise(() => {}))
    const assertion = expect(result).rejects.toEqual(
      expect.objectContaining<Partial<OperationTimeoutError>>({
        name: "OperationTimeoutError",
        message: "Saving timed out after 1 second.",
      })
    )
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })
})

describe("trackOperation", () => {
  it("captures when a user accepts the WASM fallback", () => {
    captureWasmFallback({
      action: "accepted",
      device: "webgpu",
      phase: "embedding_source",
    })

    expect(capture).toHaveBeenLastCalledWith("alignment_wasm_fallback", {
      action: "accepted",
      device: "webgpu",
      phase: "embedding_source",
    })
  })

  it("captures the latest mutable details when an operation completes", async () => {
    const details: Record<string, boolean | number | string> = {
      phase: "preparing",
    }

    await trackOperation("alignment", details, async () => {
      details.phase = "embedding_source"
      details.sourceSentenceCount = 42
    })

    expect(capture).toHaveBeenLastCalledWith("client_operation", {
      operation: "alignment",
      status: "completed",
      durationMs: expect.any(Number),
      phase: "embedding_source",
      sourceSentenceCount: 42,
    })
  })

  it("captures the error name and message", async () => {
    const error = new DOMException("Storage is blocked", "SecurityError")
    const details: Record<string, boolean | number | string> = {
      phase: "preparing",
    }

    await expect(
      trackOperation("book_reader_load", details, async () => {
        details.phase = "embedding_source"
        throw error
      })
    ).rejects.toBe(error)

    expect(capture).toHaveBeenLastCalledWith("client_operation", {
      operation: "book_reader_load",
      status: "failed",
      durationMs: expect.any(Number),
      phase: "embedding_source",
      errorName: "SecurityError",
      errorMessage: "Storage is blocked",
    })
  })

  it("records aborted operations as cancelled", async () => {
    const details: Record<string, boolean | number | string> = {
      phase: "embedding_source",
    }
    const error = new DOMException("Alignment cancelled.", "AbortError")

    await expect(
      trackOperation("alignment", details, () => Promise.reject(error))
    ).rejects.toBe(error)

    expect(capture).toHaveBeenLastCalledWith("client_operation", {
      operation: "alignment",
      status: "cancelled",
      durationMs: expect.any(Number),
      phase: "embedding_source",
    })
  })
})
