import { describe, expect, it } from "vitest"

import { groupItemsIntoParagraphs, type RawPdfTextItem } from "./pdf"

// Helper: build a text item at a given Y position
function item(
  str: string,
  y: number,
  height = 12,
  hasEOL = false
): RawPdfTextItem {
  return { str, transform: [1, 0, 0, 1, 0, y], height, hasEOL }
}

describe("groupItemsIntoParagraphs", () => {
  it("returns empty array for no items", () => {
    expect(groupItemsIntoParagraphs([])).toEqual([])
  })

  it("single item becomes a single paragraph", () => {
    const result = groupItemsIntoParagraphs([item("Hello.", 100)])
    expect(result).toEqual(["Hello."])
  })

  it("items at the same Y are joined in one line (and one paragraph)", () => {
    const result = groupItemsIntoParagraphs([
      item("Hello ", 100),
      item("world.", 100),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe("Hello world.")
  })

  it("items with small Y gap (line break) stay in the same paragraph", () => {
    // Gap of 14 px with height 12 → ~1.2x height → line break, not paragraph break
    const result = groupItemsIntoParagraphs([
      item("Line one.", 100, 12, true),
      item("Line two.", 86, 12),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe("Line one. Line two.")
  })

  it("large Y gap (> 2.2x height) creates a paragraph break", () => {
    // Gap of 40 px with height 12 → ~3.3x height → paragraph break
    const result = groupItemsIntoParagraphs([
      item("First paragraph.", 100, 12, true),
      item("Second paragraph.", 60, 12),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe("First paragraph.")
    expect(result[1]).toBe("Second paragraph.")
  })

  it("hasEOL triggers a line flush without requiring Y gap", () => {
    const result = groupItemsIntoParagraphs([
      item("Line A", 100, 12, true), // hasEOL
      item("Line B", 88, 12, true), // hasEOL, small gap → same para
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe("Line A Line B")
  })

  it("skips items with empty strings", () => {
    const result = groupItemsIntoParagraphs([
      item("Real text.", 100),
      item("", 100),
      item("  ", 100),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe("Real text.")
  })

  it("multiple paragraphs separated by large gaps", () => {
    const result = groupItemsIntoParagraphs([
      item("Para one line one.", 200, 12, true),
      item("Para one line two.", 188, 12, true),
      // gap of 80px → paragraph break
      item("Para two.", 100, 12),
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe("Para one line one. Para one line two.")
    expect(result[1]).toBe("Para two.")
  })

  it("falls back to avgHeight when item.height is 0", () => {
    // First item sets avgHeight=12, second has height=0 → should still use ~12 for gap calc
    // Gap of 100px should trigger paragraph break regardless
    const result = groupItemsIntoParagraphs([
      item("First.", 200, 12, true),
      { str: "Second.", transform: [1, 0, 0, 1, 0, 100], height: 0 },
    ])
    expect(result).toHaveLength(2)
  })
})
