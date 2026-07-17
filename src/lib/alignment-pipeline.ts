import { extractEpubContent } from "@/lib/epub"
import { extractPdfContent } from "@/lib/pdf"
import { extractTxtContent } from "@/lib/txt"
import { getSentenceTexts, splitIntoSentences } from "@/lib/sentence-splitter"
import type {
  AlignedPair,
  AlignmentResult,
  SourceParagraph,
} from "@/types/alignment"
import {
  DEFAULT_MODEL_ID,
  type InferenceDevice,
  loadExtractor,
} from "@/utils/model"
import { bandedNWAlign } from "./banded-nw"
import type { SentenceRecord } from "./sentence-splitter"

export interface RegexRule {
  pattern: string
  replacement: string
}

export interface AlignParams {
  srcBlob: Blob
  srcType: "epub" | "pdf" | "txt"
  srcLang: string
  tgtBlob: Blob
  tgtType: "epub" | "pdf" | "txt"
  tgtLang: string
  modelId?: string
  device?: InferenceDevice
  maxSentences?: number
  gapPenalty?: number
  /** Regex rules applied to extracted paragraph text before sentence splitting. */
  preprocessRules?: RegexRule[]
  onProgress?: (event: AlignProgressEvent) => void
}

function applyPreprocessRules(
  paras: SourceParagraph[],
  rules: RegexRule[]
): SourceParagraph[] {
  if (!rules.length) return paras
  return paras.map((p) => {
    let text = p.text
    for (const rule of rules) {
      try {
        text = text.replace(new RegExp(rule.pattern, "g"), rule.replacement)
      } catch {
        // skip invalid patterns silently
      }
    }
    return { ...p, text }
  })
}

export type AlignPhase =
  | "extracting_source"
  | "extracting_target"
  | "splitting"
  | "embedding_source"
  | "embedding_target"
  | "computing_similarity" // kept for backwards compat; no longer emitted
  | "aligning"

export interface AlignProgressEvent {
  phase: AlignPhase
  /** Items completed so far. Absent for phases with no granular progress. */
  current?: number
  /** Total items in this phase. Absent for phases with no granular progress. */
  total?: number
}

// ── Phase 1+2: Extract paragraphs + split sentences (DOM APIs, main thread) ──

export interface ExtractAndSplitResult {
  srcRecords: SentenceRecord[]
  tgtRecords: SentenceRecord[]
  srcParas: SourceParagraph[]
  tgtParas: SourceParagraph[]
  srcTruncated: boolean
  tgtTruncated: boolean
}

/**
 * Extract text from both books and split into sentence records.
 * Uses DOMParser (EPUB) and pdfjs — must run on the main thread, not in a Worker.
 */
export async function extractAndSplit(
  params: AlignParams
): Promise<ExtractAndSplitResult> {
  const {
    srcBlob,
    srcType,
    srcLang,
    tgtBlob,
    tgtType,
    tgtLang,
    maxSentences = 10_000,
    preprocessRules = [],
    onProgress,
  } = params

  const emit = (phase: AlignPhase, current?: number, total?: number) =>
    onProgress?.({ phase, current, total })

  emit("extracting_source")
  const rawSrcParas =
    srcType === "epub"
      ? await extractEpubContent(srcBlob)
      : srcType === "pdf"
        ? await extractPdfContent(srcBlob)
        : await extractTxtContent(srcBlob)

  emit("extracting_target")
  const rawTgtParas =
    tgtType === "epub"
      ? await extractEpubContent(tgtBlob)
      : tgtType === "pdf"
        ? await extractPdfContent(tgtBlob)
        : await extractTxtContent(tgtBlob)

  const srcParas = applyPreprocessRules(rawSrcParas, preprocessRules)
  const tgtParas = applyPreprocessRules(rawTgtParas, preprocessRules)

  emit("splitting")
  const { records: srcRecords, truncated: srcTruncated } = splitIntoSentences(
    srcParas,
    srcLang,
    maxSentences
  )
  const { records: tgtRecords, truncated: tgtTruncated } = splitIntoSentences(
    tgtParas,
    tgtLang,
    maxSentences
  )

  return {
    srcRecords,
    tgtRecords,
    srcParas,
    tgtParas,
    srcTruncated,
    tgtTruncated,
  }
}

// ── Phase 3+4+5: Embed → banded NW align (Worker-safe, no DOM APIs) ──────────

const EMBED_BATCH_SIZE = 32

/**
 * Embed a list of texts using the given model, processing in batches.
 * Embeddings are L2-normalised (dot-product == cosine similarity).
 */
export async function embedSentences(
  texts: string[],
  modelId: string,
  device: InferenceDevice = "auto",
  onProgress?: (current: number, total: number) => void
): Promise<{ data: Float32Array; hiddenDim: number }> {
  if (texts.length === 0) return { data: new Float32Array(0), hiddenDim: 0 }

  const extractor = await loadExtractor(modelId, device)
  const chunks: Float32Array[] = []
  let hiddenDim = 0
  const t0 = performance.now()
  const milestones = [25, 50, 75, 100]
  let nextMilestone = 0

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const output = await extractor(batch, { pooling: "mean", normalize: true })

    hiddenDim = output.dims[1]
    chunks.push(new Float32Array(output.data as ArrayLike<number>))

    const done = Math.min(i + EMBED_BATCH_SIZE, texts.length)
    const pct = Math.round((done / texts.length) * 100)
    while (
      nextMilestone < milestones.length &&
      pct >= milestones[nextMilestone]
    ) {
      console.log(
        `[PT] embed:   ${done}/${texts.length} (${milestones[nextMilestone]}%) — ${((performance.now() - t0) / 1000).toFixed(1)}s`
      )
      nextMilestone++
    }

    onProgress?.(done, texts.length)
  }

  const data = new Float32Array(texts.length * hiddenDim)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }

  return { data, hiddenDim }
}

/**
 * Embed → banded Needleman-Wunsch alignment.
 * No DOM APIs — safe to call from a Web Worker.
 *
 * Uses bandedNWAlign (O(src × W) memory) instead of the former two-step
 * computeSimMatrix + needlemanWunschAlign (O(src × tgt) memory), removing
 * the practical sentence-count ceiling.
 */
export async function runEmbedAndAlign(
  srcRecords: SentenceRecord[],
  tgtRecords: SentenceRecord[],
  modelId: string,
  gapPenalty: number,
  device: InferenceDevice = "auto",
  onProgress?: (event: AlignProgressEvent) => void
): Promise<AlignedPair[]> {
  const emit = (phase: AlignPhase, current?: number, total?: number) =>
    onProgress?.({ phase, current, total })

  const srcTexts = getSentenceTexts(srcRecords)
  const tgtTexts = getSentenceTexts(tgtRecords)

  console.log(
    `[PT] embed: source ${srcTexts.length} sentences | model=${modelId} | device=${device}`
  )
  const { data: srcEmb, hiddenDim } = await embedSentences(
    srcTexts,
    modelId,
    device,
    (cur, tot) => emit("embedding_source", cur, tot)
  )

  console.log(`[PT] embed: target ${tgtTexts.length} sentences`)
  const { data: tgtEmb } = await embedSentences(
    tgtTexts,
    modelId,
    device,
    (cur, tot) => emit("embedding_target", cur, tot)
  )

  console.log(
    `[PT] align: NW alignment | src=${srcRecords.length} | tgt=${tgtRecords.length}`
  )
  const pairs = bandedNWAlign(
    srcEmb,
    tgtEmb,
    hiddenDim,
    srcRecords,
    tgtRecords,
    gapPenalty,
    0.15,
    (row) => emit("aligning", row, srcRecords.length)
  )
  console.log(`[PT] align: NW done | pairs=${pairs.length}`)

  return pairs
}

// ── Combined convenience wrapper (used for testing / non-worker path) ─────────

export async function alignBooks(
  params: AlignParams
): Promise<AlignmentResult> {
  const {
    srcLang,
    tgtLang,
    modelId = DEFAULT_MODEL_ID,
    device = "auto",
    gapPenalty = 0.0,
    onProgress,
  } = params

  const { srcRecords, tgtRecords, srcParas, tgtParas } =
    await extractAndSplit(params)

  const pairs = await runEmbedAndAlign(
    srcRecords,
    tgtRecords,
    modelId,
    gapPenalty,
    device,
    onProgress
  )

  const aligned_count = pairs.filter((p) => p.alignment_type === "1:1").length
  const src_gap_count = pairs.filter((p) => p.alignment_type === "1:0").length
  const tgt_gap_count = pairs.filter((p) => p.alignment_type === "0:1").length

  return {
    pairs,
    src_lang: srcLang,
    tgt_lang: tgtLang,
    total_src_sentences: srcRecords.length,
    total_tgt_sentences: tgtRecords.length,
    aligned_count,
    src_gap_count,
    tgt_gap_count,
    source_paragraphs: srcParas,
    target_paragraphs: tgtParas,
  }
}

// Re-export so callers can use DEFAULT_MODEL_ID without importing model.ts.
export { DEFAULT_MODEL_ID }
