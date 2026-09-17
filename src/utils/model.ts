import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers"

import { checkCacheStorageForModelDownload } from "@/lib/browser-storage"
import {
  getModelRuntimeOverride,
  setModelRuntimeOverride,
} from "@/lib/model-runtime"
import { trackOperation, withTimeout } from "@/lib/operation-diagnostics"
import { shouldRetryModelDownloadWithWasm } from "@/lib/webgpu-fallback"
import { setActiveModelDownloadId } from "@/utils/model-download-state"
import {
  DEFAULT_MODEL_ID,
  resolveDevice,
  type InferenceDevice,
} from "@/utils/model-registry"

// Model metadata (MODEL_REGISTRY, DEFAULT_MODEL_ID, ModelSpec), device
// detection (detectWebGPU, resolveDevice), and the InferenceDevice type all
// moved to model-registry.ts, which has no @huggingface/transformers import.
// Re-exported here so existing call sites that only need the actual ML
// functions below don't need two import lines — but anything that ONLY
// needs the registry/device utilities should import model-registry.ts
// directly, not this file, so bundlers don't pull the ML runtime in for
// pages that never run inference (this is exactly the bug that motivated
// the split — user-settings.ts, alignment.$id.tsx, and alignments.tsx only
// ever needed DEFAULT_MODEL_ID / MODEL_REGISTRY, a plain label lookup, but
// importing it from this file pulled in the full transformers.js bundle).
export {
  DEFAULT_MODEL_ID,
  detectWebGPU,
  MODEL_ID,
  MODEL_REGISTRY,
  resolveDevice,
  type InferenceDevice,
  type ModelSpec,
} from "@/utils/model-registry"

// true in both the main thread and Web Workers; false only in Node
const isBrowser = typeof process === "undefined" || !process.versions?.node

// Embedding models are always fetched directly from the Hugging Face Hub —
// no local/R2-backed model path. (R2 is still used elsewhere, for serving
// the sample-book EPUBs — see src/server/serve-r2-assets.ts — this only
// concerns transformers.js's own model file resolution.)
//
// Confirmed viable on the real production domain (paralleltexts.app) after
// an earlier attempt on a *.workers.dev preview domain hit reliable 404s:
// traced to Hugging Face's CDN blocking requests whose Referer is a
// *.workers.dev domain (confirmed via curl — identical requests succeed with
// Referer set to a custom domain, Cloudflare Pages, Vercel, or GitHub Pages,
// and fail only for *.workers.dev). That was a preview-domain-specific block,
// not a general HF CORS/reliability problem.
function configureModelEnv() {
  env.allowLocalModels = false
  env.allowRemoteModels = true
}

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null
let loadedModelId: string | null = null
let loadedDevice: string | null = null
let activeDownload: {
  modelId: string
  promise: Promise<ModelDownloadResult>
  progressCallbacks: Set<ProgressCallback>
} | null = null

export type ModelDownloadRuntime = "webgpu" | "wasm" | "cpu"

export interface ModelDownloadResult {
  runtime: ModelDownloadRuntime
  fellBackToWasm: boolean
}

export class ModelDownloadInProgressError extends Error {
  constructor(readonly modelId: string) {
    super(`A download for ${modelId} is already in progress.`)
    this.name = "ModelDownloadInProgressError"
  }
}

export function loadExtractor(
  modelId = DEFAULT_MODEL_ID,
  device: InferenceDevice = "auto",
  progress_callback?: ProgressCallback
) {
  const resolvedDevice = isBrowser ? resolveDevice(device) : "cpu"

  // Invalidate cache if model or device changed.
  if (
    extractorPromise &&
    (loadedModelId !== modelId || loadedDevice !== resolvedDevice)
  ) {
    extractorPromise = null
    loadedModelId = null
    loadedDevice = null
  }

  if (!extractorPromise) {
    configureModelEnv()
    loadedModelId = modelId
    loadedDevice = resolvedDevice
    console.log(
      `[PT] model: loading ${modelId} | dtype=fp32 | device=${resolvedDevice}`
    )
    extractorPromise = pipeline("feature-extraction", modelId, {
      device: resolvedDevice,
      dtype: "fp32",
      progress_callback,
    })
  }

  return extractorPromise
}

/**
 * Pre-download a model into the browser Cache API so subsequent alignment calls
 * are instant. Does not use the loadExtractor singleton — safe to call any time.
 */
export async function downloadModel(
  modelId: string,
  device: InferenceDevice = "auto",
  progress_callback?: ProgressCallback
): Promise<ModelDownloadResult> {
  configureModelEnv()
  // Cache Storage can stall after a large model write. Start its temporary
  // validation here, not on every route load, and never make it hold up the
  // actual download.
  void checkCacheStorageForModelDownload()
  const detectedDevice = isBrowser ? resolveDevice(device) : "cpu"
  const resolvedDevice =
    device === "auto"
      ? (getModelRuntimeOverride(modelId) ?? detectedDevice)
      : detectedDevice
  if (activeDownload) {
    if (activeDownload.modelId !== modelId) {
      throw new ModelDownloadInProgressError(activeDownload.modelId)
    }
    if (progress_callback) {
      activeDownload.progressCallbacks.add(progress_callback)
    }
    return activeDownload.promise
  }

  const progressCallbacks = new Set<ProgressCallback>()
  if (progress_callback) progressCallbacks.add(progress_callback)

  const operationDetails: Record<string, string> = {
    modelId,
    requestedDevice: device,
    resolvedDevice,
  }
  const createPipeline = (runtime: ModelDownloadRuntime) =>
    pipeline("feature-extraction", modelId, {
      device: runtime,
      dtype: "fp32",
      progress_callback: (info) => {
        for (const callback of progressCallbacks) callback(info)
      },
    })

  const promise = trackOperation("model_download", operationDetails, () =>
    withTimeout(
      "Model download",
      6 * 60_000,
      (async (): Promise<ModelDownloadResult> => {
        try {
          await createPipeline(resolvedDevice)
          return { runtime: resolvedDevice, fellBackToWasm: false }
        } catch (error) {
          if (
            !shouldRetryModelDownloadWithWasm(device, resolvedDevice, error)
          ) {
            throw error
          }

          operationDetails.fallbackFrom = "webgpu"
          operationDetails.resolvedDevice = "wasm"
          await createPipeline("wasm")
          setModelRuntimeOverride(modelId, "wasm")
          return { runtime: "wasm", fellBackToWasm: true }
        }
      })()
    )
  )

  activeDownload = { modelId, promise, progressCallbacks }
  setActiveModelDownloadId(modelId)
  void promise.then(
    () => {
      activeDownload = null
      setActiveModelDownloadId(null)
    },
    () => {
      activeDownload = null
      setActiveModelDownloadId(null)
    }
  )

  return promise
}

// Cache-API helpers moved to model-cache.ts (no transformers import); still
// re-exported here so callers that already pull in this file don't churn.
export { checkModelCached, deleteModelFromCache } from "@/utils/model-cache"
