import { describe, expect, it } from "vitest"

import {
  canRetryAlignmentWithWasm,
  shouldRetryModelDownloadWithWasm,
  shouldAutomaticallyRetryWithWasm,
} from "./webgpu-fallback"

describe("canRetryAlignmentWithWasm", () => {
  it.each(["model_initialization", "embedding_source", "embedding_target"])(
    "offers WASM when WebGPU fails during %s",
    (phase) => {
      expect(
        canRetryAlignmentWithWasm(
          "webgpu",
          phase,
          new Error("WebGPU device was lost"),
          false
        )
      ).toBe(true)
    }
  )

  it("does not retry failures outside WebGPU model setup or embedding", () => {
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "extracting_source",
        new Error("WebGPU device was lost"),
        false
      )
    ).toBe(false)
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "computing_similarity",
        new Error("WebGPU device was lost"),
        false
      )
    ).toBe(false)
    expect(
      canRetryAlignmentWithWasm(
        "wasm",
        "embedding_source",
        new Error("WebGPU device was lost"),
        false
      )
    ).toBe(false)
  })

  it("does not treat a download or network failure as a WebGPU failure", () => {
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "model_initialization",
        new Error("Failed to fetch model files"),
        false
      )
    ).toBe(false)
  })

  it("recognizes GPU errors that do not use the WebGPU name", () => {
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "embedding_source",
        new Error("GPU device was lost"),
        false
      )
    ).toBe(true)
  })

  it("recognizes the ONNX Runtime table-index failure from the recording", () => {
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "model_initialization",
        new Error("table index is out of bounds"),
        false
      )
    ).toBe(true)
  })

  it("does not offer a second WASM retry", () => {
    expect(
      canRetryAlignmentWithWasm(
        "webgpu",
        "embedding_source",
        new Error("WebGPU device was lost"),
        true
      )
    ).toBe(false)
  })
})

describe("shouldRetryModelDownloadWithWasm", () => {
  it("retries the recorded ONNX Runtime failure when Auto chose WebGPU", () => {
    expect(
      shouldRetryModelDownloadWithWasm(
        "auto",
        "webgpu",
        new Error("table index is out of bounds")
      )
    ).toBe(true)
  })

  it("does not override an explicit WebGPU choice or non-GPU failure", () => {
    expect(
      shouldRetryModelDownloadWithWasm(
        "webgpu",
        "webgpu",
        new Error("table index is out of bounds")
      )
    ).toBe(false)
    expect(
      shouldRetryModelDownloadWithWasm(
        "auto",
        "webgpu",
        new Error("Failed to fetch")
      )
    ).toBe(false)
  })
})

describe("shouldAutomaticallyRetryWithWasm", () => {
  it("retries a WebGPU failure automatically for Auto", () => {
    expect(
      shouldAutomaticallyRetryWithWasm(
        true,
        "webgpu",
        "embedding_source",
        new Error("Failed to get GPU adapter"),
        false
      )
    ).toBe(true)
  })

  it("keeps the manual retry affordance for explicit WebGPU", () => {
    expect(
      shouldAutomaticallyRetryWithWasm(
        false,
        "webgpu",
        "embedding_source",
        new Error("Failed to get GPU adapter"),
        false
      )
    ).toBe(false)
  })
})
