export type ModelRuntimeOverride = "wasm"

const runtimeOverrides = new Map<string, ModelRuntimeOverride>()

/**
 * Keep a model on WASM for this tab after its WebGPU session fails. Model
 * files remain cached normally; only the inference backend is overridden.
 */
export function getModelRuntimeOverride(
  modelId: string
): ModelRuntimeOverride | undefined {
  return runtimeOverrides.get(modelId)
}

export function setModelRuntimeOverride(
  modelId: string,
  runtime: ModelRuntimeOverride
): void {
  runtimeOverrides.set(modelId, runtime)
}

export function clearModelRuntimeOverrides(): void {
  runtimeOverrides.clear()
}
