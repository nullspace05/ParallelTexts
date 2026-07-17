import { describe, expect, it } from "vitest"
import {
  buildCumulativeCharCounts,
  charCountForPage,
  pageFromCharCount,
} from "./reading-progress"

// Helper to create a mock HTMLElement with a given offsetLeft
function el(offsetLeft: number): HTMLElement {
  return { offsetLeft } as HTMLElement
}

const COLUMN_WIDTH = 780
const COLUMN_GAP = 40

describe("buildCumulativeCharCounts", () => {
  it("returns [0] for empty array", () => {
    expect(buildCumulativeCharCounts([])).toEqual([0])
  })

  it("returns correct cumulative sums", () => {
    const paras = [
      { text: "hello world" }, // 11
      { text: "foo bar" }, //     7
      { text: "baz" }, //         3
    ]
    expect(buildCumulativeCharCounts(paras)).toEqual([0, 11, 18, 21])
  })

  it("last element equals total chars", () => {
    const paras = [{ text: "abc" }, { text: "defgh" }]
    const result = buildCumulativeCharCounts(paras)
    expect(result[result.length - 1]).toBe(8)
  })
})

describe("charCountForPage", () => {
  // page 0 starts at offsetLeft >= 0
  // page 1 starts at offsetLeft >= 820 (780 + 40)
  // page 2 starts at offsetLeft >= 1640 (2*820)
  const els = [
    el(0), //    para 0 → page 0
    el(0), //    para 1 → page 0
    el(820), //  para 2 → page 1
    el(1640), // para 3 → page 2
  ]
  const cumulative = [0, 11, 18, 21, 25]

  it("page 0 → charCount 0 (start of first paragraph)", () => {
    expect(charCountForPage(els, 0, COLUMN_WIDTH, COLUMN_GAP, cumulative)).toBe(
      0
    )
  })

  it("page 1 → charCount at para 2", () => {
    expect(charCountForPage(els, 1, COLUMN_WIDTH, COLUMN_GAP, cumulative)).toBe(
      18
    )
  })

  it("page 2 → charCount at para 3", () => {
    expect(charCountForPage(els, 2, COLUMN_WIDTH, COLUMN_GAP, cumulative)).toBe(
      21
    )
  })

  it("page beyond last paragraph → total chars", () => {
    expect(charCountForPage(els, 5, COLUMN_WIDTH, COLUMN_GAP, cumulative)).toBe(
      25
    )
  })
})

describe("pageFromCharCount", () => {
  // Same layout as charCountForPage tests
  const els = [
    el(0), //    para 0 → page 0
    el(0), //    para 1 → page 0
    el(820), //  para 2 → page 1
    el(1640), // para 3 → page 2
  ]
  const cumulative = [0, 11, 18, 21, 25]

  it("charCount 0 → page 0", () => {
    expect(
      pageFromCharCount(0, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(0)
  })

  it("charCount in para 1 (middle of page 0) → page 0", () => {
    // charCount=14 lands in para 1 (cumulative[1]=11 ≤ 14 < 18=cumulative[2])
    expect(
      pageFromCharCount(14, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(0)
  })

  it("charCount exactly at para 2 boundary → page 1", () => {
    expect(
      pageFromCharCount(18, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(1)
  })

  it("charCount in para 2 → page 1", () => {
    expect(
      pageFromCharCount(20, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(1)
  })

  it("charCount in para 3 → page 2", () => {
    expect(
      pageFromCharCount(22, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(2)
  })

  it("charCount = total → last paragraph's page", () => {
    expect(
      pageFromCharCount(25, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(2)
  })

  it("negative charCount → page 0", () => {
    expect(
      pageFromCharCount(-1, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(0)
  })

  it("empty paraEls → page 0", () => {
    expect(pageFromCharCount(10, [], COLUMN_WIDTH, COLUMN_GAP, [0])).toBe(0)
  })
})

describe("round-trip: save charCount for page N → restore same page", () => {
  const els = [
    el(0), //    page 0
    el(0), //    page 0
    el(820), //  page 1
    el(820), //  page 1
    el(1640), // page 2
  ]
  const paras = [
    { text: "a".repeat(11) }, // cumulative: 0,11
    { text: "b".repeat(7) }, //              11,18
    { text: "c".repeat(6) }, //              18,24
    { text: "d".repeat(4) }, //              24,28
    { text: "e".repeat(3) }, //              28,31
  ]
  const cumulative = buildCumulativeCharCounts(paras)

  it("saving page 0 charCount restores page 0", () => {
    const saved = charCountForPage(els, 0, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    expect(
      pageFromCharCount(saved, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(0)
  })

  it("saving page 1 charCount restores page 1", () => {
    const saved = charCountForPage(els, 1, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    expect(
      pageFromCharCount(saved, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(1)
  })

  it("saving page 2 charCount restores page 2", () => {
    const saved = charCountForPage(els, 2, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    expect(
      pageFromCharCount(saved, els, COLUMN_WIDTH, COLUMN_GAP, cumulative)
    ).toBe(2)
  })
})
