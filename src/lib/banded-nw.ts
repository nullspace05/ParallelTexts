import type { SentenceRecord } from "@/lib/sentence-splitter"
import type { AlignedPair } from "@/types/alignment"

const EPS = 1e-5

function dot(
  a: Float32Array,
  aOff: number,
  b: Float32Array,
  bOff: number,
  dim: number
): number {
  let s = 0
  for (let k = 0; k < dim; k++) s += a[aOff + k] * b[bOff + k]
  return s
}

/**
 * Banded Needleman-Wunsch alignment.
 *
 * Identical semantics to the full NW in needleman-wunsch.ts, but only fills
 * a diagonal band of half-width W around the expected alignment path:
 *
 *   jCenter(i) = round(i × tgtLen / srcLen)
 *   band: [max(0, jCenter − W), min(tgtLen, jCenter + W)]
 *
 * This reduces memory from O(src × tgt) to O(src × W) and skips the
 * separate computeSimMatrix step — dot products are computed on-the-fly.
 *
 * W = max(50, ceil(bandFraction × max(srcLen, tgtLen)))
 *
 * With the default bandFraction=0.15, a 10 000-sentence alignment uses
 * ~48 MB for the DP band instead of ~400 MB for the full table.
 * Book translations rarely drift more than 5-10% from the diagonal,
 * so 15% gives a comfortable safety margin.
 */
export function bandedNWAlign(
  srcEmb: Float32Array,
  tgtEmb: Float32Array,
  dim: number,
  srcRecords: SentenceRecord[],
  tgtRecords: SentenceRecord[],
  gapPenalty = 0,
  bandFraction = 0.15,
  onProgress?: (row: number) => void
): AlignedPair[] {
  const srcLen = srcRecords.length
  const tgtLen = tgtRecords.length

  if (srcLen === 0 || tgtLen === 0) return []

  const W = Math.max(50, Math.ceil(bandFraction * Math.max(srcLen, tgtLen)))

  // Precompute band extents for every row i ∈ [0, srcLen].
  const lo = new Int32Array(srcLen + 1)
  const hi = new Int32Array(srcLen + 1)
  for (let i = 0; i <= srcLen; i++) {
    const jCenter = Math.round((i * tgtLen) / srcLen)
    lo[i] = Math.max(0, jCenter - W)
    hi[i] = Math.min(tgtLen, jCenter + W)
  }

  // DP table: dp[i] is a Float32Array covering columns lo[i]..hi[i].
  // Cells outside the band are implicitly −∞ (unreachable).
  const dp: Float32Array[] = new Array(srcLen + 1)
  for (let i = 0; i <= srcLen; i++) {
    dp[i] = new Float32Array(hi[i] - lo[i] + 1).fill(-Infinity)
  }

  // Boundary initialisation (same as full NW: no prefix-gap penalty by default).
  // dp[0][j] = j * gapPenalty for all j in the first-row band (lo[0] is always 0).
  for (let j = lo[0]; j <= hi[0]; j++) {
    dp[0][j - lo[0]] = j * gapPenalty
  }
  // dp[i][0] = i * gapPenalty for all rows where j=0 is inside the band.
  for (let i = 1; i <= srcLen; i++) {
    if (lo[i] === 0) dp[i][0] = i * gapPenalty
  }

  // DP fill
  for (let i = 1; i <= srcLen; i++) {
    const srcOff = (i - 1) * dim

    for (let j = lo[i]; j <= hi[i]; j++) {
      const sim = j > 0 ? dot(srcEmb, srcOff, tgtEmb, (j - 1) * dim, dim) : 0

      // Diagonal: source[i-1] matched with target[j-1]
      let best = -Infinity
      if (j > 0 && j - 1 >= lo[i - 1] && j - 1 <= hi[i - 1]) {
        const v = dp[i - 1][j - 1 - lo[i - 1]] + sim
        if (v > best) best = v
      }

      // Up: gap in target (source[i-1] unmatched)
      if (j >= lo[i - 1] && j <= hi[i - 1]) {
        const v = dp[i - 1][j - lo[i - 1]] + gapPenalty
        if (v > best) best = v
      }

      // Left: gap in source (target[j-1] unmatched)
      if (j > 0 && j - 1 >= lo[i] && j - 1 <= hi[i]) {
        const v = dp[i][j - 1 - lo[i]] + gapPenalty
        if (v > best) best = v
      }

      dp[i][j - lo[i]] = best
    }

    onProgress?.(i)
  }

  // Backtrack from (srcLen, tgtLen) to (0, 0)
  const moves: Array<"1:1" | "1:0" | "0:1"> = []
  let i = srcLen
  let j = tgtLen

  while (i > 0 || j > 0) {
    if (i === 0) {
      moves.push("0:1")
      j--
      continue
    }
    if (j === 0) {
      moves.push("1:0")
      i--
      continue
    }

    const sim = dot(srcEmb, (i - 1) * dim, tgtEmb, (j - 1) * dim, dim)
    const cur = dp[i][j - lo[i]]

    let diagScore = -Infinity
    if (j - 1 >= lo[i - 1] && j - 1 <= hi[i - 1]) {
      diagScore = dp[i - 1][j - 1 - lo[i - 1]] + sim
    }

    let upScore = -Infinity
    if (j >= lo[i - 1] && j <= hi[i - 1]) {
      upScore = dp[i - 1][j - lo[i - 1]] + gapPenalty
    }

    let leftScore = -Infinity
    if (j - 1 >= lo[i] && j - 1 <= hi[i]) {
      leftScore = dp[i][j - 1 - lo[i]] + gapPenalty
    }

    if (Math.abs(cur - diagScore) < EPS) {
      moves.push("1:1")
      i--
      j--
    } else if (Math.abs(cur - upScore) < EPS) {
      moves.push("1:0")
      i--
    } else if (Math.abs(cur - leftScore) < EPS) {
      moves.push("0:1")
      j--
    } else {
      // Fallback: band too narrow for this cell — pick the cheapest escape.
      // Should not happen in practice with bandFraction=0.15.
      if (i > 0 && j > 0) {
        moves.push("1:1")
        i--
        j--
      } else if (i > 0) {
        moves.push("1:0")
        i--
      } else {
        moves.push("0:1")
        j--
      }
    }
  }

  moves.reverse()

  // Assemble AlignedPair[] from the move sequence.
  const pairs: AlignedPair[] = []
  let si = 0
  let ti = 0

  for (const move of moves) {
    const srcRec = move !== "0:1" ? srcRecords[si] : null
    const tgtRec = move !== "1:0" ? tgtRecords[ti] : null
    const confidence =
      move === "1:1" && srcRec && tgtRec
        ? dot(srcEmb, si * dim, tgtEmb, ti * dim, dim)
        : null

    pairs.push({
      src_text: srcRec?.text ?? "",
      tgt_text: tgtRec?.text ?? "",
      src_sent_idx: srcRec?.sent_idx ?? null,
      src_para_idx: srcRec?.para_idx ?? null,
      src_global_idx: srcRec?.global_idx ?? null,
      tgt_sent_idx: tgtRec?.sent_idx ?? null,
      tgt_para_idx: tgtRec?.para_idx ?? null,
      tgt_global_idx: tgtRec?.global_idx ?? null,
      alignment_type: move,
      confidence,
      src_images: srcRec ? [] : null,
      tgt_images: tgtRec ? [] : null,
    })

    if (move !== "0:1") si++
    if (move !== "1:0") ti++
  }

  return pairs
}
