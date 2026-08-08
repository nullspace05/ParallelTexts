import type { AlignedPair } from "@/types/alignment"
import type { SentenceRecord } from "./sentence-splitter"

/**
 * Build the Needleman-Wunsch DP scoring table.
 *
 * simMatrix  — flat Float32Array of shape srcLen × tgtLen (row-major).
 *              simMatrix[i * tgtLen + j] is the cosine similarity between
 *              source sentence i and target sentence j.
 *
 * Returns a flat Float32Array of shape (srcLen+1) × (tgtLen+1), indexed as
 *   dp[i * (tgtLen+1) + j]
 * where dp[i][j] is the best cumulative similarity for aligning the first i
 * source sentences with the first j target sentences.
 *
 * Three recurrence choices per cell:
 *   diagonal  dp[i-1][j-1] + sim[i-1][j-1]  →  match source[i-1] with target[j-1]
 *   up        dp[i-1][j]   + gapPenalty      →  source[i-1] has no target match (gap in tgt)
 *   left      dp[i][j-1]   + gapPenalty      →  target[j-1] has no source match (gap in src)
 *
 * The first row and column are left as 0 (no penalty for unmatched prefixes),
 * matching the Python implementation in alignment_algorithms.py.
 */
export function buildDpTable(
  simMatrix: Float32Array,
  srcLen: number,
  tgtLen: number,
  gapPenalty: number,
  onProgress?: (row: number) => void
): Float32Array {
  const cols = tgtLen + 1
  const dp = new Float32Array((srcLen + 1) * cols) // initialised to 0

  for (let i = 1; i <= srcLen; i++) {
    for (let j = 1; j <= tgtLen; j++) {
      const sim = simMatrix[(i - 1) * tgtLen + (j - 1)]

      const diagonal = dp[(i - 1) * cols + (j - 1)] + sim
      const fromAbove = dp[(i - 1) * cols + j] + gapPenalty // gap in target
      const fromLeft = dp[i * cols + (j - 1)] + gapPenalty // gap in source

      dp[i * cols + j] = Math.max(diagonal, fromAbove, fromLeft)
    }
    onProgress?.(i)
  }

  return dp
}

/**
 * Backtrack through the filled DP table and produce aligned pairs.
 *
 * Starting from the bottom-right corner dp[srcLen][tgtLen], we walk backwards
 * to dp[0][0] by asking at each cell: which neighbour did this value come from?
 *
 *   If dp[i][j] == dp[i-1][j-1] + sim[i-1][j-1]  → diagonal: matched pair  "1:1"
 *   Else if came from above (dp[i-1][j] + gap)     → gap in target           "1:0"
 *   Else                                            → gap in source           "0:1"
 *
 * The walk builds pairs in reverse order; we reverse at the end to get
 * forward reading order, matching the Python `structured_pairs_forward`.
 *
 * Float32 epsilon (1e-5) is used instead of Python's 1e-9 because Float32
 * accumulates more rounding error than float64.
 */
export function backtrack(
  dp: Float32Array,
  simMatrix: Float32Array,
  srcLen: number,
  tgtLen: number,
  srcRecords: SentenceRecord[],
  tgtRecords: SentenceRecord[],
  gapPenalty: number
): AlignedPair[] {
  const cols = tgtLen + 1
  const EPS = 1e-5
  const pairs: AlignedPair[] = []

  let i = srcLen
  let j = tgtLen

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simMatrix[(i - 1) * tgtLen + (j - 1)]
      const diagonalScore = dp[(i - 1) * cols + (j - 1)] + sim

      if (Math.abs(dp[i * cols + j] - diagonalScore) < EPS) {
        // Diagonal → matched pair
        const src = srcRecords[i - 1]
        const tgt = tgtRecords[j - 1]
        pairs.push({
          src_text: src.text,
          tgt_text: tgt.text,
          src_sent_idx: src.sent_idx,
          src_para_idx: src.para_idx,
          src_global_idx: src.global_idx,
          tgt_sent_idx: tgt.sent_idx,
          tgt_para_idx: tgt.para_idx,
          tgt_global_idx: tgt.global_idx,
          alignment_type: "1:1",
          confidence: sim,
          src_images: null,
          tgt_images: null,
        })
        i--
        j--
        continue
      }
    }

    if (i > 0) {
      const aboveScore = dp[(i - 1) * cols + j] + gapPenalty
      if (Math.abs(dp[i * cols + j] - aboveScore) < EPS) {
        // Up → gap in target (source sentence has no match)
        const src = srcRecords[i - 1]
        pairs.push({
          src_text: src.text,
          tgt_text: "",
          src_sent_idx: src.sent_idx,
          src_para_idx: src.para_idx,
          src_global_idx: src.global_idx,
          tgt_sent_idx: null,
          tgt_para_idx: null,
          tgt_global_idx: null,
          alignment_type: "1:0",
          confidence: null,
          src_images: null,
          tgt_images: null,
        })
        i--
        continue
      }
    }

    if (j > 0) {
      // Left → gap in source (target sentence has no match)
      const tgt = tgtRecords[j - 1]
      pairs.push({
        src_text: "",
        tgt_text: tgt.text,
        src_sent_idx: null,
        src_para_idx: null,
        src_global_idx: null,
        tgt_sent_idx: tgt.sent_idx,
        tgt_para_idx: tgt.para_idx,
        tgt_global_idx: tgt.global_idx,
        alignment_type: "0:1",
        confidence: null,
        src_images: null,
        tgt_images: null,
      })
      j--
    }
  }

  return pairs.reverse()
}

/**
 * Align two lists of sentences using Needleman-Wunsch and return AlignedPair[].
 *
 * This is the single entry point the alignment pipeline calls. It sequences:
 *   1. buildDpTable  — fill the scoring matrix (fires onProgress per row)
 *   2. backtrack     — trace the best path and produce pairs
 *
 * gapPenalty defaults to 0.0 (matching the Python implementation), meaning
 * unmatched sentences carry no extra cost beyond missing out on similarity.
 */
export function needlemanWunschAlign(
  simMatrix: Float32Array,
  srcRecords: SentenceRecord[],
  tgtRecords: SentenceRecord[],
  gapPenalty = 0.0,
  onProgress?: (row: number) => void
): AlignedPair[] {
  const srcLen = srcRecords.length
  const tgtLen = tgtRecords.length

  const dp = buildDpTable(simMatrix, srcLen, tgtLen, gapPenalty, onProgress)
  return backtrack(
    dp,
    simMatrix,
    srcLen,
    tgtLen,
    srcRecords,
    tgtRecords,
    gapPenalty
  )
}
