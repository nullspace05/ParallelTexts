import type { AlignProgressEvent } from "@/lib/alignment-pipeline"
import { runEmbedAndAlign } from "@/lib/alignment-pipeline"
import type { SentenceRecord } from "@/lib/sentence-splitter"
import type { AlignedPair } from "@/types/alignment"

// ── Message types ────────────────────────────────────────────────────────────

/**
 * Sent from the main thread after extractAndSplit() has already run there.
 * Workers can't use DOMParser (needed by the EPUB extractor), so extraction
 * stays on the main thread and only the ML-heavy work runs here.
 */
export interface AlignWorkerInput {
  type: "align"
  params: {
    srcRecords: SentenceRecord[]
    tgtRecords: SentenceRecord[]
    modelId: string
    gapPenalty: number
    /** Resolved device from the main thread ("webgpu" | "wasm"). */
    device: "webgpu" | "wasm"
  }
}

/** Progress event forwarded from runEmbedAndAlign. */
export interface AlignWorkerProgress {
  type: "progress"
  event: AlignProgressEvent
}

/** Posted when alignment finishes successfully. */
export interface AlignWorkerDone {
  type: "done"
  pairs: AlignedPair[]
}

/** Posted when alignment throws. */
export interface AlignWorkerError {
  type: "error"
  message: string
}

export type AlignWorkerOutput =
  | AlignWorkerProgress
  | AlignWorkerDone
  | AlignWorkerError

// ── Handler ──────────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<AlignWorkerInput>) => {
  if (event.data.type !== "align") return

  const { srcRecords, tgtRecords, modelId, gapPenalty, device } =
    event.data.params

  console.log(
    `[PT] worker: received | model=${modelId} | device=${device} | src=${srcRecords.length} | tgt=${tgtRecords.length}`
  )
  const t0 = performance.now()

  try {
    const pairs = await runEmbedAndAlign(
      srcRecords,
      tgtRecords,
      modelId,
      gapPenalty,
      device,
      (e) => {
        self.postMessage({
          type: "progress",
          event: e,
        } satisfies AlignWorkerProgress)
      }
    )

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.log(`[PT] worker: done in ${elapsed}s | pairs=${pairs.length}`)
    self.postMessage({ type: "done", pairs } satisfies AlignWorkerDone)
  } catch (err) {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
    console.error(`[PT] worker: error after ${elapsed}s`, err)
    const message = err instanceof Error ? err.message : "Alignment failed."
    self.postMessage({ type: "error", message } satisfies AlignWorkerError)
  }
}
