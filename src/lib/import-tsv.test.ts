import { describe, expect, it } from "vitest"
import { parseTsv } from "./import-tsv"

const PT_HEADER = [
  "# exported_by=ParallelTexts",
  "# source_title=Norwegian Wood",
  "# target_title=ノルウェイの森",
  "# src_lang=en",
  "# tgt_lang=ja",
  "# total_pairs=3",
  "source_text\ttarget_text\tconfidence",
].join("\n")

describe("parseTsv", () => {
  it("parses a valid 2-column file", () => {
    const tsv = "source_text\ttarget_text\nHello\tこんにちは\nWorld\t世界"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toEqual({
      src: "Hello",
      tgt: "こんにちは",
      confidence: null,
      alignmentType: "1:1",
    })
    expect(r.hasConfidence).toBe(false)
  })

  it("parses a valid 3-column file with confidence", () => {
    const tsv = "source_text\ttarget_text\tconfidence\nHello\tこんにちは\t0.92"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[0].confidence).toBeCloseTo(0.92)
    expect(r.rows[0].alignmentType).toBe("1:1")
    expect(r.hasConfidence).toBe(true)
  })

  it("detects ParallelTexts export metadata", () => {
    const tsv = PT_HEADER + "\nHello\tこんにちは\t0.90"
    const r = parseTsv(tsv)
    expect(r.fromParallelTexts).toBe(true)
    expect(r.srcTitle).toBe("Norwegian Wood")
    expect(r.tgtTitle).toBe("ノルウェイの森")
    expect(r.srcLang).toBe("en")
    expect(r.tgtLang).toBe("ja")
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it("handles old export format with tab-separated lang on one comment line", () => {
    const tsv = [
      "# Book A ↔ Book B",
      "# src_lang=en\ttgt_lang=ja",
      "# pairs=1",
      "source_text\ttarget_text\tconfidence",
      "Hello\tこんにちは\t0.80",
    ].join("\n")
    const r = parseTsv(tsv)
    expect(r.srcLang).toBe("en")
    expect(r.tgtLang).toBe("ja")
    expect(r.srcTitle).toBe("Book A")
    expect(r.tgtTitle).toBe("Book B")
    expect(r.errors).toHaveLength(0)
  })

  it("parses 1:0 gap rows (src present, tgt empty)", () => {
    const tsv =
      "source_text\ttarget_text\tconfidence\nHello\t\t\nWorld\t世界\t0.9"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].alignmentType).toBe("1:0")
    expect(r.rows[0].src).toBe("Hello")
    expect(r.rows[0].tgt).toBe("")
    expect(r.rows[0].confidence).toBeNull()
    expect(r.rows[1].alignmentType).toBe("1:1")
  })

  it("parses 0:1 gap rows (tgt present, src empty)", () => {
    const tsv = "source_text\ttarget_text\nWorld\t世界\n\tこんにちは"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[1].alignmentType).toBe("0:1")
    expect(r.rows[1].src).toBe("")
    expect(r.rows[1].tgt).toBe("こんにちは")
  })

  it("skips comment and empty lines", () => {
    const tsv = "# comment\n\nHello\tWorld\n# another comment\nFoo\tBar"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
  })

  it("warns and skips rows where both columns are empty", () => {
    // A 3-col row where only the confidence column has content — both text cols empty
    const tsv =
      "source_text\ttarget_text\tconfidence\nHello\tWorld\t0.9\n\t\t0.5"
    const r = parseTsv(tsv)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.rows).toHaveLength(1)
  })

  it("returns error when no data rows found", () => {
    const r = parseTsv("# just a comment\n")
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.rows).toHaveLength(0)
  })

  it("returns error for wrong column count on first data row", () => {
    const r = parseTsv("one column only")
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it("warns and sets confidence to null for invalid score", () => {
    const tsv = "source_text\ttarget_text\tconfidence\nHello\tWorld\t1.5"
    const r = parseTsv(tsv)
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.rows[0].confidence).toBeNull()
  })

  it("treats empty confidence cell as null (not an error)", () => {
    const tsv = "source_text\ttarget_text\tconfidence\nHello\tWorld\t"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
    expect(r.rows[0].confidence).toBeNull()
  })

  it("strips BOM from beginning of file", () => {
    const tsv = "﻿source_text\ttarget_text\nHello\tWorld"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
  })

  it("handles windows line endings", () => {
    const tsv = "source_text\ttarget_text\r\nHello\tWorld\r\nFoo\tBar"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows).toHaveLength(2)
  })

  it("handles mixed 2- and 3-column rows gracefully", () => {
    const tsv =
      "source_text\ttarget_text\tconfidence\nHello\tWorld\t0.9\nFoo\tBar"
    const r = parseTsv(tsv)
    expect(r.errors).toHaveLength(0)
    expect(r.rows[1].confidence).toBeNull()
    expect(r.rows[1].alignmentType).toBe("1:1")
  })

  it("gap rows do not contribute to hasConfidence", () => {
    // Only gap rows in the file — no 1:1 row with confidence
    const tsv = "source_text\ttarget_text\tconfidence\nHello\t\t\n\tWorld\t"
    const r = parseTsv(tsv)
    expect(r.hasConfidence).toBe(false)
  })
})
