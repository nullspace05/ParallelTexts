export type AlignmentRuntime = "webgpu" | "wasm"

const RETRYABLE_WEBGPU_PHASES = new Set([
  "model_initialization",
  "embedding_source",
  "embedding_target",
])

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return typeof error === "string" ? error : ""
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
    /webgpu|gpu\s*(?:adapter|device|buffer|validation)/i.test(errorText(error))
  )
}
