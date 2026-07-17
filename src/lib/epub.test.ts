import JSZip from "jszip"
import { describe, expect, it } from "vitest"

import { extractEpubContent } from "./epub"

// Build a minimal EPUB zip in memory for testing
async function buildTestEpub(chapters: string[]): Promise<Blob> {
  const zip = new JSZip()

  zip.file("mimetype", "application/epub+zip")

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  const spineItems = chapters.map((_, i) => `ch${i}`)
  const manifestItems = spineItems
    .map(
      (id) =>
        `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join("\n    ")
  const spineRefs = spineItems
    .map((id) => `<itemref idref="${id}"/>`)
    .join("\n    ")

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata/>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineRefs}
  </spine>
</package>`
  )

  for (let i = 0; i < chapters.length; i++) {
    zip.file(
      `OEBPS/ch${i}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${i}</title></head>
<body>${chapters[i]}</body>
</html>`
    )
  }

  return zip.generateAsync({ type: "blob" })
}

describe("extractEpubContent", () => {
  it("extracts paragraphs in reading order with correct para_idx", async () => {
    const blob = await buildTestEpub([
      "<p>First sentence.</p><p>Second sentence.</p>",
      "<p>Third sentence.</p>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].para_idx).toBe(0)
    expect(paragraphs[0].text).toBe("First sentence.")
    expect(paragraphs[1].para_idx).toBe(1)
    expect(paragraphs[1].text).toBe("Second sentence.")
    expect(paragraphs[2].para_idx).toBe(2)
    expect(paragraphs[2].text).toBe("Third sentence.")
  })

  it("strips furigana <rt> tags from Japanese text", async () => {
    const blob = await buildTestEpub([
      `<p>彼<ruby>女<rt>じょ</rt></ruby>は言った。</p>`,
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(1)
    // Should contain the base kanji but NOT the furigana reading
    expect(paragraphs[0].text).toContain("彼")
    expect(paragraphs[0].text).toContain("女")
    expect(paragraphs[0].text).not.toContain("じょ")
  })

  it("skips empty paragraphs", async () => {
    const blob = await buildTestEpub([
      "<p>Real text.</p><p></p><p>   </p><p>More text.</p>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("Real text.")
    expect(paragraphs[1].text).toBe("More text.")
  })

  it("returns empty images array when no inline images", async () => {
    const blob = await buildTestEpub(["<p>Just text here.</p>"])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs[0].images).toEqual([])
  })

  it("handles multiple chapters, para_idx is global (not per-chapter)", async () => {
    const blob = await buildTestEpub([
      "<p>Ch1 Para1.</p>",
      "<p>Ch2 Para1.</p><p>Ch2 Para2.</p>",
      "<p>Ch3 Para1.</p>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(4)
    // para_idx must be a flat counter across all chapters
    expect(paragraphs.map((p) => p.para_idx)).toEqual([0, 1, 2, 3])
  })

  it("returns empty array for EPUB with no content", async () => {
    const blob = await buildTestEpub(["<p></p>"])
    const paragraphs = await extractEpubContent(blob)
    expect(paragraphs).toHaveLength(0)
  })
})
