export type AlignmentRuntime = "webgpu" | "wasm"

const RETRYABLE_WEBGPU_PHASES = new Set([
  "model_initialization",
  "embedding_source",
  "embedding_target",
])

const WEBGPU_RUNTIME_ERROR =
  /webgpu|gpu\s*(?:adapter|device|buffer|validation)|table index is out of bounds/i

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return typeof error === "string" ? error : ""
}

function isRetryableWebGPUError(error: unknown): boolean {
  return WEBGPU_RUNTIME_ERROR.test(errorText(error))
}

export function canRetryAlignmentWithWasm(
  runtime: AlignmentRuntime,
  phase: string,
  error: unknown,
  hasRetriedWithWasm: boolean
): boolean {
  return (
    runtime === "webgpu" &&
    !hasRetriedWithWasm &&
    RETRYABLE_WEBGPU_PHASES.has(phase) &&
    isRetryableWebGPUError(error)
  )
}

/**
 * A model "download" initializes an ONNX session too. Retry only when Auto
 * chose WebGPU, so an explicit WebGPU preference still leaves the choice with
 * the user.
 */
export function shouldRetryModelDownloadWithWasm(
  requestedDevice: "auto" | "webgpu" | "wasm",
  resolvedDevice: "webgpu" | "wasm" | "cpu",
  error: unknown
): boolean {
  return (
    requestedDevice === "auto" &&
    resolvedDevice === "webgpu" &&
    isRetryableWebGPUError(error)
  )
}

export function shouldAutomaticallyRetryWithWasm(
  isAutoDevice: boolean,
  runtime: AlignmentRuntime,
  phase: string,
  error: unknown,
  hasRetriedWithWasm: boolean
): boolean {
  return (
    isAutoDevice &&
    canRetryAlignmentWithWasm(runtime, phase, error, hasRetriedWithWasm)
  )
}
