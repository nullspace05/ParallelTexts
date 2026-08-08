import { describe, expect, it } from "vitest"

import type { AlignmentRecord } from "@/types/alignment"

import { buildAlignmentEpubBlob } from "./export-epub"
import {
  PT_MANIFEST_PATH,
  buildPtManifest,
  extractPtEpubSourceParagraphs,
  parsePtEpub,
} from "./pt-epub"

import JSZip from "jszip"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SRC_IMG = {
  id: "OEBPS/images/src.jpg",
  mime_type: "image/jpeg",
  data_base64: "/9j/AAAA",
}

const TGT_IMG = {
  id: "OEBPS/images/tgt.png",
  mime_type: "image/png",
  data_base64: "AAAAAAAA",
}

function makeRecord(overrides?: Partial<AlignmentRecord>): AlignmentRecord {
  return {
    id: "test-id",
    sourceBookId: "src-book",
    targetBookId: "tgt-book",
    sourceBookTitle: "The Little Prince",
    targetBookTitle: "星の王子さま",
    createdAt: 1_700_000_000_000,
    result: {
      src_lang: "en",
      tgt_lang: "ja",
      total_src_sentences: 2,
      total_tgt_sentences: 2,
      aligned_count: 2,
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
      ],
      source_paragraphs: [
        {
          para_idx: 0,
          text: "It is only with the heart that one can see rightly.",
          images: [SRC_IMG],
        },
        {
          para_idx: 1,
          text: "What is essential is invisible to the eye.",
          images: [],
        },
      ],
      target_paragraphs: [
        {
          para_idx: 0,
          text: "心で見なくちゃ、ものごとはよく見えないってことさ。",
          images: [TGT_IMG],
        },
        { para_idx: 1, text: "大切なものは目には見えないんだよ。", images: [] },
      ],
    },
    ...overrides,
  }
}

// ── buildPtManifest ───────────────────────────────────────────────────────────

describe("buildPtManifest", () => {
  it("strips base64 from all image assets", () => {
    const record = makeRecord()
    const imgFilenameMap = new Map([["OEBPS/images/src.jpg", "src_src.jpg"]])
    const imgMimeMap = new Map([["src_src.jpg", "image/jpeg"]])
    const manifest = buildPtManifest(record, imgFilenameMap, imgMimeMap)

    expect(manifest.exported_by).toBe("ParallelTexts")
    expect(manifest.version).toBe(1)

    const sp = manifest.record.result.source_paragraphs![0]
    expect(sp.images[0].data_base64).toBe("")
    expect(sp.images[0].id).toBe(SRC_IMG.id)
    expect(sp.images[0].mime_type).toBe(SRC_IMG.mime_type)
  })

  it("populates image_refs correctly", () => {
    const record = makeRecord()
    const imgFilenameMap = new Map([
      ["OEBPS/images/src.jpg", "src_src.jpg"],
      ["OEBPS/images/tgt.png", "src_tgt.png"],
    ])
    const imgMimeMap = new Map([
      ["src_src.jpg", "image/jpeg"],
      ["src_tgt.png", "image/png"],
    ])
    const manifest = buildPtManifest(record, imgFilenameMap, imgMimeMap)

    expect(manifest.image_refs).toHaveLength(2)
    const jpegRef = manifest.image_refs.find(
      (r) => r.id === "OEBPS/images/src.jpg"
    )
    expect(jpegRef?.epub_filename).toBe("src_src.jpg")
    expect(jpegRef?.mime_type).toBe("image/jpeg")
  })
})

// ── parsePtEpub / extractPtEpubSourceParagraphs ────────────────────────────

describe("parsePtEpub", () => {
  it("returns null for a non-PT blob", async () => {
    const blob = new Blob(["not an epub"], { type: "application/epub+zip" })
    expect(await parsePtEpub(blob)).toBeNull()
  })

  it("returns null for an EPUB without pt-manifest.json", async () => {
    const zip = new JSZip()
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" })
    const blob = await zip.generateAsync({ type: "blob" })
    expect(await parsePtEpub(blob)).toBeNull()
  })

  it("roundtrip: export then import gives identical pairs and metadata", async () => {
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "both")
    const restored = await parsePtEpub(blob)

    expect(restored).not.toBeNull()
    expect(restored!.sourceBookTitle).toBe(original.sourceBookTitle)
    expect(restored!.targetBookTitle).toBe(original.targetBookTitle)
    expect(restored!.result.src_lang).toBe("en")
    expect(restored!.result.tgt_lang).toBe("ja")
    expect(restored!.result.pairs).toHaveLength(original.result.pairs.length)

    // Every pair matches exactly
    for (let i = 0; i < original.result.pairs.length; i++) {
      const op = original.result.pairs[i]
      const rp = restored!.result.pairs[i]
      expect(rp.src_text).toBe(op.src_text)
      expect(rp.tgt_text).toBe(op.tgt_text)
      expect(rp.alignment_type).toBe(op.alignment_type)
      expect(rp.confidence).toBeCloseTo(op.confidence ?? 0)
      expect(rp.src_para_idx).toBe(op.src_para_idx)
      expect(rp.tgt_para_idx).toBe(op.tgt_para_idx)
    }
  })

  it("roundtrip: source image data is reconstructed", async () => {
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "both")
    const restored = await parsePtEpub(blob)

    const srcImg = restored!.result.source_paragraphs![0].images[0]
    expect(srcImg.data_base64).toBe(SRC_IMG.data_base64)
    expect(srcImg.id).toBe(SRC_IMG.id)
    expect(srcImg.mime_type).toBe(SRC_IMG.mime_type)
  })

  it("roundtrip: target image data is reconstructed", async () => {
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "both")
    const restored = await parsePtEpub(blob)

    const tgtImg = restored!.result.target_paragraphs![0].images[0]
    expect(tgtImg.data_base64).toBe(TGT_IMG.data_base64)
    expect(tgtImg.id).toBe(TGT_IMG.id)
  })

  it("roundtrip: images present even when exported with imageMode=none", async () => {
    // imageMode=none means no images in XHTML, but all images should still
    // be in the ZIP and reconstructable via the manifest
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "none")
    const restored = await parsePtEpub(blob)

    const srcImg = restored!.result.source_paragraphs![0].images[0]
    expect(srcImg.data_base64).toBe(SRC_IMG.data_base64)
    const tgtImg = restored!.result.target_paragraphs![0].images[0]
    expect(tgtImg.data_base64).toBe(TGT_IMG.data_base64)
  })

  it("pt-manifest.json is present in the exported ZIP", async () => {
    const { blob } = await buildAlignmentEpubBlob(makeRecord(), "source")
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(zip.file(PT_MANIFEST_PATH)).not.toBeNull()
  })

  it("preserves createdAt and other record metadata", async () => {
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "source")
    const restored = await parsePtEpub(blob)
    expect(restored!.createdAt).toBe(original.createdAt)
    expect(restored!.id).toBe(original.id)
  })
})

describe("extractPtEpubSourceParagraphs", () => {
  it("returns null for non-PT epub", async () => {
    const blob = new Blob(["not an epub"])
    expect(await extractPtEpubSourceParagraphs(blob)).toBeNull()
  })

  it("returns only source paragraphs with reconstructed images", async () => {
    const original = makeRecord()
    const { blob } = await buildAlignmentEpubBlob(original, "both")
    const sourceParagraphs = await extractPtEpubSourceParagraphs(blob)

    expect(sourceParagraphs).not.toBeNull()
    expect(sourceParagraphs!).toHaveLength(
      original.result.source_paragraphs!.length
    )

    // Text preserved
    expect(sourceParagraphs![0].text).toBe(
      original.result.source_paragraphs![0].text
    )

    // Source image reconstructed
    expect(sourceParagraphs![0].images[0].data_base64).toBe(SRC_IMG.data_base64)

    // No target data leaked
    const allText = sourceParagraphs!.map((p) => p.text).join(" ")
    expect(allText).not.toContain("心で見なくちゃ")
  })
})
