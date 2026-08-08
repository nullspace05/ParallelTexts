import { describe, expect, it } from "vitest"

import { extractTxtContent } from "./txt"

function toBlob(text: string): Blob {
  return new Blob([text], { type: "text/plain" })
}

describe("extractTxtContent", () => {
  it("splits paragraphs on blank lines", async () => {
    const paragraphs = await extractTxtContent(
      toBlob("First paragraph.\n\nSecond paragraph.")
    )
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("First paragraph.")
    expect(paragraphs[1].text).toBe("Second paragraph.")
  })

  it("collapses hard-wrapped line breaks inside a paragraph into a space", async () => {
    const paragraphs = await extractTxtContent(
      toBlob(
        "Alice was just beginning to think to herself, “Now, what am I to\ndo with this creature when I get it home?” when it grunted\nagain, so violently, that she\nlooked down into its face in some alarm."
      )
    )
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toContain("she looked down")
    expect(paragraphs[0].text).not.toContain("shelooked")
    expect(paragraphs[0].text).not.toContain("  ")
  })

  it("does not insert spurious spaces into single-line Japanese paragraphs", async () => {
    const paragraphs = await extractTxtContent(
      toBlob(
        "アリスの頭にはよぎりはじめていたことがあってね\n\n次のパラグラフ。"
      )
    )
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe(
      "アリスの頭にはよぎりはじめていたことがあってね"
    )
  })

  it("trims trailing \\r characters", async () => {
    const paragraphs = await extractTxtContent(
      toBlob("Line one.\n\nLine two.\r")
    )
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("Line one.")
    expect(paragraphs[1].text).toBe("Line two.")
  })

  it("skips blank/whitespace-only paragraphs", async () => {
    const paragraphs = await extractTxtContent(
      toBlob("Real text.\n\n   \n\nMore text.")
    )
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("Real text.")
    expect(paragraphs[1].text).toBe("More text.")
  })
})
