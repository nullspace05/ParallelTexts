// Model metadata, defaults, and device-selection logic — kept separate from
// model.ts on purpose. model.ts imports @huggingface/transformers (the
// actual ML runtime), which is large; anything in this file must stay free
// of that import so widely-imported-but-otherwise-light modules (settings,
// list/label displays) don't drag the whole ML runtime into bundles that
// never run inference. See model.ts for the actual embedding functions.

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
