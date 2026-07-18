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

// FEATURE FLAG (feat/hf-direct-models branch): when true, skips the /models/
// local path entirely (R2 in prod, public/models/ in dev) so transformers.js
// fetches straight from the Hugging Face Hub via env.remoteHost. R2 serving
// code (src/server/serve-models.ts) and the upload/download scripts are
// untouched — flip this back to false to restore the R2-first behavior.
//
// Background: an earlier attempt at this (test/hf-direct-no-r2) found model
// downloads reliably 404ing on the *.workers.dev preview domain used to test
// it. Traced to Hugging Face's CDN blocking requests whose Referer is a
// *.workers.dev domain (confirmed via curl — identical request succeeds with
// Referer set to a custom domain, Cloudflare Pages, Vercel, or GitHub Pages,
// and fails only for *.workers.dev). That's a preview-domain-specific block,
// not a general HF CORS problem — so this is worth re-testing on the real
// production domain (paralleltexts.app), where it's expected NOT to trigger.
const USE_HF_DIRECT = true

function configureModelEnv() {
  env.allowLocalModels = !USE_HF_DIRECT
  // Allow remote so models can be fetched from HuggingFace Hub when not cached locally.
  // In production, /models/* is served from R2 first; HF is only hit as a fallback.
  env.allowRemoteModels = true
  env.localModelPath = isBrowser ? "/models/" : "./public/models/"
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
 * Returns true if the model's fp32 ONNX file is available (cached or on disk).
 *
 * Dev:  HEAD fetch against /models/ (served from public/models/ by Vite).
 *       Reflects what is actually on disk — no CacheStorage involved.
 *       Skipped when USE_HF_DIRECT, since that path is never fetched.
 *
 * Prod (and dev when USE_HF_DIRECT): CacheStorage scan only. R2 always
 *       returns 200 for any /models/ URL, so a fetch would never reflect the
 *       user's download state. CacheStorage is populated by downloadModel()
 *       and cleared by deleteModelFromCache().
 *
 * Cache keys differ by source: the R2/local path caches under
 * "/models/{modelId}/{filePath}", while a direct HF fetch caches under the
 * full resolve URL "https://huggingface.co/{modelId}/resolve/main/{filePath}".
 * Matching on "includes modelId" + "ends with filePath" covers both shapes.
 */
export async function checkModelCached(modelId: string): Promise<boolean> {
  const filePath = "onnx/model.onnx"

  if (import.meta.env.DEV && !USE_HF_DIRECT) {
    try {
      const res = await fetch(`/models/${modelId}/${filePath}`, {
        method: "HEAD",
      })
      return res.ok
    } catch {
      return false
    }
  }

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
