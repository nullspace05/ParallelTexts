import { describe, expect, it } from "vitest"

import { bandedNWAlign } from "./banded-nw"
import { needlemanWunschAlign } from "./needleman-wunsch"
import type { SentenceRecord } from "./sentence-splitter"

function rec(text: string, idx: number): SentenceRecord {
  return { text, para_idx: 0, sent_idx: idx, global_idx: idx }
}

/** Build L2-normalised embeddings from unit vectors (dim=4). */
function emb(...rows: number[][]): Float32Array {
  const dim = rows[0].length
  const out = new Float32Array(rows.length * dim)
  for (let i = 0; i < rows.length; i++) {
    const len = Math.sqrt(rows[i].reduce((s, v) => s + v * v, 0))
    for (let k = 0; k < dim; k++) out[i * dim + k] = rows[i][k] / len
  }
  return out
}

/** Build a flat similarity matrix for the full NW comparison. */
function simMatrix(
  src: Float32Array,
  tgt: Float32Array,
  dim: number,
  srcLen: number,
  tgtLen: number
): Float32Array {
  const m = new Float32Array(srcLen * tgtLen)
  for (let i = 0; i < srcLen; i++)
    for (let j = 0; j < tgtLen; j++) {
      let s = 0
      for (let k = 0; k < dim; k++) s += src[i * dim + k] * tgt[j * dim + k]
      m[i * tgtLen + j] = s
    }
  return m
}

const DIM = 4

describe("bandedNWAlign", () => {
  it("returns empty array when either side is empty", () => {
    const e = new Float32Array(0)
    const r = [rec("a", 0)]
    expect(bandedNWAlign(e, e, DIM, [], [], 0)).toEqual([])
    expect(bandedNWAlign(e, e, DIM, r, [], 0)).toEqual([])
    expect(bandedNWAlign(e, e, DIM, [], r, 0)).toEqual([])
  })

  it("1×1 perfect match → single 1:1 pair with high confidence", () => {
    const v = emb([1, 0, 0, 0])
    const pairs = bandedNWAlign(v, v, DIM, [rec("A", 0)], [rec("B", 0)], 0)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].alignment_type).toBe("1:1")
    expect(pairs[0].confidence).toBeCloseTo(1.0, 4)
  })

  it("3×3 diagonal similarity → matches full NW output", () => {
    const srcE = emb([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
    const tgtE = emb([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
    const srcRecs = [rec("s0", 0), rec("s1", 1), rec("s2", 2)]
    const tgtRecs = [rec("t0", 0), rec("t1", 1), rec("t2", 2)]

    // Band large enough to cover everything (bandFraction=1.0)
    const banded = bandedNWAlign(srcE, tgtE, DIM, srcRecs, tgtRecs, 0, 1.0)
    const sim = simMatrix(srcE, tgtE, DIM, 3, 3)
    const full = needlemanWunschAlign(sim, srcRecs, tgtRecs, 0)

    expect(banded.map((p) => p.alignment_type)).toEqual(
      full.map((p) => p.alignment_type)
    )
    banded.forEach((p, i) => {
      if (p.alignment_type === "1:1") {
        expect(p.confidence).toBeCloseTo(full[i].confidence!, 3)
      }
    })
  })

  it("output length = srcLen + tgtLen - matched count (all moves consume at least one side)", () => {
    const srcE = emb([1, 0, 0, 0], [0, 1, 0, 0])
    const tgtE = emb([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
    const srcRecs = [rec("s0", 0), rec("s1", 1)]
    const tgtRecs = [rec("t0", 0), rec("t1", 1), rec("t2", 2)]
    const pairs = bandedNWAlign(srcE, tgtE, DIM, srcRecs, tgtRecs, 0, 1.0)

    const ones = pairs.filter((p) => p.alignment_type === "1:1").length
    const srcGaps = pairs.filter((p) => p.alignment_type === "1:0").length
    const tgtGaps = pairs.filter((p) => p.alignment_type === "0:1").length
    expect(ones + srcGaps).toBe(2) // all src sentences consumed
    expect(ones + tgtGaps).toBe(3) // all tgt sentences consumed
  })

  it("gap rows have null fields on the missing side", () => {
    // Make src[0] highly similar to tgt[0]; src[1] has no good match → 1:0 gap
    const srcE = emb([1, 0, 0, 0], [0, 0, 0, 1])
    const tgtE = emb([1, 0, 0, 0])
    const pairs = bandedNWAlign(
      srcE,
      tgtE,
      DIM,
      [rec("s0", 0), rec("s1", 1)],
      [rec("t0", 0)],
      0,
      1.0
    )
    const gap = pairs.find((p) => p.alignment_type === "1:0")!
    expect(gap).toBeDefined()
    expect(gap.tgt_text).toBe("")
    expect(gap.tgt_sent_idx).toBeNull()
    expect(gap.tgt_images).toBeNull()
    expect(gap.confidence).toBeNull()
  })

  it("progress callback fires once per src row", () => {
    const srcE = emb([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
    const tgtE = emb([1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
    const calls: number[] = []
    bandedNWAlign(
      srcE,
      tgtE,
      DIM,
      [rec("s0", 0), rec("s1", 1), rec("s2", 2)],
      [rec("t0", 0), rec("t1", 1), rec("t2", 2)],
      0,
      1.0,
      (row) => calls.push(row)
    )
    expect(calls).toEqual([1, 2, 3])
  })
})
