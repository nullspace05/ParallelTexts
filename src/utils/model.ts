import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers"

import {
  DEFAULT_MODEL_ID,
  type InferenceDevice,
  resolveDevice,
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
  type InferenceDevice,
  MODEL_ID,
  MODEL_REGISTRY,
  type ModelSpec,
  resolveDevice,
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
): Promise<void> {
  configureModelEnv()
  const resolvedDevice = isBrowser ? resolveDevice(device) : "cpu"
  await pipeline("feature-extraction", modelId, {
    device: resolvedDevice,
    dtype: "fp32",
    progress_callback,
  })
}

/**
 * Returns true if the model's fp32 ONNX file is already in the browser
 * Cache API (populated by downloadModel(), cleared by
 * deleteModelFromCache()). Models are fetched directly from Hugging Face,
 * cached under the full resolve URL
 * "https://huggingface.co/{modelId}/resolve/main/{filePath}" — matching on
 * "includes modelId" + "ends with filePath" is robust to that shape.
 */
export async function checkModelCached(modelId: string): Promise<boolean> {
  const filePath = "onnx/model.onnx"

  if (typeof caches === "undefined") return false
  try {
    const names = await caches.keys()
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (
        keys.some((r) => r.url.includes(modelId) && r.url.endsWith(filePath))
      ) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

/**
 * Removes all cached files for a model from every CacheStorage bucket.
 */
export async function deleteModelFromCache(modelId: string): Promise<void> {
  if (typeof caches === "undefined") return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        const toDelete = keys.filter((r) => r.url.includes(`/${modelId}/`))
        await Promise.all(toDelete.map((r) => cache.delete(r)))
      })
    )
  } catch {}
}
