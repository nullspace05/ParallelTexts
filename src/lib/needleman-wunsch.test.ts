import { describe, expect, it } from "vitest"

import {
  backtrack,
  buildDpTable,
  needlemanWunschAlign,
} from "./needleman-wunsch"
import type { SentenceRecord } from "./sentence-splitter"

// Minimal SentenceRecord for testing
function rec(text: string, globalIdx: number): SentenceRecord {
  return { text, para_idx: 0, sent_idx: globalIdx, global_idx: globalIdx }
}

// Build a flat Float32Array from a 2D row-major array
function mat(rows: number[][]): Float32Array {
  return new Float32Array(rows.flat())
}

// ─── buildDpTable ───────────────────────────────────────────────────────────

describe("buildDpTable", () => {
  it("fills a 1×1 table correctly", () => {
    const sim = mat([[0.8]])
    const dp = buildDpTable(sim, 1, 1, 0.0)
    // dp[1][1] = sim[0][0] = 0.8
    expect(dp[1 * 2 + 1]).toBeCloseTo(0.8, 4)
  })

  it("perfect diagonal 3×3 scores 2.7 at bottom-right", () => {
    const sim = mat([
      [0.9, 0.1, 0.1],
      [0.1, 0.9, 0.1],
      [0.1, 0.1, 0.9],
    ])
    const dp = buildDpTable(sim, 3, 3, 0.0)
    expect(dp[3 * 4 + 3]).toBeCloseTo(2.7, 3)
  })

  it("first row and column remain 0 (no gap penalty on edges)", () => {
    const sim = mat([
      [0.5, 0.5],
      [0.5, 0.5],
    ])
    const dp = buildDpTable(sim, 2, 2, 0.0)
    const cols = 3
    // Row 0 all zeros
    expect(dp[0 * cols + 0]).toBe(0)
    expect(dp[0 * cols + 1]).toBe(0)
    expect(dp[0 * cols + 2]).toBe(0)
    // Col 0 all zeros
    expect(dp[1 * cols + 0]).toBe(0)
    expect(dp[2 * cols + 0]).toBe(0)
  })

  it("calls onProgress once per source row", () => {
    const sim = mat([
      [0.5, 0.5],
      [0.5, 0.5],
    ])
    const rows: number[] = []
    buildDpTable(sim, 2, 2, 0.0, (r) => rows.push(r))
    expect(rows).toEqual([1, 2])
  })
})

// ─── backtrack ──────────────────────────────────────────────────────────────

describe("backtrack", () => {
  it("produces 3 matched pairs for a perfect diagonal 3×3", () => {
    const sim = mat([
      [0.9, 0.1, 0.1],
      [0.1, 0.9, 0.1],
      [0.1, 0.1, 0.9],
    ])
    const src = [rec("A", 0), rec("B", 1), rec("C", 2)]
    const tgt = [rec("X", 0), rec("Y", 1), rec("Z", 2)]
    const dp = buildDpTable(sim, 3, 3, 0.0)
    const pairs = backtrack(dp, sim, 3, 3, src, tgt, 0.0)

    expect(pairs).toHaveLength(3)
    expect(pairs.every((p) => p.alignment_type === "1:1")).toBe(true)
    expect(pairs[0].src_text).toBe("A")
    expect(pairs[0].tgt_text).toBe("X")
    expect(pairs[2].src_text).toBe("C")
    expect(pairs[2].tgt_text).toBe("Z")
  })

  it("pairs are in forward order (first pair first)", () => {
    const sim = mat([
      [0.9, 0.1],
      [0.1, 0.9],
    ])
    const src = [rec("first", 0), rec("second", 1)]
    const tgt = [rec("uno", 0), rec("dos", 1)]
    const dp = buildDpTable(sim, 2, 2, 0.0)
    const pairs = backtrack(dp, sim, 2, 2, src, tgt, 0.0)

    expect(pairs[0].src_text).toBe("first")
    expect(pairs[1].src_text).toBe("second")
  })
})

// ─── needlemanWunschAlign ────────────────────────────────────────────────────

describe("needlemanWunschAlign", () => {
  it("3×3 diagonal → all 1:1 pairs with correct confidence", () => {
    const sim = mat([
      [0.9, 0.1, 0.1],
      [0.1, 0.9, 0.1],
      [0.1, 0.1, 0.9],
    ])
    const src = [rec("A", 0), rec("B", 1), rec("C", 2)]
    const tgt = [rec("X", 0), rec("Y", 1), rec("Z", 2)]
    const pairs = needlemanWunschAlign(sim, src, tgt)

    expect(pairs).toHaveLength(3)
    pairs.forEach((p) => {
      expect(p.alignment_type).toBe("1:1")
      expect(p.confidence).toBeCloseTo(0.9, 3)
    })
  })

  it("2×3 (more target than source) → some 0:1 gap pairs", () => {
    // src has 2 sentences, tgt has 3 — one target will be unmatched
    const sim = mat([
      [0.9, 0.1, 0.1],
      [0.1, 0.1, 0.9],
    ])
    const src = [rec("A", 0), rec("B", 1)]
    const tgt = [rec("X", 0), rec("Y", 1), rec("Z", 2)]
    const pairs = needlemanWunschAlign(sim, src, tgt)

    // Total pairs must account for all src and tgt sentences
    const matched = pairs.filter((p) => p.alignment_type === "1:1")
    const tgtGaps = pairs.filter((p) => p.alignment_type === "0:1")
    expect(matched).toHaveLength(2)
    expect(tgtGaps).toHaveLength(1)
    // Gap pair has empty src_text
    expect(tgtGaps[0].src_text).toBe("")
    expect(tgtGaps[0].confidence).toBeNull()
  })

  it("3×2 (more source than target) → some 1:0 gap pairs", () => {
    const sim = mat([
      [0.9, 0.1],
      [0.1, 0.1],
      [0.1, 0.9],
    ])
    const src = [rec("A", 0), rec("B", 1), rec("C", 2)]
    const tgt = [rec("X", 0), rec("Y", 1)]
    const pairs = needlemanWunschAlign(sim, src, tgt)

    const matched = pairs.filter((p) => p.alignment_type === "1:1")
    const srcGaps = pairs.filter((p) => p.alignment_type === "1:0")
    expect(matched).toHaveLength(2)
    expect(srcGaps).toHaveLength(1)
    expect(srcGaps[0].tgt_text).toBe("")
    expect(srcGaps[0].confidence).toBeNull()
  })

  it("index fields on pairs match the source SentenceRecord", () => {
    const sim = mat([[0.9]])
    const src = [{ text: "Hello.", para_idx: 3, sent_idx: 1, global_idx: 7 }]
    const tgt = [
      { text: "こんにちは。", para_idx: 5, sent_idx: 0, global_idx: 12 },
    ]
    const pairs = needlemanWunschAlign(sim, src, tgt)

    expect(pairs[0].src_para_idx).toBe(3)
    expect(pairs[0].src_sent_idx).toBe(1)
    expect(pairs[0].src_global_idx).toBe(7)
    expect(pairs[0].tgt_para_idx).toBe(5)
    expect(pairs[0].tgt_global_idx).toBe(12)
  })

  it("gap pairs have null index fields on the missing side", () => {
    // 1 source, 0 target equivalent: force a 1:0 gap
    const sim = mat([[0.1, 0.9]])
    const src = [rec("A", 0)]
    const tgt = [rec("X", 0), rec("Y", 1)]
    const pairs = needlemanWunschAlign(sim, src, tgt)

    const gap = pairs.find((p) => p.alignment_type === "0:1")
    expect(gap).toBeDefined()
    expect(gap!.src_para_idx).toBeNull()
    expect(gap!.src_sent_idx).toBeNull()
    expect(gap!.src_global_idx).toBeNull()
  })
})
