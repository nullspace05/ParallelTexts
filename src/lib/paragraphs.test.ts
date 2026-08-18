import { describe, expect, it } from "vitest"

import { normalizeParagraphs } from "./paragraphs"
import type { ImageAsset, SourceParagraph } from "@/types/alignment"

function para(
  text: string,
  idx: number,
  images: ImageAsset[] = []
): SourceParagraph {
  return { para_idx: idx, text, images }
}

const img: ImageAsset = { id: "i1", mime_type: "image/png", data_base64: "" }

describe("normalizeParagraphs", () => {
  it("returns input unchanged when already contiguous and non-empty", () => {
    const raw = [para("A", 0), para("B", 1), para("C", 2)]
    expect(normalizeParagraphs(raw)).toEqual(raw)
  })

  it("drops a blank-text/no-image paragraph and reindexes everything after it", () => {
    const raw = [para("A", 0), para("   ", 1), para("C", 2)]
    const result = normalizeParagraphs(raw)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ para_idx: 0, text: "A", images: [] })
    expect(result[1]).toEqual({ para_idx: 1, text: "C", images: [] })
  })

  it("keeps an image-only paragraph with empty text", () => {
    const raw = [para("A", 0), para("", 1, [img]), para("C", 2)]
    const result = normalizeParagraphs(raw)
    expect(result).toHaveLength(3)
    expect(result[1].images).toEqual([img])
    expect(result[1].para_idx).toBe(1)
  })

  it("returns an empty array for empty input", () => {
    expect(normalizeParagraphs([])).toEqual([])
  })

  it("returns an empty array when every paragraph is blank", () => {
    expect(normalizeParagraphs([para("  ", 0), para("", 1)])).toEqual([])
  })
})
