import JSZip from "jszip"
import { describe, expect, it } from "vitest"

import type { AlignmentRecord } from "@/types/alignment"

import { buildAlignmentEpubBlob } from "./export-epub"

// Minimal valid AlignmentRecord for testing
function makeRecord(overrides?: Partial<AlignmentRecord>): AlignmentRecord {
  return {
    id: "test-id",
    sourceBookId: "src-book",
    targetBookId: "tgt-book",
    sourceBookTitle: "The Little Prince",
    targetBookTitle: "星の王子さま",
    createdAt: Date.now(),
    result: {
      src_lang: "en",
      tgt_lang: "ja",
      total_src_sentences: 3,
      total_tgt_sentences: 3,
      aligned_count: 3,
      src_gap_count: 0,
      tgt_gap_count: 0,
      pairs: [
        {
          src_text: "It is only with the heart that one can see rightly.",
          tgt_text: "心で見なくちゃ、ものごとはよく見えないってことさ。",
          src_sent_idx: 0,
          src_para_idx: 0,
          src_global_idx: 0,
          tgt_sent_idx: 0,
          tgt_para_idx: 0,
          tgt_global_idx: 0,
          alignment_type: "1:1",
          confidence: 0.92,
          src_images: null,
          tgt_images: null,
        },
        {
          src_text: "What is essential is invisible to the eye.",
          tgt_text: "大切なものは目には見えないんだよ。",
          src_sent_idx: 0,
          src_para_idx: 1,
          src_global_idx: 1,
          tgt_sent_idx: 0,
          tgt_para_idx: 1,
          tgt_global_idx: 1,
          alignment_type: "1:1",
          confidence: 0.88,
          src_images: null,
          tgt_images: null,
        },
        {
          src_text: "You become responsible forever for what you've tamed.",
          tgt_text: "",
          src_sent_idx: 0,
          src_para_idx: 2,
          src_global_idx: 2,
          tgt_sent_idx: null,
          tgt_para_idx: null,
          tgt_global_idx: null,
          alignment_type: "1:0",
          confidence: null,
          src_images: null,
          tgt_images: null,
        },
      ],
      source_paragraphs: [
        {
          para_idx: 0,
          text: "It is only with the heart that one can see rightly.",
          images: [],
        },
        {
          para_idx: 1,
          text: "What is essential is invisible to the eye.",
          images: [],
        },
        {
          para_idx: 2,
          text: "You become responsible forever for what you've tamed.",
          images: [],
        },
      ],
    },
    ...overrides,
  }
}

describe("buildAlignmentEpubBlob", () => {
  it("returns a blob with .epub filename containing short titles", async () => {
    const { blob, filename } = await buildAlignmentEpubBlob(makeRecord())
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toMatch(/\.epub$/)
    expect(filename).toMatch(/_align\.epub$/)
    expect(filename).toContain("The Little")
    // Japanese target title must survive sanitization (not replaced with underscores)
    expect(filename).toContain("星の王子")
  })

  it("preserves CJK characters in filename when source title is Japanese", async () => {
    const { filename } = await buildAlignmentEpubBlob(
      makeRecord({
        sourceBookTitle: "吾輩は猫である",
        targetBookTitle: "I Am a Cat",
      })
    )
    expect(filename).toContain("吾輩は猫")
    expect(filename).toContain("I Am")
    // No run of underscores where the Japanese title should be
    expect(filename).not.toMatch(/^_{4,}/)
  })

  it("ZIP contains required EPUB 3 files", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const names = Object.keys(zip.files)

    expect(names).toContain("mimetype")
    expect(names).toContain("META-INF/container.xml")
    expect(names).toContain("EPUB/content.opf")
    expect(names).toContain("EPUB/nav.xhtml")
    expect(names).toContain("EPUB/styles.css")
    // At least one chapter
    expect(names.some((n) => /EPUB\/ch\d+\.xhtml$/.test(n))).toBe(true)
  })

  it("mimetype entry is uncompressed (STORE)", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const mimetypeEntry = zip.files["mimetype"]
    expect(mimetypeEntry).toBeDefined()
    const content = await mimetypeEntry.async("string")
    expect(content).toBe("application/epub+zip")
    // compression method 0 = STORE; JSZip exposes _data.compression on internal entries
    // biome-ignore lint: intentional access of JSZip internal
    expect(
      (
        mimetypeEntry as unknown as {
          _data?: { compression?: { magic?: string } }
        }
      )._data?.compression?.magic
    ).toBe("\x00\x00")
  })

  it("container.xml points to EPUB/content.opf", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const containerXml =
      await zip.files["META-INF/container.xml"].async("string")
    expect(containerXml).toContain('full-path="EPUB/content.opf"')
    expect(containerXml).toContain('media-type="application/oebps-package+xml"')
  })

  it("content.opf has correct EPUB 3 package structure", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const opf = await zip.files["EPUB/content.opf"].async("string")

    expect(opf).toContain('version="3.0"')
    expect(opf).toContain("http://www.idpf.org/2007/opf")
    expect(opf).toContain(
      "<dc:title>The Little Prince ↔ 星の王子さま</dc:title>"
    )
    expect(opf).toContain("<dc:language>en</dc:language>")
    expect(opf).toContain("<dc:language>ja</dc:language>")
    expect(opf).toContain('property="dcterms:modified"')
    expect(opf).toContain('properties="nav"')
  })

  it("nav.xhtml has epub:type=toc and lists chapters", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const nav = await zip.files["EPUB/nav.xhtml"].async("string")

    expect(nav).toContain('epub:type="toc"')
    expect(nav).toContain("http://www.idpf.org/2007/ops")
    expect(nav).toContain("ch001.xhtml")
  })

  it("chapter xhtml has correct parallel text structure", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord())
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")

    // 1:1 pairs use <details>/<summary> for click-to-reveal
    expect(ch).toContain("<details")
    expect(ch).toContain("<summary")
    expect(ch).toContain('class="src"')
    expect(ch).toContain('class="tgt"')
    expect(ch).toContain("one can see rightly")
    expect(ch).toContain("心で見なくちゃ")
    // 1:0 gap pair still uses plain div
    expect(ch).toContain('class="pair gap"')
    expect(ch).toContain('epub:type="bodymatter chapter"')
  })

  it("escapes XML special characters in text", async () => {
    const record = makeRecord()
    record.result.pairs[0].src_text = 'Say "hello" & <wave>'
    const { blob } = await buildAlignmentEpubBlob(record)
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    expect(ch).toContain("Say &quot;hello&quot; &amp; &lt;wave&gt;")
    expect(ch).not.toContain('Say "hello"')
  })

  // ALL images are always stored in the ZIP regardless of imageMode (for roundtrip
  // fidelity). imageMode only controls what the XHTML chapters reference/display.
  function makeRecordWithImages() {
    const r = makeRecord()
    r.result.source_paragraphs![0].images = [
      {
        id: "OEBPS/images/src.jpg",
        mime_type: "image/jpeg",
        data_base64: "/9j/AAAA",
      },
    ]
    r.result.target_paragraphs = [
      {
        para_idx: 0,
        text: "",
        images: [
          {
            id: "OEBPS/images/tgt.png",
            mime_type: "image/png",
            data_base64: "AAAAAAAA",
          },
        ],
      },
    ]
    return r
  }

  it("imageMode=source: XHTML only shows source image", async () => {
    const { blob } = await buildAlignmentEpubBlob(
      makeRecordWithImages(),
      "source"
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    // Source image is referenced in XHTML
    expect(ch).toContain("src.jpg")
    // Target image is NOT referenced in XHTML (even though it's in the ZIP)
    expect(ch).not.toContain("tgt.png")
    // Both files are in ZIP for roundtrip
    const names = Object.keys(zip.files)
    expect(names.some((n) => n.includes("src.jpg"))).toBe(true)
    expect(names.some((n) => n.includes("tgt.png"))).toBe(true)
  })

  it("imageMode=target: XHTML only shows target image", async () => {
    const { blob } = await buildAlignmentEpubBlob(
      makeRecordWithImages(),
      "target"
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    expect(ch).toContain("tgt.png")
    expect(ch).not.toContain("src.jpg")
  })

  it("imageMode=both: XHTML shows both images", async () => {
    const { blob } = await buildAlignmentEpubBlob(
      makeRecordWithImages(),
      "both"
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    expect(ch).toContain("src.jpg")
    expect(ch).toContain("tgt.png")
  })

  it("imageMode=none: XHTML references no images but ZIP still has them", async () => {
    const { blob } = await buildAlignmentEpubBlob(
      makeRecordWithImages(),
      "none"
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    expect(ch).not.toContain("src.jpg")
    // Both still in ZIP for roundtrip
    const names = Object.keys(zip.files)
    expect(names.some((n) => n.includes("src.jpg"))).toBe(true)
    expect(names.some((n) => n.includes("tgt.png"))).toBe(true)
  })

  it("splits large alignments into multiple chapters", async () => {
    const record = makeRecord()
    // Create 120 pairs — enough to trigger chunking (chunkSize = max(50, ceil(120/20)=6) = 50 → 3 chunks)
    const pairs = Array.from({ length: 120 }, (_, i) => ({
      src_text: `Source sentence ${i}`,
      tgt_text: `Target sentence ${i}`,
      src_sent_idx: 0,
      src_para_idx: i,
      src_global_idx: i,
      tgt_sent_idx: 0,
      tgt_para_idx: i,
      tgt_global_idx: i,
      alignment_type: "1:1" as const,
      confidence: 0.9,
      src_images: null,
      tgt_images: null,
    }))
    record.result.pairs = pairs
    record.result.source_paragraphs = pairs.map((p) => ({
      para_idx: p.src_para_idx ?? 0,
      text: p.src_text,
      images: [],
    }))

    const { blob } = await buildAlignmentEpubBlob(record)
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const chapters = Object.keys(zip.files).filter((n) =>
      /EPUB\/ch\d+\.xhtml$/.test(n)
    )
    expect(chapters.length).toBeGreaterThan(1)

    // nav should list all chapters
    const nav = await zip.files["EPUB/nav.xhtml"].async("string")
    for (const ch of chapters) {
      const basename = ch.replace("EPUB/", "")
      expect(nav).toContain(basename)
    }

    // opf spine should list all chapters
    const opf = await zip.files["EPUB/content.opf"].async("string")
    for (const ch of chapters) {
      const basename = ch.replace("EPUB/", "").replace(".xhtml", "")
      expect(opf).toContain(`idref="${basename}"`)
    }
  })

  it("works with legacy records without source_paragraphs", async () => {
    const record = makeRecord()
    delete record.result.source_paragraphs
    const { blob } = await buildAlignmentEpubBlob(record)
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const ch = await zip.files["EPUB/ch001.xhtml"].async("string")
    expect(ch).toContain("one can see rightly")
  })
})
