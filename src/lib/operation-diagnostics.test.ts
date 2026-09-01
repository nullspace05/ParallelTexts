import { afterEach, describe, expect, it, vi } from "vitest"
import { trackOperation, withTimeout } from "./operation-diagnostics"
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
  it("captures the error name and message", async () => {
    const error = new DOMException("Storage is blocked", "SecurityError")

    await expect(
      trackOperation("book_reader_load", {}, () => Promise.reject(error))
    ).rejects.toBe(error)

    expect(capture).toHaveBeenLastCalledWith("client_operation", {
      operation: "book_reader_load",
      status: "failed",
      durationMs: expect.any(Number),
      errorName: "SecurityError",
      errorMessage: "Storage is blocked",
    })
  })
})
