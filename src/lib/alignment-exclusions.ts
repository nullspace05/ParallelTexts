import type { SentenceRecord } from "@/lib/sentence-splitter"
import type { AlignedPair } from "@/types/alignment"

/**
 * Splits sentence records into the ones that should be fed to embedding/NW
 * ("included") and the ones the user marked as excluded on the book page
 * ("excluded"). Both outputs preserve the input's relative order, so their
 * `global_idx` values stay in ascending order within each half — this is what
 * lets `mergeExcludedIntoPairs` walk `excluded` with a single forward cursor.
 *
 * `maxSentences` caps `included` the same way `splitIntoSentences`'s own cap
 * used to — except the budget is spent only on sentences that actually go to
 * the aligner. `records` must not already be capped by that count (callers
 * should split with an effectively unbounded limit and let this function
 * apply the real one), otherwise excluded paragraphs occurring early in the
 * book would still eat into the budget before ever reaching this partition
 * step. Once `included` reaches the cap, both `included` and `excluded` stop
 * accumulating at that document position — content beyond it, excluded or
 * not, is dropped, matching the pre-existing truncation behavior.
 */
export function partitionExcludedSentences(
  records: SentenceRecord[],
  excludedParaIdxs: ReadonlyArray<number>,
  maxSentences = Infinity
): {
  included: SentenceRecord[]
  excluded: SentenceRecord[]
  truncated: boolean
} {
  const excludedSet = new Set(excludedParaIdxs)
  const included: SentenceRecord[] = []
  const excluded: SentenceRecord[] = []

  for (const record of records) {
    if (included.length >= maxSentences) {
      return { included, excluded, truncated: true }
    }
    if (excludedSet.has(record.para_idx)) excluded.push(record)
    else included.push(record)
  }

  return { included, excluded, truncated: false }
}

function excludedRecordToPair(
  record: SentenceRecord,
  side: "src" | "tgt"
): AlignedPair {
  if (side === "src") {
    return {
      src_text: record.text,
      tgt_text: "",
      src_sent_idx: record.sent_idx,
      src_para_idx: record.para_idx,
      src_global_idx: record.global_idx,
      tgt_sent_idx: null,
      tgt_para_idx: null,
      tgt_global_idx: null,
      alignment_type: "1:0",
      confidence: null,
      src_images: [],
      tgt_images: null,
      src_excluded: true,
    }
  }
  return {
    src_text: "",
    tgt_text: record.text,
    src_sent_idx: null,
    src_para_idx: null,
    src_global_idx: null,
    tgt_sent_idx: record.sent_idx,
    tgt_para_idx: record.para_idx,
    tgt_global_idx: record.global_idx,
    alignment_type: "0:1",
    confidence: null,
    src_images: null,
    tgt_images: [],
    tgt_excluded: true,
  }
}

/**
 * Splices sentences excluded from alignment back into the NW output as
 * ordinary `"1:0"`/`"0:1"` gap pairs (flagged `src_excluded`/`tgt_excluded`),
 * in their correct document position — so excluded text still shows up
 * everywhere pairs are consumed (reader, search, exports) without those
 * consumers needing any changes.
 *
 * Single forward pass over `pairs`: before each pair, flushes any excluded
 * record on a side whose `global_idx` comes before that pair's `global_idx`
 * on the same side. A pair with a `null` `src_global_idx` (a `"0:1"` pair, no
 * source sentence) or `null` `tgt_global_idx` (a `"1:0"` pair) has nothing to
 * compare on that side, so that side's cursor is left untouched for it.
 * Both `srcExcluded` and `tgtExcluded` must already be in ascending
 * `global_idx` order (true of `partitionExcludedSentences`'s output).
 */
export function mergeExcludedIntoPairs(
  pairs: AlignedPair[],
  srcExcluded: SentenceRecord[],
  tgtExcluded: SentenceRecord[]
): AlignedPair[] {
  if (srcExcluded.length === 0 && tgtExcluded.length === 0) return pairs

  const result: AlignedPair[] = []
  let si = 0
  let ti = 0

  function flushSrc(limit: number) {
    while (si < srcExcluded.length && srcExcluded[si].global_idx < limit) {
      result.push(excludedRecordToPair(srcExcluded[si], "src"))
      si++
    }
  }
  function flushTgt(limit: number) {
    while (ti < tgtExcluded.length && tgtExcluded[ti].global_idx < limit) {
      result.push(excludedRecordToPair(tgtExcluded[ti], "tgt"))
      ti++
    }
  }

  for (const pair of pairs) {
    if (pair.src_global_idx !== null) flushSrc(pair.src_global_idx)
    if (pair.tgt_global_idx !== null) flushTgt(pair.tgt_global_idx)
    result.push(pair)
  }
  flushSrc(Infinity)
  flushTgt(Infinity)

  return result
}

/**
 * Tallies `pairs` into the summary counts stored on `AlignmentResult`.
 * Pairs flagged `src_excluded`/`tgt_excluded` are counted separately rather
 * than folded into `src_gap_count`/`tgt_gap_count` — they exist because the
 * user chose to skip that content, not because the aligner failed to find a
 * match, so counting them as ordinary gaps would understate match quality
 * and dilute the reported gap counts with content that was never a
 * candidate for alignment in the first place.
 */
export function computeAlignmentStats(pairs: AlignedPair[]): {
  aligned_count: number
  src_gap_count: number
  tgt_gap_count: number
  excluded_count: number
} {
  let aligned_count = 0
  let src_gap_count = 0
  let tgt_gap_count = 0
  let excluded_count = 0

  for (const p of pairs) {
    if (p.src_excluded || p.tgt_excluded) {
      excluded_count++
    } else if (p.alignment_type === "1:1") {
      aligned_count++
    } else if (p.alignment_type === "1:0") {
      src_gap_count++
    } else if (p.alignment_type === "0:1") {
      tgt_gap_count++
    }
  }

  return { aligned_count, src_gap_count, tgt_gap_count, excluded_count }
}
