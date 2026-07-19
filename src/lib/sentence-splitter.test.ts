import { describe, expect, it } from "vitest"

import {
  MAX_SENTENCES,
  getSentenceTexts,
  splitIntoSentences,
} from "./sentence-splitter"
import type { SourceParagraph } from "@/types/alignment"

function para(text: string, idx = 0): SourceParagraph {
  return { para_idx: idx, text, images: [] }
}

describe("splitIntoSentences", () => {
  it("splits basic English sentences", () => {
    const { records } = splitIntoSentences(
      [para("Hello world. How are you?")],
      "en"
    )
    expect(records).toHaveLength(2)
    expect(records[0].text).toBe("Hello world.")
    expect(records[1].text).toBe("How are you?")
  })

  it("splits Japanese sentences on 。", () => {
    const { records } = splitIntoSentences(
      [para("彼は言った。大丈夫です。")],
      "jp"
    )
    expect(records).toHaveLength(2)
    expect(records[0].text).toBe("彼は言った。")
    expect(records[1].text).toBe("大丈夫です。")
  })

  it("global_idx is a flat counter that does not reset per paragraph", () => {
    const { records } = splitIntoSentences(
      [para("First. Second.", 0), para("Third. Fourth.", 1)],
      "en"
    )
    expect(records.map((r) => r.global_idx)).toEqual([0, 1, 2, 3])
  })

  it("sent_idx resets to 0 for each new paragraph", () => {
    const { records } = splitIntoSentences(
      [para("One. Two.", 0), para("Three. Four.", 1)],
      "en"
    )
    // First paragraph: sent_idx 0, 1
    expect(records[0].sent_idx).toBe(0)
    expect(records[1].sent_idx).toBe(1)
    // Second paragraph: sent_idx resets to 0, 1
    expect(records[2].sent_idx).toBe(0)
    expect(records[3].sent_idx).toBe(1)
  })

  it("para_idx on each record matches the source paragraph's para_idx", () => {
    const { records } = splitIntoSentences(
      [para("A sentence.", 5), para("Another sentence.", 10)],
      "en"
    )
    expect(records[0].para_idx).toBe(5)
    expect(records[1].para_idx).toBe(10)
  })

  it("skips paragraphs with empty or whitespace-only text", () => {
    const { records } = splitIntoSentences(
      [
        para("Real text.", 0),
        para("   ", 1),
        para("", 2),
        para("More text.", 3),
      ],
      "en"
    )
    expect(records).toHaveLength(2)
    expect(records[0].text).toBe("Real text.")
    expect(records[1].text).toBe("More text.")
  })

  it("handles 'jp' lang code (maps to Japanese locale)", () => {
    // Should not throw, and should segment Japanese text
    const { records } = splitIntoSentences(
      [para("私は学生です。あなたは？")],
      "jp"
    )
    expect(records.length).toBeGreaterThanOrEqual(1)
  })

  it("truncates at MAX_SENTENCES and sets truncated=true", () => {
    // Build more than MAX_SENTENCES paragraphs with 1 sentence each
    const many = Array.from({ length: MAX_SENTENCES + 10 }, (_, i) =>
      para(`Sentence ${i}.`, i)
    )
    const { records, truncated } = splitIntoSentences(many, "en")
    expect(records).toHaveLength(MAX_SENTENCES)
    expect(truncated).toBe(true)
  })

  it("truncated=false when under the cap", () => {
    const { truncated } = splitIntoSentences([para("One sentence.", 0)], "en")
    expect(truncated).toBe(false)
  })
})

describe("getSentenceTexts", () => {
  it("returns just the text strings", () => {
    const { records } = splitIntoSentences([para("Hello. World.")], "en")
    expect(getSentenceTexts(records)).toEqual(["Hello.", "World."])
  })
})
