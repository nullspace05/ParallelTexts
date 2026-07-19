import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers"

export interface ModelSpec {
  id: string
  label: string
  description: string
  /** Maximum token sequence length the model supports. */
  maxSeqLen: number
  /** Download size in MB (fp32). */
  sizeMb: number
  recommended?: boolean
}

export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: "Xenova/paraphrase-multilingual-mpnet-base-v2",
    label: "Paraphrase Multilingual mpnet base v2",
    description:
      "50+ languages, stronger than MiniLM. Good speed/quality balance.",
    maxSeqLen: 128,
    sizeMb: 1110,
    recommended: true,
  },
  {
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    label: "Paraphrase Multilingual MiniLM L12",
    description: "50+ languages, smallest model. Fastest inference.",
    maxSeqLen: 128,
    sizeMb: 470,
  },
  {
    id: "Xenova/distiluse-base-multilingual-cased-v2",
    label: "DistilUSE base multilingual v2",
    description: "50+ languages. Fast and well-rounded general-purpose model.",
    maxSeqLen: 128,
    sizeMb: 539,
  },
  {
    id: "onnx-community/embeddinggemma-300m-ONNX",
    label: "EmbeddingGemma 300M",
    description:
      "100+ languages, 2048-token context, MRL 768-dim. Decoder-only.",
    maxSeqLen: 2048,
    sizeMb: 1230,
  },
]

/** Default model used when none is specified. */
export const DEFAULT_MODEL_ID = MODEL_REGISTRY[0].id

// Keep for backwards compatibility with existing callers.
export const MODEL_ID = DEFAULT_MODEL_ID

/** Inference device. "auto" selects WebGPU when available, falls back to WASM. */
export type InferenceDevice = "webgpu" | "wasm" | "auto"

// true in both the main thread and Web Workers; false only in Node
const isBrowser = typeof process === "undefined" || !process.versions?.node

/**
 * Returns true when WebGPU is available in the current browsing context.
 * Workers cannot access navigator.gpu, so this always returns false there —
 * device detection must happen on the main thread and be passed to the worker.
 */
export function detectWebGPU(): boolean {
  try {
    return typeof navigator !== "undefined" && "gpu" in navigator
  } catch {
    return false
  }
}

/** Resolve "auto" to the concrete device string for the pipeline call. */
export function resolveDevice(device: InferenceDevice): "webgpu" | "wasm" {
  if (device === "auto") return detectWebGPU() ? "webgpu" : "wasm"
  return device
}

// Embedding models are always fetched directly from the Hugging Face Hub —
// no local/R2-backed model path. (R2 is still used elsewhere, for serving
// the sample-book EPUBs — see src/server/serve-models.ts — this only
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
