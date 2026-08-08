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

// Build a test EPUB with per-page titles and optional binary image assets,
// for exercising the Gutenberg "linked image" page detection.
async function buildTestEpubWithPages(
  pages: Array<{ title: string; body: string }>,
  images: Record<string, string> = {}
): Promise<Blob> {
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

  const spineItems = pages.map((_, i) => `ch${i}`)
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

  for (let i = 0; i < pages.length; i++) {
    zip.file(
      `OEBPS/ch${i}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${pages[i].title}</title></head>
<body>${pages[i].body}</body>
</html>`
    )
  }

  for (const [path, content] of Object.entries(images)) {
    zip.file(`OEBPS/${path}`, content)
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

  it("collapses hard-wrapped line breaks inside a <p> into a space instead of gluing words together", async () => {
    const blob = await buildTestEpub([
      "<p>Alice was just beginning to think to herself, “Now, what am I to\ndo with this\ncreature when I get it home?” when it grunted\nagain, so violently, that she\nlooked down into its face in some alarm.</p>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toContain("she looked down")
    expect(paragraphs[0].text).toContain("what am I to do with this")
    expect(paragraphs[0].text).not.toContain("shelooked")
    expect(paragraphs[0].text).not.toContain("  ")
  })

  it("collapses a line break split across inline tags (e.g. <i>no</i>\\nmistake)", async () => {
    const blob = await buildTestEpub([
      "<p>This time there could be <i>no</i>\nmistake about it.</p>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs[0].text).toContain("no mistake about it")
    expect(paragraphs[0].text).not.toContain("nomistake")
  })

  it("collapses hard-wrapped line breaks in <br/>-delimited (Aozora-style) content", async () => {
    const blob = await buildTestEpub([
      "<div>Alice was just beginning to think to herself that she\nlooked down into its face.<br/>So she set the little creature down.</div>",
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toContain("she looked down")
    expect(paragraphs[0].text).not.toContain("shelooked")
    expect(paragraphs[1].text).toBe("So she set the little creature down.")
  })

  it("does not insert spurious spaces into single-line Japanese text", async () => {
    const blob = await buildTestEpub([
      `<p>アリスの頭にはよぎりはじめていたことがあってね、「ところでこの生き物をうちにつれかえって」</p>`,
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs[0].text).toBe(
      "アリスの頭にはよぎりはじめていたことがあってね、「ところでこの生き物をうちにつれかえって」"
    )
  })

  it('drops Project Gutenberg EbookMaker "linked image" duplicate pages', async () => {
    const blob = await buildTestEpubWithPages(
      [
        {
          title: "Chapter 1",
          body: '<p>She saw a rabbit. <img src="pic.jpg" id="illo1"/></p>',
        },
        {
          title: '"linked image"',
          body:
            '<div style="text-align: center">' +
            '<img src="pic.jpg" class="x-ebookmaker-wrapper" alt=""/>' +
            '<br/><a href="ch0.xhtml#illo1" title="back">back</a></div>',
        },
        { title: "Chapter 2", body: "<p>More real text.</p>" },
      ],
      { "pic.jpg": "fake-image-bytes" }
    )
    const paragraphs = await extractEpubContent(blob)

    // The duplicate "linked image" page contributes no paragraphs at all.
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.map((p) => p.text)).toEqual([
      "She saw a rabbit.",
      "More real text.",
    ])
    // The real inline illustration (co-located with its sentence) survives.
    expect(paragraphs[0].images).toHaveLength(1)
    // No paragraph is left as an orphaned image-only block.
    expect(paragraphs.every((p) => p.text.trim().length > 0)).toBe(true)
  })

  it('does not drop pages whose title merely resembles "linked image"', async () => {
    const blob = await buildTestEpubWithPages([
      { title: "Linked Images", body: "<p>A chapter about linking.</p>" },
      { title: "The Linked Image", body: "<p>Another real chapter.</p>" },
    ])
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe("A chapter about linking.")
    expect(paragraphs[1].text).toBe("Another real chapter.")
  })

  it("captures an illustration that floats in a <div> outside every <p>, and skips the co-located zoom icon", async () => {
    // Mirrors real Gutenberg EbookMaker markup: the real illustration is a
    // direct child of a wrapping <div> (not inside a <p>), immediately
    // followed by a <p> that only contains a "click to enlarge" icon linking
    // to the (dropped) linked-image page.
    const blob = await buildTestEpubWithPages(
      [
        {
          title: "Chapter 1",
          body:
            "<p>She found a long, low hall.</p>" +
            '<div class="figcenter">' +
            '<img src="hall.jpg" alt=""/>' +
            '<p class="right"><a href="wrap.xhtml" title="linked image">' +
            '<img src="zoom-icon.jpg" class="agrandissement"/></a></p>' +
            "</div>" +
            "<p>There were doors all round the hall.</p>",
        },
      ],
      { "hall.jpg": "real-illustration-bytes", "zoom-icon.jpg": "tiny-icon" }
    )
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs.map((p) => p.text)).toEqual([
      "She found a long, low hall.",
      "",
      "There were doors all round the hall.",
    ])
    // The real illustration is captured as its own block, in document order.
    expect(paragraphs[1].images).toHaveLength(1)
    expect(paragraphs[1].images[0].id).toContain("hall.jpg")
    // The decorative zoom icon is never captured anywhere.
    const allImageIds = paragraphs.flatMap((p) => p.images.map((im) => im.id))
    expect(allImageIds.some((id) => id.includes("zoom-icon"))).toBe(false)
  })

  it("does not duplicate an image that is both inside a <p> and a real illustration", async () => {
    const blob = await buildTestEpubWithPages(
      [{ title: "Chapter 1", body: '<p>Text. <img src="pic.jpg"/></p>' }],
      { "pic.jpg": "bytes" }
    )
    const paragraphs = await extractEpubContent(blob)

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].images).toHaveLength(1)
  })
})
