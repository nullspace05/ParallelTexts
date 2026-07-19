import { beforeEach, describe, expect, it } from "vitest"
import {
  buildCumulativeCharCounts,
  charCountForPage,
  getAlignmentProgress,
  getAlignmentViewPrefs,
  pageFromCharCount,
  setAlignmentProgress,
  setAlignmentViewPrefs,
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

describe("getAlignmentViewPrefs / setAlignmentViewPrefs", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("returns null when nothing has been saved", () => {
    expect(getAlignmentViewPrefs("alignment-1")).toBeNull()
  })

  it("round-trips a saved view", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    expect(getAlignmentViewPrefs("alignment-1")).toEqual({
      view: "side-by-side",
    })
  })

  it("round-trips a saved pageNumHidden", () => {
    setAlignmentViewPrefs("alignment-1", { pageNumHidden: true })
    expect(getAlignmentViewPrefs("alignment-1")).toEqual({
      pageNumHidden: true,
    })
  })

  it("setting pageNumHidden doesn't clobber a previously saved view (partial merge)", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    setAlignmentViewPrefs("alignment-1", { pageNumHidden: true })
    expect(getAlignmentViewPrefs("alignment-1")).toEqual({
      view: "side-by-side",
      pageNumHidden: true,
    })
  })

  it("setting view doesn't clobber a previously saved pageNumHidden (partial merge)", () => {
    setAlignmentViewPrefs("alignment-1", { pageNumHidden: true })
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    expect(getAlignmentViewPrefs("alignment-1")).toEqual({
      view: "side-by-side",
      pageNumHidden: true,
    })
  })

  it("overwrites a previously saved value for the same field", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    setAlignmentViewPrefs("alignment-1", { view: "popover" })
    expect(getAlignmentViewPrefs("alignment-1")?.view).toBe("popover")
  })

  it("is isolated per alignment id", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    expect(getAlignmentViewPrefs("alignment-2")).toBeNull()
  })

  it("is isolated from reading-progress storage (no cross-talk)", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })
    setAlignmentProgress("alignment-1", 42, 100)

    expect(getAlignmentViewPrefs("alignment-1")).toEqual({
      view: "side-by-side",
    })
    expect(getAlignmentProgress("alignment-1")).toEqual({
      charCount: 42,
      totalChars: 100,
    })
  })

  it("returns null for corrupted JSON instead of throwing", () => {
    localStorage.setItem("pt:viewprefs:alignment-1", "{not valid json")
    expect(getAlignmentViewPrefs("alignment-1")).toBeNull()
  })

  it("ignores invalid stored values instead of returning them", () => {
    localStorage.setItem(
      "pt:viewprefs:alignment-1",
      JSON.stringify({ view: "not-a-real-view", pageNumHidden: "not-a-bool" })
    )
    expect(getAlignmentViewPrefs("alignment-1")).toBeNull()
  })

  // Regression: reproduces the exact real-world scenario reported —
  // switch to side-by-side, navigate away, navigate back with the URL
  // carrying no view param at all (as a fresh Link click would) — the
  // saved preference must be what's returned, simulating the fallback
  // logic in alignment.$id.tsx: `view ?? viewPrefs?.view ?? "popover"`.
  it("simulates: set side-by-side, then a fresh navigation (URL view=undefined) resolves to the saved view, not the hardcoded default", () => {
    setAlignmentViewPrefs("alignment-1", { view: "side-by-side" })

    const urlView: "side-by-side" | "popover" | undefined = undefined
    const viewPrefs = getAlignmentViewPrefs("alignment-1")
    const effectiveView = urlView ?? viewPrefs?.view ?? "popover"

    expect(effectiveView).toBe("side-by-side")
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
