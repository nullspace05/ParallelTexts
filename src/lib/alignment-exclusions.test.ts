import { describe, expect, it } from "vitest"

import {
  mergeExcludedIntoPairs,
  partitionExcludedSentences,
} from "./alignment-exclusions"
import type { SentenceRecord } from "./sentence-splitter"
import type { AlignedPair } from "@/types/alignment"

function rec(
  globalIdx: number,
  paraIdx: number,
  sentIdx = 0,
  text = `s${globalIdx}`
): SentenceRecord {
  return { text, para_idx: paraIdx, sent_idx: sentIdx, global_idx: globalIdx }
}

/** A 1:1 pair with the given src/tgt global_idx, otherwise minimal filler. */
function pair11(srcIdx: number, tgtIdx: number): AlignedPair {
  return {
    src_text: `src${srcIdx}`,
    tgt_text: `tgt${tgtIdx}`,
    src_sent_idx: 0,
    src_para_idx: srcIdx,
    src_global_idx: srcIdx,
    tgt_sent_idx: 0,
    tgt_para_idx: tgtIdx,
    tgt_global_idx: tgtIdx,
    alignment_type: "1:1",
    confidence: 0.9,
    src_images: [],
    tgt_images: [],
  }
}

describe("partitionExcludedSentences", () => {
  it("returns everything included when excludedParaIdxs is empty", () => {
    const records = [rec(0, 0), rec(1, 0), rec(2, 1)]
    const result = partitionExcludedSentences(records, [])
    expect(result.included).toEqual(records)
    expect(result.excluded).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it("excludes every sentence of one paragraph", () => {
    // paragraph 1 has two sentences (global_idx 2, 3)
    const records = [
      rec(0, 0, 0),
      rec(1, 0, 1),
      rec(2, 1, 0),
      rec(3, 1, 1),
      rec(4, 2, 0),
    ]
    const { included, excluded } = partitionExcludedSentences(records, [1])
    expect(included.map((r) => r.global_idx)).toEqual([0, 1, 4])
    expect(excluded.map((r) => r.global_idx)).toEqual([2, 3])
    expect(excluded.every((r) => r.para_idx === 1)).toBe(true)
  })

  it("excludes sentences spanning multiple paragraphs, preserving order", () => {
    const records = [rec(0, 0), rec(1, 1), rec(2, 2), rec(3, 3), rec(4, 4)]
    const { included, excluded } = partitionExcludedSentences(records, [1, 3])
    expect(included.map((r) => r.global_idx)).toEqual([0, 2, 4])
    expect(excluded.map((r) => r.global_idx)).toEqual([1, 3])
  })

  it("returns empty arrays for empty records", () => {
    const result = partitionExcludedSentences([], [0, 1])
    expect(result.included).toEqual([])
    expect(result.excluded).toEqual([])
  })

  it("excludes nothing when excludedParaIdxs references paragraphs not present", () => {
    const records = [rec(0, 0), rec(1, 1)]
    const { included, excluded } = partitionExcludedSentences(records, [99])
    expect(included).toEqual(records)
    expect(excluded).toEqual([])
  })

  it("does not count excluded sentences against maxSentences", () => {
    // paragraph 0 (excluded, 3 sentences) precedes 2 real sentences; a cap of
    // 2 should keep both real sentences even though 5 records precede them.
    const records = [
      rec(0, 0, 0),
      rec(1, 0, 1),
      rec(2, 0, 2),
      rec(3, 1, 0),
      rec(4, 2, 0),
    ]
    const { included, excluded, truncated } = partitionExcludedSentences(
      records,
      [0],
      2
    )
    expect(included.map((r) => r.global_idx)).toEqual([3, 4])
    expect(excluded.map((r) => r.global_idx)).toEqual([0, 1, 2])
    expect(truncated).toBe(false)
  })

  it("stops at the document position where the included budget runs out, dropping everything after it", () => {
    const records = [
      rec(0, 0, 0), // included #1
      rec(1, 1, 0), // excluded, before the cutoff — kept
      rec(2, 2, 0), // included #2 — budget of 2 reached here
      rec(3, 1, 1), // excluded, but past the cutoff — dropped
      rec(4, 3, 0), // included, but past the cutoff — dropped
    ]
    const { included, excluded, truncated } = partitionExcludedSentences(
      records,
      [1],
      2
    )
    expect(included.map((r) => r.global_idx)).toEqual([0, 2])
    expect(excluded.map((r) => r.global_idx)).toEqual([1])
    expect(truncated).toBe(true)
  })

  it("truncated is false when included never reaches maxSentences", () => {
    const records = [rec(0, 0), rec(1, 1)]
    const { truncated } = partitionExcludedSentences(records, [], 10)
    expect(truncated).toBe(false)
  })
})

describe("mergeExcludedIntoPairs", () => {
  it("returns pairs unchanged when there is nothing excluded on either side", () => {
    const pairs = [pair11(0, 0), pair11(1, 1)]
    expect(mergeExcludedIntoPairs(pairs, [], [])).toBe(pairs)
  })

  it("inserts a src-excluded record before the first pair", () => {
    // excluded src sentence has global_idx 0, first surviving pair starts at src global_idx 1
    const pairs = [pair11(1, 0)]
    const excluded = [rec(0, 5, 0, "excluded-first")]
    const result = mergeExcludedIntoPairs(pairs, excluded, [])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      src_text: "excluded-first",
      alignment_type: "1:0",
      src_excluded: true,
      tgt_global_idx: null,
    })
    expect(result[1]).toBe(pairs[0])
  })

  it("inserts a src-excluded record between two pairs", () => {
    const pairs = [pair11(0, 0), pair11(2, 1)]
    // excluded sentence sits at src global_idx 1, between the two pairs
    const excluded = [rec(1, 5, 0, "middle")]
    const result = mergeExcludedIntoPairs(pairs, excluded, [])
    expect(result.map((p) => p.src_text)).toEqual(["src0", "middle", "src2"])
    expect(result[1].src_excluded).toBe(true)
  })

  it("appends a src-excluded record after the last pair", () => {
    const pairs = [pair11(0, 0)]
    const excluded = [rec(1, 5, 0, "trailing")]
    const result = mergeExcludedIntoPairs(pairs, excluded, [])
    expect(result.map((p) => p.src_text)).toEqual(["src0", "trailing"])
    expect(result[1].src_excluded).toBe(true)
  })

  it("handles a src-excluded and a tgt-excluded record adjacent to each other", () => {
    const pairs = [pair11(0, 0), pair11(2, 3)]
    const srcExcluded = [rec(1, 5, 0, "src-middle")]
    const tgtExcluded = [rec(1, 6, 0, "tgt-middle")]
    const result = mergeExcludedIntoPairs(pairs, srcExcluded, tgtExcluded)
    expect(result).toHaveLength(4)
    expect(result[0]).toBe(pairs[0])
    // Both excluded records land between the two real pairs (order between
    // them is not asserted — src/tgt sides are independent cursors).
    const middleTexts = result.slice(1, 3).map((p) => p.src_text || p.tgt_text)
    expect(middleTexts.sort()).toEqual(["src-middle", "tgt-middle"])
    expect(result[3]).toBe(pairs[1])
  })

  it("keeps global_idx non-decreasing on each side across the merged output", () => {
    const pairs = [pair11(0, 0), pair11(3, 4)]
    const srcExcluded = [rec(1, 5), rec(2, 5)]
    const tgtExcluded = [rec(1, 6), rec(2, 6), rec(3, 6)]
    const result = mergeExcludedIntoPairs(pairs, srcExcluded, tgtExcluded)

    const srcIdxs = result
      .map((p) => p.src_global_idx)
      .filter((n): n is number => n !== null)
    const tgtIdxs = result
      .map((p) => p.tgt_global_idx)
      .filter((n): n is number => n !== null)
    for (let i = 1; i < srcIdxs.length; i++) {
      expect(srcIdxs[i]).toBeGreaterThanOrEqual(srcIdxs[i - 1])
    }
    for (let i = 1; i < tgtIdxs.length; i++) {
      expect(tgtIdxs[i]).toBeGreaterThanOrEqual(tgtIdxs[i - 1])
    }
  })

  it("skips the src cursor comparison for a 0:1 pair (null src_global_idx)", () => {
    const zeroOnePair: AlignedPair = {
      src_text: "",
      tgt_text: "orphan",
      src_sent_idx: null,
      src_para_idx: null,
      src_global_idx: null,
      tgt_sent_idx: 0,
      tgt_para_idx: 9,
      tgt_global_idx: 0,
      alignment_type: "0:1",
      confidence: null,
      src_images: null,
      tgt_images: [],
    }
    const pairs = [zeroOnePair, pair11(0, 1)]
    const srcExcluded = [rec(0, 5, 0, "excluded-src")]
    const result = mergeExcludedIntoPairs(pairs, srcExcluded, [])
    // The excluded src record must still appear exactly once, and the
    // 0:1 pair must be unaffected by the src-side merge.
    expect(result.filter((p) => p.src_excluded)).toHaveLength(1)
    expect(result).toContainEqual(zeroOnePair)
  })
})
